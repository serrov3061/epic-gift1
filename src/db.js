import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { cfg } from './config.js';

fs.mkdirSync(path.dirname(path.resolve(cfg.DB_PATH)), { recursive: true });
export const db = new Database(cfg.DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT, first_name TEXT, photo_url TEXT,
  balance INTEGER NOT NULL DEFAULT 0,
  ref_by INTEGER, ref_earned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER,                 -- NULL = склад казино (цели апгрейда)
  owned_gift_id TEXT UNIQUE,        -- id подарка на бизнес-аккаунте-ретрансляторе
  title TEXT NOT NULL,              -- "Plush Pepe"
  slug TEXT,                        -- "PlushPepe-123"
  number INTEGER,
  model TEXT, rarity INTEGER,
  backdrop TEXT, color1 TEXT, color2 TEXT,
  image_file_id TEXT,
  transfer_cost INTEGER NOT NULL DEFAULT 0,
  can_transfer INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'available',   -- available | withdrawing | withdrawn
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS items_owner ON items(owner_id, status);
CREATE TABLE IF NOT EXISTS prices (collection TEXT PRIMARY KEY, value INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tx (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL, type TEXT NOT NULL, amount INTEGER NOT NULL,
  meta TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tx_type_time ON tx(type, created_at);
CREATE TABLE IF NOT EXISTS payments (
  charge_id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, amount INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rounds (
  id INTEGER PRIMARY KEY, seed TEXT NOT NULL, hash TEXT NOT NULL, crash REAL NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
`);

// миграции
const itemCols = db.prepare('PRAGMA table_info(items)').all().map((c) => c.name);
if (!itemCols.includes('lottie_file_id')) db.exec('ALTER TABLE items ADD COLUMN lottie_file_id TEXT');
const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userCols.includes('wager_left')) db.exec('ALTER TABLE users ADD COLUMN wager_left INTEGER NOT NULL DEFAULT 0');

export class AppError extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}

const now = () => Date.now();

export const kvGet = (k) => db.prepare('SELECT v FROM kv WHERE k=?').get(k)?.v ?? null;
export const kvSet = (k, v) => db.prepare('INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, v);

export const getUser = (id) => db.prepare('SELECT * FROM users WHERE id=?').get(id);

const safePhoto = (u) => (typeof u === 'string' && /^https:\/\/[^\s'"()<>\\]+$/.test(u) ? u : null);
const safeName = (n) => (typeof n === 'string' ? n.replace(/[\u0000-\u001f\u200b-\u200f\u202a-\u202e]/g, '').slice(0, 64) : n);

export function ensureUser({ id, first_name, username, photo_url }, refBy = null) {
  photo_url = safePhoto(photo_url); first_name = safeName(first_name);
  const u = getUser(id);
  if (u) {
    if (first_name !== undefined) {
      db.prepare('UPDATE users SET first_name=?, username=?, photo_url=COALESCE(?, photo_url) WHERE id=?')
        .run(first_name || u.first_name, username || null, photo_url || null, id);
    }
    return getUser(id);
  }
  const ref = refBy && refBy !== id && getUser(refBy) ? refBy : null;
  db.prepare('INSERT INTO users(id, username, first_name, photo_url, ref_by, created_at) VALUES(?,?,?,?,?,?)')
    .run(id, username || null, first_name || 'Игрок', photo_url || null, ref, now());
  return getUser(id);
}

export const logTx = (userId, type, amount, meta = null) =>
  db.prepare('INSERT INTO tx(user_id,type,amount,meta,created_at) VALUES(?,?,?,?,?)')
    .run(userId, type, amount, meta ? JSON.stringify(meta) : null, now());

/** Атомарно меняет баланс; при нехватке бросает AppError. Вызывать внутри db.transaction. */
export function addBalance(userId, delta, type, meta) {
  delta = Math.trunc(delta);
  if (delta === 0) return;
  const r = db.prepare('UPDATE users SET balance = balance + ? WHERE id = ? AND balance + ? >= 0').run(delta, userId, delta);
  if (!r.changes) throw new AppError('Недостаточно звёзд');
  logTx(userId, type, delta, meta);
}

/** Отыгрыш: пополнения/бонусы нужно прокрутить в ставках перед выводом (защита от отмыва и самореферальства). */
export const addWagerReq = (userId, amount) =>
  db.prepare('UPDATE users SET wager_left = wager_left + ? WHERE id=?').run(Math.max(0, Math.floor(amount * cfg.WAGER_MULT)), userId);
export const consumeWager = (userId, amount) =>
  db.prepare('UPDATE users SET wager_left = MAX(0, wager_left - ?) WHERE id=?').run(Math.max(0, Math.floor(amount)), userId);

const priceStmt = db.prepare('SELECT value FROM prices WHERE collection = ? COLLATE NOCASE');
export const itemValue = (it) => priceStmt.get(it.title)?.value ?? cfg.DEFAULT_NFT_PRICE;

export function publicItem(it) {
  return {
    id: it.id, title: it.title, slug: it.slug, number: it.number, model: it.model,
    rarity: it.rarity, backdrop: it.backdrop, color1: it.color1, color2: it.color2,
    image: it.image_file_id || it.slug ? `/img/${it.id}` : null,
    anim: it.lottie_file_id || it.slug ? `/lottie/${it.id}` : null,
    value: itemValue(it), canTransfer: !!it.can_transfer, transferCost: it.transfer_cost, status: it.status,
  };
}

export const userItems = (userId) =>
  db.prepare("SELECT * FROM items WHERE owner_id=? AND status='available' ORDER BY id DESC").all(userId);

export const houseItems = () =>
  db.prepare("SELECT * FROM items WHERE owner_id IS NULL AND status='available'").all();

/** Забирает предметы у пользователя на склад. Вызывать внутри транзакции. */
export function takeUserItems(userId, ids) {
  ids = [...new Set((ids || []).map(Number))];
  const items = ids.map((id) => {
    const it = db.prepare("SELECT * FROM items WHERE id=? AND owner_id=? AND status='available'").get(id, userId);
    if (!it) throw new AppError('Подарок недоступен');
    return it;
  });
  for (const it of items) db.prepare('UPDATE items SET owner_id=NULL WHERE id=?').run(it.id);
  return items;
}

/** Зачисление депозита звёздами + реферальный бонус. Идемпотентно по charge_id. */
export const creditDeposit = db.transaction((userId, amount, chargeId) => {
  const ins = db.prepare('INSERT OR IGNORE INTO payments(charge_id,user_id,amount,created_at) VALUES(?,?,?,?)')
    .run(chargeId, userId, amount, now());
  if (!ins.changes) return false;
  ensureUser({ id: userId });
  addBalance(userId, amount, 'deposit', { chargeId });
  addWagerReq(userId, amount);
  const u = getUser(userId);
  if (u.ref_by) {
    const bonus = Math.floor((amount * cfg.REF_PERCENT) / 100);
    if (bonus > 0) {
      addBalance(u.ref_by, bonus, 'ref_bonus', { from: userId });
      addWagerReq(u.ref_by, bonus);
      db.prepare('UPDATE users SET ref_earned = ref_earned + ? WHERE id=?').run(bonus, u.ref_by);
    }
  }
  return true;
});
