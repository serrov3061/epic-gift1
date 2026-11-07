import crypto from 'crypto';
import { cfg } from './config.js';
import { AppError } from './db.js';

const MAX_AGE_S = 24 * 3600;

/**
 * Проверка initData Mini App (алгоритм совпадает с Telegram, ключ — токен бота StaticGram).
 * В DEV_MODE принимает строку "dev:<id>" для теста в обычном браузере.
 */
export function parseInitData(initData) {
  if (!initData) throw new AppError('Нет initData', 401);

  if (cfg.DEV_MODE && initData.startsWith('dev:')) {
    const id = Number(initData.slice(4)) || 1;
    return { user: { id, first_name: `Dev ${id}`, username: `dev${id}` }, startParam: null };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new AppError('Нет подписи', 401);
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(cfg.BOT_TOKEN).digest();
  const expected = crypto.createHmac('sha256', secret).update(check).digest('hex');
  if (expected.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash))) {
    throw new AppError('Неверная подпись', 401);
  }
  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_S) throw new AppError('Сессия устарела', 401);

  const user = JSON.parse(params.get('user') || 'null');
  if (!user?.id) throw new AppError('Нет пользователя', 401);
  return { user, startParam: params.get('start_param') };
}

export const refFromParam = (p) => (p && /^ref\d+$/.test(p) ? Number(p.slice(3)) : null);
