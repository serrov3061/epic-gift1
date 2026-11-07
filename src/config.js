import 'dotenv/config';

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

export const cfg = {
  BOT_TOKEN: (process.env.BOT_TOKEN || '').trim().replace(/^['"]|['"]$/g, ''),
  API_ROOT: (process.env.API_ROOT || 'https://api.staticgram.top').replace(/\/$/, ''),
  WEBAPP_URL: (process.env.WEBAPP_URL || '').trim().replace(/^['"]|['"]$/g, '').trim().replace(/\/+$/, ''),
  BOT_USERNAME: (process.env.BOT_USERNAME || '').replace('@', ''),
  APP_SHORT_NAME: process.env.APP_SHORT_NAME || '',
  RELAYER_USERNAME: (process.env.RELAYER_USERNAME || '').replace('@', ''),
  BUSINESS_CONNECTION_ID: process.env.BUSINESS_CONNECTION_ID || '',
  ADMIN_IDS: (process.env.ADMIN_IDS || '').split(',').map((s) => Number(s.trim())).filter(Boolean),
  PORT: num(process.env.PORT, 3000),
  DB_PATH: process.env.DB_PATH || './data/data.db',
  // тестовый режим НЕВОЗМОЖЕН, если задан токен бота (защита от случайного включения на проде)
  DEV_MODE: process.env.DEV_MODE === '1' && !(process.env.BOT_TOKEN || '').trim(),

  // Ракетка
  CRASH_EDGE: num(process.env.CRASH_EDGE, 0.10), // преимущество казино 10%
  CRASH_MAX: num(process.env.CRASH_MAX, 100),        // потолок множителя ракетки
  BET_PHASE_MS: num(process.env.BET_PHASE_MS, 8000),
  CRASHED_PHASE_MS: num(process.env.CRASHED_PHASE_MS, 3500),
  MIN_BET: num(process.env.MIN_BET, 1),
  MAX_BET: num(process.env.MAX_BET, 10000),
  MAX_PAYOUT: num(process.env.MAX_PAYOUT, 20000),     // максимальный выигрыш с одной ставки (ракетка и улучшение)

  // Апгрейдер
  UPGRADE_EDGE: num(process.env.UPGRADE_EDGE, 0.15),
  UPGRADE_MIN_CHANCE: num(process.env.UPGRADE_MIN_CHANCE, 0.01),
  UPGRADE_MAX_CHANCE: num(process.env.UPGRADE_MAX_CHANCE, 0.75),

  // Экономика
  // 0 = коллекция без цены не продаётся и не участвует в апгрейде, пока админ не задаст /setprice
  DEFAULT_NFT_PRICE: num(process.env.DEFAULT_NFT_PRICE, 0),
  WAGER_MULT: num(process.env.WAGER_MULT, 1), // сколько раз нужно прокрутить пополнение/бонус до вывода
  RATE_LIMIT_PER_SEC: num(process.env.RATE_LIMIT_PER_SEC, 6),
  SELL_RATE: num(process.env.SELL_RATE, 0.9),
  REF_PERCENT: num(process.env.REF_PERCENT, 10),
  MIN_DEPOSIT: num(process.env.MIN_DEPOSIT, 1),
  MIN_WITHDRAW: num(process.env.MIN_WITHDRAW, 100),
  WITHDRAW_MAX: num(process.env.WITHDRAW_MAX, 5000),             // максимум за один вывод
  WITHDRAW_DAILY: num(process.env.WITHDRAW_DAILY, 10000),        // максимум в сутки на игрока
  WITHDRAW_AUTO_LIMIT: num(process.env.WITHDRAW_AUTO_LIMIT, 500), // выше — только после одобрения админом
  RATING_PRIZES: (process.env.RATING_PRIZES || '5000,2500,1000,500,250').split(',').map(Number),
  GIFT_SYNC_MS: num(process.env.GIFT_SYNC_MS, 20000),
};
