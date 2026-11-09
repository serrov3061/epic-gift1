import crypto from 'crypto';
import { EventEmitter } from 'events';
import { cfg } from './config.js';
import { db, AppError, addBalance, getUser, logTx, consumeWager } from './db.js';

// Рост множителя: m(t) = e^(K·t), t в мс. 10 с ≈ 1.82x, 30 с ≈ 6.05x
export const K = 0.00006;
export const multAt = (ms) => Math.max(1, Math.floor(100 * Math.exp(K * Math.max(0, ms))) / 100);
export const msFor = (m) => Math.log(m) / K;

/** Provably fair: P(краш ≥ x) = (1 − edge) / x. hash = sha256(seed) публикуется до раунда, seed — после. */
export function crashFromSeed(seed) {
  const h = crypto.createHmac('sha256', seed).update('epic-gift-rocket').digest('hex');
  const r = parseInt(h.slice(0, 13), 16) / 2 ** 52;
  const c = Math.floor((100 * (1 - cfg.CRASH_EDGE)) / (1 - r)) / 100;
  // Взрывы ниже CRASH_MIN поднимаются ровно до CRASH_MIN. Забрать выигрыш можно только при m > CRASH_MIN,
  // поэтому для любой цели x > CRASH_MIN шанс P(краш > x) не меняется — преимущество казино сохраняется.
  const out = Math.min(cfg.CRASH_MAX || 1000, Math.max(cfg.CRASH_MIN || 1, c));
  if (!Number.isFinite(out)) { console.error('[crash] точка взрыва не число — проверь CRASH_* в переменных'); return 1; }
  return out;
}

export class CrashGame extends EventEmitter {
  constructor() {
    super();
    this.history = db.prepare('SELECT crash FROM rounds ORDER BY id DESC LIMIT 20').all().map((r) => r.crash);
    this.roundId = (db.prepare('SELECT MAX(id) m FROM rounds').get().m || 0);
    this.bets = new Map();
    this.newRound();
    setInterval(() => this.tick(), 50);
  }

  newRound() {
    this.roundId += 1;
    this.seed = crypto.randomBytes(32).toString('hex');
    this.hash = crypto.createHash('sha256').update(this.seed).digest('hex');
    this.crash = crashFromSeed(this.seed);
    this.crashMs = this.crash <= 1 ? 0 : msFor(this.crash);
    this.phase = 'betting';
    this.betEndsAt = Date.now() + cfg.BET_PHASE_MS;
    this.startAt = null;
    this.bets = new Map();
    this.emit('state');
  }

  tick() {
    const t = Date.now();
    if (this.phase === 'betting' && t >= this.betEndsAt) {
      this.phase = 'flying';
      this.startAt = t;
      this.emit('state');
    } else if (this.phase === 'flying') {
      const elapsed = t - this.startAt;
      if (elapsed >= this.crashMs) return this.bust();
      const m = multAt(elapsed);
      for (const [uid, b] of this.bets) {
        if (!b.cashout && b.auto && m >= b.auto) this.payout(uid, b.auto);
      }
    } else if (this.phase === 'crashed' && t >= this.nextAt) {
      this.newRound();
    }
  }

  bust() {
    // автовыводы, которые сервер не успел обработать между тиками
    for (const [uid, b] of this.bets) if (!b.cashout && b.auto && b.auto < this.crash) this.payout(uid, b.auto, true);
    this.phase = 'crashed';
    this.nextAt = Date.now() + cfg.CRASHED_PHASE_MS;
    db.prepare('INSERT OR REPLACE INTO rounds(id,seed,hash,crash,created_at) VALUES(?,?,?,?,?)')
      .run(this.roundId, this.seed, this.hash, this.crash, Date.now());
    this.history.unshift(this.crash);
    this.history.length = Math.min(this.history.length, 20);
    this.emit('state');
  }

