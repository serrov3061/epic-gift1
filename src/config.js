import 'dotenv/config';

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

export const cfg = {
  BOT_TOKEN: (process.env.BOT_TOKEN || '').trim(),
  API_ROOT: (process.env.API_ROOT || 'https://api.staticgram.top').replace(/\/$/, ''),
  WEBAPP_URL: (process.env.WEBAPP_URL || '').trim().replace(/\/+$/, ''),
  BOT_USERNAME: (process.env.BOT_USERNAME || '').replace('@', ''),
  APP_SHORT_NAME: process.env.APP_SHORT_NAME || '',
  RELAYER_USERNAME: (process.env.RELAYER_USERNAME || '').replace('@', ''),
  BUSINESS_CONNECTION_ID: process.env.BUSINESS_CONNECTION_ID || '',
  ADMIN_IDS: (process.env.ADMIN_IDS || '').split(',').map((s) => Number(s.trim())).filter(Boolean),
  PORT: num(process.env.PORT, 3000),
  DB_PATH: process.env.DB_PATH || './data/data.db',
  DEV_MODE: process.env.DEV_MODE === '1',

  // Ракетка
  CRASH_EDGE: num(process.env.CRASH_EDGE, 0.04), // преимущество казино 4%
  CRASH_MAX: num(process.env.CRASH_MAX, 1000),
  BET_PHASE_MS: num(process.env.BET_PHASE_MS, 8000),
  CRASHED_PHASE_MS: num(process.env.CRASHED_PHASE_MS, 3500),
  MIN_BET: num(process.env.MIN_BET, 1),
  MAX_BET: num(process.env.MAX_BET, 100000),

  // Апгрейдер
  UPGRADE_EDGE: num(process.env.UPGRADE_EDGE, 0.08),
  UPGRADE_MIN_CHANCE: num(process.env.UPGRADE_MIN_CHANCE, 0.01),
  UPGRADE_MAX_CHANCE: num(process.env.UPGRADE_MAX_CHANCE, 0.8),

  // Экономика
  DEFAULT_NFT_PRICE: num(process.env.DEFAULT_NFT_PRICE, 500),
  SELL_RATE: num(process.env.SELL_RATE, 0.9),
  REF_PERCENT: num(process.env.REF_PERCENT, 10),
  MIN_DEPOSIT: num(process.env.MIN_DEPOSIT, 1),
  MIN_WITHDRAW: num(process.env.MIN_WITHDRAW, 100),
  RATING_PRIZES: (process.env.RATING_PRIZES || '5000,2500,1000,500,250').split(',').map(Number),
  GIFT_SYNC_MS: num(process.env.GIFT_SYNC_MS, 20000),
};
