import { Bot, InlineKeyboard } from 'grammy';
import { cfg } from './config.js';
import { db, kvGet, kvSet, ensureUser, creditDeposit, getUser, addBalance, addWagerReq, itemValue, AppError } from './db.js';
import { refFromParam } from './auth.js';

export const bot = cfg.BOT_TOKEN ? new Bot(cfg.BOT_TOKEN, { client: { apiRoot: cfg.API_ROOT } }) : null;
const isAdmin = (id) => cfg.ADMIN_IDS.includes(id);
let globalMenuOk = false;
let workingVariant = null;
let hooks = { onBalance: () => {}, onInventory: () => {} };
export const setBotHooks = (h) => { hooks = { ...hooks, ...h }; };

// Кнопка открытия Mini App — тот вариант, который StaticGram принял в /start
const appButton = (text = '🎁 Играть') => {
  const u = bot?.botInfo?.username || cfg.BOT_USERNAME;
  if (workingVariant === 'app_link' && cfg.APP_SHORT_NAME) return new InlineKeyboard().url(text, `https://staticgram.top/${u}/${cfg.APP_SHORT_NAME}`);
  if (workingVariant === 'main_app_link') return new InlineKeyboard().url(text, `https://staticgram.top/${u}?startapp=play`);
  if (workingVariant === 'url') return new InlineKeyboard().url(text, cfg.WEBAPP_URL);
  if (workingVariant === 'text' || workingVariant === 'reply_web_app') return undefined;
  return new InlineKeyboard().webApp(text, cfg.WEBAPP_URL);
};

/** Raw-вызов метода StaticGram (в т.ч. расширений, которых нет в grammY). */
export async function callApi(method, payload) {
  const r = await fetch(`${cfg.API_ROOT}/bot${cfg.BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  const j = await r.json();
  if (!j.ok) throw new AppError(j.description || `Ошибка ${method}`);
  return j.result;
}

export const businessConnectionId = () => kvGet('business_connection_id') || cfg.BUSINESS_CONNECTION_ID;

// ───────────── Депозиты звёздами ─────────────
export async function createDepositLink(userId, amount) {
  return callApi('createInvoiceLink', {
    title: 'Пополнение Epic Gift',
    description: `${amount} ⭐ на баланс Epic Gift`,
    payload: `dep:${userId}:${amount}`,
    currency: 'XTR',
    prices: [{ label: `${amount} ⭐`, amount }],
  });
}

// ───────────── Вывод звёзд (расширение StaticGram withdrawStarBalance) ─────────────
// Защита: строгая валидация суммы, лимит на вывод и в сутки, отыгрыш,
// крупные выводы и выводы больше депозитов — только после одобрения админом.
const pendingWithdraw = new Set();
const userTag = (u) => (u.username ? `@${u.username}` : u.first_name) + ` (id ${u.id})`;
const wdStats = (userId) => db.prepare(`SELECT
  (SELECT COALESCE(SUM(amount),0) FROM payments WHERE user_id=@u) dep,
  (SELECT COALESCE(SUM(amount),0) FROM withdrawals WHERE user_id=@u AND status IN ('done','processing','pending','queued')) wd,
  (SELECT COALESCE(SUM(amount),0) FROM withdrawals WHERE user_id=@u AND status IN ('done','processing','pending','queued') AND created_at > @day) day`)
  .get({ u: userId, day: Date.now() - 864e5 });

export async function withdrawStars(userId, rawAmount) {
  if (!/^\d{1,9}$/.test(String(rawAmount ?? ''))) throw new AppError('Неверная сумма');
  const amount = Number(rawAmount);
  if (amount < cfg.MIN_WITHDRAW) throw new AppError(`Минимальный вывод ${cfg.MIN_WITHDRAW} ⭐`);
  if (amount > cfg.WITHDRAW_MAX) throw new AppError(`Максимум за один вывод — ${cfg.WITHDRAW_MAX} ⭐`);
  const u = getUser(userId);
  if (!u) throw new AppError('Пользователь не найден');
  if (u.wager_left > 0) throw new AppError(`Сначала отыграйте ещё ${u.wager_left} ⭐ в ставках — так защищаемся от отмыва`);
  if (pendingWithdraw.has(userId)) throw new AppError('Предыдущий вывод ещё обрабатывается');
  pendingWithdraw.add(userId);
  try {
    const st = wdStats(userId);
    if (st.day + amount > cfg.WITHDRAW_DAILY) throw new AppError(`Лимит вывода — ${cfg.WITHDRAW_DAILY} ⭐ в сутки. Сегодня доступно ещё ${Math.max(0, cfg.WITHDRAW_DAILY - st.day)} ⭐`);
    // списываем сразу (атомарно, с проверкой баланса) и создаём заявку
    const review = amount > cfg.WITHDRAW_AUTO_LIMIT || st.wd + amount > st.dep;
    const wdId = db.transaction(() => {
      addBalance(userId, -amount, 'withdraw');
      return db.prepare('INSERT INTO withdrawals(user_id,amount,status,created_at) VALUES(?,?,?,?)')
        .run(userId, amount, review ? 'pending' : 'queued', Date.now()).lastInsertRowid;
    })();
    if (review) {
      const reason = amount > cfg.WITHDRAW_AUTO_LIMIT ? `больше ${cfg.WITHDRAW_AUTO_LIMIT} ⭐` : 'больше суммы депозитов';
      notifyAdmins(
        `💸 Заявка на вывод #${wdId}\n${userTag(u)}\nСумма: ${amount} ⭐ (${reason})\n`
        + `Депозиты: ${st.dep} ⭐ · Уже выведено: ${st.wd} ⭐\nБаланс после: ${getUser(userId).balance} ⭐`,
        new InlineKeyboard().text('✅ Одобрить', `wd:ok:${wdId}`).text('❌ Отклонить', `wd:no:${wdId}`),
      );
      return { pending: true, id: wdId };
    }
    await payoutWithdrawal(wdId);
    return { pending: false, id: wdId };
  } finally { pendingWithdraw.delete(userId); }
}

