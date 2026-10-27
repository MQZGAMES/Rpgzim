// Comércio com preços configuráveis por loja. Transações inválidas são rejeitadas sem alterar o estado.
import type { CharacterState } from '../entities/character';
import type { ShopDef } from '../entities/definitions';
import type { GameData } from '../entities/gameData';
import { addItem, canFit, countItem, removeItem } from './inventory';

export type TradeFailReason = 'notSold' | 'notBought' | 'notEnoughGold' | 'inventoryFull' | 'notEnoughItems' | 'invalidQuantity';
/** `fromBank`: parte da compra paga com o ouro depositado no banco (o da mochila é gasto primeiro). */
export type TradeResult = { ok: true; total: number; fromBank?: number } | { ok: false; reason: TradeFailReason };

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
  // o ouro da mochila paga primeiro; o que faltar sai do banco
  if (c.gold + c.bankGold < total) return { ok: false, reason: 'notEnoughGold' };
  if (!canFit(data, c.inventory, itemId, quantity)) return { ok: false, reason: 'inventoryFull' };
  const fromBag = Math.min(c.gold, total);
  const fromBank = total - fromBag;
  c.gold -= fromBag;
  c.bankGold -= fromBank;
  addItem(data, c.inventory, itemId, quantity);
  return fromBank > 0 ? { ok: true, total, fromBank } : { ok: true, total };
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

/** Fica fora do "vender tudo": travado pelo jogador. */
export function keptFromSellAll(c: CharacterState, itemId: string): boolean {
  return isSellLocked(c, itemId);
}

/** O que "vender tudo" levaria: itens da mochila (nunca os equipados nem os travados) que esta loja compra. */
export function sellAllPreview(c: CharacterState, shop: ShopDef): { itemId: string; count: number; total: number }[] {
  return shop.buys
    .filter((o) => !keptFromSellAll(c, o.itemId))
    .map((o) => ({ itemId: o.itemId, count: countItem(c.inventory, o.itemId), price: o.price }))
    .filter((o) => o.count > 0)
    .map((o) => ({ itemId: o.itemId, count: o.count, total: o.count * o.price }));
}

/** Vende de uma vez tudo da mochila que a loja compra. Retorna o ouro recebido e as unidades vendidas. */
export function sellAll(c: CharacterState, shop: ShopDef): { total: number; units: number } {
  let total = 0;
  let units = 0;
  for (const o of sellAllPreview(c, shop)) {
    const res = sell(c, shop, o.itemId, o.count);
    if (res.ok) {
      total += res.total;
      units += o.count;
    }
  }
  return { total, units };
}
