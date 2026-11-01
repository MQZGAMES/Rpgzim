// Banco de Pedraluz: ouro (depositar/sacar), depósito de itens e o mercado entre personagens. No depósito, toque num
// item da mochila para guardar e num item do depósito para retirar. No mercado, escolha um item (mochila ou depósito),
// dê um preço e anuncie — ou use a venda automática (75% do valor; o NPC paga 50%) — e compre o que os outros
// anunciaram (vai direto para o depósito).
import { useState } from 'react';
import { useSession, useSnap } from '../../integration/game-ui-bridge/hooks';
import { ItemIcon, Panel, PixelButton } from '../common/primitives';
import { ItemCell } from '../inventory/ItemCell';

function GoldRow() {
  const session = useSession();
  const depot = useSnap((s) => s.depot);
  const [amount, setAmount] = useState('');
  if (!depot) return null;
  const n = Math.floor(Number(amount));
  const valid = Number.isFinite(n) && n > 0;
  return (
    <div className="frame-slot mb-2 flex flex-wrap items-center gap-2 !border-[6px] p-1 text-[12px]">
      <span className="flex items-center gap-1 text-gold-light" data-testid="depot-gold">
        <ItemIcon icon="ui_coin" size={14} /> Bolsa: {depot.gold}
      </span>
      <span className="flex items-center gap-1 text-gold-light" data-testid="depot-bank-gold">
        <ItemIcon icon="ui_save" size={14} /> Banco: {depot.bankGold}
      </span>
      <input
        inputMode="numeric"
        pattern="[0-9]*"
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 9))}
        placeholder="Quantia"
        aria-label="Quantia de ouro"
        className="h-8 w-[84px] border-2 border-ink bg-[#1a1220] px-1 text-[13px] text-parchment"
        data-testid="depot-amount"
      />
      <PixelButton
        className="!border-[6px] px-1 text-[11px]"
        disabled={!valid || n > depot.gold}
        onClick={() => (session.bankGold('deposit', n), setAmount(''))}
      >
        Depositar
      </PixelButton>
      <PixelButton
        className="!border-[6px] px-1 text-[11px]"
        disabled={!valid || n > depot.bankGold}
        onClick={() => (session.bankGold('withdraw', n), setAmount(''))}
      >
        Sacar
      </PixelButton>
      <PixelButton
        className="!border-[6px] px-1 text-[11px]"
        disabled={depot.gold <= 0}
        onClick={() => session.bankGold('deposit', depot.gold)}
        title="Depositar todo o ouro da bolsa"
      >
        Depositar tudo
      </PixelButton>
    </div>
  );
}

