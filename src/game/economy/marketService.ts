// Mercado do banco no mundo: só com a janela do banco aberta (como o depósito). Credita o vendedor que está no jogo
// direto no banco dele; quem está fora recebe ao logar (collectProceeds). Avisa a interface e a persistência.
import {
  MARKET_FAIL_MESSAGE,
  autoPrice,
  buyListing,
  cancelListing,
  collectProceeds,
  listItem,
  type MarketFail,
} from '../../domain/rules/market';
import type { PlayerEntity } from '../entities/types';
import type { World } from '../simulation/World';
import { allActors, message, warnThrottled } from '../simulation/World';
import { pkNow } from '../social/social';

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
  w.events.emit('saveRequested', { reason: 'market' });
}

/** Personagem no jogo (jogador ou herói logado) dono deste id de personagem. */
function onlineByCharacter(w: World, characterId: string): PlayerEntity | undefined {
  return allActors(w).find((a) => a.character.id === characterId);
}

/** Anuncia a pilha da mochila ou do depósito a `price` por unidade. */
export function marketList(w: World, from: 'inventory' | 'depot', index: number, price: number): boolean {
  if (!atBank(w)) return false;
  const c = w.player.character;
  const res = listItem(w.data, w.market, c, from, index, price, pkNow(w));
  if (!res.ok) return fail(w, res.reason);
  const l = res.listing;
  message(
    w,
    `Anunciado no mercado: ${l.count > 1 ? `${l.count}x ` : ''}${w.data.items[l.itemId]?.name} por ${l.price * l.count} de ouro.`,
    'info',
  );
  changed(w);
  return true;
}

/** Venda automática: anuncia a 75% do valor do item (o NPC paga só 50%). */
export function marketAutoList(w: World, from: 'inventory' | 'depot', index: number): boolean {
  const c = w.player.character;
  const st = (from === 'inventory' ? c.inventory : c.depot)[index];
  if (!st) return fail(w, 'empty');
  return marketList(w, from, index, autoPrice(w.data, st.itemId));
}

/** Compra um anúncio: o item vai para o depósito e o ouro para o banco do vendedor. */
export function marketBuy(w: World, listingId: string): boolean {
  if (!atBank(w)) return false;
  const c = w.player.character;
  const res = buyListing(w.data, w.market, c, listingId);
  if (!res.ok) return fail(w, res.reason);
  const { listing, total } = res;
  const name = w.data.items[listing.itemId]?.name ?? listing.itemId;
  const seller = onlineByCharacter(w, listing.sellerId);
  if (seller) {
    seller.character.bankGold += total;
    seller.scope.events.emit('message', {
      text: `Mercado: ${c.name} comprou ${listing.count > 1 ? `${listing.count}x ` : ''}${name}. +${total} de ouro no banco.`,
      kind: 'loot',
    });
    seller.scope.events.emit('saveRequested', { reason: 'market' });
  } else w.market.proceeds[listing.sellerId] = (w.market.proceeds[listing.sellerId] ?? 0) + total;
  const bank = res.fromBank ? ` (${res.fromBank} saiu do banco)` : '';
  message(
    w,
    `Comprou no mercado: ${listing.count > 1 ? `${listing.count}x ` : ''}${name} por ${total} de ouro${bank}. Está no depósito.`,
    'loot',
  );
  w.events.emit('goldChanged', { amount: c.gold, delta: -(total - res.fromBank) });
  changed(w);
  return true;
}

/** Retira o próprio anúncio (o item volta para o depósito). */
export function marketCancel(w: World, listingId: string): boolean {
  if (!atBank(w)) return false;
  const res = cancelListing(w.data, w.market, w.player.character, listingId);
  if (!res.ok) return fail(w, res.reason);
  message(w, `Anúncio retirado: ${w.data.items[res.listing.itemId]?.name} voltou para o depósito.`, 'info');
  changed(w);
  return true;
}

/** Ao entrar no jogo: o que foi vendido enquanto estava fora entra no banco. */
export function marketCollect(w: World, a: PlayerEntity): number {
  const got = collectProceeds(w.market, a.character);
  if (got > 0) {
    a.scope.events.emit('message', {
      text: `Mercado: suas vendas renderam ${got} de ouro (já no banco).`,
      kind: 'loot',
    });
    w.events.emit('marketChanged', {});
  }
  return got;
}