/** Отправка звёзд по заявке. Идемпотентно: request_id = id заявки. */
async function payoutWithdrawal(wdId, adminId = null) {
  // атомарный захват: выплатить заявку можно ровно один раз
  const claimed = db.prepare("UPDATE withdrawals SET status='processing', decided_by=COALESCE(?,decided_by), updated_at=? WHERE id=? AND status IN ('pending','queued')")
    .run(adminId, Date.now(), wdId).changes;
  if (!claimed) throw new AppError('Заявка уже обработана');
  const w = db.prepare('SELECT * FROM withdrawals WHERE id=?').get(wdId);
  try {
    const res = await callApi('withdrawStarBalance', { user_id: w.user_id, star_count: w.amount, request_id: `wd${wdId}` });
    if (res?.star_count !== undefined && Number(res.star_count) !== w.amount) console.error(`[withdraw] #${wdId}: StaticGram списал ${res.star_count}, ожидалось ${w.amount}`);
    db.prepare("UPDATE withdrawals SET status='done', updated_at=? WHERE id=?").run(Date.now(), wdId);
    bot.api.sendMessage(w.user_id, `✅ Вывод ${w.amount} ⭐ отправлен`).catch(() => {});
  } catch (e) {
    if (e instanceof AppError) { // StaticGram явно отказал — возвращаем звёзды
      db.transaction(() => {
        addBalance(w.user_id, w.amount, 'withdraw_refund', { wdId });
        db.prepare("UPDATE withdrawals SET status='failed', reason=?, updated_at=? WHERE id=?").run(e.message, Date.now(), wdId);
      })();
      hooks.onBalance(w.user_id);
      notifyAdmins(`⚠️ Вывод #${wdId} (${w.amount} ⭐) не прошёл: ${e.message}. Звёзды возвращены игроку.`);
      throw new AppError(`Вывод не прошёл: ${e.message}`);
    }
    notifyAdmins(`⚠️ Вывод #${wdId} (${w.amount} ⭐): нет ответа StaticGram, статус неизвестен — проверь /bank`);
    throw new AppError('Вывод в обработке, если звёзды не придут — напишите в поддержку');
  }
}

