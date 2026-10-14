// Loja: comprar e vender com preços configuráveis, quantidade, comparação e feedback de ouro.
import { useState } from 'react';
import { useSession, useSnap } from '../../integration/game-ui-bridge/hooks';
import { ItemIcon, Panel, PixelButton } from '../common/primitives';
import { ItemDetails } from '../inventory/InventoryPanel';

export function ShopPanel() {
  const session = useSession();
  const shop = useSnap((s) => s.shop);
  const gold = useSnap((s) => s.player.gold);
  const eq = useSnap((s) => s.equipment);
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const [selId, setSelId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  if (!shop) return null;
  const list = tab === 'buy' ? shop.sells.map((o) => ({ item: o.item, price: o.price, extra: o.canAfford ? '' : 'caro', owned: 0 })) : shop.buys.map((o) => ({ item: o.item, price: o.price, extra: '', owned: o.owned }));
  const sel = list.find((o) => o.item.itemId === selId) ?? null;
  const maxQty = sel ? (tab === 'buy' ? Math.max(1, Math.min(100, Math.floor(gold / Math.max(1, sel.price)))) : Math.max(1, sel.owned)) : 1;
  const q = Math.min(qty, maxQty);
  return (
    <Panel title={shop.name} onClose={() => session.closeShop()} icon="ui_coin" wide scroll={false}>
      <div className="mb-2 flex shrink-0 items-center gap-2">
        <PixelButton variant={tab === 'buy' ? 'gold' : 'stone'} onClick={() => (setTab('buy'), setSelId(null), setQty(1))}>
          Comprar
        </PixelButton>
        <PixelButton variant={tab === 'sell' ? 'gold' : 'stone'} onClick={() => (setTab('sell'), setSelId(null), setQty(1))}>
          Vender
        </PixelButton>
        <span className="ml-auto flex items-center gap-1 text-gold-light" data-testid="shop-gold">
          <ItemIcon icon="ui_coin" size={16} /> {gold}
        </span>
      </div>
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,290px)] sm:grid-rows-1">
        <div className="flex min-h-[120px] flex-col gap-1 overflow-y-auto overscroll-contain pr-1">
          {list.map((o) => (
            <button
              type="button"
              key={o.item.itemId}
              onClick={() => (setSelId(o.item.itemId), setQty(1))}
              className={`frame-slot flex shrink-0 items-center gap-2 !border-[6px] px-1 text-left ${selId === o.item.itemId ? 'outline-2 outline-gold-light' : ''} ${tab === 'sell' && o.owned === 0 ? 'opacity-50' : ''}`}
              data-testid={`shop-item-${o.item.itemId}`}
            >
              <ItemIcon icon={o.item.icon} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">{o.item.name}</span>
                <span className={`block text-[11px] ${tab === 'buy' && o.extra ? 'text-hp-light' : 'text-gold-light'}`}>
                  {o.price} ouro{tab === 'sell' ? ` · você tem ${o.owned}` : ''}
                </span>
              </span>
              {o.item.blockedReason && tab === 'buy' && (
                <span className="text-[10px] text-hp-light" title={o.item.blockedReason}>
                  !
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="max-h-[42dvh] overflow-y-auto overscroll-contain sm:max-h-none">
          {sel ? (
            <ItemDetails
              item={sel.item}
              equipped={sel.item.slot ? eq[sel.item.slot] : undefined}
              actions={
                <div className="flex w-full flex-wrap items-center gap-2">
                  <PixelButton className="h-9 w-9 !border-[6px]" onClick={() => setQty(Math.max(1, q - 1))} ariaLabel="Diminuir quantidade">
                    −
                  </PixelButton>
                  <span className="w-8 text-center" data-testid="shop-qty">
                    {q}
                  </span>
                  <PixelButton className="h-9 w-9 !border-[6px]" onClick={() => setQty(Math.min(maxQty, q + 1))} ariaLabel="Aumentar quantidade">
                    +
                  </PixelButton>
                  <PixelButton className="h-9 !border-[6px] px-1 text-[11px]" onClick={() => setQty(maxQty)}>
                    Máx
                  </PixelButton>
                  <PixelButton
                    variant="gold"
                    className="w-full px-1"
                    disabled={tab === 'sell' && sel.owned === 0}
                    onClick={() => (tab === 'buy' ? session.buy(sel.item.itemId, q) : session.sell(sel.item.itemId, q))}
                  >
                    {tab === 'buy' ? `Comprar por ${sel.price * q}` : `Vender por ${sel.price * q}`}
                  </PixelButton>
                </div>
              }
            />
          ) : (
            <p className="frame-tooltip text-[12px] text-muted">{tab === 'buy' ? 'Escolha um item para ver atributos, comparar com o equipado e comprar.' : 'Escolha um item da lista para vender. Itens equipados não podem ser vendidos.'}</p>
          )}
        </div>
      </div>
    </Panel>
  );
}
