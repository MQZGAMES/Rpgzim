// Mercado do banco: livro de ofertas por item. Escolha um item (busca ou lista), diga quantas unidades e:
// - Comprar agora: paga o menor preço à venda (vários anúncios, do mais barato), o item vai para o depósito;
// - Vender agora: recebe a maior oferta de compra, o ouro vai para o banco;
// - ou deixe uma ordem: anúncio de venda (com "venda rápida" a 75% do valor) ou oferta de compra (o ouro fica
//   reservado). Uma ordem que alcança o preço do outro lado fecha na hora pelo preço de quem já esperava.
import { useMemo, useState } from 'react';
import type { MarketItemView } from '../../integration/game-ui-bridge/snapshot';
import { useSession, useSnap } from '../../integration/game-ui-bridge/hooks';
import { ItemIcon, PixelButton } from '../common/primitives';

type Filter = 'all' | 'mine' | 'selling' | 'wanted';
const FILTERS: [Filter, string][] = [
  ['all', 'Todos'],
  ['mine', 'Meus itens'],
  ['selling', 'À venda'],
  ['wanted', 'Procurados'],
];

/** Custo (ou ganho) de `qty` unidades andando pelos níveis de preço, do melhor para o pior. */
function walk(levels: { price: number; count: number }[], qty: number): { count: number; total: number } {
  let count = 0;
  let total = 0;
  for (const l of levels) {
    if (count >= qty) break;
    const n = Math.min(l.count, qty - count);
    count += n;
    total += n * l.price;
  }
  return { count, total };
}

const units = (levels: { count: number }[]) => levels.reduce((s, l) => s + l.count, 0);
const digits = (v: string) => v.replace(/\D/g, '').slice(0, 9);
const inputCls = 'h-8 border-2 border-ink bg-[#1a1220] px-1 text-[13px] text-parchment';

