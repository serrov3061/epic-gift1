import crypto from 'crypto';
import { EventEmitter } from 'events';
import { cfg } from './config.js';
import { db, AppError, addBalance, getUser, logTx } from './db.js';

// Рост множителя: m(t) = e^(K·t), t в мс. 10 с ≈ 1.82x, 30 с ≈ 6.05x
export const K = 0.00006;
export const multAt = (ms) => Math.max(1, Math.floor(100 * Math.exp(K * Math.max(0, ms))) / 100);
export const msFor = (m) => Math.log(m) / K;

/** Provably fair: P(краш ≥ x) = (1 − edge) / x. hash = sha256(seed) публикуется до раунда, seed — после. */
export function crashFromSeed(seed) {
  const h = crypto.createHmac('sha256', seed).update('epic-gift-rocket').digest('hex');
  const r = parseInt(h.slice(0, 13), 16) / 2 ** 52;
  const c = Math.floor((100 * (1 - cfg.CRASH_EDGE)) / (1 - r)) / 100;
  return Math.min(cfg.CRASH_MAX, Math.max(1, c));
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
    amount = Math.floor(Number(amount) || 0);
    if (amount < 0) throw new AppError('Неверная сумма');
    auto = auto ? Math.floor(Number(auto) * 100) / 100 : null;
    if (auto !== null && (!(auto >= 1.01) || auto > cfg.CRASH_MAX)) throw new AppError('Автовывод от 1.01x');

    if (amount < cfg.MIN_BET) throw new AppError(`Минимальная ставка ${cfg.MIN_BET} ⭐`);
    if (amount > cfg.MAX_BET) throw new AppError(`Максимальная ставка ${cfg.MAX_BET} ⭐`);
    const bet = db.transaction(() => {
      addBalance(userId, -amount, 'crash_bet', { round: this.roundId });
      logTx(userId, 'wager', amount, { game: 'crash', round: this.roundId });
      return { value: amount, auto, cashout: null, payout: 0 };
    })();

    const u = getUser(userId);
    bet.name = u.first_name;
    bet.photo = u.photo_url;
    this.bets.set(userId, bet);
    this.emit('state');
    this.emit('balance', userId);
    return bet;
  }

  cashout(userId) {
    const b = this.bets.get(userId);
    if (this.phase !== 'flying') throw new AppError('Раунд не идёт');
    if (!b || b.cashout) throw new AppError('Нет активной ставки');
    const m = multAt(Date.now() - this.startAt);
    if (m >= this.crash) throw new AppError('Ракета уже улетела');
    return this.payout(userId, m);
  }

  payout(userId, m, silent = false) {
    const b = this.bets.get(userId);
    b.cashout = m;
    b.payout = Math.floor(b.value * m);
    db.transaction(() => addBalance(userId, b.payout, 'crash_win', { round: this.roundId, m }))();
    this.emit('balance', userId);
    if (b.payout >= b.value * 3 || b.payout >= 1000) this.emit('live', { userId, kind: 'crash', m, payout: b.payout });
    if (!silent) this.emit('state');
    return { cashout: m, payout: b.payout };
  }

  snapshot() {
    return {
      type: 'crash',
      phase: this.phase,
      roundId: this.roundId,
      hash: this.hash,
      betEndsAt: this.betEndsAt,
      betMs: cfg.BET_PHASE_MS,
      startAt: this.startAt,
      crash: this.phase === 'crashed' ? this.crash : null,
      seed: this.phase === 'crashed' ? this.seed : null,
      history: this.history,
      serverNow: Date.now(),
      bets: [...this.bets].map(([uid, b]) => ({
        uid, name: b.name, photo: b.photo, value: b.value, cashout: b.cashout, payout: b.payout,
      })).sort((a, b) => b.value - a.value),
    };
  }
}
