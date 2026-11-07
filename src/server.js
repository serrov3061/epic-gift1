import express from 'express';
import zlib from 'zlib';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { cfg } from './config.js';
import {
  db, AppError, ensureUser, getUser, userItems, houseItems, publicItem, itemValue, addBalance,
} from './db.js';
import { parseInitData, refFromParam } from './auth.js';
import { CrashGame } from './crash.js';
import { doUpgrade, MULTIPLIERS } from './upgrade.js';
import {
  startBot, setBotHooks, createDepositLink, withdrawStars, transferItem, giftFile, bot,
} from './bot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '../public'), { maxAge: cfg.DEV_MODE ? 0 : '1h' }));
app.get('/vendor/lottie.js', (req, res) => res.sendFile(path.join(__dirname, '../node_modules/lottie-web/build/player/lottie_light.min.js')));

// ───────────── auth ─────────────
function authUser(initData) {
  const { user, startParam } = parseInitData(initData);
  return ensureUser(user, refFromParam(startParam));
}
const auth = (req, res, next) => {
  try { req.user = authUser(req.get('x-init-data')); next(); } catch (e) { res.status(401).json({ error: e.message }); }
};
const h = (fn) => async (req, res) => {
  try { res.json(await fn(req)); } catch (e) {
    if (!(e instanceof AppError)) console.error(e);
    res.status(e.status || 400).json({ error: e instanceof AppError ? e.message : 'Ошибка сервера' });
  }
};

// ───────────── realtime ─────────────
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const sockets = new Map(); // userId -> Set<ws>
const live = []; // лента крупных выигрышей

const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
const broadcast = (msg) => { const s = JSON.stringify(msg); wss.clients.forEach((ws) => ws.readyState === 1 && ws.send(s)); };
const toUser = (uid, msg) => sockets.get(uid)?.forEach((ws) => send(ws, msg));
const pushBalance = (uid) => { const u = getUser(uid); if (u) toUser(uid, { type: 'balance', balance: u.balance }); };
const pushInventory = (uid) => toUser(uid, { type: 'inventory' });
function pushLive(e) {
  const u = getUser(e.userId);
  const ev = { ...e, name: u?.first_name, photo: u?.photo_url, at: Date.now() };
  delete ev.userId;
  live.unshift(ev); live.length = Math.min(live.length, 20);
  broadcast({ type: 'live', event: ev });
}

wss.on('connection', (ws, req) => {
  let user;
  try { user = authUser(new URL(req.url, 'http://x').searchParams.get('initData')); } catch { return ws.close(4001, 'auth'); }
  if (!sockets.has(user.id)) sockets.set(user.id, new Set());
  sockets.get(user.id).add(ws);
  send(ws, crash.snapshot());
  pushOnline();
  ws.on('close', () => { sockets.get(user.id)?.delete(ws); if (!sockets.get(user.id)?.size) sockets.delete(user.id); pushOnline(); });
});
let onlineT = null;
function pushOnline() {
  if (onlineT) return;
  onlineT = setTimeout(() => { onlineT = null; broadcast({ type: 'online', n: sockets.size }); }, 500);
}

const crash = new CrashGame();
let stateTimer = null;
crash.on('state', () => { // склеиваем частые обновления
  if (stateTimer) return;
  stateTimer = setTimeout(() => { stateTimer = null; broadcast(crash.snapshot()); }, 60);
});
crash.on('balance', pushBalance);
crash.on('inventory', pushInventory);
crash.on('live', pushLive);
setBotHooks({ onBalance: pushBalance, onInventory: pushInventory });

// ───────────── API ─────────────
const weekStart = () => { const d = new Date(); const day = (d.getUTCDay() + 6) % 7; d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - day); return d.getTime(); };
const refLink = (id) => (cfg.APP_SHORT_NAME
  ? `https://staticgram.top/${cfg.BOT_USERNAME}/${cfg.APP_SHORT_NAME}?startapp=ref${id}`
  : `https://staticgram.top/${cfg.BOT_USERNAME}?start=ref${id}`);

app.get('/api/config', h(() => ({
  bot: cfg.BOT_USERNAME, relayer: cfg.RELAYER_USERNAME, minBet: cfg.MIN_BET, minDeposit: cfg.MIN_DEPOSIT,
  minWithdraw: cfg.MIN_WITHDRAW, sellRate: cfg.SELL_RATE, refPercent: cfg.REF_PERCENT, multipliers: MULTIPLIERS,
  upgradeEdge: cfg.UPGRADE_EDGE, maxChance: cfg.UPGRADE_MAX_CHANCE, minChance: cfg.UPGRADE_MIN_CHANCE, dev: cfg.DEV_MODE,
})));

