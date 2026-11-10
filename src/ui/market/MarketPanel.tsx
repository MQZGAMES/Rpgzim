// Mercado de Pedraluz (corretor ao lado da banqueira) — pensado primeiro para o celular. A jornada:
//   1. Comprar / Vender / Minhas ofertas (abas no topo);
//   2. Categoria (espadas, machados, ..., poções de mana), com quantas ofertas (ou itens seus) há em cada uma;
//   3. Lista da categoria com filtro por vocação e ordenação por preço ou nível; ao lado de cada item, o nível, os
//      atributos, se é melhor ou pior que o seu e o preço (comprando: menor anúncio; vendendo: maior oferta e o último
//      negócio);
//   4. O item: todas as ofertas e as ações com valores sugeridos pela oferta e procura (MarketItem).
import { useMemo, useState } from 'react';
import { MARKET_CATEGORIES, type CatalogItem, type MarketCategoryId } from '../../domain/rules/marketCatalog';
import { useSession, useSnap } from '../../integration/game-ui-bridge/hooks';
import { ItemIcon, Panel, PixelButton } from '../common/primitives';
import { MarketItem } from './MarketItem';
import { Coin, FitBadge } from './marketUi';

type Mode = 'buy' | 'sell' | 'mine' | 'log';
/** Categoria da lista; 'all' = "Ver tudo" (tudo à venda ao comprar, tudo que você tem ao vender). */
type ListCat = MarketCategoryId | 'all';
type Screen =
  | { kind: 'cats' }
  | { kind: 'list'; cat: ListCat }
  | { kind: 'item'; itemId: string; back: ListCat | 'mine' | 'search' };
type VocFilter = 'all' | 'mine' | 'knight' | 'paladin' | 'sorcerer' | 'druid';
type Sort = 'level-asc' | 'level-desc' | 'price-asc' | 'price-desc';

const VOCS: [VocFilter, string][] = [
  ['all', 'Todas'],
  ['mine', 'Minha'],
  ['knight', 'Knight'],
  ['paladin', 'Paladin'],
  ['sorcerer', 'Sorcerer'],
  ['druid', 'Druid'],
];
const SORTS: [Sort, string][] = [
  ['level-asc', 'Nível ↑'],
  ['level-desc', 'Nível ↓'],
  ['price-asc', 'Preço ↑'],
  ['price-desc', 'Preço ↓'],
];

const chip = (on: boolean) =>
  `${on ? '' : 'opacity-80'} !border-[5px] min-h-[32px] shrink-0 px-2 text-[11px]`;

