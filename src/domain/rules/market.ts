// Mercado de Pedraluz: livro de ofertas por item (inspirado no Market do Tibia e no Grand Exchange do RuneScape).
// - Só equipamentos e poções: materiais, comida e munição são das lojas.
// - Ofertas de VENDA (o item fica guardado pelo mercado) e de COMPRA (o ouro fica reservado), sem limite de quantidade.
// - Quem compra paga sempre o menor preço anunciado; quem vende recebe sempre a maior oferta de compra. Uma oferta que
//   alcança o preço do outro lado fecha na hora pelo preço de quem já estava esperando (como no Grand Exchange).
// - Todas as ofertas ficam visíveis (como no Tibia) e cada negócio fecha entra no histórico do item: o último preço e a
//   média recente viram o "preço de referência" que a tela usa para sugerir valores (oferta e demanda).
// - Entregas: o ouro das vendas vai para o banco; os itens comprados na hora vão para a mochila (sem espaço, para o
//   depósito). Quem não estava no jogo (ou estava com o depósito cheio) recebe depois: ouro em `proceeds` e itens em
//   `parcels`, retirados no mercado.
import type { CharacterState, ItemStack } from '../entities/character';
import type { ItemDef } from '../entities/definitions';
import type { GameData } from '../entities/gameData';
import { ensureDepotSize } from './depot';
import { addItem, capacityFor, countItem, removeItem } from './inventory';
import { SEASON } from './season';

export type OfferSide = 'sell' | 'buy';

export interface MarketOffer {
  id: string;
  side: OfferSide;
  ownerId: string;
  ownerName: string;
  itemId: string;
  /** Unidades restantes. */
  count: number;
  /** Preço por unidade. */
  price: number;
  /** Quando foi criada (relógio de parede do jogo). */
  at: number;
}

/** Um negócio fechado (para o histórico de preços). */
export interface MarketTrade {
  price: number;
  count: number;
  at: number;
}

export interface MarketState {
  offers: MarketOffer[];
  /** Últimos negócios de cada item (do mais antigo ao mais recente). */
  history: Record<string, MarketTrade[]>;
  /** Ouro de vendas (ou de ofertas canceladas) de quem não estava no jogo, por id de personagem. */
  proceeds: Record<string, number>;
  /** Itens comprados ainda não entregues (fora do jogo ou depósito cheio). */
  parcels: Record<string, ItemStack[]>;
  seq: number;
}

/** Um lado de um negócio: quem estava do outro lado, quantas unidades e a que preço. */
export interface MarketFill {
  otherId: string;
  itemId: string;
  count: number;
  price: number;
}

/** Negócios guardados por item no histórico. */
export const HISTORY_KEEP = 20;

export const emptyMarket = (): MarketState => ({ offers: [], history: {}, proceeds: {}, parcels: {}, seq: 0 });

/** O mercado só aceita equipamentos e poções (os itens diversos ficam com as lojas). */
export function marketable(def: ItemDef | undefined): boolean {
  return !!def && (!!def.slot || def.type === 'potion');
}

export type MarketFail = 'notMarketable' | 'empty' | 'price' | 'qty' | 'gone' | 'gold' | 'room' | 'none';

export const MARKET_FAIL_MESSAGE: Record<MarketFail, string> = {
  notMarketable: 'O mercado só negocia equipamentos e poções. Materiais e outros itens vão para as lojas.',
  empty: 'Você não tem esse item (mochila ou depósito).',
  price: 'Escolha um preço de pelo menos 1 de ouro.',
  qty: 'Escolha a quantidade.',
  gone: 'Essa oferta não está mais disponível.',
  gold: 'Ouro insuficiente (bolsa + banco).',
  room: 'Sem espaço na mochila nem no depósito.',
  none: 'Não há oferta nesse preço agora.',
};

// ------------------------------------------------------------------ consultas
/** Ofertas de um lado para o item, da melhor para a pior (venda: mais barata; compra: mais cara; empate: a mais antiga). */
export function offersFor(m: MarketState, itemId: string, side: OfferSide, exceptOwner?: string): MarketOffer[] {
  return m.offers
    .filter((o) => o.itemId === itemId && o.side === side && o.ownerId !== exceptOwner)
    .sort((a, b) => (side === 'sell' ? a.price - b.price : b.price - a.price) || a.at - b.at);
}