/** Aba do mercado: anunciar (preço livre ou venda automática a 75%) e comprar os anúncios dos outros. */
function MarketTab() {
  const session = useSession();
  const depot = useSnap((s) => s.depot);
  const market = useSnap((s) => s.market);
  const inv = useSnap((s) => s.inventory);
  const [pick, setPick] = useState<{ from: 'inventory' | 'depot'; index: number } | null>(null);
  const [price, setPrice] = useState('');
  if (!depot || !market) return null;
  const picked = pick ? (pick.from === 'inventory' ? inv[pick.index] : depot.items[pick.index]) : null;
  const auto = picked ? Math.max(1, Math.round(picked.value * market.autoRate)) : 0;
  const unit = Math.floor(Number(price));
  const choose = (from: 'inventory' | 'depot', index: number, item: { value: number } | null | undefined) => {
    if (!item) return;
    setPick({ from, index });
    setPrice(String(Math.max(1, Math.round(item.value * market.autoRate))));
  };
  const done = () => {
    setPick(null);
    setPrice('');
  };
  return (
    <div data-testid="market-tab">
      <div className="frame-slot mb-2 !border-[6px] p-1 text-[12px]">
        <div className="mb-1 text-gold-light">
          Anunciar ({market.mine}/{market.max}) — toque num item da mochila ou do depósito
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="grid flex-1 grid-cols-5 gap-1">
            {inv.map((it, i) => (
              <ItemCell
                key={i}
                item={it}
                active={pick?.from === 'inventory' && pick.index === i}
                onTap={() => choose('inventory', i, it)}
                testId={`market-bag-${i}`}
              />
            ))}
          </div>
          <div className="grid max-h-[22dvh] flex-1 grid-cols-5 gap-1 overflow-y-auto overscroll-contain pr-1 sm:max-h-[200px]">
            {depot.items.map((it, i) => (
              <ItemCell
                key={i}
                item={it}
                active={pick?.from === 'depot' && pick.index === i}
                onTap={() => choose('depot', i, it)}
                emptyLabel="Espaço vazio no depósito"
                testId={`market-depot-${i}`}
              />
            ))}
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 truncate">
            {picked
              ? `${picked.count > 1 ? `${picked.count}x ` : ''}${picked.name} · valor ${picked.value}`
              : 'Nenhum item escolhido'}
          </span>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, '').slice(0, 9))}
            placeholder="Preço"
            aria-label="Preço por unidade"
            className="h-8 w-[84px] border-2 border-ink bg-[#1a1220] px-1 text-[13px] text-parchment"
            data-testid="market-price"
          />
          <PixelButton
            variant="gold"
            className="!border-[6px] px-1 text-[11px]"
            disabled={!pick || !(unit >= 1)}
            onClick={() => {
              if (pick && session.marketList(pick.from, pick.index, unit)) done();
            }}
            data-testid="market-list"
          >
            Anunciar
          </PixelButton>
          <PixelButton
            className="!border-[6px] px-1 text-[11px]"
            disabled={!pick}
            title={`Anuncia a ${Math.round(market.autoRate * 100)}% do valor (o NPC paga 50%)`}
            onClick={() => {
              if (pick && session.marketAutoList(pick.from, pick.index)) done();
            }}
            data-testid="market-auto"
          >
            Venda automática{picked ? ` (${auto * picked.count})` : ''}
          </PixelButton>
        </div>
      </div>
      <div className="mb-1 text-[12px] text-muted">
        À venda ({market.listings.length}) — a compra vai direto para o depósito; o ouro vai para o banco de
        quem vendeu.
      </div>
      <div className="flex max-h-[30dvh] flex-col gap-1 overflow-y-auto overscroll-contain pr-1 sm:max-h-[260px]">
        {market.listings.length === 0 && <p className="text-[12px] text-muted">Nenhum anúncio no momento.</p>}
        {market.listings.map((l) => (
          <div
            key={l.id}
            className="frame-slot flex items-center gap-2 !border-[6px] px-1 py-[2px] text-[12px]"
            data-testid={`market-row-${l.id}`}
          >
            <ItemIcon icon={l.item.icon} size={24} />
            <span className="min-w-0 flex-1 truncate">
              {l.count > 1 ? `${l.count}x ` : ''}
              {l.item.name} <span className="text-muted">· {l.mine ? 'seu anúncio' : l.sellerName}</span>
            </span>
            <span className="flex items-center gap-1 text-gold-light">
              <ItemIcon icon="ui_coin" size={12} /> {l.total}
            </span>
            {l.mine ? (
              <PixelButton
                className="!border-[6px] px-1 text-[11px]"
                onClick={() => session.marketCancel(l.id)}
                data-testid={`market-cancel-${l.id}`}
              >
                Retirar
              </PixelButton>
            ) : (
              <PixelButton
                variant="gold"
                className="!border-[6px] px-1 text-[11px]"
                disabled={!l.canAfford}
                onClick={() => session.marketBuy(l.id)}
                data-testid={`market-buy-${l.id}`}
              >
                Comprar
              </PixelButton>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DepotPanel() {
  const session = useSession();
  const depot = useSnap((s) => s.depot);
  const inv = useSnap((s) => s.inventory);
  const [last, setLast] = useState<string | null>(null);
  const [tab, setTab] = useState<'depot' | 'market'>('depot');
  if (!depot) return null;
  const used = depot.items.filter(Boolean).length;
  return (
    <Panel title="Banco de Pedraluz" onClose={() => session.closeDepot()} icon="ui_save" wide>
      <div data-testid="depot-panel">
        <GoldRow />
        <div className="mb-2 flex gap-1">
          <PixelButton
            variant={tab === 'depot' ? 'gold' : undefined}
            className="flex-1 !border-[6px] text-[12px]"
            onClick={() => setTab('depot')}
            data-testid="depot-tab-depot"
          >
            Depósito
          </PixelButton>
          <PixelButton
            variant={tab === 'market' ? 'gold' : undefined}
            className="flex-1 !border-[6px] text-[12px]"
            onClick={() => setTab('market')}
            data-testid="depot-tab-market"
          >
            Mercado
          </PixelButton>
        </div>
        {tab === 'market' ? (
          <MarketTab />
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center justify-between text-[12px] text-muted">
                  <span>
                    Mochila {inv.filter(Boolean).length}/{inv.length}
                  </span>
                  <PixelButton
                    className="!border-[6px] px-1 text-[11px]"
                    onClick={() => session.depotDepositAll()}
                    title="Guarda tudo, menos poções e flechas"
                  >
                    Guardar loot
                  </PixelButton>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {inv.map((it, i) => (
                    <ItemCell
                      key={i}
                      item={it}
                      onTap={() => {
                        if (it && session.depotDeposit(i)) setLast(`${it.name}: guardado no depósito.`);
                      }}
                      testId={`depot-bag-${i}`}
                    />
                  ))}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-[12px] text-muted">
                  Depósito {used}/{depot.items.length}
                </div>
                <div className="grid max-h-[34dvh] grid-cols-5 gap-1 overflow-y-auto overscroll-contain pr-1 sm:max-h-[300px]">
                  {depot.items.map((it, i) => (
                    <ItemCell
                      key={i}
                      item={it}
                      onTap={() => {
                        if (it && session.depotWithdraw(i)) setLast(`${it.name}: retirado do depósito.`);
                      }}
                      emptyLabel="Espaço vazio no depósito"
                      testId={`depot-slot-${i}`}
                    />
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-2 text-[12px] text-muted">
              {last ??
                'Toque num item da mochila para guardar e num item do depósito para retirar. O depósito e o ouro do banco nunca se perdem.'}
            </p>
          </>
        )}
      </div>
    </Panel>
  );
}
