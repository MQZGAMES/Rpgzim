// Loja: comprar e vender com preços configuráveis, quantidade, comparação e feedback de ouro.
import { useState } from 'react';
import { useSession, useSnap } from '../../integration/game-ui-bridge/hooks';
import { ItemIcon, Panel, PixelButton } from '../common/primitives';
import { ItemDetails } from '../inventory/InventoryPanel';
import { ItemStats } from '../inventory/ItemCell';

export function ShopPanel() {
  const session = useSession();
  const shop = useSnap((s) => s.shop);
  const gold = useSnap((s) => s.player.gold);
  const eq = useSnap((s) => s.equipment);
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const [selId, setSelId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  if (!shop) return null;
  const list = tab === 'buy' ? shop.sells.map((o) => ({ item: o.item, price: o.price, extra: o.canAfford ? '' : 'caro', owned: 0 })) : shop.buys
          .map((o) => ({ item: o.item, price: o.price, extra: '', owned: o.owned }))
          // o que você tem para vender aparece primeiro (maior valor total no topo)
          .sort((a, b) => Number(b.owned > 0) - Number(a.owned > 0) || b.owned * b.price - a.owned * a.price);
  // itens travados (cadeado) não entram no "vender tudo"
  const sellAllTotal = shop.buys.reduce((s, o) => s + (o.item.locked ? 0 : o.owned * o.price), 0);
  const sellAllUnits = shop.buys.reduce((s, o) => s + (o.item.locked ? 0 : o.owned), 0);
  const sel = list.find((o) => o.item.itemId === selId) ?? null;
  const maxQty = sel ? (tab === 'buy' ? Math.max(1, Math.min(100, Math.floor(gold / Math.max(1, sel.price)))) : Math.max(1, sel.owned)) : 1;
  const q = Math.min(qty, maxQty);
  return (
    <Panel title={shop.name} onClose={() => session.closeShop()} icon="ui_coin" wide scroll={false} fill>
      <div className="mb-2 flex shrink-0 items-center gap-2">
        <PixelButton variant={tab === 'buy' ? 'gold' : 'stone'} onClick={() => (setTab('buy'), setSelId(null), setQty(1))}>
          Comprar
        </PixelButton>
        <PixelButton variant={tab === 'sell' ? 'gold' : 'stone'} onClick={() => (setTab('sell'), setSelId(null), setQty(1))}>
          Vender
        </PixelButton>
        {tab === 'sell' && (
          <PixelButton
            variant="gold"
            className="px-1 text-[12px]"
            disabled={sellAllUnits === 0}
            title="Vende tudo da mochila que esta loja compra (itens equipados não entram)"
            onClick={() => {
              if (window.confirm(`Vender ${sellAllUnits} ${sellAllUnits === 1 ? 'item' : 'itens'} da mochila por ${sellAllTotal} de ouro?`)) session.sellAll();
            }}
          >
            Vender tudo ({sellAllTotal})
          </PixelButton>
        )}
        <span className="ml-auto flex items-center gap-1 text-gold-light" data-testid="shop-gold">
          <ItemIcon icon="ui_coin" size={16} /> {gold}
        </span>
      </div>
      {/* corpo: lista (rola) + coluna de detalhes (rola) com a barra de compra sempre visível embaixo */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 sm:flex-row">
        <div className="flex min-h-[96px] flex-1 flex-col gap-1 overflow-y-auto overscroll-contain pr-1 sm:min-h-0" data-testid="shop-list">
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
                <span className="flex items-center gap-2">
                  {o.item.locked && <ItemIcon icon="ui_lock" size={12} title="Venda travada" />}
                  <span className="min-w-0 truncate text-[13px]">{o.item.name}</span>
                  <ItemStats item={o.item} size="md" />
                </span>
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
        <div className="flex min-h-0 shrink-0 flex-col gap-2 sm:w-[300px] sm:shrink">
          <div className="max-h-[30dvh] min-h-0 overflow-y-auto overscroll-contain sm:max-h-none sm:flex-1">
            {sel ? (
              <ItemDetails item={sel.item} equipped={sel.item.slot ? eq[sel.item.slot] : undefined} />
            ) : (
              <p className="frame-tooltip text-[12px] text-muted">{tab === 'buy' ? 'Escolha um item para ver atributos, comparar com o equipado e comprar.' : 'Escolha um item da lista para vender. Itens equipados não podem ser vendidos.'}</p>
            )}
          </div>
          {sel && (
            <div className="frame-slot flex shrink-0 flex-wrap items-center gap-2 !border-[6px] p-1" data-testid="shop-actions">
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
                className="min-w-[140px] flex-1 px-1"
                disabled={tab === 'sell' && sel.owned === 0}
                onClick={() => (tab === 'buy' ? session.buy(sel.item.itemId, q) : session.sell(sel.item.itemId, q))}
              >
                {tab === 'buy' ? `Comprar por ${sel.price * q}` : `Vender por ${sel.price * q}`}
              </PixelButton>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
