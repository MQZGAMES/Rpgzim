// Tela de um item no mercado: atributos e comparação com o que você usa, o guia de preços (menor venda, maior compra,
// último negócio, média), as ações do modo escolhido com valores sugeridos e TODAS as ofertas do item.
// Comprar: compra na hora pelo menor preço (várias unidades do mesmo preço de uma vez) ou deixa uma oferta de compra.
// Vender: vende na hora para quem já quer comprar ou anuncia (último negócio, abaixo do menor anúncio ou o seu preço).
import { useState } from 'react';
import type { CatalogItem } from '../../domain/rules/marketCatalog';
import { priceLevels } from '../../domain/rules/market';
import { useSession, useSnap } from '../../integration/game-ui-bridge/hooks';
import type { MarketOfferView } from '../../integration/game-ui-bridge/snapshot';
import { ItemIcon, PixelButton } from '../common/primitives';
import { Coin, FitBadge, PriceChip, PriceStepper, QtyStepper } from './marketUi';

const VOC_SHORT: Record<string, string> = {
  knight: 'Knight',
  paladin: 'Paladin',
  sorcerer: 'Sorcerer',
  druid: 'Druid',
};

function ago(at: number, now: number): string {
  const min = Math.max(0, Math.round((now - at) / 60000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} d`;
}

/** Uma lista do livro (à venda ou procurados), com as unidades por preço; tocar escolhe o preço para a ação. */
function Book({
  title,
  side,
  offers,
  selected,
  onPick,
  now,
}: {
  title: string;
  side: 'sell' | 'buy';
  offers: MarketOfferView[];
  selected: number | null;
  onPick: ((price: number) => void) | null;
  now: number;
}) {
  return (
    <div className="min-w-0 flex-1" data-testid={`market-book-${side}`}>
      <div className={`mb-1 text-[12px] ${side === 'sell' ? 'text-gold-light' : 'text-mana-light'}`}>
        {title} ({offers.reduce((s, o) => s + o.count, 0)})
      </div>
      {offers.length === 0 && <p className="text-[11px] text-muted">Nenhuma oferta.</p>}
      <div className="flex flex-col gap-[3px]">
        {offers.map((o) => (
          <button
            key={o.id}
            type="button"
            disabled={!onPick || o.mine}
            onClick={() => onPick?.(o.price)}
            className={`frame-slot flex items-center gap-1 !border-[4px] px-1 py-[2px] text-left text-[11px] ${selected === o.price && !o.mine ? 'outline-2 outline-gold-light' : ''} ${o.mine ? 'opacity-70' : ''}`}
            data-testid={`market-offer-${o.id}`}
          >
            <Coin n={o.price} className={side === 'sell' ? 'text-gold-light' : 'text-mana-light'} />
            <span className="text-parchment">×{o.count}</span>
            <span className="min-w-0 flex-1 truncate text-right text-muted">
              {o.mine ? 'você' : o.owner} · {ago(o.at, now)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function MarketItem({ item, mode }: { item: CatalogItem; mode: 'buy' | 'sell' }) {
  const session = useSession();
  const market = useSnap((s) => s.market)!;
  const now = Date.now(); // as ofertas guardam a hora do relógio (valem entre sessões)
  const q = market.quotes[item.itemId]!;
  const fit = market.fits[item.itemId];
  const owned = market.owned[item.itemId] ?? 0;
  const offers = market.offers.filter((o) => o.itemId === item.itemId);
  const asks = offers.filter((o) => o.side === 'sell').sort((a, b) => a.price - b.price || a.at - b.at);
  const bids = offers.filter((o) => o.side === 'buy').sort((a, b) => b.price - a.price || a.at - b.at);
  const askLevels = priceLevels(asks.filter((o) => !o.mine));
  const bidLevels = priceLevels(bids.filter((o) => !o.mine));
  // preço escolhido no livro para agir na hora (padrão: o melhor do outro lado)
  const [pickedAsk, setPickedAsk] = useState<number | null>(null);
  const [pickedBid, setPickedBid] = useState<number | null>(null);
  const askAt = askLevels.find((l) => l.price === pickedAsk) ?? askLevels[0] ?? null;
  const bidAt = bidLevels.find((l) => l.price === pickedBid) ?? bidLevels[0] ?? null;
  // unidades disponíveis até o preço escolhido (comprar) / a partir dele (vender)
  const buyUnits = askAt
    ? askLevels.filter((l) => l.price <= askAt.price).reduce((s, l) => s + l.count, 0)
    : 0;
  const sellUnits = bidAt
    ? Math.min(
        owned,
        bidLevels.filter((l) => l.price >= bidAt.price).reduce((s, l) => s + l.count, 0),
      )
    : 0;
  const [shopQty, setShopQty] = useState(1);
  const [qtyNow, setQtyNow] = useState(1);
  const [qtyOffer, setQtyOffer] = useState(1);
  const [price, setPrice] = useState(mode === 'buy' ? q.buySuggest : q.sellSuggest);
  const qNow = Math.max(1, Math.min(qtyNow, mode === 'buy' ? buyUnits : sellUnits));
  const qOffer = Math.max(1, mode === 'sell' ? Math.min(qtyOffer, Math.max(1, owned)) : qtyOffer);
  // custo de comprar qNow andando do menor preço; valor de vender qNow para as maiores ofertas
  const walk = (levels: { price: number; count: number }[], n: number) => {
    let left = n;
    let total = 0;
    for (const l of levels) {
      const k = Math.min(left, l.count);
      total += k * l.price;
      left -= k;
      if (left <= 0) break;
    }
    return total;
  };
  const buyTotal = walk(askLevels, qNow);
  const sellTotal = walk(bidLevels, qNow);
  const crosses = mode === 'buy' ? q.ask !== null && price >= q.ask : q.bid !== null && price <= q.bid;
  const maxBuyOffer = Math.max(1, Math.min(999, Math.floor(market.money / Math.max(1, price))));
  const chips =
    mode === 'buy'
      ? [
          ...(q.bid !== null
            ? [
                {
                  label: 'Cobrir maior oferta',
                  price: Math.min(q.bid + 1, q.ask !== null ? Math.max(1, q.ask - 1) : Infinity),
                },
              ]
            : []),
          { label: 'Referência', price: q.ref },
          ...(q.last !== null ? [{ label: 'Último negócio', price: q.last }] : []),
          ...(q.ask !== null ? [{ label: 'Menor anúncio', price: q.ask }] : []),
        ]
      : [
          ...(q.last !== null ? [{ label: 'Último negócio', price: q.last }] : []),
          ...(q.ask !== null
            ? [
                {
                  label: 'Abaixo do menor',
                  price: Math.max(1, q.bid !== null ? Math.max(q.bid + 1, q.ask - 1) : q.ask - 1),
                },
              ]
            : []),
          { label: 'Referência', price: q.ref },
          ...(q.bid !== null ? [{ label: 'Maior oferta', price: q.bid }] : []),
        ];
  const uniqueChips = chips.filter(
    (c, i) => Number.isFinite(c.price) && chips.findIndex((x) => x.label === c.label) === i,
  );
  return (
    <div className="flex flex-col gap-2" data-testid="market-item">
      {/* cabeçalho: atributos e comparação com o que você usa */}
      <div className="frame-slot flex items-start gap-2 !border-[6px] p-1 text-[12px]">
        <div className="frame-slot !border-[4px]">
          <ItemIcon icon={item.icon} size={36} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] leading-tight text-gold-light">{item.name}</div>
          <div className="text-[11px] text-parchment">{item.stats}</div>
          <div className="flex flex-wrap gap-x-2 text-[11px]">
            <span className="text-muted">Nv {item.minLevel}</span>
            <span className="text-muted">
              {item.vocations ? item.vocations.map((v) => VOC_SHORT[v]).join(', ') : 'todas as vocações'}
            </span>
            <FitBadge fit={fit} minLevel={item.minLevel} />
          </div>
          <div className="text-[11px] text-muted">Você tem {owned}</div>
        </div>
      </div>
      {/* guia de preços */}
      <div className="grid grid-cols-2 gap-1 text-[11px] sm:grid-cols-4" data-testid="market-guide">
        <div className="frame-slot !border-[4px] px-1">
          <div className="text-muted">Menor venda</div>
          {q.ask !== null ? <Coin n={`${q.ask} (${q.askUnits})`} /> : <span className="text-muted">—</span>}
        </div>
        <div className="frame-slot !border-[4px] px-1">
          <div className="text-muted">Maior compra</div>
          {q.bid !== null ? (
            <Coin n={`${q.bid} (${q.bidUnits})`} className="text-mana-light" />
          ) : (
            <span className="text-muted">—</span>
          )}
        </div>
        <div className="frame-slot !border-[4px] px-1">
          <div className="text-muted">Último negócio</div>
          {q.last !== null ? (
            <Coin n={q.last} className="text-parchment" />
          ) : (
            <span className="text-muted">—</span>
          )}
        </div>
        <div className="frame-slot !border-[4px] px-1">
          <div className="text-muted">Loja vende / paga</div>
          <span className="text-parchment">
            {q.shopSells ?? '—'} / {q.shopBuys ?? '—'}
          </span>
        </div>
      </div>
      <div className="frame-slot !border-[6px] p-2" data-testid="market-shop-card">
        <div className="mb-2 text-[14px] text-gold-light">Negociar com a loja</div>
        <p className="mb-2 text-[11px] text-muted">
          Compra entregue na mochila. Venda usa mochila e depósito, sem os equipados.
        </p>
        <QtyStepper
          value={Math.min(shopQty, 1000)}
          max={1000}
          onChange={setShopQty}
          testId="market-shop-qty"
        />
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <PixelButton
            variant="gold"
            className="min-h-[44px] !border-[5px] text-[12px]"
            disabled={q.shopSells === null || shopQty * q.shopSells > market.money}
            onClick={() => session.marketShopTrade('buy', item.itemId, shopQty) && setShopQty(1)}
            data-testid="market-shop-buy"
          >
            {q.shopSells === null ? 'Loja não vende' : `Comprar ${shopQty} · ${shopQty * q.shopSells} ouro`}
          </PixelButton>
          <PixelButton
            className="min-h-[44px] !border-[5px] text-[12px]"
            disabled={q.shopBuys === null || shopQty > owned}
            onClick={() => session.marketShopTrade('sell', item.itemId, shopQty) && setShopQty(1)}
            data-testid="market-shop-sell"
          >
            {q.shopBuys === null ? 'Loja não compra' : `Vender ${shopQty} · ${shopQty * q.shopBuys} ouro`}
          </PixelButton>
        </div>
        <p className="mt-1 text-[11px] text-muted">
          Preço por unidade: compra {q.shopSells ?? '—'} · venda {q.shopBuys ?? '—'} ouro.
        </p>
      </div>
      <div className="text-[14px] text-parchment">
        Negociar com jogadores · {mode === 'buy' ? 'Comprar' : 'Vender'}
      </div>
      {mode === 'buy' ? (
        <>
          {/* comprar agora: pelo menor preço (várias unidades do mesmo preço de uma vez) */}
          <div className="frame-slot !border-[6px] p-1" data-testid="market-buy-now-card">
            <div className="mb-1 text-[12px] text-gold-light">Comprar agora</div>
            {askAt ? (
              <>
                <div className="mb-1 text-[11px] text-muted">
                  Até <Coin n={askAt.price} /> por unidade · {buyUnits} disponíveis (toque numa oferta à venda
                  para escolher outro preço)
                </div>
                <QtyStepper value={qNow} max={buyUnits} onChange={setQtyNow} testId="market-qty-now" />
                <PixelButton
                  variant="gold"
                  className="mt-1 min-h-[40px] w-full !border-[6px] text-[13px]"
                  disabled={buyTotal > market.money}
                  onClick={() => session.marketBuyNow(item.itemId, qNow, askAt.price) && setQtyNow(1)}
                  data-testid="market-buy-now"
                >
                  Comprar {qNow} por {buyTotal} de ouro
                </PixelButton>
                {buyTotal > market.money && (
                  <div className="text-[11px] text-hp-light">Ouro insuficiente (bolsa + banco).</div>
                )}
              </>
            ) : (
              <p className="text-[11px] text-muted">
                Ninguém vendendo agora. Deixe uma oferta de compra abaixo.
              </p>
            )}
          </div>
          {/* oferta de compra: quanto você paga */}
          <div className="frame-slot !border-[6px] p-1" data-testid="market-bid-card">
            <div className="mb-1 text-[12px] text-mana-light">Oferta de compra (quanto você paga)</div>
            <div className="mb-1 flex flex-wrap gap-1">
              {uniqueChips.map((c) => (
                <PriceChip
                  key={c.label}
                  label={c.label}
                  price={c.price}
                  active={price === c.price}
                  onPick={() => setPrice(c.price)}
                  testId={`market-chip-${c.label}`}
                />
              ))}
            </div>
            <PriceStepper value={price} onChange={setPrice} testId="market-price" />
            <div className="mt-1">
              <QtyStepper
                value={Math.min(qOffer, maxBuyOffer)}
                max={maxBuyOffer}
                onChange={setQtyOffer}
                testId="market-qty-offer"
              />
            </div>
            {crosses && (
              <div className="text-[11px] text-heal">
                Há anúncio por esse preço ou menos: compra na hora pelo anunciado.
              </div>
            )}
            <PixelButton
              className="mt-1 min-h-[40px] w-full !border-[6px] text-[13px]"
              disabled={price * Math.min(qOffer, maxBuyOffer) > market.money}
              onClick={() =>
                session.marketOffer('buy', item.itemId, Math.min(qOffer, maxBuyOffer), price) &&
                setQtyOffer(1)
              }
              data-testid="market-place-bid"
            >
              Ofertar {Math.min(qOffer, maxBuyOffer)} a {price} ({price * Math.min(qOffer, maxBuyOffer)}{' '}
              reservados)
            </PixelButton>
          </div>
        </>
      ) : (
        <>
          {/* vender agora: para quem já quer comprar */}
          <div className="frame-slot !border-[6px] p-1" data-testid="market-sell-now-card">
            <div className="mb-1 text-[12px] text-mana-light">Vender agora</div>
            {!owned ? (
              <p className="text-[11px] text-muted">Você não tem esse item.</p>
            ) : bidAt ? (
              <>
                <div className="mb-1 text-[11px] text-muted">
                  A partir de <Coin n={bidAt.price} className="text-mana-light" /> por unidade · {sellUnits}{' '}
                  procurados (toque numa oferta de compra para escolher)
                </div>
                <QtyStepper
                  value={qNow}
                  max={Math.max(1, sellUnits)}
                  onChange={setQtyNow}
                  testId="market-qty-now"
                />
                <PixelButton
                  variant="gold"
                  className="mt-1 min-h-[40px] w-full !border-[6px] text-[13px]"
                  onClick={() => session.marketSellNow(item.itemId, qNow, bidAt.price) && setQtyNow(1)}
                  data-testid="market-sell-now"
                >
                  Vender {qNow} por {sellTotal} de ouro
                </PixelButton>
              </>
            ) : (
              <p className="text-[11px] text-muted">Ninguém comprando agora. Anuncie abaixo.</p>
            )}
          </div>
          {/* anunciar: último negócio, abaixo do menor anúncio ou o seu preço */}
          <div className="frame-slot !border-[6px] p-1" data-testid="market-ask-card">
            <div className="mb-1 text-[12px] text-gold-light">Anunciar (quanto você pede)</div>
            <div className="mb-1 flex flex-wrap gap-1">
              {uniqueChips.map((c) => (
                <PriceChip
                  key={c.label}
                  label={c.label}
                  price={c.price}
                  active={price === c.price}
                  onPick={() => setPrice(c.price)}
                  testId={`market-chip-${c.label}`}
                />
              ))}
            </div>
            <PriceStepper value={price} onChange={setPrice} testId="market-price" />
            <div className="mt-1">
              <QtyStepper
                value={qOffer}
                max={Math.max(1, owned)}
                onChange={setQtyOffer}
                testId="market-qty-offer"
              />
            </div>
            {crosses && (
              <div className="text-[11px] text-heal">
                Alguém já paga isso ou mais: vende na hora pela oferta.
              </div>
            )}
            {q.shopBuys !== null && price < q.shopBuys && (
              <div className="text-[11px] text-hp-light">
                A loja paga {q.shopBuys}: abaixo disso, vale mais vender lá.
              </div>
            )}
            <PixelButton
              className="mt-1 min-h-[40px] w-full !border-[6px] text-[13px]"
              disabled={!owned}
              onClick={() => session.marketOffer('sell', item.itemId, qOffer, price) && setQtyOffer(1)}
              data-testid="market-place-ask"
            >
              Anunciar {qOffer} a {price} cada ({qOffer * price})
            </PixelButton>
          </div>
        </>
      )}
      {/* todas as ofertas do item */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Book
          title="À venda"
          side="sell"
          offers={asks}
          selected={askAt?.price ?? null}
          onPick={mode === 'buy' ? setPickedAsk : null}
          now={now}
        />
        <Book
          title="Querem comprar"
          side="buy"
          offers={bids}
          selected={bidAt?.price ?? null}
          onPick={mode === 'sell' ? setPickedBid : null}
          now={now}
        />
      </div>
      {q.trades > 0 && (
        <p className="text-[11px] text-muted">
          {q.trades} {q.trades > 1 ? 'negócios recentes' : 'negócio recente'} · média {q.avg} de ouro
        </p>
      )}
    </div>
  );
}
