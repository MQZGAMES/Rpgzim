// Banco de Pedraluz: ouro (depositar/sacar) e depósito de itens. Um toque num item mostra os atributos com o botão de
// guardar (mochila) ou retirar (depósito); o toque duplo guarda/retira direto. (O mercado entre personagens fica com o
// corretor, ao lado da banqueira.)
import { useState } from 'react';
import { useSession, useSnap } from '../../integration/game-ui-bridge/hooks';
import { ItemIcon, Panel, PixelButton } from '../common/primitives';
import { ItemCell } from '../inventory/ItemCell';
import { ItemDetails } from '../inventory/InventoryPanel';

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

export function DepotPanel() {
  const session = useSession();
  const depot = useSnap((s) => s.depot);
  const inv = useSnap((s) => s.inventory);
  const eq = useSnap((s) => s.equipment);
  const [last, setLast] = useState<string | null>(null);
  const [sel, setSel] = useState<{ from: 'bag' | 'depot'; index: number } | null>(null);
  if (!depot) return null;
  const used = depot.items.filter(Boolean).length;
  const deposit = (i: number) => {
    const it = inv[i];
    if (it && session.depotDeposit(i)) setLast(`${it.name}: guardado no depósito.`);
    setSel(null);
  };
  const withdraw = (i: number) => {
    const it = depot.items[i];
    if (it && session.depotWithdraw(i)) setLast(`${it.name}: retirado do depósito.`);
    setSel(null);
  };
  const pick = (from: 'bag' | 'depot', index: number, filled: boolean) =>
    setSel(filled && !(sel?.from === from && sel.index === index) ? { from, index } : null);
  const selected = sel ? (sel.from === 'bag' ? inv[sel.index] : depot.items[sel.index]) : null;
  return (
    <Panel title="Banco de Pedraluz" onClose={() => session.closeDepot()} icon="ui_save" wide>
      <div data-testid="depot-panel">
        <GoldRow />
        {
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
                      active={sel?.from === 'bag' && sel.index === i}
                      onTap={() => pick('bag', i, !!it)}
                      onDoubleTap={() => deposit(i)}
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
                      active={sel?.from === 'depot' && sel.index === i}
                      onTap={() => pick('depot', i, !!it)}
                      onDoubleTap={() => withdraw(i)}
                      emptyLabel="Espaço vazio no depósito"
                      testId={`depot-slot-${i}`}
                    />
                  ))}
                </div>
              </div>
            </div>
            {sel && selected && (
              <div className="mt-2">
                <ItemDetails
                  item={selected}
                  equipped={selected.slot ? (eq[selected.slot] ?? null) : undefined}
                  actions={
                    <>
                      <PixelButton
                        className="!border-[5px] px-2 text-[12px]"
                        onClick={() => (sel.from === 'bag' ? deposit(sel.index) : withdraw(sel.index))}
                        data-testid="depot-item-action"
                      >
                        {sel.from === 'bag' ? 'Depositar' : 'Retirar'}
                      </PixelButton>
                      <PixelButton className="!border-[5px] px-2 text-[12px]" onClick={() => setSel(null)}>
                        Fechar
                      </PixelButton>
                    </>
                  }
                />
              </div>
            )}
            <p className="mt-2 text-[12px] text-muted">
              {last ??
                'Toque num item para ver os atributos e guardar ou retirar; toque duas vezes para guardar ou retirar direto. O depósito e o ouro do banco nunca se perdem.'}
            </p>
          </>
        }
      </div>
    </Panel>
  );
}