app.get('/api/me', auth, h((req) => {
  const u = req.user;
  const refs = db.prepare('SELECT COUNT(*) c FROM users WHERE ref_by=?').get(u.id).c;
  return {
    user: { id: u.id, name: u.first_name, username: u.username, photo: u.photo_url, balance: u.balance, refEarned: u.ref_earned, refs },
    items: userItems(u.id).map(publicItem),
    refLink: refLink(u.id),
  };
}));

// витрина для лендинга (без авторизации)
app.get('/api/showcase', h(() => houseItems().map(publicItem).sort((a, b) => b.value - a.value).slice(0, 8)));
app.get('/api/shop', auth, h(() => houseItems().map(publicItem).sort((a, b) => a.value - b.value)));
app.get('/api/live', auth, h(() => live));

app.post('/api/deposit', auth, h(async (req) => {
  const amount = Math.floor(Number(req.body.amount));
  if (!(amount >= cfg.MIN_DEPOSIT) || amount > 100000) throw new AppError(`Сумма от ${cfg.MIN_DEPOSIT} до 100 000 ⭐`);
  if (!bot) throw new AppError('Бот не настроен (BOT_TOKEN)');
  return { link: await createDepositLink(req.user.id, amount) };
}));

app.post('/api/withdraw', auth, h(async (req) => {
  const amount = Math.floor(Number(req.body.amount));
  if (!(amount >= cfg.MIN_WITHDRAW)) throw new AppError(`Минимальный вывод ${cfg.MIN_WITHDRAW} ⭐`);
  if (!bot) throw new AppError('Бот не настроен (BOT_TOKEN)');
  try { await withdrawStars(req.user.id, amount); } finally { pushBalance(req.user.id); }
  return { ok: true, balance: getUser(req.user.id).balance };
}));

app.post('/api/items/:id/sell', auth, h((req) => {
  const uid = req.user.id;
  const res = db.transaction(() => {
    const it = db.prepare("SELECT * FROM items WHERE id=? AND owner_id=? AND status='available'").get(Number(req.params.id), uid);
    if (!it) throw new AppError('Подарок не найден');
    const price = Math.floor(itemValue(it) * cfg.SELL_RATE);
    db.prepare('UPDATE items SET owner_id=NULL WHERE id=?').run(it.id);
    addBalance(uid, price, 'sell', { item: it.id });
    return { price };
  })();
  return { ...res, balance: getUser(uid).balance };
}));

app.post('/api/items/:id/withdraw', auth, h(async (req) => {
  const uid = req.user.id;
  const it = db.prepare("SELECT * FROM items WHERE id=? AND owner_id=? AND status='available'").get(Number(req.params.id), uid);
  if (!it) throw new AppError('Подарок не найден');
  if (!it.can_transfer || !it.owned_gift_id) throw new AppError('Этот подарок пока нельзя вывести');
  if (!db.prepare("UPDATE items SET status='withdrawing' WHERE id=? AND status='available'").run(it.id).changes) throw new AppError('Подарок занят');
  try {
    await transferItem(it, uid);
    db.prepare("UPDATE items SET status='withdrawn' WHERE id=?").run(it.id);
    return { ok: true };
  } catch (e) {
    db.prepare("UPDATE items SET status='available' WHERE id=?").run(it.id);
    throw e instanceof AppError ? e : new AppError('Не удалось вывести, попробуйте позже');
  }
}));

app.post('/api/crash/bet', auth, h((req) => crash.placeBet(req.user.id, req.body)));
app.post('/api/crash/cashout', auth, h((req) => crash.cashout(req.user.id)));

app.post('/api/upgrade', auth, h((req) => {
  const r = doUpgrade(req.user.id, req.body);
  pushBalance(req.user.id);
  if (r.win && r.targetValue >= r.inputValue * 3) pushLive({ userId: req.user.id, kind: 'upgrade', item: r.item, stars: r.stars, chance: r.chance });
  return { ...r, balance: getUser(req.user.id).balance };
}));

app.get('/api/rating', auth, h((req) => {
  const from = weekStart();
  const rows = db.prepare(`SELECT t.user_id id, SUM(t.amount) score, u.first_name name, u.photo_url photo
    FROM tx t JOIN users u ON u.id=t.user_id WHERE t.type='wager' AND t.created_at>=? GROUP BY t.user_id ORDER BY score DESC`).all(from);
  const idx = rows.findIndex((r) => r.id === req.user.id);
  return {
    endsAt: from + 7 * 864e5, prizes: cfg.RATING_PRIZES, participants: rows.length,
    top: rows.slice(0, 50).map((r, i) => ({ rank: i + 1, name: r.name, photo: r.photo, score: r.score, prize: cfg.RATING_PRIZES[i] || 0 })),
    me: { rank: idx + 1 || null, score: rows[idx]?.score || 0 },
  };
}));

