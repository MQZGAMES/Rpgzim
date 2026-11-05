// Mercado do banco como livro de ofertas (por item): anúncios de VENDA (preço pedido por unidade) e ofertas de
// COMPRA (preço oferecido por unidade, com o ouro já reservado). Quem compra paga sempre o menor preço à venda; quem
// vende recebe sempre a maior oferta de compra. Uma oferta que cruza o livro executa na hora pelo preço de quem já
// estava esperando; o que sobra fica no livro. Compras chegam no depósito; o ouro das vendas cai no banco. Quem não
// está no jogo recebe ao logar (ouro em `proceeds`, itens em `parcels`), e quem está com o depósito cheio retira a
// entrega depois, no banco.
import type { CharacterState, ItemStack } from '../entities/character';
import type { GameData } from '../entities/gameData';
import { addItem, countItem, removeItem } from './inventory';
import { ensureDepotSize } from './depot';

/** Anúncio de venda (o item já saiu da mochila/depósito do vendedor). */
export interface MarketListing {
  id: string;
  sellerId: string;
  sellerName: string;
  itemId: string;
  count: number;
  /** Preço pedido por unidade. */
  price: number;
  listedAt: number;
}

/** Oferta de compra (o ouro `price × count` já saiu da bolsa/banco do comprador). */
export interface MarketBid {
  id: string;
  buyerId: string;
  buyerName: string;
  itemId: string;
  count: number;
  /** Preço oferecido por unidade. */
  price: number;
  placedAt: number;
}

export interface MarketState {
  listings: MarketListing[];
  bids: MarketBid[];
  /** Ouro de vendas (ou de ofertas retiradas) de quem não estava no jogo, por id de personagem. */
  proceeds: Record<string, number>;
  /** Itens comprados que ainda não couberam no depósito (ou de quem estava fora do jogo). */
  parcels: Record<string, ItemStack[]>;
  seq: number;
}

/** Um negócio fechado: quem estava do outro lado, quantas unidades e a que preço. */
export interface MarketFill {
  otherId: string;
  itemId: string;
  count: number;
  price: number;
}

/** Ordens abertas (venda + compra) por personagem. */
export const MARKET_MAX_PER_SELLER = 12;
/** Venda rápida: anuncia a 75% do valor do item (o NPC paga bem menos). */
export const MARKET_AUTO_RATE = 0.75;

export const emptyMarket = (): MarketState => ({ listings: [], bids: [], proceeds: {}, parcels: {}, seq: 0 });

export type MarketFail = 'empty' | 'price' | 'limit' | 'own' | 'gone' | 'gold' | 'room' | 'none';

export const MARKET_FAIL_MESSAGE: Record<MarketFail, string> = {
  empty: 'Você não tem esse item (mochila ou depósito).',
  price: 'Defina um preço de pelo menos 1 de ouro.',
  limit: `Você já tem ${MARKET_MAX_PER_SELLER} ordens abertas no mercado.`,
  own: 'Essa ordem é sua (use "Cancelar").',
  gone: 'Essa ordem não está mais disponível.',
  gold: 'Ouro insuficiente (bolsa + banco).',
  room: 'Sem espaço no depósito para receber o item.',
  none: 'Ninguém está vendendo (ou comprando) esse item agora.',
};

/** Preço da venda rápida (por unidade). */
export function autoPrice(data: GameData, itemId: string): number {
  return Math.max(1, Math.round((data.items[itemId]?.value ?? 1) * MARKET_AUTO_RATE));
}

/** Quanto de `itemId` ainda cabe no depósito (sem mexer nele). */
export function depotSpace(data: GameData, c: CharacterState, itemId: string, want: number): number {
  ensureDepotSize(data, c);
  const trial = c.depot.map((s) => (s ? { ...s } : null));
  return addItem(data, trial, itemId, want);
}

/** Cabe `count` de `itemId` no depósito (sem mexer nele)? */
export function depotRoom(data: GameData, c: CharacterState, itemId: string, count: number): boolean {
  return depotSpace(data, c, itemId, count) === count;
}

/** Quantas unidades o personagem tem (mochila + depósito). */
export const ownedCount = (c: CharacterState, itemId: string): number =>
  countItem(c.inventory, itemId) + countItem(c.depot, itemId);

export const openOrders = (m: MarketState, characterId: string): number =>
  m.listings.filter((l) => l.sellerId === characterId).length + m.bids.filter((b) => b.buyerId === characterId).length;

