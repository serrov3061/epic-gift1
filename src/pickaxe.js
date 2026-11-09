import crypto from 'crypto';
import { cfg } from './config.js';
import { db, AppError, addBalance, logTx, consumeWager } from './db.js';

/*
 * «Кирка»: игрок ставит звёзды, кирка падает в шахту и ломает блоки, пока не кончится прочность.
 * Честность: итоговый множитель выбирается по опубликованной таблице (возврат игрокам = 1 − PICKAXE_EDGE).
 * Шахта (какие блоки, сколько урона) строится под этот множитель — сумма иксов сломанных блоков
 * всегда ровно равна выпавшему множителю, а прочность кончается ровно на последнем блоке.
 */

export const PICK_VALUES = [0.2, 0.3, 0.5, 0.7, 1, 1.2, 1.5, 2, 3, 5, 10, 25, 50, 100];
export const PICK_MAX_HP = 100;

// Блоки и их иксы (в сотых долях: 10 = x0.1)
export const BLOCKS = {
  coal: 10, gold: 20, ruby: 30, sapphire: 50, emerald: 100, goldblock: 200, diamond: 500, amethyst: 1000, chest: 2500,
};
const DENOMS = Object.entries(BLOCKS).sort((a, b) => b[1] - a[1]); // от дорогих к дешёвым
const HARD = { stone: 1, coal: 1.1, gold: 1.2, ruby: 1.3, sapphire: 1.4, emerald: 1.6, goldblock: 1.7, diamond: 1.9, amethyst: 2.1, chest: 1.5, tnt: 2.6 };

/** Таблица шансов: p ∝ x^-a (для x<1 дополнительно × x^1.5), a подбирается так, чтобы средний возврат = 1 − edge. */
export function buildTable(edge = cfg.PICKAXE_EDGE) {
  const V = PICK_VALUES.filter((v) => v <= (cfg.PICKAXE_MAX || 100));
  const weights = (a) => V.map((v) => v ** -a * (v < 1 ? v ** 1.5 : 1));
  const ev = (a) => { const w = weights(a); const s = w.reduce((x, y) => x + y, 0); return V.reduce((x, v, i) => x + v * w[i], 0) / s; };
  let lo = 0.05, hi = 8;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (ev(m) > 1 - edge) lo = m; else hi = m; }
  const w = weights(lo); const s = w.reduce((x, y) => x + y, 0);
  return V.map((v, i) => ({ x: v, p: w[i] / s }));
}
let TABLE = buildTable();
export const pickTable = () => TABLE;

// детерминированный ГПСЧ для раскладки шахты (результат уже выбран криптостойко)
function prng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Строит последовательность событий (блоков), сумма иксов которых = mult, урон в сумме = PICK_MAX_HP. */
export function buildMine(mult, seed) {
  const rnd = prng(seed);
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  let rem = Math.round(mult * 100);
  const items = [];
  // раскладываем множитель на блоки; при большом остатке берём крупные, иначе — случайные подходящие
  while (rem > 0) {
    const fit = DENOMS.filter(([, v]) => v <= rem);
    let pick;
    if (items.length >= 12 || rem >= 2500) pick = fit[0];
    else {
      const w = fit.map(([, v]) => Math.sqrt(v));
      let r = rnd() * w.reduce((x, y) => x + y, 0), i = 0;
      while ((r -= w[i]) > 0 && i < fit.length - 1) i++;
      pick = fit[i];
    }
    items.push({ k: pick[0], v: pick[1] });
    rem -= pick[1];
  }
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }

  // иногда несколько ценных блоков забирает взрыв динамита
  const events = [];
  for (let i = 0; i < items.length;) {
    const left = items.length - i;
    if (left >= 2 && rnd() < 0.22) {
      const n = Math.min(left, ri(2, 4));
      const parts = items.slice(i, i + n);
      events.push({ k: 'tnt', v: parts.reduce((s, p) => s + p.v, 0), parts: parts.map((p) => p.k) });
      i += n;
    } else { events.push(items[i]); i++; }
  }
  // пустая порода между ценными блоками
  const stones = ri(5, 11);
  for (let s = 0; s < stones; s++) events.splice(ri(0, events.length), 0, { k: 'stone', v: 0 });
  // последним ломается всегда что-то: если вышел камень — ок, кирка ломается о него

  // урон: пропорционально твёрдости, сумма ровно PICK_MAX_HP
  const hw = events.map((e) => HARD[e.k] * (0.8 + rnd() * 0.4));
  const total = hw.reduce((x, y) => x + y, 0);
  let left = PICK_MAX_HP;
  events.forEach((e, i) => {
    e.dmg = i === events.length - 1 ? left : Math.max(1, Math.min(left - (events.length - 1 - i), Math.round((hw[i] / total) * PICK_MAX_HP)));
    left -= e.dmg;
  });
  // путь: колонка 0..6, кирка иногда смещается вбок
  let col = 3;
  events.forEach((e) => {
    const r = rnd();
    const dx = r < 0.2 ? -1 : r > 0.8 ? 1 : 0;
    col = Math.max(1, Math.min(5, col + dx));
    e.col = col; e.gap = ri(0, 2);
  });
  return events;
}

/** Длительность анимации на клиенте (мс) — баланс в других вкладках раскрываем после неё. */
export const revealMs = (events) => 1600 + events.length * 430;

export function playPickaxe(userId, { amount }) {
  if (!/^\d{1,9}$/.test(String(amount ?? ''))) throw new AppError('Неверная сумма');
  amount = Number(amount);
  if (amount < cfg.MIN_BET) throw new AppError(`Минимальная ставка ${cfg.MIN_BET} ⭐`);
  if (amount > cfg.MAX_BET) throw new AppError(`Максимальная ставка ${cfg.MAX_BET} ⭐`);

  // криптостойкий бросок по таблице
  const roll = crypto.randomInt(0, 1_000_000_000) / 1_000_000_000;
  let acc = 0, mult = TABLE[TABLE.length - 1].x;
  for (const row of TABLE) { acc += row.p; if (roll < acc) { mult = row.x; break; } }
  let payout = Math.floor(amount * mult);
  if (cfg.MAX_PAYOUT > 0 && payout > cfg.MAX_PAYOUT) payout = cfg.MAX_PAYOUT;

  const seed = crypto.randomInt(0, 2 ** 31);
  const events = buildMine(mult, seed);

  db.transaction(() => {
    addBalance(userId, -amount, 'pickaxe_bet');
    consumeWager(userId, amount);
    logTx(userId, 'wager', amount, { game: 'pickaxe', mult, roll });
    if (payout > 0) addBalance(userId, payout, 'pickaxe_win', { m: mult });
  })();

  return { mult, payout, amount, events, maxHp: PICK_MAX_HP, revealMs: revealMs(events) };
}