export function MarketPanel() {
  const session = useSession();
  const market = useSnap((s) => s.market);
  const vocation = useSnap((s) => s.player.vocation);
  const catalog = useMemo(() => session.marketCatalog(), [session]);
  const [mode, setMode] = useState<Mode>('buy');
  const [screen, setScreen] = useState<Screen>({ kind: 'cats' });
  const [voc, setVoc] = useState<VocFilter>('mine');
  const [sort, setSort] = useState<Sort>('level-asc');
  const [onlyOffers, setOnlyOffers] = useState(false);
  const [query, setQuery] = useState('');
  if (!market) return null;
  const byId = new Map(catalog.map((c) => [c.itemId, c]));
  const priceOf = (it: CatalogItem) =>
    (mode === 'sell' ? market.quotes[it.itemId]?.bid : market.quotes[it.itemId]?.ask) ?? null;
  const vocOk = (it: CatalogItem) =>
    voc === 'all' || !it.vocations || it.vocations.includes((voc === 'mine' ? vocation : voc) as never);
  const viewAll = screen.kind === 'list' && screen.cat === 'all';
  const listFor = (items: CatalogItem[]) =>
    items
      .filter((it) => (mode === 'sell' ? (market.owned[it.itemId] ?? 0) > 0 : true))
      .filter((it) => mode === 'sell' || !(onlyOffers || viewAll) || priceOf(it) !== null)
      .filter(vocOk)
      .sort((a, b) => {
        if (sort.startsWith('level'))
          return (sort === 'level-asc' ? 1 : -1) * (a.minLevel - b.minLevel) || a.score - b.score;
        const pa = priceOf(a);
        const pb = priceOf(b);
        if (pa === null || pb === null)
          return pa === null && pb === null ? a.minLevel - b.minLevel : pa === null ? 1 : -1;
        return (sort === 'price-asc' ? 1 : -1) * (pa - pb);
      });
  const go = (s: Screen) => setScreen(s);
  const tradeMode: 'buy' | 'sell' = mode === 'sell' ? 'sell' : 'buy';
  const switchMode = (m: Mode) => {
    setMode(m);
    // no item, troca de modo e continua no mesmo item; na lista ou nas categorias, volta às categorias
    if (screen.kind !== 'item' || m === 'mine' || m === 'log') setScreen({ kind: 'cats' });
  };
  const back = () => {
    if (screen.kind === 'item')
      setScreen(
        screen.back === 'mine'
          ? { kind: 'cats' }
          : screen.back === 'search'
            ? { kind: 'cats' }
            : { kind: 'list', cat: screen.back },
      );
    else setScreen({ kind: 'cats' });
    if (screen.kind === 'item' && screen.back === 'mine') setMode('mine');
  };
  const mine = market.offers.filter((o) => o.mine);
  const title =
    screen.kind === 'list'
      ? screen.cat === 'all'
        ? 'Ver tudo'
        : MARKET_CATEGORIES.find((c) => c.id === screen.cat)?.name
      : screen.kind === 'item'
        ? byId.get(screen.itemId)?.name
        : null;
  return (
    <Panel
      title="Mercado de Pedraluz"
      onClose={() => session.closeMarket()}
      icon="ui_coin"
      wide
      scroll={false}
      fill
    >
      <div className="flex min-h-0 flex-1 flex-col" data-testid="market-panel">
        {/* 1) comprar / vender / minhas ofertas */}
        <div className="mb-1 grid shrink-0 grid-cols-4 gap-1">
          <PixelButton
            variant={mode === 'buy' ? 'gold' : 'stone'}
            className="min-h-[40px] !border-[6px] text-[13px]"
            onClick={() => switchMode('buy')}
            data-testid="market-mode-buy"
          >
            Comprar
          </PixelButton>
          <PixelButton
            variant={mode === 'sell' ? 'gold' : 'stone'}
            className="min-h-[40px] !border-[6px] text-[13px]"
            onClick={() => switchMode('sell')}
            data-testid="market-mode-sell"
          >
            Vender
          </PixelButton>
          <PixelButton
            variant={mode === 'mine' ? 'gold' : 'stone'}
            className="min-h-[40px] !border-[6px] text-[12px]"
            onClick={() => switchMode('mine')}
            data-testid="market-mode-mine"
          >
            Minhas ({mine.length})
          </PixelButton>
          <PixelButton
            variant={mode === 'log' ? 'gold' : 'stone'}
            className="min-h-[40px] !border-[6px] text-[12px]"
            onClick={() => switchMode('log')}
            data-testid="market-mode-log"
          >
            Registro
          </PixelButton>
        </div>
        <div className="mb-1 flex shrink-0 flex-wrap items-center gap-x-3 text-[11px] text-muted">
          <span>
            Seu ouro <Coin n={market.money} />
          </span>
          {market.escrow > 0 && (
            <span>
              Reservado <Coin n={market.escrow} className="text-mana-light" />
            </span>
          )}
          {market.parcels > 0 && (
            <PixelButton
              variant="gold"
              className="!border-[5px] px-1 text-[11px]"
              onClick={() => session.marketTakeParcels()}
              data-testid="market-parcels"
            >
              Retirar {market.parcels} {market.parcels > 1 ? 'compras' : 'compra'}
            </PixelButton>
          )}
        </div>
        {screen.kind !== 'cats' && mode !== 'mine' && mode !== 'log' && (
          <div className="mb-1 flex shrink-0 items-center gap-2">
            <PixelButton
              className="min-h-[34px] !border-[5px] px-2 text-[12px]"
              onClick={back}
              data-testid="market-back"
            >
              ← Voltar
            </PixelButton>
            <span className="min-w-0 flex-1 truncate text-[13px] text-gold-light">{title}</span>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          {mode === 'log' ? (
            <TradeLog />
          ) : mode === 'mine' ? (
            <MyOffers
              onOpen={(itemId, side) => (setMode(side), go({ kind: 'item', itemId, back: 'mine' }))}
            />
          ) : screen.kind === 'cats' ? (
            <Categories
              mode={tradeMode}
              catalog={catalog}
              query={query}
              setQuery={setQuery}
              results={
                query.trim()
                  ? listFor(catalog.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase())))
                  : null
              }
              onCat={(cat) => go({ kind: 'list', cat })}
              onAll={() => go({ kind: 'list', cat: 'all' })}
              onItem={(itemId) => go({ kind: 'item', itemId, back: 'search' })}
            />
          ) : screen.kind === 'list' ? (
            <>
              <div className="sticky top-0 z-10 -mx-[1px] mb-1 flex flex-col gap-1 bg-[#1a1220] pb-1">
                <div className="flex gap-1 overflow-x-auto pb-[2px]" data-testid="market-voc-filter">
                  {VOCS.map(([v, label]) => (
                    <PixelButton
                      key={v}
                      variant={voc === v ? 'gold' : 'stone'}
                      className={chip(voc === v)}
                      onClick={() => setVoc(v)}
                      data-testid={`market-voc-${v}`}
                    >
                      {label}
                    </PixelButton>
                  ))}
                </div>
                <div className="flex gap-1 overflow-x-auto pb-[2px]" data-testid="market-sort">
                  {SORTS.map(([v, label]) => (
                    <PixelButton
                      key={v}
                      variant={sort === v ? 'gold' : 'stone'}
                      className={chip(sort === v)}
                      onClick={() => setSort(v)}
                      data-testid={`market-sort-${v}`}
                    >
                      {label}
                    </PixelButton>
                  ))}
                  {mode === 'buy' && !viewAll && (
                    <PixelButton
                      variant={onlyOffers ? 'gold' : 'stone'}
                      className={chip(onlyOffers)}
                      onClick={() => setOnlyOffers(!onlyOffers)}
                      data-testid="market-only-offers"
                    >
                      Só à venda
                    </PixelButton>
                  )}
                </div>
              </div>
              {mode === 'sell' && (
                <QuickSellAll
                  items={listFor(catalog.filter((c) => screen.cat === 'all' || c.category === screen.cat))}
                />
              )}
              <ItemRows
                mode={tradeMode}
                items={listFor(catalog.filter((c) => screen.cat === 'all' || c.category === screen.cat))}
                onItem={(itemId) => go({ kind: 'item', itemId, back: screen.cat })}
              />
            </>
          ) : (
            byId.get(screen.itemId) && (
              <MarketItem key={`${screen.itemId}-${mode}`} item={byId.get(screen.itemId)!} mode={tradeMode} />
            )
          )}
        </div>
      </div>
    </Panel>
  );
}