async function declineWithdrawal(wdId, adminId, reason = 'отклонено администратором') {
  const w = db.transaction(() => {
    const w = db.prepare("SELECT * FROM withdrawals WHERE id=? AND status='pending'").get(wdId);
    if (!w) return null;
    addBalance(w.user_id, w.amount, 'withdraw_refund', { wdId });
    db.prepare("UPDATE withdrawals SET status='declined', reason=?, decided_by=?, updated_at=? WHERE id=?").run(reason, adminId, Date.now(), wdId);
    return w;
  })();
  if (!w) throw new AppError('Заявка уже обработана');
  hooks.onBalance(w.user_id);
  bot.api.sendMessage(w.user_id, `❌ Вывод ${w.amount} ⭐ отклонён, звёзды возвращены на баланс`).catch(() => {});
  return w;
}

function notifyAdmins(text, markup) {
  for (const a of cfg.ADMIN_IDS) bot?.api.sendMessage(a, text, markup ? { reply_markup: markup } : {}).catch(() => {});
}

// ───────────── Вывод NFT ─────────────
export async function transferItem(item, userId) {
  const bc = businessConnectionId();
  if (!bc) throw new AppError('Вывод временно недоступен');
  const payload = { business_connection_id: bc, owned_gift_id: item.owned_gift_id, new_owner_chat_id: userId };
  if (item.transfer_cost > 0) payload.star_count = item.transfer_cost;
  await callApi('transferGift', payload);
}

// ───────────── Синхронизация NFT, отправленных на аккаунт-ретранслятор ─────────────
const toHex = (n) => (typeof n === 'number' ? `#${n.toString(16).padStart(6, '0')}` : null);

function importGift(g) {
  const ex = db.prepare('SELECT * FROM items WHERE owned_gift_id=?').get(g.owned_gift_id);
  if (ex && ex.status !== 'withdrawn') return null;
  const sender = g.sender_user;
  const ownerId = sender && !isAdmin(sender.id) && !sender.is_bot ? sender.id : null;
  if (ownerId) ensureUser({ id: sender.id, first_name: sender.first_name, username: sender.username });
  const u = g.gift;
  const st = u.model?.sticker;
  const imageFileId = st ? (st.is_animated || st.is_video ? st.thumbnail?.file_id : st.file_id) || null : null;
  const lottieFileId = st?.is_animated ? st.file_id : null; // .tgs = gzip(lottie json)
  const row = {
    owner_id: ownerId, owned_gift_id: g.owned_gift_id, title: u.base_name, slug: u.name, number: u.number,
    model: u.model?.name || null, rarity: u.model?.rarity_per_mille ?? null,
    backdrop: u.backdrop?.name || null, color1: toHex(u.backdrop?.colors?.center_color), color2: toHex(u.backdrop?.colors?.edge_color),
    image_file_id: imageFileId, lottie_file_id: lottieFileId, transfer_cost: g.transfer_star_count || 0, can_transfer: g.can_be_transferred === false ? 0 : 1,
  };
  if (ex) {
    db.prepare(`UPDATE items SET owner_id=@owner_id, status='available', transfer_cost=@transfer_cost, can_transfer=@can_transfer WHERE id=${ex.id}`).run(row);
  } else {
    db.prepare(`INSERT INTO items(owner_id,owned_gift_id,title,slug,number,model,rarity,backdrop,color1,color2,image_file_id,lottie_file_id,transfer_cost,can_transfer,created_at)
      VALUES(@owner_id,@owned_gift_id,@title,@slug,@number,@model,@rarity,@backdrop,@color1,@color2,@image_file_id,@lottie_file_id,@transfer_cost,@can_transfer,${Date.now()})`).run(row);
  }
  return ownerId ? { ownerId, title: `${u.base_name} #${u.number}` } : null;
}

let syncing = false;
const unpricedWarned = new Set();
export async function syncGifts() {
  const bc = businessConnectionId();
  if (!bot || !bc || syncing) return;
  syncing = true;
  try {
    let offset = '';
    do {
      const res = await callApi('getBusinessAccountGifts', { business_connection_id: bc, offset, limit: 100 });
      for (const g of res.gifts || []) {
        if (g.type !== 'unique') continue;
        const r = importGift(g);
        if (g.gift?.base_name && !(itemValue({ title: g.gift.base_name }) > 0) && !unpricedWarned.has(g.gift.base_name)) {
          unpricedWarned.add(g.gift.base_name);
          for (const a of cfg.ADMIN_IDS) bot.api.sendMessage(a, `⚠️ Пришёл NFT из коллекции «${g.gift.base_name}» без цены. Пока цены нет, его нельзя продать и выиграть.\nЗадай: /setprice ${g.gift.base_name} 1000`).catch(() => {});
        }
        if (r) {
          hooks.onInventory(r.ownerId);
          bot.api.sendMessage(r.ownerId, `🎁 ${r.title} зачислен в инвентарь Epic Gift`, { reply_markup: appButton('Открыть') })
            .catch(() => bot.api.sendMessage(r.ownerId, `🎁 ${r.title} зачислен в инвентарь Epic Gift`).catch(() => {}));
        }
      }
      offset = res.next_offset || '';
    } while (offset);
  } catch (e) {
    console.error('[gifts] sync error:', e.message);
  } finally { syncing = false; }
}