function Coin({ n, className = 'text-gold-light' }: { n: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[2px] ${className}`}>
      <ItemIcon icon="ui_coin" size={11} />
      {n}
    </span>
  );
}

function ItemRow({ it, active, onPick }: { it: MarketItemView; active: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`frame-slot flex w-full items-center gap-2 !border-[5px] px-1 py-[2px] text-left text-[12px] ${active ? 'outline-2 outline-gold-light' : ''}`}
      data-testid={`market-item-${it.itemId}`}
    >
      <ItemIcon icon={it.item.icon} size={22} />
      <span className="min-w-0 flex-1 truncate">{it.item.name}</span>
      {it.asks[0] && (
        <span title="Menor preço à venda">
          venda <Coin n={it.asks[0].price} />
        </span>
      )}
      {it.bids[0] && (
        <span title="Maior oferta de compra" className="text-mana-light">
          compra <Coin n={it.bids[0].price} className="text-mana-light" />
        </span>
      )}
      {it.owned > 0 && <span className="text-muted">você: {it.owned}</span>}
    </button>
  );
}

function Detail({ it, money }: { it: MarketItemView; money: number }) {
  const session = useSession();
  const [mode, setMode] = useState<'buy' | 'sell'>(it.owned > 0 && !it.asks.length ? 'sell' : 'buy');
  const [qtyText, setQty] = useState('1');
  const bestAsk = it.asks[0]?.price;
  const bestBid = it.bids[0]?.price;
  // preço sugerido: comprando, um pouco acima da maior oferta (ou metade do valor); vendendo, um pouco abaixo do
  // menor anúncio (sem ir abaixo da maior oferta) ou a venda rápida
  const suggestBuy = bestBid ? bestBid + 1 : Math.max(1, Math.round(it.item.value * 0.5));
  const suggestSell = bestAsk ? Math.max(bestBid ?? 1, bestAsk - 1) : it.quick;
  const [priceText, setPrice] = useState(String(mode === 'buy' ? suggestBuy : suggestSell));
  const qty = Math.max(1, Math.floor(Number(qtyText) || 1));
  const price = Math.floor(Number(priceText));
  const buyQ = walk(it.asks, qty);
  const sellQ = walk(it.bids, Math.min(qty, it.owned));
  const maxQty = mode === 'sell' ? Math.max(1, it.owned) : Math.max(1, units(it.asks) || 100);
  const switchMode = (m: 'buy' | 'sell') => {
    setMode(m);
    setPrice(String(m === 'buy' ? suggestBuy : suggestSell));
  };
  const done = () => setQty('1');
  return (
    <div className="frame-slot mt-2 !border-[6px] p-1 text-[12px]" data-testid="market-detail">
      <div className="flex items-center gap-2">
        <ItemIcon icon={it.item.icon} size={28} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] text-gold-light">{it.item.name}</div>
          <div className="text-[11px] text-muted">
            Você tem {it.owned} · loja paga {it.npcBuy || '—'} · valor {it.item.value}
          </div>
        </div>
      </div>
      <div className="mt-1 flex gap-1">
        <PixelButton variant={mode === 'buy' ? 'gold' : undefined} className="flex-1 !border-[5px] text-[12px]" onClick={() => switchMode('buy')} data-testid="market-mode-buy">
          Comprar
        </PixelButton>
        <PixelButton variant={mode === 'sell' ? 'gold' : undefined} className="flex-1 !border-[5px] text-[12px]" onClick={() => switchMode('sell')} data-testid="market-mode-sell">
          Vender
        </PixelButton>
      </div>
      <div className="mt-1 flex items-center gap-1">
        <span className="text-muted">Quantidade</span>
        <PixelButton className="!border-[5px] px-2 text-[12px]" onClick={() => setQty(String(Math.max(1, qty - 1)))} ariaLabel="Menos">
          −
        </PixelButton>
        <input inputMode="numeric" pattern="[0-9]*" value={qtyText} onChange={(e) => setQty(digits(e.target.value))} aria-label="Quantidade" className={`${inputCls} w-[56px] text-center`} data-testid="market-qty" />
        <PixelButton className="!border-[5px] px-2 text-[12px]" onClick={() => setQty(String(qty + 1))} ariaLabel="Mais">
          +
        </PixelButton>
        <PixelButton className="!border-[5px] px-1 text-[11px]" onClick={() => setQty(String(maxQty))} data-testid="market-qty-max">
          Máx
        </PixelButton>
      </div>
      {mode === 'buy' ? (
        <>
          <div className="mt-1">
            {bestAsk ? (
              <>
                Menor preço: <Coin n={bestAsk} /> <span className="text-muted">({units(it.asks)} à venda)</span>
              </>
            ) : (
              <span className="text-muted">Ninguém vendendo agora — deixe uma oferta de compra.</span>
            )}
          </div>
          <PixelButton
            variant="gold"
            className="mt-1 w-full !border-[6px] text-[12px]"
            disabled={!buyQ.count || buyQ.total > money}
            onClick={() => session.marketBuyNow(it.itemId, qty) && done()}
            data-testid="market-buy-now"
          >
            {buyQ.count ? `Comprar ${buyQ.count} agora por ${buyQ.total} de ouro${buyQ.count < qty ? ' (todos à venda)' : ''}` : 'Comprar agora'}
          </PixelButton>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <span className="text-muted">Oferta por unidade</span>
            <input inputMode="numeric" pattern="[0-9]*" value={priceText} onChange={(e) => setPrice(digits(e.target.value))} aria-label="Preço da oferta por unidade" className={`${inputCls} w-[76px]`} data-testid="market-price" />
            <PixelButton
              className="!border-[6px] px-1 text-[11px]"
              disabled={!(price >= 1) || price * qty > money}
              onClick={() => session.marketBid(it.itemId, qty, price) && done()}
              data-testid="market-place-bid"
            >
              Ofertar {qty} ({price * qty || 0} reservados)
            </PixelButton>
          </div>
        </>
      ) : (
        <>
          <div className="mt-1">
            {bestBid ? (
              <>
                Maior oferta: <Coin n={bestBid} className="text-mana-light" /> <span className="text-muted">({units(it.bids)} procurados)</span>
              </>
            ) : (
              <span className="text-muted">Ninguém comprando agora — anuncie para vender.</span>
            )}
          </div>
          <PixelButton
            variant="gold"
            className="mt-1 w-full !border-[6px] text-[12px]"
            disabled={!sellQ.count}
            onClick={() => session.marketSellNow(it.itemId, qty) && done()}
            data-testid="market-sell-now"
          >
            {sellQ.count ? `Vender ${sellQ.count} agora por ${sellQ.total} de ouro` : 'Vender agora'}
          </PixelButton>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <span className="text-muted">Preço por unidade</span>
            <input inputMode="numeric" pattern="[0-9]*" value={priceText} onChange={(e) => setPrice(digits(e.target.value))} aria-label="Preço de venda por unidade" className={`${inputCls} w-[76px]`} data-testid="market-price" />
            <PixelButton className="!border-[5px] px-1 text-[11px]" onClick={() => setPrice(String(it.quick))} title="75% do valor do item (a loja paga bem menos)" data-testid="market-quick">
              Venda rápida ({it.quick})
            </PixelButton>
            {bestAsk && (
              <PixelButton className="!border-[5px] px-1 text-[11px]" onClick={() => setPrice(String(bestAsk))}>
                Igualar ({bestAsk})
              </PixelButton>
            )}
          </div>
          <PixelButton
            className="mt-1 w-full !border-[6px] text-[12px]"
            disabled={!(price >= 1) || it.owned < 1}
            onClick={() => session.marketSell(it.itemId, Math.min(qty, it.owned), price) && done()}
            data-testid="market-place-ask"
          >
            Anunciar {Math.min(qty, Math.max(1, it.owned))} a {price || 0} cada
          </PixelButton>
        </>
      )}
    </div>
  );
}

export function MarketTab() {
  const session = useSession();
  const market = useSnap((s) => s.market);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [pick, setPick] = useState<string | null>(null);
  const list = useMemo(() => {
    if (!market) return [];
    const q = query.trim().toLowerCase();
    return market.items.filter(
      (it) =>
        (!q || it.item.name.toLowerCase().includes(q)) &&
        (filter === 'all' ||
          (filter === 'mine' && it.owned > 0) ||
          (filter === 'selling' && it.asks.length > 0) ||
          (filter === 'wanted' && it.bids.length > 0)),
    );
  }, [market, query, filter]);
  if (!market) return null;
  const picked = market.items.find((it) => it.itemId === pick) ?? null;
  return (
    <div data-testid="market-tab">
      <p className="mb-1 text-[11px] text-muted">
        Compra sempre pelo menor preço à venda; venda sempre pela maior oferta. Compras vão para o depósito, o ouro das
        vendas para o banco. Ordens abertas: {market.open}/{market.max}.
      </p>
      {market.parcels > 0 && (
        <div className="frame-slot mb-1 flex items-center gap-2 !border-[5px] p-1 text-[12px] text-heal">
          <span className="flex-1">{market.parcels} {market.parcels > 1 ? 'itens comprados esperando' : 'item comprado esperando'} espaço no depósito.</span>
          <PixelButton variant="gold" className="!border-[5px] px-1 text-[11px]" onClick={() => session.marketTakeParcels()} data-testid="market-parcels">
            Retirar
          </PixelButton>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1">
        <input value={query} onChange={(e) => setQuery(e.target.value.slice(0, 30))} placeholder="Procurar item…" aria-label="Procurar item" className={`${inputCls} min-w-0 flex-1`} data-testid="market-search" />
        {FILTERS.map(([f, label]) => (
          <PixelButton key={f} variant={filter === f ? 'gold' : undefined} className="!border-[5px] px-1 text-[11px]" onClick={() => setFilter(f)} data-testid={`market-filter-${f}`}>
            {label}
          </PixelButton>
        ))}
      </div>
      <div className="mt-1 flex max-h-[24dvh] flex-col gap-1 overflow-y-auto overscroll-contain pr-1 sm:max-h-[200px]">
        {list.length === 0 && <p className="text-[12px] text-muted">Nenhum item aqui. Itens da mochila e do depósito aparecem em "Meus itens".</p>}
        {list.map((it) => (
          <ItemRow key={it.itemId} it={it} active={it.itemId === pick} onPick={() => setPick(it.itemId)} />
        ))}
      </div>
      {picked && <Detail key={picked.itemId} it={picked} money={market.money} />}
      {market.orders.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-[12px] text-gold-light">Suas ordens</div>
          <div className="flex max-h-[18dvh] flex-col gap-1 overflow-y-auto overscroll-contain pr-1 sm:max-h-[160px]">
            {market.orders.map((o) => (
              <div key={o.id} className="frame-slot flex items-center gap-2 !border-[5px] px-1 py-[2px] text-[12px]" data-testid={`market-order-${o.id}`}>
                <ItemIcon icon={o.item.icon} size={20} />
                <span className="min-w-0 flex-1 truncate">
                  <span className={o.side === 'sell' ? 'text-gold-light' : 'text-mana-light'}>{o.side === 'sell' ? 'Vendendo' : 'Comprando'}</span> {o.count}x {o.item.name} a {o.price}
                </span>
                <PixelButton className="!border-[5px] px-1 text-[11px]" onClick={() => session.marketCancel(o.id)} data-testid={`market-cancel-${o.id}`}>
                  Cancelar
                </PixelButton>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