/** Anúncios de venda de um item, do mais barato ao mais caro (empate: o mais antigo primeiro). */
export function asksFor(m: MarketState, itemId: string, exceptId?: string): MarketListing[] {
  return m.listings
    .filter((l) => l.itemId === itemId && l.sellerId !== exceptId)
    .sort((a, b) => a.price - b.price || a.listedAt - b.listedAt);
}

/** Ofertas de compra de um item, da maior para a menor (empate: a mais antiga primeiro). */
export function bidsFor(m: MarketState, itemId: string, exceptId?: string): MarketBid[] {
  return m.bids
    .filter((b) => b.itemId === itemId && b.buyerId !== exceptId)
    .sort((a, b) => b.price - a.price || a.placedAt - b.placedAt);
}

/** Quanto custaria comprar `qty` agora (andando do menor preço para cima, até `maxPrice`). */
export function quoteBuy(m: MarketState, itemId: string, qty: number, buyerId: string, maxPrice = Infinity) {
  let count = 0;
  let total = 0;
  for (const l of asksFor(m, itemId, buyerId)) {
    if (count >= qty || l.price > maxPrice) break;
    const n = Math.min(l.count, qty - count);
    count += n;
    total += n * l.price;
  }
  return { count, total };
}

/** Quanto renderia vender `qty` agora (andando da maior oferta para baixo, até `minPrice`). */
export function quoteSell(m: MarketState, itemId: string, qty: number, sellerId: string, minPrice = 0) {
  let count = 0;
  let total = 0;
  for (const b of bidsFor(m, itemId, sellerId)) {
    if (count >= qty || b.price < minPrice) break;
    const n = Math.min(b.count, qty - count);
    count += n;
    total += n * b.price;
  }
  return { count, total };
}

/** Paga com a bolsa e, faltando, com o banco. */
function pay(c: CharacterState, total: number): void {
  const fromPurse = Math.min(c.gold, total);
  c.gold -= fromPurse;
  c.bankGold -= total - fromPurse;
}

/** Tira `qty` unidades do item: primeiro da mochila (ou do depósito, se preferido), depois do outro. */
function takeItems(c: CharacterState, itemId: string, qty: number, prefer: 'inventory' | 'depot' = 'inventory'): number {
  const [first, second] = prefer === 'depot' ? [c.depot, c.inventory] : [c.inventory, c.depot];
  const a = removeItem(first, itemId, qty);
  return a + removeItem(second, itemId, qty - a);
}

/** Executa contra os anúncios de venda (do mais barato) até `qty` ou `maxPrice`: o comprador paga, recebe no depósito. */
function takeAsks(data: GameData, m: MarketState, buyer: CharacterState, itemId: string, qty: number, maxPrice: number): MarketFill[] {
  const fills: MarketFill[] = [];
  let left = qty;
  for (const l of asksFor(m, itemId, buyer.id)) {
    if (left <= 0 || l.price > maxPrice) break;
    const n = Math.min(l.count, left);
    pay(buyer, n * l.price);
    addItem(data, buyer.depot, itemId, n);
    l.count -= n;
    left -= n;
    fills.push({ otherId: l.sellerId, itemId, count: n, price: l.price });
  }
  m.listings = m.listings.filter((l) => l.count > 0);
  return fills;
}

/** Executa contra as ofertas de compra (da maior) até `qty` ou `minPrice`: o vendedor recebe no banco. */
function takeBids(m: MarketState, seller: CharacterState, itemId: string, qty: number, minPrice: number): MarketFill[] {
  const fills: MarketFill[] = [];
  let left = qty;
  for (const b of bidsFor(m, itemId, seller.id)) {
    if (left <= 0 || b.price < minPrice) break;
    const n = Math.min(b.count, left);
    seller.bankGold += n * b.price; // o ouro já estava reservado na oferta
    b.count -= n;
    left -= n;
    fills.push({ otherId: b.buyerId, itemId, count: n, price: b.price });
  }
  m.bids = m.bids.filter((b) => b.count > 0);
  return fills;
}

export type MarketResult<T = object> = ({ ok: true; fills: MarketFill[] } & T) | { ok: false; reason: MarketFail };

/**
 * Compra agora até `qty` unidades pelo menor preço disponível (vários anúncios, do mais barato). O que couber no
 * depósito; sem espaço ou sem ouro para tudo, não compra nada.
 */
export function buyNow(data: GameData, m: MarketState, buyer: CharacterState, itemId: string, qty: number, maxPrice = Infinity): MarketResult<{ total: number; count: number }> {
  const q = quoteBuy(m, itemId, qty, buyer.id, maxPrice);
  if (!q.count) return { ok: false, reason: asksFor(m, itemId).some((l) => l.sellerId === buyer.id) && !asksFor(m, itemId, buyer.id).length ? 'own' : 'none' };
  if (buyer.gold + buyer.bankGold < q.total) return { ok: false, reason: 'gold' };
  if (!depotRoom(data, buyer, itemId, q.count)) return { ok: false, reason: 'room' };
  const fills = takeAsks(data, m, buyer, itemId, q.count, maxPrice);
  return { ok: true, fills, total: q.total, count: q.count };
}

