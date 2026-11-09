import 'dotenv/config';

// число из переменной окружения; мусор ("abc", "1,5") → значение по умолчанию + предупреждение в лог
const num = (v, d) => {
  if (v === undefined || String(v).trim() === '') return d;
  const n = Number(String(v).trim().replace(',', '.'));
  if (!Number.isFinite(n)) { console.error(`[config] неверное число «${v}», использую ${d}`); return d; }
  return n;
};

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
  CRASH_EDGE: num(process.env.CRASH_EDGE, 0.05), // преимущество казино 5%
  CRASH_MAX: num(process.env.CRASH_MAX, 100),        // потолок множителя ракетки
  CRASH_MIN: num(process.env.CRASH_MIN, 1.10),       // ракетка всегда долетает хотя бы до этого икса; забрать можно только выше
  BET_PHASE_MS: num(process.env.BET_PHASE_MS, 8000),
  CRASHED_PHASE_MS: num(process.env.CRASHED_PHASE_MS, 3500),
  MIN_BET: num(process.env.MIN_BET, 1),
  MAX_BET: num(process.env.MAX_BET, 100000),
  MAX_PAYOUT: num(process.env.MAX_PAYOUT, 0),         // потолок выигрыша звёздами за одну игру (0 = без потолка)

  // Кирка
  PICKAXE_EDGE: num(process.env.PICKAXE_EDGE, 0.05), // преимущество казино 5%
  PICKAXE_MAX: num(process.env.PICKAXE_MAX, 100),     // максимальный множитель кирки

  // Апгрейдер
  UPGRADE_EDGE: num(process.env.UPGRADE_EDGE, 0.10),
  // надбавка к преимуществу казино для крупных выигрышей: чем больше (цель − ставка) и множитель, тем ниже шанс
  UPGRADE_BIG_STEP: num(process.env.UPGRADE_BIG_STEP, 20000), // «масштаб» крупной выплаты, ⭐
  UPGRADE_BIG_MAX: num(process.env.UPGRADE_BIG_MAX, 0.25),    // максимум надбавки за размер выплаты
  UPGRADE_MULT_MAX: num(process.env.UPGRADE_MULT_MAX, 0.10),  // максимум надбавки за высокий множитель (от x5)
  UPGRADE_MIN_CHANCE: num(process.env.UPGRADE_MIN_CHANCE, 0.01),
  UPGRADE_MAX_CHANCE: num(process.env.UPGRADE_MAX_CHANCE, 0.80),

  // Экономика
  // 0 = коллекция без цены не продаётся и не участвует в апгрейде, пока админ не задаст /setprice
  DEFAULT_NFT_PRICE: num(process.env.DEFAULT_NFT_PRICE, 0),
  WAGER_MULT: num(process.env.WAGER_MULT, 1), // сколько раз нужно прокрутить пополнение/бонус до вывода
  RATE_LIMIT_PER_SEC: num(process.env.RATE_LIMIT_PER_SEC, 6),
  SELL_RATE: num(process.env.SELL_RATE, 0.9),
  REF_PERCENT: num(process.env.REF_PERCENT, 10),
  MIN_DEPOSIT: num(process.env.MIN_DEPOSIT, 1),
  MIN_WITHDRAW: num(process.env.MIN_WITHDRAW, 5000),
  // 0 = без ограничения
  WITHDRAW_MAX: num(process.env.WITHDRAW_MAX, 0),
  WITHDRAW_DAILY: num(process.env.WITHDRAW_DAILY, 50000), // максимум вывода в сутки на игрока
  WITHDRAW_AUTO_LIMIT: num(process.env.WITHDRAW_AUTO_LIMIT, 0),
  // вывод больше суммы пополнений игрока — на одобрение админу (защита от «звёзд из воздуха»)
  WITHDRAW_REVIEW_OVER_DEPOSIT: process.env.WITHDRAW_REVIEW_OVER_DEPOSIT !== '0',
  RATING_PRIZES: (process.env.RATING_PRIZES || '5000,2500,1000,500,250').split(',').map(Number),
  LOG_TZ: process.env.LOG_TZ || 'Asia/Yekaterinburg',
  GIFT_SYNC_MS: num(process.env.GIFT_SYNC_MS, 20000),
};