/** 2) Categorias: quantas ofertas (comprando) ou itens seus (vendendo) há em cada uma; e a busca por nome. */
function Categories({
  mode,
  catalog,
  query,
  setQuery,
  results,
  onCat,
  onAll,
  onItem,
}: {
  mode: 'buy' | 'sell';
  catalog: CatalogItem[];
  query: string;
  setQuery: (q: string) => void;
  results: CatalogItem[] | null;
  onCat: (c: MarketCategoryId) => void;
  onAll: () => void;
  onItem: (itemId: string) => void;
}) {
  const market = useSnap((s) => s.market)!;
  const groups = [...new Set(MARKET_CATEGORIES.map((c) => c.group))];
  const count = (cat: MarketCategoryId) =>
    catalog
      .filter((c) => c.category === cat)
      .reduce(
        (s, c) =>
          s + (mode === 'sell' ? (market.owned[c.itemId] ?? 0) : (market.quotes[c.itemId]?.askUnits ?? 0)),
        0,
      );
  const total = MARKET_CATEGORIES.reduce((s, c) => s + count(c.id), 0);
  return (
    <div data-testid="market-categories">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value.slice(0, 30))}
        placeholder="Procurar item pelo nome…"
        aria-label="Procurar item"
        className="mb-2 h-9 w-full border-2 border-ink bg-[#1a1220] px-2 text-[13px] text-parchment"
        data-testid="market-search"
      />
      {results ? (
        <ItemRows mode={mode} items={results} onItem={onItem} />
      ) : (
        <>
          <PixelButton
            variant="gold"
            className="mb-2 min-h-[40px] w-full !border-[6px] text-[13px]"
            onClick={onAll}
            data-testid="market-view-all"
          >
            Ver tudo ({total})
          </PixelButton>
          {mode === 'sell' && <QuickSellAll items={catalog} />}
          {groups.map((g) => (
            <div key={g} className="mb-2">
              <div className="mb-1 text-[12px] text-muted">{g}</div>
              <div className="grid grid-cols-4 gap-1 sm:grid-cols-6">
                {MARKET_CATEGORIES.filter((c) => c.group === g).map((c) => {
                  const n = count(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onCat(c.id)}
                      className={`frame-slot relative flex min-h-[64px] flex-col items-center justify-center gap-[2px] !border-[5px] px-[2px] text-center ${mode === 'sell' && !n ? 'opacity-50' : ''}`}
                      data-testid={`market-cat-${c.id}`}
                    >
                      <ItemIcon icon={c.icon} size={26} />
                      <span className="text-[10px] leading-tight text-parchment">{c.name}</span>
                      {n > 0 && (
                        <span
                          className={`text-outline absolute right-[2px] top-[1px] text-[10px] ${mode === 'sell' ? 'text-heal' : 'text-gold-light'}`}
                        >
                          {n}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
      <p className="text-[11px] text-muted">
        {mode === 'buy'
          ? 'O número em cada categoria é quanto está à venda. Comprando, você paga sempre o menor preço; sem ninguém vendendo, deixe uma oferta de compra.'
          : 'O número é quanto você tem (mochila e depósito). Materiais de criaturas só são vendidos nas lojas.'}
      </p>
    </div>
  );
}

/**
 * Vender tudo rápido: anuncia tudo o que você tem de `items` (mochila e depósito) pelo preço sugerido de cada um — um
 * abaixo do menor anúncio ou, sem ninguém vendendo, o preço de referência. Dois toques: o segundo confirma.
 */
function QuickSellAll({ items }: { items: CatalogItem[] }) {
  const session = useSession();
  const market = useSnap((s) => s.market)!;
  const [confirming, setConfirming] = useState(false);
  const mine = items.filter((it) => (market.owned[it.itemId] ?? 0) > 0);
  const units = mine.reduce((s, it) => s + market.owned[it.itemId]!, 0);
  const total = mine.reduce(
    (s, it) => s + market.owned[it.itemId]! * (market.quotes[it.itemId]?.sellSuggest ?? 0),
    0,
  );
  if (!units) return null;
  if (!confirming)
    return (
      <PixelButton
        className="mb-2 min-h-[40px] w-full !border-[6px] text-[13px]"
        onClick={() => setConfirming(true)}
        data-testid="market-sell-all"
      >
        Vender tudo rápido ({units})
      </PixelButton>
    );
  return (
    <div className="frame-slot mb-2 !border-[6px] p-1 text-[12px]" data-testid="market-sell-all-confirm">
      <p className="mb-1 text-parchment">
        Anunciar {units} {units > 1 ? 'itens' : 'item'} ({mine.length} {mine.length > 1 ? 'tipos' : 'tipo'})
        da mochila e do depósito pelo preço sugerido? Total pedido: <Coin n={total} />
      </p>
      <div className="grid grid-cols-2 gap-1">
        <PixelButton
          variant="gold"
          className="min-h-[38px] !border-[5px] text-[12px]"
          onClick={() => {
            session.marketSellAll(mine.map((it) => it.itemId));
            setConfirming(false);
          }}
          data-testid="market-sell-all-yes"
        >
          Anunciar tudo
        </PixelButton>
        <PixelButton
          className="min-h-[38px] !border-[5px] text-[12px]"
          onClick={() => setConfirming(false)}
          data-testid="market-sell-all-no"
        >
          Cancelar
        </PixelButton>
      </div>
    </div>
  );
}

/** 3) Linhas da lista: nível, atributos, melhor/pior que o seu e o preço do modo. */
function ItemRows({
  mode,
  items,
  onItem,
}: {
  mode: 'buy' | 'sell';
  items: CatalogItem[];
  onItem: (itemId: string) => void;
}) {
  const market = useSnap((s) => s.market)!;
  if (!items.length)
    return (
      <p className="text-[12px] text-muted">
        {mode === 'sell' ? 'Você não tem itens desta categoria.' : 'Nenhum item com esses filtros.'}
      </p>
    );
  return (
    <div className="flex flex-col gap-1" data-testid="market-list">
      {items.map((it) => {
        const q = market.quotes[it.itemId];
        const owned = market.owned[it.itemId] ?? 0;
        return (
          <button
            key={it.itemId}
            type="button"
            onClick={() => onItem(it.itemId)}
            className="frame-slot flex w-full items-center gap-2 !border-[5px] px-1 py-1 text-left"
            data-testid={`market-item-${it.itemId}`}
          >
            <ItemIcon icon={it.icon} size={30} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] text-parchment">{it.name}</span>
              <span className="block truncate text-[10px] text-muted">
                Nv {it.minLevel} · {it.stats}
              </span>
              <span className="block text-[10px]">
                <FitBadge fit={market.fits[it.itemId]} minLevel={it.minLevel} />
                {owned > 0 && <span className="ml-2 text-muted">você tem {owned}</span>}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end text-[11px] leading-tight">
              {mode === 'buy' ? (
                q?.ask != null ? (
                  <>
                    <Coin n={q.ask} />
                    <span className="text-muted">{q.askUnits} à venda</span>
                  </>
                ) : (
                  <span className="text-muted">sem anúncio</span>
                )
              ) : q?.bid != null ? (
                <>
                  <Coin n={q.bid} className="text-mana-light" />
                  <span className="text-muted">pagam</span>
                </>
              ) : (
                <span className="text-muted">sem comprador</span>
              )}
              {q?.last != null && <span className="text-muted">último {q.last}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const fmtWhen = (at: number) =>
  at > 0
    ? new Date(at).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

/** Registro: o que você comprou e vendeu no mercado (ofertas atendidas incluídas), com preço e total. */
function TradeLog() {
  const session = useSession();
  const market = useSnap((s) => s.market)!;
  const catalog = useMemo(() => session.marketCatalog(), [session]);
  const byId = new Map(catalog.map((c) => [c.itemId, c]));
  const spent = market.log.reduce((s, e) => s + (e.kind === 'buy' ? e.count * e.price : 0), 0);
  const earned = market.log.reduce((s, e) => s + (e.kind === 'sell' ? e.count * e.price : 0), 0);
  return (
    <div data-testid="market-log">
      {market.log.length === 0 ? (
        <p className="text-[12px] text-muted">Nenhum negócio ainda.</p>
      ) : (
        <>
          <div className="mb-1 flex flex-wrap gap-x-3 text-[11px] text-muted">
            <span>
              Gasto <Coin n={spent} className="text-hp-light" />
            </span>
            <span>
              Recebido <Coin n={earned} className="text-heal" />
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {market.log.map((e, i) => {
              const it = byId.get(e.itemId);
              const buy = e.kind === 'buy';
              return (
                <div
                  key={`${e.at}-${i}`}
                  className="frame-slot flex items-center gap-2 !border-[5px] px-1 py-1 text-[12px]"
                  data-testid={`market-log-${i}`}
                >
                  <ItemIcon icon={it?.icon ?? 'ui_bag'} size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-parchment">
                      <span className={buy ? 'text-hp-light' : 'text-heal'}>
                        {buy ? 'Comprou' : 'Vendeu'}
                      </span>{' '}
                      {e.count}x {it?.name ?? e.itemId}
                    </span>
                    <span className="block text-[11px] text-muted">
                      a <Coin n={e.price} /> · total {e.count * e.price} · {fmtWhen(e.at)}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
      <p className="mt-2 text-[11px] text-muted">
        Guarda as últimas 100 compras e vendas, inclusive as ofertas suas que alguém atendeu enquanto você
        estava fora.
      </p>
    </div>
  );
}

/** Minhas ofertas: vendas e compras abertas (com cancelar) e as compras a retirar. */
function MyOffers({ onOpen }: { onOpen: (itemId: string, side: 'buy' | 'sell') => void }) {
  const session = useSession();
  const market = useSnap((s) => s.market)!;
  const catalog = useMemo(() => session.marketCatalog(), [session]);
  const byId = new Map(catalog.map((c) => [c.itemId, c]));
  const mine = market.offers.filter((o) => o.mine);
  const section = (side: 'sell' | 'buy', title: string) => {
    const list = mine.filter((o) => o.side === side);
    return (
      <div className="mb-2">
        <div className={`mb-1 text-[12px] ${side === 'sell' ? 'text-gold-light' : 'text-mana-light'}`}>
          {title} ({list.length})
        </div>
        {list.length === 0 && <p className="text-[11px] text-muted">Nenhuma.</p>}
        <div className="flex flex-col gap-1">
          {list.map((o) => {
            const it = byId.get(o.itemId);
            const q = market.quotes[o.itemId];
            const best = side === 'sell' ? q?.ask : q?.bid;
            return (
              <div
                key={o.id}
                className="frame-slot flex items-center gap-2 !border-[5px] px-1 py-1 text-[12px]"
                data-testid={`market-mine-${o.id}`}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => onOpen(o.itemId, side)}
                >
                  <ItemIcon icon={it?.icon ?? 'ui_bag'} size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-parchment">
                      {o.count}x {it?.name ?? o.itemId}
                    </span>
                    <span className="block text-[11px] text-muted">
                      a <Coin n={o.price} /> · total {o.count * o.price}
                      {best != null && best !== o.price && (
                        <span
                          className={
                            (side === 'sell' ? best < o.price : best > o.price)
                              ? 'text-hp-light'
                              : 'text-heal'
                          }
                        >
                          {' '}
                          · {side === 'sell' ? 'menor anúncio' : 'maior oferta'} {best}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
                <PixelButton
                  className="min-h-[34px] !border-[5px] px-1 text-[11px]"
                  onClick={() => session.marketCancel(o.id)}
                  data-testid={`market-cancel-${o.id}`}
                >
                  Cancelar
                </PixelButton>
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  return (
    <div data-testid="market-mine">
      {section('sell', 'Vendendo')}
      {section('buy', 'Comprando (ouro reservado)')}
      <p className="text-[11px] text-muted">
        Cancelar uma venda devolve o item para a mochila; cancelar uma compra devolve o ouro reservado ao
        banco. O que alguém comprar de você vira ouro no banco; o que você comprou por oferta chega no
        depósito.
      </p>
    </div>
  );
}