// ───────────── Файлы подарков (прокси file API) ─────────────
const imgCache = new Map();
export async function giftFile(fileId) {
  if (imgCache.has(fileId)) return imgCache.get(fileId);
  const f = await callApi('getFile', { file_id: fileId });
  const r = await fetch(`${cfg.API_ROOT}/file/bot${cfg.BOT_TOKEN}/${f.file_path}`);
  if (!r.ok) throw new Error('file');
  const buf = Buffer.from(await r.arrayBuffer());
  if (imgCache.size > 500) imgCache.clear();
  imgCache.set(fileId, buf);
  return buf;
}

// ───────────── Хендлеры бота ─────────────
export function startBot() {
  if (!bot) { console.log('[bot] BOT_TOKEN не задан — бот не запущен'); return; }

  bot.command('start', async (ctx) => {
    ensureUser(ctx.from, refFromParam(ctx.match));
    const text = '<b>Epic Gift</b> 🎁\n\nКрути ракетку, улучшай подарки и забирай NFT.\n'
      + (cfg.RELAYER_USERNAME ? `\nЧтобы закинуть NFT — отправь подарок на @${cfg.RELAYER_USERNAME}.` : '');
    if (!globalMenuOk && cfg.WEBAPP_URL) {
      bot.api.setChatMenuButton({ chat_id: ctx.chat.id, menu_button: { type: 'web_app', text: 'Играть', web_app: { url: cfg.WEBAPP_URL } } })
        .catch((e) => console.error('[bot] menu (chat):', e.message));
    }
    // Перебираем варианты кнопки, пока StaticGram не примет; рабочий запоминаем
    const bot_ = bot.botInfo?.username || cfg.BOT_USERNAME;
    const variants = [
      ['web_app', { reply_markup: new InlineKeyboard().webApp('🎁 Играть', cfg.WEBAPP_URL) }],
      cfg.APP_SHORT_NAME && ['app_link', { reply_markup: new InlineKeyboard().url('🎁 Играть', `https://staticgram.top/${bot_}/${cfg.APP_SHORT_NAME}`) }],
      ['main_app_link', { reply_markup: new InlineKeyboard().url('🎁 Играть', `https://staticgram.top/${bot_}?startapp=play`) }],
      ['reply_web_app', { reply_markup: { keyboard: [[{ text: '🎁 Играть', web_app: { url: cfg.WEBAPP_URL } }]], resize_keyboard: true, is_persistent: true } }],
      ['url', { reply_markup: new InlineKeyboard().url('🎁 Играть', cfg.WEBAPP_URL) }],
      ['text', {}],
    ].filter(Boolean);
    const ordered = workingVariant ? [variants.find((v) => v[0] === workingVariant), ...variants.filter((v) => v[0] !== workingVariant)].filter(Boolean) : variants;
    for (const [name, extra] of ordered) {
      try {
        await ctx.reply(name === 'text' ? `${text}\n\n👉 ${cfg.WEBAPP_URL}` : text, { parse_mode: 'HTML', ...extra });
        if (workingVariant !== name) { workingVariant = name; console.log(`[bot] кнопка /start: работает вариант «${name}»`); }
        break;
      } catch (e) { console.error(`[bot] /start вариант «${name}» отклонён:`, e.message); }
    }
  });

  bot.on('pre_checkout_query', async (ctx) => {
    const ok = /^dep:\d+:\d+$/.test(ctx.preCheckoutQuery.invoice_payload);
    await ctx.answerPreCheckoutQuery(ok, ok ? undefined : { error_message: 'Неверный счёт' });
  });

  bot.on('message:successful_payment', async (ctx) => {
    const p = ctx.message.successful_payment;
    const [, uid] = p.invoice_payload.split(':');
    const credited = creditDeposit(Number(uid), p.total_amount, p.telegram_payment_charge_id);
    if (credited) {
      hooks.onBalance(Number(uid));
      const ref = getUser(Number(uid))?.ref_by;
      if (ref) hooks.onBalance(ref);
      await ctx.reply(`✅ Баланс пополнен на ${p.total_amount} ⭐`, { reply_markup: appButton('Играть') })
        .catch(() => ctx.reply(`✅ Баланс пополнен на ${p.total_amount} ⭐`).catch(() => {}));
    }
  });

  bot.on('business_connection', async (ctx) => {
    const c = ctx.businessConnection;
    if (!isAdmin(c.user.id)) return;
    if (c.is_enabled) {
      kvSet('business_connection_id', c.id);
      await bot.api.sendMessage(c.user.id, '✅ Аккаунт-ретранслятор подключён, синхронизирую подарки…').catch(() => {});
      syncGifts();
    } else if (kvGet('business_connection_id') === c.id) kvSet('business_connection_id', '');
  });

  // ── Админ-команды ──
  bot.command('setprice', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const m = ctx.match.match(/^(.+)\s+(\d+)$/);
    if (!m) return ctx.reply('Формат: /setprice Plush Pepe 15000');
    db.prepare('INSERT INTO prices(collection,value) VALUES(?,?) ON CONFLICT(collection) DO UPDATE SET value=excluded.value').run(m[1].trim(), Number(m[2]));
    ctx.reply(`Цена «${m[1].trim()}» = ${m[2]} ⭐`);
  });
  bot.command('prices', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const used = db.prepare("SELECT title, COUNT(*) c FROM items WHERE status='available' GROUP BY title").all();
    const prices = Object.fromEntries(db.prepare('SELECT * FROM prices').all().map((p) => [p.collection.toLowerCase(), p.value]));
    ctx.reply(used.map((u) => `${u.title} ×${u.c}: ${prices[u.title.toLowerCase()] ?? '❗️ нет цены'}${prices[u.title.toLowerCase()] ? ' ⭐' : ''}`).join('\n') || 'Подарков пока нет');
  });
  bot.command('addbalance', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const [who, amt] = ctx.match.trim().split(/\s+/);
    const amount = Math.trunc(Number(amt));
    if (!who || !amount) return ctx.reply('Формат:\n/addbalance @username 500\n/addbalance 123456789 500\n(минус — списать: /addbalance @username -100)');
    let id = Number(who);
    if (!id) {
      const u = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(who.replace('@', ''));
      if (!u) return ctx.reply(`Игрок ${who} не найден. Он должен хотя бы раз нажать /start или открыть игру.`);
      id = u.id;
    }
    ensureUser({ id });
    try {
      db.transaction(() => { addBalance(id, amount, 'admin', { by: ctx.from.id }); if (amount > 0) addWagerReq(id, amount); })();
    } catch (e) { return ctx.reply(`Не вышло: ${e.message}`); }
    hooks.onBalance(id);
    const u = getUser(id);
    ctx.reply(`✅ ${amount > 0 ? 'Начислено' : 'Списано'} ${Math.abs(amount)} ⭐ → ${u.username ? '@' + u.username : u.first_name} (id ${id})\nБаланс: ${u.balance} ⭐`);
    if (amount > 0) bot.api.sendMessage(id, `🎁 Вам начислено ${amount} ⭐ на баланс Epic Gift`, { reply_markup: appButton('Играть') })
      .catch(() => bot.api.sendMessage(id, `🎁 Вам начислено ${amount} ⭐ на баланс Epic Gift`).catch(() => {}));
  });
  bot.command('user', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const q = ctx.match.trim().replace('@', '');
    const u = Number(q) ? getUser(Number(q)) : db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(q);
    if (!u) return ctx.reply('Не найден. Формат: /user @username или /user 123456789');
    const dep = db.prepare('SELECT COALESCE(SUM(amount),0) s FROM payments WHERE user_id=?').get(u.id).s;
    ctx.reply(`👤 ${u.first_name}${u.username ? ' @' + u.username : ''}\nid: ${u.id}\nБаланс: ${u.balance} ⭐\nДепозиты: ${dep} ⭐\nОсталось отыграть: ${u.wager_left} ⭐`);
  });
  bot.callbackQuery(/^wd:(ok|no):(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery({ text: 'Только для админа' });
    const [, act, id] = ctx.match;
    try {
      if (act === 'ok') { await payoutWithdrawal(Number(id), ctx.from.id); await ctx.answerCallbackQuery({ text: 'Отправлено' }); }
      else { await declineWithdrawal(Number(id), ctx.from.id); await ctx.answerCallbackQuery({ text: 'Отклонено, звёзды возвращены' }); }
      await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n${act === 'ok' ? '✅ Одобрено' : '❌ Отклонено'} — ${ctx.from.first_name}`).catch(() => {});
    } catch (e) { await ctx.answerCallbackQuery({ text: e.message.slice(0, 190), show_alert: true }); }
  });
  bot.command('withdrawals', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const rows = db.prepare("SELECT w.*, u.username, u.first_name FROM withdrawals w JOIN users u ON u.id=w.user_id WHERE w.status='pending' ORDER BY w.id").all();
    if (!rows.length) return ctx.reply('Заявок на вывод нет');
    for (const w of rows.slice(0, 20)) {
      await ctx.reply(`💸 #${w.id} · ${w.username ? '@' + w.username : w.first_name} (id ${w.user_id}) · ${w.amount} ⭐`,
        { reply_markup: new InlineKeyboard().text('✅ Одобрить', `wd:ok:${w.id}`).text('❌ Отклонить', `wd:no:${w.id}`) });
    }
  });
  bot.command('stats', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const s = db.prepare(`SELECT
      (SELECT COUNT(*) FROM users) users,
      (SELECT COALESCE(SUM(amount),0) FROM payments) deposits,
      (SELECT COALESCE(SUM(balance),0) FROM users) balances,
      (SELECT COUNT(*) FROM items WHERE owner_id IS NULL AND status='available') house,
      (SELECT COALESCE(SUM(amount),0) FROM withdrawals WHERE status='done') wd,
      (SELECT COUNT(*) FROM withdrawals WHERE status='pending') wdp`).get();
    ctx.reply(`👥 ${s.users}\n💰 Депозиты: ${s.deposits} ⭐\n🏦 На балансах: ${s.balances} ⭐\n💸 Выведено: ${s.wd} ⭐ · ждут одобрения: ${s.wdp} (/withdrawals)\n🎁 NFT на складе: ${s.house}\n🔗 Ретранслятор: ${businessConnectionId() ? 'подключён' : 'нет'}`);
  });
  bot.command('sync', async (ctx) => { if (isAdmin(ctx.from.id)) { await syncGifts(); ctx.reply('Синхронизировано'); } });

  bot.catch((e) => console.error('[bot]', e.message));
  console.log('[bot] WEBAPP_URL =', JSON.stringify(cfg.WEBAPP_URL));
  if (!/^https:\/\/[^\s/]+\.[^\s/]+/.test(cfg.WEBAPP_URL)) console.error('[bot] WEBAPP_URL должен начинаться с https:// — сейчас:', JSON.stringify(cfg.WEBAPP_URL));

  const run = async () => {
    try {
      await bot.api.deleteWebhook().catch(() => {});
      await bot.start({
        allowed_updates: ['message', 'callback_query', 'pre_checkout_query', 'business_connection'],
        onStart: async (me) => {
          console.log(`[bot] @${me.username} запущен`);
          if (!cfg.WEBAPP_URL) return;
          try {
            await bot.api.setChatMenuButton({ menu_button: { type: 'web_app', text: 'Играть', web_app: { url: cfg.WEBAPP_URL } } });
            globalMenuOk = true;
            console.log('[bot] кнопка меню установлена');
          } catch (e) {
            console.error('[bot] общая кнопка меню не принята:', e.message, '— ставлю каждому игроку при /start');
          }
        },
      });
    } catch (e) {
      const conflict = e?.error_code === 409 || /409|Conflict/.test(e?.message || '');
      console.error(conflict ? '[bot] 409: работает другая копия бота, переподключаюсь через 5 с' : `[bot] polling упал: ${e.message}, перезапуск через 5 с`);
      setTimeout(run, 5000);
    }
  };
  run();
  setInterval(syncGifts, cfg.GIFT_SYNC_MS);
  syncGifts();
}