/** Vende agora até `qty` unidades (mochila primeiro, depois depósito) para as maiores ofertas de compra. */
export function sellNow(m: MarketState, seller: CharacterState, itemId: string, qty: number, minPrice = 0): MarketResult<{ total: number; count: number }> {
  const have = ownedCount(seller, itemId);
  if (!have) return { ok: false, reason: 'empty' };
  const q = quoteSell(m, itemId, Math.min(qty, have), seller.id, minPrice);
  if (!q.count) return { ok: false, reason: 'none' };
  takeItems(seller, itemId, q.count);
  const fills = takeBids(m, seller, itemId, q.count, minPrice);
  return { ok: true, fills, total: q.total, count: q.count };
}

/**
 * Anuncia `qty` unidades a `price` cada. Se já há quem pague isso ou mais, vende na hora pela oferta (maior primeiro);
 * o resto fica anunciado.
 */
export function placeAsk(data: GameData, m: MarketState, seller: CharacterState, itemId: string, qty: number, price: number, now: number, prefer: 'inventory' | 'depot' = 'inventory'): MarketResult<{ sold: number; total: number; listing: MarketListing | null }> {
  const unit = Math.floor(price);
  if (!Number.isFinite(unit) || unit < 1) return { ok: false, reason: 'price' };
  const n = Math.min(Math.floor(qty), ownedCount(seller, itemId));
  if (!data.items[itemId] || n < 1) return { ok: false, reason: 'empty' };
  const q = quoteSell(m, itemId, n, seller.id, unit);
  if (q.count < n && openOrders(m, seller.id) >= MARKET_MAX_PER_SELLER) return { ok: false, reason: 'limit' };
  let fills: MarketFill[] = [];
  if (q.count) {
    takeItems(seller, itemId, q.count, prefer);
    fills = takeBids(m, seller, itemId, q.count, unit);
  }
  let listing: MarketListing | null = null;
  const rest = n - q.count;
  if (rest > 0) {
    takeItems(seller, itemId, rest, prefer);
    listing = { id: `mk${++m.seq}`, sellerId: seller.id, sellerName: seller.name, itemId, count: rest, price: unit, listedAt: now };
    m.listings.push(listing);
  }
  return { ok: true, fills, sold: q.count, total: q.total, listing };
}

/**
 * Oferta de compra de `qty` unidades a até `price` cada. Se já há anúncio por esse preço ou menos, compra na hora pelo
 * preço anunciado (menor primeiro); o resto vira oferta com o ouro reservado.
 */
export function placeBid(data: GameData, m: MarketState, buyer: CharacterState, itemId: string, qty: number, price: number, now: number): MarketResult<{ bought: number; total: number; bid: MarketBid | null }> {
  const unit = Math.floor(price);
  if (!Number.isFinite(unit) || unit < 1) return { ok: false, reason: 'price' };
  const n = Math.floor(qty);
  if (!data.items[itemId] || n < 1) return { ok: false, reason: 'empty' };
  const q = quoteBuy(m, itemId, n, buyer.id, unit);
  const rest = n - q.count;
  if (rest > 0 && openOrders(m, buyer.id) >= MARKET_MAX_PER_SELLER) return { ok: false, reason: 'limit' };
  if (buyer.gold + buyer.bankGold < q.total + rest * unit) return { ok: false, reason: 'gold' };
  if (q.count && !depotRoom(data, buyer, itemId, q.count)) return { ok: false, reason: 'room' };
  const fills = q.count ? takeAsks(data, m, buyer, itemId, q.count, unit) : [];
  let bid: MarketBid | null = null;
  if (rest > 0) {
    pay(buyer, rest * unit);
    bid = { id: `mb${++m.seq}`, buyerId: buyer.id, buyerName: buyer.name, itemId, count: rest, price: unit, placedAt: now };
    m.bids.push(bid);
  }
  return { ok: true, fills, bought: q.count, total: q.total, bid };
}

/** Anuncia a pilha inteira da posição `index` (mochila ou depósito) a `price` por unidade. */
export function listItem(data: GameData, m: MarketState, seller: CharacterState, from: 'inventory' | 'depot', index: number, price: number, now: number): MarketResult<{ listing: MarketListing | null; sold: number; total: number }> {
  const inv = from === 'inventory' ? seller.inventory : seller.depot;
  const st = inv[index];
  if (!st || !data.items[st.itemId]) return { ok: false, reason: 'empty' };
  // (a quantidade é a da pilha escolhida; as unidades saem da mochila primeiro, depois do depósito)
  return placeAsk(data, m, seller, st.itemId, st.count, price, now, from);
}

