// Mercado de Pedraluz no mundo: só com a janela do corretor aberta (NPC ao lado da banqueira). Liquida os negócios: o
// ouro de quem vendeu vai para o banco dele (fora do jogo, fica guardado até ele logar); o item de quem tinha a oferta
// de compra vai para o depósito dele (sem espaço ou fora do jogo, fica como entrega a retirar no mercado).
import {
  MARKET_FAIL_MESSAGE,
  addParcel,
  buyNow,
  cancelOffer,
  collectParcels,
  collectProceeds,
  depotSpace,
  logTrade,
  placeOffer,
  sellNow,
  type MarketFail,
  type MarketFill,
  type OfferSide,
} from '../../domain/rules/market';
import { addItem } from '../../domain/rules/inventory';
import type { PlayerEntity } from '../entities/types';
import type { World } from '../simulation/World';
import { allActors, message, warnThrottled } from '../simulation/World';
import { pkNow } from '../social/social';

function atMarket(w: World): boolean {
  if (!w.ui.market || w.player.dead) {
    warnThrottled(w, 'market', 'O mercado fica no Banco de Pedraluz: fale com o corretor.', 800);
    return false;
  }
  return true;
}

function fail(w: World, reason: MarketFail): false {
  warnThrottled(w, `market:${reason}`, MARKET_FAIL_MESSAGE[reason], 600);
  return false;
}

function changed(w: World): void {
  w.events.emit('marketChanged', {});
  w.events.emit('itemsChanged', {});
  w.events.emit('goldChanged', { amount: w.player.character.gold, delta: 0 });
  w.events.emit('saveRequested', { reason: 'market' });
}

/** Personagem no jogo (jogador ou herói logado) dono deste id de personagem. */
function onlineByCharacter(w: World, characterId: string): PlayerEntity | undefined {
  return allActors(w).find((a) => a.character.id === characterId);
}

const itemName = (w: World, id: string) => w.data.items[id]?.name ?? id;
const qtyName = (w: World, id: string, n: number) => `${n > 1 ? `${n}x ` : ''}${itemName(w, id)}`;

/** Anota no registro de `characterId` cada negócio fechado (um por oferta atendida, com o preço dela). */
function logFills(w: World, characterId: string, kind: 'buy' | 'sell', fills: MarketFill[]): void {
  const at = pkNow(w);
  for (const f of fills) logTrade(w.market, characterId, { kind, itemId: f.itemId, count: f.count, price: f.price, at });
}

/** Quem tinha a oferta de venda recebe o ouro no banco (fora do jogo: fica guardado). */
function paySellers(w: World, fills: MarketFill[], buyer: string): void {
  for (const f of fills) {
    logTrade(w.market, f.otherId, { kind: 'sell', itemId: f.itemId, count: f.count, price: f.price, at: pkNow(w) });
    const gold = f.count * f.price;
    const seller = onlineByCharacter(w, f.otherId);
    if (seller) {
      seller.character.bankGold += gold;
      seller.scope.events.emit('message', { text: `Mercado: ${buyer} comprou ${qtyName(w, f.itemId, f.count)}. +${gold} de ouro no banco.`, kind: 'loot' });
      seller.scope.events.emit('saveRequested', { reason: 'market' });
    } else w.market.proceeds[f.otherId] = (w.market.proceeds[f.otherId] ?? 0) + gold;
  }
}

/** Quem tinha a oferta de compra recebe o item no depósito (sem espaço ou fora do jogo: entrega a retirar). */
function deliverBuyers(w: World, fills: MarketFill[], seller: string): void {
  for (const f of fills) {
    logTrade(w.market, f.otherId, { kind: 'buy', itemId: f.itemId, count: f.count, price: f.price, at: pkNow(w) });
    const buyer = onlineByCharacter(w, f.otherId);
    const fit = buyer ? depotSpace(w.data, buyer.character, f.itemId, f.count) : 0;
    if (buyer && fit) addItem(w.data, buyer.character.depot, f.itemId, fit);
    if (fit < f.count) addParcel(w.market, f.otherId, f.itemId, f.count - fit);
    if (buyer) {
      buyer.scope.events.emit('message', {
        text: `Mercado: ${seller} vendeu ${qtyName(w, f.itemId, f.count)} para a sua oferta (${fit === f.count ? 'no depósito' : 'retire no mercado'}).`,
        kind: 'loot',
      });
      buyer.scope.events.emit('saveRequested', { reason: 'market' });
    }
  }
}

/** Compra agora até `qty` unidades pelo menor preço (até `maxPrice`): vai para a mochila (sem espaço, depósito). */
export function marketBuyNow(w: World, itemId: string, qty: number, maxPrice = Infinity): boolean {
  if (!atMarket(w)) return false;
  return buyFromMarket(w, itemId, qty, maxPrice);
}

/**
 * Compra no mercado sem sair da loja: só os anúncios mais baratos que o preço da loja (o "Comprar no mercado" da
 * janela da loja). O item vem para a mochila como numa compra no corretor.
 */
