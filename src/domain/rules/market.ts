// Mercado do banco: um personagem anuncia um item (da mochila ou do depósito) por um preço e qualquer outro compra.
// O item comprado vai direto para o depósito do comprador (sem espaço, não compra); o ouro vai para o banco do
// vendedor — se ele não estiver no jogo, fica guardado e entra no banco dele quando logar.
import type { CharacterState } from '../entities/character';
import type { GameData } from '../entities/gameData';
import { addItem, removeAt } from './inventory';
import { ensureDepotSize } from './depot';

export interface MarketListing {
  id: string;
  sellerId: string;
  sellerName: string;
  itemId: string;
  count: number;
  /** Preço por unidade. */
  price: number;
  listedAt: number;
}

export interface MarketState {
  listings: MarketListing[];
  /** Vendas de quem não estava no jogo: ouro a receber, por id de personagem. */
  proceeds: Record<string, number>;
  seq: number;
}

/** Anúncios abertos por personagem. */
export const MARKET_MAX_PER_SELLER = 12;
/** Venda automática: anuncia a 75% do valor do item (o NPC paga 50%). */
export const MARKET_AUTO_RATE = 0.75;

export const emptyMarket = (): MarketState => ({ listings: [], proceeds: {}, seq: 0 });

export type MarketFail = 'empty' | 'price' | 'limit' | 'own' | 'gone' | 'gold' | 'room';

export const MARKET_FAIL_MESSAGE: Record<MarketFail, string> = {
  empty: 'Escolha um item para anunciar.',
  price: 'Defina um preço de pelo menos 1 de ouro.',
  limit: `Você já tem ${MARKET_MAX_PER_SELLER} anúncios abertos.`,
  own: 'Esse anúncio é seu (use "Retirar" para cancelar).',
  gone: 'Esse anúncio não está mais disponível.',
  gold: 'Ouro insuficiente (bolsa + banco).',
  room: 'Sem espaço no depósito para receber o item.',
};

/** Preço da venda automática (por unidade). */
export function autoPrice(data: GameData, itemId: string): number {
  return Math.max(1, Math.round((data.items[itemId]?.value ?? 1) * MARKET_AUTO_RATE));
}

/** Cabe `count` de `itemId` no depósito (sem mexer nele)? */
export function depotRoom(data: GameData, c: CharacterState, itemId: string, count: number): boolean {
  ensureDepotSize(data, c);
  const trial = c.depot.map((s) => (s ? { ...s } : null));
  return addItem(data, trial, itemId, count) === count;
}

/** Valida e lê um mercado salvo (descarta o que não reconhece). */
export function parseMarket(data: GameData, raw: unknown): MarketState {
  const m = emptyMarket();
  if (!raw || typeof raw !== 'object') return m;
  const r = raw as Partial<MarketState>;
  if (Array.isArray(r.listings))
    for (const l of r.listings)
      if (
        l &&
        typeof l.id === 'string' &&
        typeof l.sellerId === 'string' &&
        data.items[l.itemId] &&
        Number.isFinite(l.count) &&
        l.count > 0 &&
        Number.isFinite(l.price) &&
        l.price > 0
      )
        m.listings.push({ ...l, sellerName: String(l.sellerName ?? '?'), listedAt: Number(l.listedAt) || 0 });
  if (r.proceeds && typeof r.proceeds === 'object')
    for (const [k, v] of Object.entries(r.proceeds))
      if (Number.isFinite(v) && v > 0) m.proceeds[k] = Math.floor(v);
  m.seq = Number.isFinite(r.seq) ? Number(r.seq) : m.listings.length;
  return m;
}

/** Anuncia a pilha inteira da posição `index` (mochila ou depósito) a `price` por unidade. */
export function listItem(
  data: GameData,
  market: MarketState,
  seller: CharacterState,
  from: 'inventory' | 'depot',
  index: number,
  price: number,
  now: number,
): { ok: true; listing: MarketListing } | { ok: false; reason: MarketFail } {
  const inv = from === 'inventory' ? seller.inventory : seller.depot;
  const st = inv[index];
  if (!st || !data.items[st.itemId]) return { ok: false, reason: 'empty' };
  const unit = Math.floor(price);
  if (!Number.isFinite(unit) || unit < 1) return { ok: false, reason: 'price' };
  if (market.listings.filter((l) => l.sellerId === seller.id).length >= MARKET_MAX_PER_SELLER)
    return { ok: false, reason: 'limit' };
  const taken = removeAt(inv, index, st.count)!;
  const listing: MarketListing = {
    id: `mk${++market.seq}`,
    sellerId: seller.id,
    sellerName: seller.name,
    itemId: taken.itemId,
    count: taken.count,
    price: unit,
    listedAt: now,
  };
  market.listings.push(listing);
  return { ok: true, listing };
}

/**
 * Compra o anúncio inteiro: paga com a bolsa e, faltando, com o banco; o item vai para o depósito. Retorna quem
 * recebe o ouro (o serviço credita no banco de quem está no jogo ou guarda para quando ele logar).
 */
export function buyListing(
  data: GameData,
  market: MarketState,
  buyer: CharacterState,
  listingId: string,
): { ok: true; listing: MarketListing; total: number; fromBank: number } | { ok: false; reason: MarketFail } {
  const listing = market.listings.find((l) => l.id === listingId);
  if (!listing) return { ok: false, reason: 'gone' };
  if (listing.sellerId === buyer.id) return { ok: false, reason: 'own' };
  const total = listing.price * listing.count;
  if (buyer.gold + buyer.bankGold < total) return { ok: false, reason: 'gold' };
  if (!depotRoom(data, buyer, listing.itemId, listing.count)) return { ok: false, reason: 'room' };
  const fromPurse = Math.min(buyer.gold, total);
  buyer.gold -= fromPurse;
  buyer.bankGold -= total - fromPurse;
  addItem(data, buyer.depot, listing.itemId, listing.count);
  market.listings = market.listings.filter((l) => l !== listing);
  return { ok: true, listing, total, fromBank: total - fromPurse };
}

/** Retira o próprio anúncio: o item volta para o depósito (sem espaço, continua anunciado). */
export function cancelListing(
  data: GameData,
  market: MarketState,
  seller: CharacterState,
  listingId: string,
): { ok: true; listing: MarketListing } | { ok: false; reason: MarketFail } {
  const listing = market.listings.find((l) => l.id === listingId && l.sellerId === seller.id);
  if (!listing) return { ok: false, reason: 'gone' };
  if (!depotRoom(data, seller, listing.itemId, listing.count)) return { ok: false, reason: 'room' };
  addItem(data, seller.depot, listing.itemId, listing.count);
  market.listings = market.listings.filter((l) => l !== listing);
  return { ok: true, listing };
}

/** Recebe o ouro das vendas feitas enquanto o personagem estava fora do jogo (vai para o banco). */
export function collectProceeds(market: MarketState, c: CharacterState): number {
  const amount = market.proceeds[c.id] ?? 0;
  if (amount <= 0) return 0;
  delete market.proceeds[c.id];
  c.bankGold += amount;
  return amount;
}