/** Cancela uma ordem própria: o anúncio volta para o depósito (sem espaço, continua); a oferta devolve o ouro ao banco. */
export function cancelOrder(data: GameData, m: MarketState, c: CharacterState, orderId: string): MarketResult<{ itemId: string; count: number; refund: number }> {
  const l = m.listings.find((x) => x.id === orderId && x.sellerId === c.id);
  if (l) {
    if (!depotRoom(data, c, l.itemId, l.count)) return { ok: false, reason: 'room' };
    addItem(data, c.depot, l.itemId, l.count);
    m.listings = m.listings.filter((x) => x !== l);
    return { ok: true, fills: [], itemId: l.itemId, count: l.count, refund: 0 };
  }
  const b = m.bids.find((x) => x.id === orderId && x.buyerId === c.id);
  if (!b) return { ok: false, reason: 'gone' };
  c.bankGold += b.price * b.count;
  m.bids = m.bids.filter((x) => x !== b);
  return { ok: true, fills: [], itemId: b.itemId, count: b.count, refund: b.price * b.count };
}

/** Recebe o ouro guardado (vendas de quando estava fora) no banco. */
export function collectProceeds(m: MarketState, c: CharacterState): number {
  const amount = m.proceeds[c.id] ?? 0;
  if (amount <= 0) return 0;
  delete m.proceeds[c.id];
  c.bankGold += amount;
  return amount;
}

/** Coloca no depósito o que couber das entregas pendentes; devolve quantas unidades entraram. */
export function collectParcels(data: GameData, m: MarketState, c: CharacterState): number {
  const list = m.parcels[c.id];
  if (!list?.length) return 0;
  ensureDepotSize(data, c);
  let got = 0;
  const left: ItemStack[] = [];
  for (const st of list) {
    const n = addItem(data, c.depot, st.itemId, st.count);
    got += n;
    if (n < st.count) left.push({ itemId: st.itemId, count: st.count - n });
  }
  if (left.length) m.parcels[c.id] = left;
  else delete m.parcels[c.id];
  return got;
}

/** Guarda uma entrega para depois (fora do jogo ou depósito cheio). */
export function addParcel(m: MarketState, characterId: string, itemId: string, count: number): void {
  const list = (m.parcels[characterId] ??= []);
  const same = list.find((s) => s.itemId === itemId);
  if (same) same.count += count;
  else list.push({ itemId, count });
}

/** Valida e lê um mercado salvo (descarta o que não reconhece). */
export function parseMarket(data: GameData, raw: unknown): MarketState {
  const m = emptyMarket();
  if (!raw || typeof raw !== 'object') return m;
  const r = raw as Partial<MarketState>;
  const okOrder = (o: { itemId?: unknown; count?: unknown; price?: unknown } | null | undefined) =>
    !!o && typeof o.itemId === 'string' && !!data.items[o.itemId] && Number.isFinite(o.count) && Number(o.count) > 0 && Number.isFinite(o.price) && Number(o.price) > 0;
  if (Array.isArray(r.listings))
    for (const l of r.listings)
      if (okOrder(l) && typeof l.id === 'string' && typeof l.sellerId === 'string')
        m.listings.push({ ...l, sellerName: String(l.sellerName ?? '?'), listedAt: Number(l.listedAt) || 0 });
  if (Array.isArray(r.bids))
    for (const b of r.bids)
      if (okOrder(b) && typeof b.id === 'string' && typeof b.buyerId === 'string')
        m.bids.push({ ...b, buyerName: String(b.buyerName ?? '?'), placedAt: Number(b.placedAt) || 0 });
  if (r.proceeds && typeof r.proceeds === 'object')
    for (const [k, v] of Object.entries(r.proceeds)) if (Number.isFinite(v) && v > 0) m.proceeds[k] = Math.floor(v);
  if (r.parcels && typeof r.parcels === 'object')
    for (const [k, v] of Object.entries(r.parcels))
      if (Array.isArray(v)) {
        const ok = v.filter((s) => okOrder({ ...s, price: 1 }));
        if (ok.length) m.parcels[k] = ok.map((s) => ({ itemId: s.itemId, count: Math.floor(s.count) }));
      }
  m.seq = Number.isFinite(r.seq) ? Number(r.seq) : m.listings.length + m.bids.length;
  return m;
}