/** Níveis de preço (unidades somadas por preço), na ordem recebida. */
export function priceLevels(offers: readonly { price: number; count: number }[]): { price: number; count: number }[] {
  const out: { price: number; count: number }[] = [];
  for (const o of offers) {
    const last = out[out.length - 1];
    if (last && last.price === o.price) last.count += o.count;
    else out.push({ price: o.price, count: o.count });
  }
  return out;
}

export const ownOffers = (m: MarketState, ownerId: string): MarketOffer[] => m.offers.filter((o) => o.ownerId === ownerId);

/** Unidades que o personagem tem (mochila + depósito). */
export const ownedCount = (c: CharacterState, itemId: string): number =>
  countItem(c.inventory, itemId) + countItem(c.depot, itemId);

/** Ouro reservado nas ofertas de compra do personagem. */
export const escrowOf = (m: MarketState, ownerId: string): number =>
  m.offers.reduce((s, o) => (o.ownerId === ownerId && o.side === 'buy' ? s + o.price * o.count : s), 0);

export function lastTrade(m: MarketState, itemId: string): MarketTrade | null {
  const h = m.history[itemId];
  return h?.length ? h[h.length - 1]! : null;
}

/** Preço médio (por unidade) dos últimos `n` negócios, pesado pela quantidade. */
export function averagePrice(m: MarketState, itemId: string, n = 8): number | null {
  const h = (m.history[itemId] ?? []).slice(-n);
  const units = h.reduce((s, t) => s + t.count, 0);
  return units ? Math.round(h.reduce((s, t) => s + t.price * t.count, 0) / units) : null;
}

/** Preços das lojas por item (fixos para os dados do jogo: calculados uma vez). */
const shopCache = new WeakMap<GameData, Map<string, { sells: number | null; buys: number | null }>>();

/** Preço da loja: o que as lojas cobram (menor) e o que pagam (maior). */
export function shopPrices(data: GameData, itemId: string): { sells: number | null; buys: number | null } {
  let map = shopCache.get(data);
  if (!map) {
    map = new Map();
    for (const s of Object.values(data.shops)) {
      for (const o of s.sells) {
        const e = map.get(o.itemId) ?? { sells: null, buys: null };
        if (e.sells === null || o.price < e.sells) e.sells = o.price;
        map.set(o.itemId, e);
      }
      for (const o of s.buys) {
        const e = map.get(o.itemId) ?? { sells: null, buys: null };
        if (e.buys === null || o.price > e.buys) e.buys = o.price;
        map.set(o.itemId, e);
      }
    }
    shopCache.set(data, map);
  }
  return map.get(itemId) ?? { sells: null, buys: null };
}

/**
 * Guia de preços do item para quem está olhando (sem contar as próprias ofertas): menor venda, maior compra, último
 * negócio, média recente, a referência (oferta e demanda) e as sugestões para anunciar e para ofertar.
 */
export interface PriceGuide {
  ask: number | null;
  askUnits: number;
  bid: number | null;
  bidUnits: number;
  last: number | null;
  avg: number | null;
  trades: number;
  /** Preço justo estimado: negócios recentes; sem negócios, o meio do livro; sem nada, uma fração do valor. */
  ref: number;
  /** Sugestão para anunciar a venda: um pouco abaixo do menor anúncio (sem ir abaixo da maior oferta). */
  sellSuggest: number;
  /** Sugestão para a oferta de compra: um pouco acima da maior oferta (sem chegar no menor anúncio). */
  buySuggest: number;
  shopSells: number | null;
  shopBuys: number | null;
}

