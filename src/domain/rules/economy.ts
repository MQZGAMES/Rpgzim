// Comércio com preços configuráveis por loja. Transações inválidas são rejeitadas sem alterar o estado.
import type { CharacterState } from '../entities/character';
import type { ShopDef } from '../entities/definitions';
import type { GameData } from '../entities/gameData';
import { addItem, canFit, countItem, removeItem } from './inventory';

export type TradeFailReason = 'notSold' | 'notBought' | 'notEnoughGold' | 'inventoryFull' | 'notEnoughItems' | 'invalidQuantity';
export type TradeResult = { ok: true; total: number } | { ok: false; reason: TradeFailReason };

export const TRADE_FAIL_MESSAGE: Record<TradeFailReason, string> = {
  notSold: 'Esta loja não vende este item.',
  notBought: 'Esta loja não compra este item.',
  notEnoughGold: 'Ouro insuficiente.',
  inventoryFull: 'Sem espaço na mochila.',
  notEnoughItems: 'Você não tem itens suficientes.',
  invalidQuantity: 'Quantidade inválida.',
};

export function buy(data: GameData, c: CharacterState, shop: ShopDef, itemId: string, quantity: number): TradeResult {
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 1000) return { ok: false, reason: 'invalidQuantity' };
  const offer = shop.sells.find((o) => o.itemId === itemId);
  if (!offer) return { ok: false, reason: 'notSold' };
  const total = offer.price * quantity;
  if (c.gold < total) return { ok: false, reason: 'notEnoughGold' };
  if (!canFit(data, c.inventory, itemId, quantity)) return { ok: false, reason: 'inventoryFull' };
  c.gold -= total;
  addItem(data, c.inventory, itemId, quantity);
  return { ok: true, total };
}

export function sell(c: CharacterState, shop: ShopDef, itemId: string, quantity: number): TradeResult {
  if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, reason: 'invalidQuantity' };
  const offer = shop.buys.find((o) => o.itemId === itemId);
  if (!offer) return { ok: false, reason: 'notBought' };
  if (countItem(c.inventory, itemId) < quantity) return { ok: false, reason: 'notEnoughItems' };
  removeItem(c.inventory, itemId, quantity);
  const total = offer.price * quantity;
  c.gold += total;
  return { ok: true, total };
}

/** Itens travados pelo jogador não entram no "vender tudo" (guardado em `flags`, sem mudar o save). */
export const sellLockKey = (itemId: string) => `lock:${itemId}`;
export function isSellLocked(c: CharacterState, itemId: string): boolean {
  return c.flags[sellLockKey(itemId)] === true;
}
export function setSellLock(c: CharacterState, itemId: string, locked: boolean): void {
  if (locked) c.flags[sellLockKey(itemId)] = true;
  else delete c.flags[sellLockKey(itemId)];
}

/** A munição que a arma equipada usa (flechas do arco) nunca entra no "vender tudo". */
export function isOwnAmmo(data: GameData, c: CharacterState, itemId: string): boolean {
  const def = data.items[itemId];
  const weapon = c.equipment.mainHand ? data.items[c.equipment.mainHand.itemId]?.weapon : undefined;
  return def?.type === 'ammo' && !!weapon?.ammo && def.ammoType === weapon.ammo;
}
/** Fica fora do "vender tudo": travado pelo jogador ou munição da própria arma. */
export function keptFromSellAll(c: CharacterState, itemId: string, data?: GameData): boolean {
  return isSellLocked(c, itemId) || (!!data && isOwnAmmo(data, c, itemId));
}

/** O que "vender tudo" levaria: itens da mochila (nunca os equipados, os travados nem a munição da arma) que esta loja compra. */
export function sellAllPreview(c: CharacterState, shop: ShopDef, data?: GameData): { itemId: string; count: number; total: number }[] {
  return shop.buys
    .filter((o) => !keptFromSellAll(c, o.itemId, data))
    .map((o) => ({ itemId: o.itemId, count: countItem(c.inventory, o.itemId), price: o.price }))
    .filter((o) => o.count > 0)
    .map((o) => ({ itemId: o.itemId, count: o.count, total: o.count * o.price }));
}

/** Vende de uma vez tudo da mochila que a loja compra. Retorna o ouro recebido e as unidades vendidas. */
export function sellAll(c: CharacterState, shop: ShopDef, data?: GameData): { total: number; units: number } {
  let total = 0;
  let units = 0;
  for (const o of sellAllPreview(c, shop, data)) {
    const res = sell(c, shop, o.itemId, o.count);
    if (res.ok) {
      total += res.total;
      units += o.count;
    }
  }
  return { total, units };
}
