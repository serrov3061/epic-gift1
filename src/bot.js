import { Bot, InlineKeyboard } from 'grammy';
import { cfg } from './config.js';
import { db, kvGet, kvSet, ensureUser, creditDeposit, getUser, addBalance, AppError } from './db.js';
import { refFromParam } from './auth.js';

export const bot = cfg.BOT_TOKEN ? new Bot(cfg.BOT_TOKEN, { client: { apiRoot: cfg.API_ROOT } }) : null;
const isAdmin = (id) => cfg.ADMIN_IDS.includes(id);
let globalMenuOk = false;
let hooks = { onBalance: () => {}, onInventory: () => {} };
export const setBotHooks = (h) => { hooks = { ...hooks, ...h }; };

const appButton = (text = '🎁 Играть') =>
  new InlineKeyboard().webApp(text, cfg.WEBAPP_URL);

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
export async function withdrawStars(userId, amount) {
  const txId = db.transaction(() => {
    addBalance(userId, -amount, 'withdraw', { status: 'pending' });
    return db.prepare('SELECT last_insert_rowid() id').get().id;
  })();
  try {
    await callApi('withdrawStarBalance', { user_id: userId, star_count: amount, request_id: `w${txId}` });
    db.prepare("UPDATE tx SET meta=? WHERE id=?").run(JSON.stringify({ status: 'done' }), txId);
  } catch (e) {
    if (e instanceof AppError) { // сервер явно отказал — возвращаем звёзды
      db.transaction(() => addBalance(userId, amount, 'withdraw_refund', { txId }))();
      throw new AppError(`Вывод не прошёл: ${e.message}`);
    }
    throw new AppError('Вывод в обработке, если звёзды не придут — напишите в поддержку');
  }
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
        if (r) {
          hooks.onInventory(r.ownerId);
          bot.api.sendMessage(r.ownerId, `🎁 ${r.title} зачислен в инвентарь Epic Gift`, { reply_markup: appButton('Открыть') }).catch(() => {});
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
    // web_app-кнопка → обычная ссылка-кнопка → просто текст (бот ответит в любом случае)
    const variants = [
      { reply_markup: appButton() },
      { reply_markup: new InlineKeyboard().url('🎁 Играть', cfg.WEBAPP_URL) },
      {},
    ];
    for (const [i, extra] of variants.entries()) {
      try {
        await ctx.reply(i ? `${text}\n\n👉 ${cfg.WEBAPP_URL || 'WEBAPP_URL не задан'}` : text, { parse_mode: 'HTML', ...extra });
        if (i) console.error(`[bot] /start отправлен запасным вариантом №${i}: StaticGram не принимает WEBAPP_URL=${JSON.stringify(cfg.WEBAPP_URL)}`);
        break;
      } catch (e) { console.error(`[bot] /start вариант ${i}:`, e.message); }
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
      await ctx.reply(`✅ Баланс пополнен на ${p.total_amount} ⭐`, { reply_markup: appButton('Играть') });
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
    ctx.reply(used.map((u) => `${u.title} ×${u.c}: ${prices[u.title.toLowerCase()] ?? `${cfg.DEFAULT_NFT_PRICE} (по умолч.)`} ⭐`).join('\n') || 'Подарков пока нет');
  });
  bot.command('addbalance', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const [id, amount] = ctx.match.split(/\s+/).map(Number);
    if (!id || !amount) return ctx.reply('Формат: /addbalance <user_id> <сумма>');
    ensureUser({ id });
    db.transaction(() => addBalance(id, amount, 'admin', { by: ctx.from.id }))();
    hooks.onBalance(id);
    ctx.reply(`Готово, баланс ${id}: ${getUser(id).balance} ⭐`);
  });
  bot.command('stats', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const s = db.prepare(`SELECT
      (SELECT COUNT(*) FROM users) users,
      (SELECT COALESCE(SUM(amount),0) FROM payments) deposits,
      (SELECT COALESCE(SUM(balance),0) FROM users) balances,
      (SELECT COUNT(*) FROM items WHERE owner_id IS NULL AND status='available') house`).get();
    ctx.reply(`👥 ${s.users}\n💰 Депозиты: ${s.deposits} ⭐\n🏦 На балансах: ${s.balances} ⭐\n🎁 NFT на складе: ${s.house}\n🔗 Ретранслятор: ${businessConnectionId() ? 'подключён' : 'нет'}`);
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