  placeBet(userId, { amount = 0, auto = null }) {
    if (this.phase !== 'betting') throw new AppError('Ставки на этот раунд закрыты');
    if (this.bets.has(userId)) throw new AppError('Вы уже сделали ставку');
    if (!/^\d{1,9}$/.test(String(amount ?? ''))) throw new AppError('Неверная сумма');
    amount = Number(amount);
    auto = auto ? Math.floor(Number(auto) * 100) / 100 : null;
    const autoMin = Math.round(((cfg.CRASH_MIN || 1) + 0.01) * 100) / 100;
    if (auto !== null && (!(auto >= autoMin) || auto > cfg.CRASH_MAX)) throw new AppError(`Автовывод от ${autoMin.toFixed(2)}x до ${cfg.CRASH_MAX}x`);

    if (amount < cfg.MIN_BET) throw new AppError(`Минимальная ставка ${cfg.MIN_BET} ⭐`);
    if (amount > cfg.MAX_BET) throw new AppError(`Максимальная ставка ${cfg.MAX_BET} ⭐`);
    const bet = db.transaction(() => {
      addBalance(userId, -amount, 'crash_bet', { round: this.roundId });
      consumeWager(userId, amount);
      logTx(userId, 'wager', amount, { game: 'crash', round: this.roundId });
      return { value: amount, auto, cashout: null, payout: 0 };
    })();

    const u = getUser(userId);
    bet.name = u.first_name;
    bet.photo = u.photo_url;
    this.bets.set(userId, bet);
    this.emit('bet', { uid: userId, name: bet.name, photo: bet.photo, value: bet.value, cashout: null, payout: 0 });
    this.emit('balance', userId);
    return bet;
  }

  cashout(userId) {
    const b = this.bets.get(userId);
    if (this.phase !== 'flying') throw new AppError('Раунд не идёт');
    if (!b || b.cashout) throw new AppError('Нет активной ставки');
    const m = multAt(Date.now() - this.startAt);
    if (m >= this.crash) throw new AppError('Ракета уже улетела');
    if ((cfg.CRASH_MIN || 1) > 1 && m <= cfg.CRASH_MIN) throw new AppError(`Забрать можно после ${cfg.CRASH_MIN.toFixed(2)}x`);
    return this.payout(userId, m);
  }

  payout(userId, m, silent = false) {
    const b = this.bets.get(userId);
    b.cashout = m;
    b.payout = Math.floor(b.value * m);
    if (cfg.MAX_PAYOUT > 0) b.payout = Math.min(b.payout, cfg.MAX_PAYOUT);
    db.transaction(() => addBalance(userId, b.payout, 'crash_win', { round: this.roundId, m }))();
    this.emit('balance', userId);
    if (b.payout >= b.value * 3 || b.payout >= 1000) this.emit('live', { userId, kind: 'crash', m, payout: b.payout });
    if (!silent) this.emit('cash', { uid: userId, cashout: m, payout: b.payout });
    return { cashout: m, payout: b.payout };
  }

  static LIST_LIMIT = 100;
  snapshot() {
    const all = [...this.bets];
    return {
      type: 'crash',
      phase: this.phase,
      roundId: this.roundId,
      hash: this.hash,
      betEndsAt: this.betEndsAt,
      betMs: cfg.BET_PHASE_MS,
      crashMin: cfg.CRASH_MIN,
      startAt: this.startAt,
      crash: this.phase === 'crashed' ? this.crash : null,
      seed: this.phase === 'crashed' ? this.seed : null,
      history: this.history,
      serverNow: Date.now(),
      betsTotal: all.length,
      betsSum: all.reduce((s, [, b]) => s + b.value, 0),
      bets: all.map(([uid, b]) => ({
        uid, name: b.name, photo: b.photo, value: b.value, cashout: b.cashout, payout: b.payout,
      })).sort((a, b) => b.value - a.value).slice(0, CrashGame.LIST_LIMIT),
    };
  }
}