export function priceGuide(data: GameData, m: MarketState, itemId: string, viewer?: string): PriceGuide {
  const asks = offersFor(m, itemId, 'sell', viewer);
  const bids = offersFor(m, itemId, 'buy', viewer);
  const ask = asks[0]?.price ?? null;
  const bid = bids[0]?.price ?? null;
  const last = lastTrade(m, itemId)?.price ?? null;
  const avg = averagePrice(m, itemId);
  const shop = shopPrices(data, itemId);
  const def = data.items[itemId];
  const potion = def?.type === 'potion';
  // sem negócios nem ofertas: entre o que a loja paga e o que ela cobra (poções: um pouco abaixo da loja)
  const base = potion
    ? Math.round((shop.sells ?? def?.value ?? 1) * 0.85)
    : Math.round(Math.max(shop.buys ?? 0, (def?.value ?? 1) * 0.6));
  let ref = base;
  if (last !== null) ref = avg !== null ? Math.round(last * 0.5 + avg * 0.5) : last;
  else if (ask !== null && bid !== null) ref = Math.round((ask + bid) / 2);
  else if (ask !== null) ref = Math.min(ask, Math.max(base, Math.round(ask * 0.9)));
  else if (bid !== null) ref = Math.max(bid, base);
  ref = Math.max(1, ref);
  const sellSuggest = Math.max(1, bid !== null ? bid + 1 : 1, ask !== null ? ask - 1 : ref);
  const buySuggest = Math.max(1, Math.min(ask !== null ? ask - 1 : Infinity, bid !== null ? bid + 1 : Math.round(ref * 0.9)));
  return {
    ask,
    askUnits: asks.reduce((s, o) => s + o.count, 0),
    bid,
    bidUnits: bids.reduce((s, o) => s + o.count, 0),
    last,
    avg,
    trades: m.history[itemId]?.length ?? 0,
    ref,
    sellSuggest,
    buySuggest: Math.max(1, buySuggest),
    shopSells: shop.sells,
    shopBuys: shop.buys,
  };
}

/** Custo de comprar `qty` agora (do mais barato, até `maxPrice`) — sem as próprias ofertas. */
export function quoteBuy(m: MarketState, itemId: string, qty: number, buyerId: string, maxPrice = Infinity) {
  let count = 0;
  let total = 0;
  for (const o of offersFor(m, itemId, 'sell', buyerId)) {
    if (count >= qty || o.price > maxPrice) break;
    const n = Math.min(o.count, qty - count);
    count += n;
    total += n * o.price;
  }
  return { count, total };
}

/** Quanto renderia vender `qty` agora (da maior oferta, até `minPrice`) — sem as próprias ofertas. */
export function quoteSell(m: MarketState, itemId: string, qty: number, sellerId: string, minPrice = 0) {
  let count = 0;
  let total = 0;
  for (const o of offersFor(m, itemId, 'buy', sellerId)) {
    if (count >= qty || o.price < minPrice) break;
    const n = Math.min(o.count, qty - count);
    count += n;
    total += n * o.price;
  }
  return { count, total };
}

// ------------------------------------------------------------------ movimentos de itens e ouro
/** Paga com a bolsa e, faltando, com o banco. */
function pay(c: CharacterState, total: number): void {
  const fromPurse = Math.min(c.gold, total);
  c.gold -= fromPurse;
  c.bankGold -= total - fromPurse;
}

/** Tira `qty` unidades do item: primeiro da mochila, depois do depósito. */
function takeItems(c: CharacterState, itemId: string, qty: number): number {
  const a = removeItem(c.inventory, itemId, qty);
  return a + removeItem(c.depot, itemId, qty - a);
}

/** Quanto do item ainda cabe no depósito (sem mexer nele). */
export function depotSpace(data: GameData, c: CharacterState, itemId: string, want: number): number {
  ensureDepotSize(data, c);
  const trial = c.depot.map((s) => (s ? { ...s } : null));
  return addItem(data, trial, itemId, want);
}

/** Cabe `count` unidades entre mochila e depósito? */
export function roomFor(data: GameData, c: CharacterState, itemId: string, count: number): boolean {
  return Math.min(count, capacityFor(data, c.inventory, itemId)) + depotSpace(data, c, itemId, count) >= count;
}

/** Entrega para quem está presente: mochila primeiro, o resto no depósito. Devolve quantas foram para a mochila. */
function deliverHere(data: GameData, c: CharacterState, itemId: string, count: number): number {
  const bag = addItem(data, c.inventory, itemId, count);
  if (bag < count) addItem(data, c.depot, itemId, count - bag);
  return bag;
}