export function marketBuyAtShop(w: World, itemId: string, qty: number): boolean {
  const shop = w.ui.shop ? w.data.shops[w.ui.shop.shopId] : undefined;
  const offer = shop?.sells.find((o) => o.itemId === itemId);
  if (!offer || w.player.dead) return false;
  return buyFromMarket(w, itemId, qty, offer.price - 1);
}

function buyFromMarket(w: World, itemId: string, qty: number, maxPrice: number): boolean {
  const c = w.player.character;
  const res = buyNow(w.data, w.market, c, itemId, qty, maxPrice, pkNow(w));
  if (!res.ok) return fail(w, res.reason);
  paySellers(w, res.fills, c.name);
  logFills(w, c.id, 'buy', res.fills);
  message(w, `Comprou no mercado: ${qtyName(w, itemId, res.count)} por ${res.total} de ouro.`, 'loot');
  changed(w);
  return true;
}

/** Vende agora até `qty` unidades para as maiores ofertas de compra (a partir de `minPrice`): o ouro vai para o banco. */
export function marketSellNow(w: World, itemId: string, qty: number, minPrice = 0): boolean {
  if (!atMarket(w)) return false;
  const c = w.player.character;
  const res = sellNow(w.data, w.market, c, itemId, qty, minPrice, pkNow(w));
  if (!res.ok) return fail(w, res.reason);
  deliverBuyers(w, res.fills, c.name);
  logFills(w, c.id, 'sell', res.fills);
  message(w, `Vendeu no mercado: ${qtyName(w, itemId, res.count)} por ${res.total} de ouro (no banco).`, 'loot');
  changed(w);
  return true;
}

/** Cria uma oferta de venda ou de compra; o que já tem par do outro lado fecha na hora. */
export function marketOffer(w: World, side: OfferSide, itemId: string, qty: number, price: number): boolean {
  if (!atMarket(w)) return false;
  const c = w.player.character;
  const res = placeOffer(w.data, w.market, c, side, itemId, qty, price, pkNow(w));
  if (!res.ok) return fail(w, res.reason);
  if (side === 'sell') {
    deliverBuyers(w, res.fills, c.name);
    logFills(w, c.id, 'sell', res.fills);
    if (res.matched) message(w, `Vendeu na hora: ${qtyName(w, itemId, res.matched)} por ${res.total} de ouro (no banco).`, 'loot');
    if (res.offer) message(w, `Anunciado: ${qtyName(w, itemId, res.offer.count)} a ${res.offer.price} de ouro cada.`, 'info');
  } else {
    paySellers(w, res.fills, c.name);
    logFills(w, c.id, 'buy', res.fills);
    if (res.matched) message(w, `Comprou na hora: ${qtyName(w, itemId, res.matched)} por ${res.total} de ouro.`, 'loot');
    if (res.offer)
      message(w, `Oferta de compra: ${qtyName(w, itemId, res.offer.count)} a ${res.offer.price} cada (${res.offer.count * res.offer.price} reservados).`, 'info');
  }
  changed(w);
  return true;
}

/** Cancela uma oferta própria (o item volta para a mochila; o ouro reservado, para o banco). */
export function marketCancel(w: World, offerId: string): boolean {
  if (!atMarket(w)) return false;
  const res = cancelOffer(w.data, w.market, w.player.character, offerId);
  if (!res.ok) return fail(w, res.reason);
  message(
    w,
    res.refund
      ? `Oferta de compra cancelada: ${res.refund} de ouro voltaram para o banco.`
      : `Anúncio cancelado: ${qtyName(w, res.offer.itemId, res.offer.count)} voltou para você.`,
    'info',
  );
  changed(w);
  return true;
}

/** Retira as entregas pendentes (mochila primeiro, depois o depósito). */
export function marketTakeParcels(w: World): boolean {
  if (!atMarket(w)) return false;
  const got = collectParcels(w.data, w.market, w.player.character);
  if (!got) return fail(w, w.market.parcels[w.player.character.id]?.length ? 'room' : 'gone');
  message(w, `Entregas do mercado: ${got} ${got > 1 ? 'itens' : 'item'} retirados.`, 'loot');
  changed(w);
  return true;
}

/** Ao entrar no jogo: o ouro das vendas de quando estava fora entra no banco e as compras, no depósito. */
export function marketCollect(w: World, a: PlayerEntity): number {
  const got = collectProceeds(w.market, a.character);
  const items = collectParcels(w.data, w.market, a.character, false);
  if (got > 0) a.scope.events.emit('message', { text: `Mercado: suas vendas renderam ${got} de ouro (já no banco).`, kind: 'loot' });
  if (items > 0)
    a.scope.events.emit('message', { text: `Mercado: ${items} ${items > 1 ? 'itens comprados chegaram' : 'item comprado chegou'} no depósito.`, kind: 'loot' });
  if (got > 0 || items > 0) w.events.emit('marketChanged', {});
  return got;
}
