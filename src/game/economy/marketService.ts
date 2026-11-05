// Mercado do banco no mundo: só com a janela do banco aberta (como o depósito). Liquida os negócios fechados: o ouro de
// quem vendeu vai para o banco dele (fora do jogo, fica guardado até ele logar); o item de quem tinha a oferta de
// compra vai para o depósito dele (sem espaço ou fora do jogo, fica como entrega a retirar). Avisa a interface e a
// persistência.
import {
  MARKET_FAIL_MESSAGE,
  addParcel,
  asksFor,
  autoPrice,
  buyNow,
  cancelOrder,
  collectParcels,
  collectProceeds,
  depotSpace,
  listItem,
  placeAsk,
  placeBid,
  sellNow,
  type MarketFail,
  type MarketFill,
} from '../../domain/rules/market';
import type { PlayerEntity } from '../entities/types';
import type { World } from '../simulation/World';
import { allActors, message, warnThrottled } from '../simulation/World';
import { pkNow } from '../social/social';
import { addItem } from '../../domain/rules/inventory';

function atBank(w: World): boolean {
  if (!w.ui.depot || w.player.dead) {
    warnThrottled(w, 'market', 'O mercado fica no banco: fale com o banqueiro.', 800);
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

/** O outro lado de uma venda (quem anunciou): recebe o ouro no banco. */
function paySellers(w: World, fills: MarketFill[], buyer: string): void {
  for (const f of fills) {
    const gold = f.count * f.price;
    const seller = onlineByCharacter(w, f.otherId);
    if (seller) {
      seller.character.bankGold += gold;
      seller.scope.events.emit('message', { text: `Mercado: ${buyer} comprou ${qtyName(w, f.itemId, f.count)}. +${gold} de ouro no banco.`, kind: 'loot' });
      seller.scope.events.emit('saveRequested', { reason: 'market' });
    } else w.market.proceeds[f.otherId] = (w.market.proceeds[f.otherId] ?? 0) + gold;
  }
}

/** O outro lado de uma compra (quem tinha a oferta): recebe o item no depósito ou como entrega a retirar. */
function deliverBuyers(w: World, fills: MarketFill[], seller: string): void {
  for (const f of fills) {
    const buyer = onlineByCharacter(w, f.otherId);
    const fit = buyer ? depotSpace(w.data, buyer.character, f.itemId, f.count) : 0;
    if (buyer && fit) addItem(w.data, buyer.character.depot, f.itemId, fit);
    if (fit < f.count) addParcel(w.market, f.otherId, f.itemId, f.count - fit);
    if (buyer) {
      buyer.scope.events.emit('message', {
        text: `Mercado: ${seller} vendeu ${qtyName(w, f.itemId, f.count)} para a sua oferta (${fit === f.count ? 'no depósito' : 'retire a entrega no banco'}).`,
        kind: 'loot',
      });
      buyer.scope.events.emit('saveRequested', { reason: 'market' });
    }
  }
}

/** Compra agora `qty` unidades pelo menor preço à venda (o item vai para o depósito). */
export function marketBuyNow(w: World, itemId: string, qty: number, maxPrice = Infinity): boolean {
  if (!atBank(w)) return false;
  const c = w.player.character;
  const res = buyNow(w.data, w.market, c, itemId, qty, maxPrice);
  if (!res.ok) return fail(w, res.reason);
  paySellers(w, res.fills, c.name);
  message(w, `Comprou no mercado: ${qtyName(w, itemId, res.count)} por ${res.total} de ouro. Está no depósito.`, 'loot');
  changed(w);
  return true;
}

/** Vende agora `qty` unidades para as maiores ofertas de compra (o ouro vai para o banco). */
export function marketSellNow(w: World, itemId: string, qty: number): boolean {
  if (!atBank(w)) return false;
  const c = w.player.character;
  const res = sellNow(w.market, c, itemId, qty);
  if (!res.ok) return fail(w, res.reason);
  deliverBuyers(w, res.fills, c.name);
  message(w, `Vendeu no mercado: ${qtyName(w, itemId, res.count)} por ${res.total} de ouro (no banco).`, 'loot');
  changed(w);
  return true;
}

/** Anuncia `qty` unidades a `price`: o que já tem comprador por esse preço (ou mais) vende na hora. */
export function marketSell(w: World, itemId: string, qty: number, price: number): boolean {
  if (!atBank(w)) return false;
  const c = w.player.character;
  const res = placeAsk(w.data, w.market, c, itemId, qty, price, pkNow(w));
  if (!res.ok) return fail(w, res.reason);
  announceAsk(w, itemId, res);
  return true;
}

function announceAsk(w: World, itemId: string, res: { fills: MarketFill[]; sold: number; total: number; listing: { count: number; price: number } | null }): void {
  const c = w.player.character;
  deliverBuyers(w, res.fills, c.name);
  if (res.sold) message(w, `Vendeu na hora: ${qtyName(w, itemId, res.sold)} por ${res.total} de ouro (no banco).`, 'loot');
  if (res.listing)
    message(w, `Anunciado: ${qtyName(w, itemId, res.listing.count)} a ${res.listing.price} de ouro cada.`, 'info');
  changed(w);
}

/** Oferta de compra: o que já está à venda por esse preço (ou menos) compra na hora; o resto reserva o ouro. */
export function marketBid(w: World, itemId: string, qty: number, price: number): boolean {
  if (!atBank(w)) return false;
  const c = w.player.character;
  const res = placeBid(w.data, w.market, c, itemId, qty, price, pkNow(w));
  if (!res.ok) return fail(w, res.reason);
  paySellers(w, res.fills, c.name);
  if (res.bought) message(w, `Comprou na hora: ${qtyName(w, itemId, res.bought)} por ${res.total} de ouro (no depósito).`, 'loot');
  if (res.bid)
    message(w, `Oferta de compra: ${qtyName(w, itemId, res.bid.count)} a ${res.bid.price} de ouro cada (${res.bid.count * res.bid.price} reservados).`, 'info');
  changed(w);
  return true;
}

/** Anuncia a pilha inteira de uma posição (mochila ou depósito) a `price` por unidade. */
export function marketList(w: World, from: 'inventory' | 'depot', index: number, price: number): boolean {
  if (!atBank(w)) return false;
  const c = w.player.character;
  const st = (from === 'inventory' ? c.inventory : c.depot)[index];
  const res = listItem(w.data, w.market, c, from, index, price, pkNow(w));
  if (!res.ok || !st) return fail(w, res.ok ? 'empty' : res.reason);
  announceAsk(w, st.itemId, res);
  return true;
}

/** Venda rápida: anuncia a 75% do valor do item (e vende na hora para quem já oferece isso ou mais). */
export function marketAutoList(w: World, from: 'inventory' | 'depot', index: number): boolean {
  const c = w.player.character;
  const st = (from === 'inventory' ? c.inventory : c.depot)[index];
  if (!st) return fail(w, 'empty');
  return marketList(w, from, index, autoPrice(w.data, st.itemId));
}

/** Compra o item de um anúncio (pelo menor preço disponível do item, a quantidade do anúncio). */
export function marketBuy(w: World, listingId: string): boolean {
  const l = w.market.listings.find((x) => x.id === listingId);
  if (!l) return fail(w, 'gone');
  if (l.sellerId === w.player.character.id && !asksFor(w.market, l.itemId, l.sellerId).length) return fail(w, 'own');
  return marketBuyNow(w, l.itemId, l.count);
}

/** Cancela uma ordem própria (anúncio volta para o depósito; oferta devolve o ouro ao banco). */
export function marketCancel(w: World, orderId: string): boolean {
  if (!atBank(w)) return false;
  const res = cancelOrder(w.data, w.market, w.player.character, orderId);
  if (!res.ok) return fail(w, res.reason);
  message(
    w,
    res.refund
      ? `Oferta cancelada: ${res.refund} de ouro voltaram para o banco.`
      : `Anúncio retirado: ${qtyName(w, res.itemId, res.count)} voltou para o depósito.`,
    'info',
  );
  changed(w);
  return true;
}

/** Retira as entregas pendentes (o que couber no depósito). */
export function marketTakeParcels(w: World): boolean {
  if (!atBank(w)) return false;
  const got = collectParcels(w.data, w.market, w.player.character);
  if (!got) return fail(w, w.market.parcels[w.player.character.id]?.length ? 'room' : 'gone');
  message(w, `Entregas do mercado: ${got} ${got > 1 ? 'itens' : 'item'} no depósito.`, 'loot');
  changed(w);
  return true;
}

/** Ao entrar no jogo: o ouro das vendas de quando estava fora entra no banco e as entregas, no depósito. */
export function marketCollect(w: World, a: PlayerEntity): number {
  const got = collectProceeds(w.market, a.character);
  const items = collectParcels(w.data, w.market, a.character);
  if (got > 0)
    a.scope.events.emit('message', { text: `Mercado: suas vendas renderam ${got} de ouro (já no banco).`, kind: 'loot' });
  if (items > 0)
    a.scope.events.emit('message', { text: `Mercado: ${items} ${items > 1 ? 'itens comprados chegaram' : 'item comprado chegou'} no depósito.`, kind: 'loot' });
  if (got > 0 || items > 0) w.events.emit('marketChanged', {});
  return got;
}