function record(m: MarketState, itemId: string, price: number, count: number, at: number): void {
  const h = (m.history[itemId] ??= []);
  h.push({ price, count, at });
  if (h.length > HISTORY_KEEP) h.splice(0, h.length - HISTORY_KEEP);
}

/** Executa contra as ofertas de venda (da mais barata) até `qty`/`maxPrice`: o comprador paga e recebe. */
function takeSellOffers(data: GameData, m: MarketState, buyer: CharacterState, itemId: string, qty: number, maxPrice: number, now: number): MarketFill[] {
  const fills: MarketFill[] = [];
  let left = qty;
  for (const o of offersFor(m, itemId, 'sell', buyer.id)) {
    if (left <= 0 || o.price > maxPrice) break;
    const n = Math.min(o.count, left);
    pay(buyer, n * o.price);
    deliverHere(data, buyer, itemId, n);
    o.count -= n;
    left -= n;
    record(m, itemId, o.price, n, now);
    fills.push({ otherId: o.ownerId, itemId, count: n, price: o.price });
  }
  m.offers = m.offers.filter((o) => o.count > 0);
  return fills;
}

/** Executa contra as ofertas de compra (da mais cara) até `qty`/`minPrice`: o vendedor recebe no banco. */
function takeBuyOffers(m: MarketState, seller: CharacterState, itemId: string, qty: number, minPrice: number, now: number): MarketFill[] {
  const fills: MarketFill[] = [];
  let left = qty;
  for (const o of offersFor(m, itemId, 'buy', seller.id)) {
    if (left <= 0 || o.price < minPrice) break;
    const n = Math.min(o.count, left);
    seller.bankGold += n * o.price; // o ouro já estava reservado na oferta de compra
    o.count -= n;
    left -= n;
    record(m, itemId, o.price, n, now);
    fills.push({ otherId: o.ownerId, itemId, count: n, price: o.price });
  }
  m.offers = m.offers.filter((o) => o.count > 0);
  return fills;
}

export type MarketResult<T = object> = ({ ok: true; fills: MarketFill[] } & T) | { ok: false; reason: MarketFail };

const validQty = (n: number) => Number.isFinite(n) && Math.floor(n) >= 1;

/**
 * Compra agora até `qty` unidades pagando o menor preço (várias ofertas, da mais barata, até `maxPrice`). Sem ouro ou
 * sem espaço para tudo, não compra nada.
 */
export function buyNow(data: GameData, m: MarketState, buyer: CharacterState, itemId: string, qty: number, maxPrice: number, now: number): MarketResult<{ count: number; total: number }> {
  if (!marketable(data.items[itemId])) return { ok: false, reason: 'notMarketable' };
  if (!validQty(qty)) return { ok: false, reason: 'qty' };
  const q = quoteBuy(m, itemId, Math.floor(qty), buyer.id, maxPrice);
  if (!q.count) return { ok: false, reason: 'none' };
  if (buyer.gold + buyer.bankGold < q.total) return { ok: false, reason: 'gold' };
  if (!roomFor(data, buyer, itemId, q.count)) return { ok: false, reason: 'room' };
  const fills = takeSellOffers(data, m, buyer, itemId, q.count, maxPrice, now);
  return { ok: true, fills, count: q.count, total: q.total };
}

/** Vende agora até `qty` unidades (mochila primeiro, depois depósito) para as maiores ofertas de compra (≥ `minPrice`). */
export function sellNow(data: GameData, m: MarketState, seller: CharacterState, itemId: string, qty: number, minPrice: number, now: number): MarketResult<{ count: number; total: number }> {
  if (!marketable(data.items[itemId])) return { ok: false, reason: 'notMarketable' };
  if (!validQty(qty)) return { ok: false, reason: 'qty' };
  const have = ownedCount(seller, itemId);
  if (!have) return { ok: false, reason: 'empty' };
  const q = quoteSell(m, itemId, Math.min(Math.floor(qty), have), seller.id, minPrice);
  if (!q.count) return { ok: false, reason: 'none' };
  takeItems(seller, itemId, q.count);
  const fills = takeBuyOffers(m, seller, itemId, q.count, minPrice, now);
  return { ok: true, fills, count: q.count, total: q.total };
}