// Картинка NFT: свой стикер из StaticGram → иначе рендер коллекции с Fragment по slug
const fragment = (slug, ext) => `https://nft.fragment.com/gift/${slug.toLowerCase()}.${ext}`;
app.get('/img/:id', async (req, res) => {
  const it = db.prepare('SELECT image_file_id, slug FROM items WHERE id=?').get(Number(req.params.id));
  if (!it) return res.sendStatus(404);
  if (it.image_file_id && bot) {
    try {
      const buf = await giftFile(it.image_file_id);
      return res.set('content-type', 'image/webp').set('cache-control', 'public, max-age=86400').send(buf);
    } catch { /* fallback ниже */ }
  }
  if (it.slug) return res.redirect(302, fragment(it.slug, 'webp'));
  res.sendStatus(404);
});

// Анимация NFT (Lottie JSON): .tgs из StaticGram (gunzip) → иначе Fragment через прокси (CORS)
const lottieCache = new Map();
app.get('/lottie/:id', async (req, res) => {
  const it = db.prepare('SELECT lottie_file_id, slug FROM items WHERE id=?').get(Number(req.params.id));
  if (!it) return res.sendStatus(404);
  const key = it.lottie_file_id || it.slug;
  try {
    let json = lottieCache.get(key);
    if (!json) {
      if (it.lottie_file_id && bot) json = zlib.gunzipSync(await giftFile(it.lottie_file_id));
      else if (it.slug) {
        const r = await fetch(fragment(it.slug, 'lottie.json'));
        if (!r.ok) throw new Error('fragment');
        json = Buffer.from(await r.arrayBuffer());
      } else throw new Error('none');
      if (lottieCache.size > 200) lottieCache.delete(lottieCache.keys().next().value);
      lottieCache.set(key, json);
    }
    res.set('content-type', 'application/json').set('cache-control', 'public, max-age=86400').send(json);
  } catch { res.sendStatus(404); }
});

// ───────────── DEV: тестовые данные ─────────────
if (cfg.DEV_MODE) {
  app.post('/api/dev/faucet', auth, h((req) => {
    db.transaction(() => addBalance(req.user.id, 1000, 'dev'))();
    pushBalance(req.user.id);
    return { balance: getUser(req.user.id).balance };
  }));
  // реальные коллекции Telegram — картинки/анимации подтягиваются с Fragment по slug
  const demo = [
    ['Plush Pepe', 'PlushPepe', 25000, '#2e7d4f', '#0c2a19', [12, 377]],
    ["Durov's Cap", 'DurovsCap', 9000, '#5b3b8c', '#1b0f33', [41, 1203]],
    ['Precious Peach', 'PreciousPeach', 6200, '#d9764a', '#4a1c0c', [88, 905]],
    ['Heart Locket', 'HeartLocket', 4200, '#b3264a', '#3d0816', [7, 640]],
    ['Astral Shard', 'AstralShard', 3600, '#4a5fd8', '#111a5c', [155, 2077]],
    ['Swiss Watch', 'SwissWatch', 2600, '#3d7fb0', '#0d2b40', [301, 1777]],
    ['Signet Ring', 'SignetRing', 1800, '#c49a2c', '#3d2c05', [64, 999]],
    ['Genie Lamp', 'GenieLamp', 1500, '#7a3fd0', '#200c47', [210, 3301]],
    ['Kissed Frog', 'KissedFrog', 1300, '#3fae66', '#0d3b1d', [500, 4122]],
    ['Loot Bag', 'LootBag', 950, '#8a5a2b', '#2b1708', [77, 2500]],
    ['Toy Bear', 'ToyBear', 700, '#b5657a', '#3a1420', [999, 5555]],
    ['Lol Pop', 'LolPop', 380, '#c94fb0', '#3d0c33', [1234, 8080]],
  ];
  if (!db.prepare('SELECT COUNT(*) c FROM items').get().c) {
    const ins = db.prepare('INSERT INTO items(owner_id,title,slug,number,model,backdrop,color1,color2,created_at) VALUES(?,?,?,?,?,?,?,?,?)');
    for (const [t, pas, v, c1, c2, nums] of demo) {
      db.prepare('INSERT OR REPLACE INTO prices VALUES(?,?)').run(t, v);
      for (const n of nums) ins.run(null, t, `${pas}-${n}`, n, null, null, c1, c2, Date.now());
    }
    ensureUser({ id: 1, first_name: 'Dev 1' });
    // пара подарков сразу в инвентарь dev-игрока 1
    db.prepare("UPDATE items SET owner_id=1 WHERE slug IN ('LolPop-1234','KissedFrog-500','ToyBear-999')").run();
  }
  console.log('[dev] DEV_MODE: откройте http://localhost:' + cfg.PORT + '/?dev=1');
}

server.listen(cfg.PORT, () => console.log(`[http] Epic Gift на :${cfg.PORT}`));
startBot();
