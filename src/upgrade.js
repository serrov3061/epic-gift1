import crypto from 'crypto';
import { cfg } from './config.js';
import { db, AppError, addBalance, takeUserItems, itemValue, logTx, publicItem } from './db.js';

export const MULTIPLIERS = [1.5, 2, 3, 5, 10, 20];

export function calcChance(inputValue, targetValue) {
  if (!(inputValue > 0) || !(targetValue > inputValue)) return 0;
  return Math.min(cfg.UPGRADE_MAX_CHANCE, (inputValue / targetValue) * (1 - cfg.UPGRADE_EDGE));
}

/**
 * Апгрейд: ставим звёзды и/или NFT, цель — NFT со склада или множитель (выигрыш звёздами).
 * target = { type: 'item', id } | { type: 'mult', mult }
 */
export function doUpgrade(userId, { amount = 0, itemIds = [], target }) {
  amount = Math.floor(Number(amount) || 0);
  if (amount < 0) throw new AppError('Неверная сумма');
  if (!target) throw new AppError('Выберите цель');

  return db.transaction(() => {
    if (amount > 0) addBalance(userId, -amount, 'upgrade_bet');
    const items = takeUserItems(userId, itemIds);
    const inputValue = amount + items.reduce((s, it) => s + itemValue(it), 0);
    if (inputValue < cfg.MIN_BET) throw new AppError('Добавьте звёзды или подарок');

    let targetValue, targetItem = null;
    if (target.type === 'item') {
      targetItem = db.prepare("SELECT * FROM items WHERE id=? AND owner_id IS NULL AND status='available'").get(Number(target.id));
      if (!targetItem) throw new AppError('Этот подарок уже забрали');
      if (items.some((i) => i.id === targetItem.id)) throw new AppError('Нельзя улучшать в тот же подарок');
      targetValue = itemValue(targetItem);
    } else if (target.type === 'mult' && MULTIPLIERS.includes(Number(target.mult))) {
      targetValue = Math.floor(inputValue * Number(target.mult));
    } else throw new AppError('Неверная цель');

    if (targetValue <= inputValue) throw new AppError('Цель должна быть дороже ставки');
    const chance = calcChance(inputValue, targetValue);
    if (chance < cfg.UPGRADE_MIN_CHANCE) throw new AppError('Слишком маленький шанс — добавьте ставку');
    if ((inputValue / targetValue) * (1 - cfg.UPGRADE_EDGE) > cfg.UPGRADE_MAX_CHANCE) {
      throw new AppError(`Шанс выше ${Math.round(cfg.UPGRADE_MAX_CHANCE * 100)}% — выберите цель дороже`);
    }

    const roll = crypto.randomInt(0, 1_000_000) / 1_000_000;
    const win = roll < chance;
    logTx(userId, 'wager', inputValue, { game: 'upgrade', chance, roll, win });

    if (win) {
      if (targetItem) db.prepare('UPDATE items SET owner_id=? WHERE id=?').run(userId, targetItem.id);
      else addBalance(userId, targetValue, 'upgrade_win', { mult: target.mult });
    }
    return {
      win, chance, roll, inputValue, targetValue,
      item: targetItem && win ? publicItem({ ...targetItem, owner_id: userId }) : null,
      stars: !targetItem && win ? targetValue : 0,
      consumedItems: items.length,
    };
  })();
}