/**
 * Cria uma oferta de `qty` unidades a `price` cada. A parte que já tem par do outro lado (venda ≤ oferta de compra;
 * compra ≥ anúncio) fecha na hora pelo preço de quem esperava; o resto fica no livro (o item guardado pelo mercado ou o
 * ouro reservado).
 */
export function placeOffer(
  data: GameData,
  m: MarketState,
  c: CharacterState,
  side: OfferSide,
  itemId: string,
  qty: number,
  price: number,
  now: number,
): MarketResult<{ matched: number; total: number; offer: MarketOffer | null }> {
  if (!marketable(data.items[itemId])) return { ok: false, reason: 'notMarketable' };
  const unit = Math.floor(price);
  if (!Number.isFinite(unit) || unit < 1) return { ok: false, reason: 'price' };
  if (!validQty(qty)) return { ok: false, reason: 'qty' };
  let n = Math.floor(qty);
  let fills: MarketFill[] = [];
  let matched = 0;
  let total = 0;
  if (side === 'sell') {
    n = Math.min(n, ownedCount(c, itemId));
    if (n < 1) return { ok: false, reason: 'empty' };
    const q = quoteSell(m, itemId, n, c.id, unit);
    if (q.count) {
      takeItems(c, itemId, q.count);
      fills = takeBuyOffers(m, c, itemId, q.count, unit, now);
      ({ count: matched, total } = q);
    }
    const rest = n - matched;
    let offer: MarketOffer | null = null;
    if (rest > 0) {
      takeItems(c, itemId, rest);
      offer = { id: `mo${++m.seq}`, side, ownerId: c.id, ownerName: c.name, itemId, count: rest, price: unit, at: now };
      m.offers.push(offer);
    }
    return { ok: true, fills, matched, total, offer };
  }
  const q = quoteBuy(m, itemId, n, c.id, unit);
  const rest = n - q.count;
  if (c.gold + c.bankGold < q.total + rest * unit) return { ok: false, reason: 'gold' };
  if (q.count && !roomFor(data, c, itemId, q.count)) return { ok: false, reason: 'room' };
  if (q.count) {
    fills = takeSellOffers(data, m, c, itemId, q.count, unit, now);
    ({ count: matched, total } = q);
  }
  let offer: MarketOffer | null = null;
  if (rest > 0) {
    pay(c, rest * unit);
    offer = { id: `mo${++m.seq}`, side, ownerId: c.id, ownerName: c.name, itemId, count: rest, price: unit, at: now };
    m.offers.push(offer);
  }
  return { ok: true, fills, matched, total, offer };
}

/**
 * Cancela uma oferta própria: a de venda devolve o item (mochila, senão depósito, senão fica como entrega); a de compra
 * devolve o ouro reservado ao banco.
 */
export function cancelOffer(data: GameData, m: MarketState, c: CharacterState, offerId: string): MarketResult<{ offer: MarketOffer; refund: number }> {
  const o = m.offers.find((x) => x.id === offerId && x.ownerId === c.id);
  if (!o) return { ok: false, reason: 'gone' };
  m.offers = m.offers.filter((x) => x !== o);
  if (o.side === 'buy') {
    c.bankGold += o.price * o.count;
    return { ok: true, fills: [], offer: o, refund: o.price * o.count };
  }
  const bag = addItem(data, c.inventory, o.itemId, o.count);
  const depot = bag < o.count ? addItem(data, c.depot, o.itemId, o.count - bag) : 0;
  if (bag + depot < o.count) addParcel(m, c.id, o.itemId, o.count - bag - depot);
  return { ok: true, fills: [], offer: o, refund: 0 };
}

/** Recebe o ouro guardado (vendas de quando estava fora) no banco. */
export function collectProceeds(m: MarketState, c: CharacterState): number {
  const amount = m.proceeds[c.id] ?? 0;
  if (amount <= 0) return 0;
  delete m.proceeds[c.id];
  c.bankGold += amount;
  return amount;
}

/** Entrega o que couber das compras pendentes (mochila, depois depósito); devolve quantas unidades saíram. */
export function collectParcels(data: GameData, m: MarketState, c: CharacterState, toBag = true): number {
  const list = m.parcels[c.id];
  if (!list?.length) return 0;
  ensureDepotSize(data, c);
  let got = 0;
  const left: ItemStack[] = [];
  for (const st of list) {
    const bag = toBag ? addItem(data, c.inventory, st.itemId, st.count) : 0;
    const depot = bag < st.count ? addItem(data, c.depot, st.itemId, st.count - bag) : 0;
    got += bag + depot;
    if (bag + depot < st.count) left.push({ itemId: st.itemId, count: st.count - bag - depot });
  }
  if (left.length) m.parcels[c.id] = left;
  else delete m.parcels[c.id];
  return got;
}

export const parcelUnits = (m: MarketState, characterId: string): number =>
  (m.parcels[characterId] ?? []).reduce((s, p) => s + p.count, 0);

/** Guarda uma entrega para depois (fora do jogo ou depósito cheio). */
export function addParcel(m: MarketState, characterId: string, itemId: string, count: number): void {
  const list = (m.parcels[characterId] ??= []);
  const same = list.find((s) => s.itemId === itemId);
  if (same) same.count += count;
  else list.push({ itemId, count });
}

// ------------------------------------------------------------------ persistência
/** Lê um mercado salvo (descarta o que não reconhece; de outra temporada, recomeça vazio). */
export function parseMarket(data: GameData, raw: unknown): MarketState {
  const m = emptyMarket();
  if (!raw || typeof raw !== 'object') return m;
  const r = raw as Record<string, unknown>;
  // temporada nova: o mercado recomeça vazio (as ofertas antigas eram de personagens que recomeçaram)
  if (r.season !== SEASON) return m;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
  const take = (o: Record<string, unknown>, side: OfferSide, owner: unknown, name: unknown, at: unknown) => {
    const itemId = typeof o.itemId === 'string' ? o.itemId : '';
    const count = Math.floor(num(o.count));
    const price = Math.floor(num(o.price));
    if (typeof owner !== 'string' || !data.items[itemId] || !(count > 0) || !(price > 0)) return;
    if (!marketable(data.items[itemId])) return;
    m.offers.push({
      id: typeof o.id === 'string' ? o.id : `mo${++m.seq}`,
      side,
      ownerId: owner,
      ownerName: String(name ?? '?'),
      itemId,
      count,
      price,
      at: num(at) || 0,
    });
  };
  if (Array.isArray(r.offers))
    for (const o of r.offers as Record<string, unknown>[])
      if (o && (o.side === 'sell' || o.side === 'buy')) take(o, o.side, o.ownerId, o.ownerName, o.at);
  if (r.history && typeof r.history === 'object')
    for (const [itemId, list] of Object.entries(r.history as Record<string, unknown>)) {
      if (!data.items[itemId] || !Array.isArray(list)) continue;
      const ok = (list as Record<string, unknown>[])
        .filter((t) => t && num(t.price) > 0 && num(t.count) > 0)
        .map((t) => ({ price: Math.floor(num(t.price)), count: Math.floor(num(t.count)), at: num(t.at) || 0 }))
        .slice(-HISTORY_KEEP);
      if (ok.length) m.history[itemId] = ok;
    }
  if (r.proceeds && typeof r.proceeds === 'object')
    for (const [k, v] of Object.entries(r.proceeds as Record<string, unknown>))
      if (num(v) > 0) m.proceeds[k] = (m.proceeds[k] ?? 0) + Math.floor(num(v));
  if (r.parcels && typeof r.parcels === 'object')
    for (const [k, v] of Object.entries(r.parcels as Record<string, unknown>))
      if (Array.isArray(v))
        for (const s of v as Record<string, unknown>[])
          if (s && typeof s.itemId === 'string' && data.items[s.itemId] && num(s.count) > 0)
            addParcel(m, k, s.itemId, Math.floor(num(s.count)));
  m.seq = Math.max(m.seq, Number.isFinite(num(r.seq)) ? num(r.seq) : 0, m.offers.length);
  return m;
}
