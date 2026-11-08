// Configuração dos atalhos: escolha uma posição (numerada, no mesmo lugar da tela) e vincule uma magia,
// uma poção automática ou um item usável da mochila. Uma entrada já usada em outro atalho troca de lugar.
import { useState } from 'react';
import type { HotbarEntry } from '../../domain/rules/hotbar';
import { useLocal, useSession, useSnap } from '../../integration/game-ui-bridge/hooks';
import type { HotbarSlotView } from '../../integration/game-ui-bridge/snapshot';
import { ItemIcon, Panel, PixelButton } from '../common/primitives';
import { TOUCH_CELLS } from '../hud/ActionControls';

function SlotPreview({ slot, selected, onSelect }: { slot: HotbarSlotView; selected: boolean; onSelect: () => void }) {
  const icon = slot.spell?.icon ?? slot.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Atalho ${slot.index + 1}: ${slot.name}`}
      aria-pressed={selected}
      title={`${slot.index + 1}: ${slot.name}`}
      className={`relative flex h-12 w-12 items-center justify-center ${selected ? 'btn-gold' : 'frame-slot !border-[6px]'}`}
      data-testid={`hotbar-pick-${slot.index}`}
    >
      {icon ? <ItemIcon icon={icon} size={28} /> : <span className="text-muted">+</span>}
      <span className="text-outline absolute -left-[5px] -top-[7px] text-[12px] leading-none text-gold-light">{slot.index + 1}</span>
    </button>
  );
}

function Option({ icon, label, sub, active, onClick, dim = false, testId, at }: { icon: string; label: string; sub: string; active: boolean; onClick: () => void; dim?: boolean; testId: string; at?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-sm border-2 px-1 py-1 text-left ${active ? 'border-gold bg-gold/15' : 'border-transparent bg-black/20 hover:bg-black/35'} ${dim ? 'opacity-60' : ''}`}
      data-testid={testId}
    >
      <ItemIcon icon={icon} size={26} className={dim ? 'grayscale' : ''} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-parchment">{label}</span>
        <span className="block truncate text-[10px] text-muted">{sub}</span>
      </span>
      {/* em que atalho já está (escolher de novo troca de lugar) */}
      {at !== undefined && (
        <span className="shrink-0 rounded-sm bg-gold/25 px-1 text-[10px] text-gold-light" title={`Já está no atalho ${at}`}>
          {at}
        </span>
      )}
    </button>
  );
}

export function HotbarPanel({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const touch = useLocal((s) => s.touch);
  const hotbar = useSnap((s) => s.hotbar);
  const book = useSnap((s) => s.spellbook);
  const usable = useSnap((s) => {
    const seen = new Set<string>();
    return s.inventory.filter((it): it is NonNullable<typeof it> => !!it && it.usable && !seen.has(it.itemId) && !!seen.add(it.itemId)).map((it) => ({ id: it.itemId, name: it.name, icon: it.icon, count: it.count }));
  });
  const [sel, setSel] = useState(() => Math.max(0, hotbar.findIndex((h) => h.kind === 'empty')));
  const current = hotbar[sel];
  const assign = (e: HotbarEntry) => {
    session.setHotbar(sel, e);
    if (e) setSel((sel + 1) % hotbar.length);
  };
  const isCur = (kind: string, id: string) => (kind === 'spell' ? current?.spell?.id === id : current?.kind === kind && current.itemId === id);
  /** Número do atalho onde esta entrada já está (1 a 9), se estiver. */
  const at = (kind: string, id: string) => {
    const i = hotbar.findIndex((h) => (kind === 'spell' ? h.spell?.id === id : h.kind === kind && h.itemId === id));
    return i >= 0 ? i + 1 : undefined;
  };
  // magias liberadas primeiro (pelo nível); as que ainda não liberam vão para o fim
  const spells = [...book].sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || a.minLevel - b.minLevel);
  return (
    <Panel title="Atalhos" icon="ui_book" onClose={onClose}>
      <div data-testid="hotbar-panel">
        {/* os 9 atalhos sempre num teclado 3x3 (1 2 3 / 4 5 6 / 7 8 9, a mesma ordem da tela), fixo no topo enquanto as
            opções rolam embaixo: cabe em qualquer tela (antes, sem toque, eram 9 em linha e os últimos ficavam cortados) */}
        <div className="sticky top-0 z-10 -mx-1 bg-[#1d1626] px-1 pb-2" data-testid="hotbar-slots">
          <div className="flex items-center gap-3">
            <div className="grid shrink-0 gap-2" style={{ gridTemplateColumns: 'repeat(3, 48px)', gridTemplateRows: 'repeat(3, 48px)' }}>
              {hotbar.map((slot) => (
                <div key={slot.index} className="flex items-center justify-center" style={{ gridRow: TOUCH_CELLS[slot.index]![0], gridColumn: TOUCH_CELLS[slot.index]![1] }}>
                  <SlotPreview slot={slot} selected={sel === slot.index} onSelect={() => setSel(slot.index)} />
                </div>
              ))}
            </div>
            <div className="min-w-0 flex-1 text-[12px]">
              <p className="text-muted">
                Toque num número e escolha abaixo o que ele usa{touch ? ' (o mesmo teclado do canto da tela)' : ' (teclas 1 a 9)'}. Depois de escolher, passa para o próximo.
              </p>
              <p className="mt-1 truncate">
                Atalho <b className="text-gold-light">{sel + 1}</b>: <span data-testid="hotbar-current">{current?.name ?? 'Vazio'}</span>
              </p>
              <PixelButton className="mt-1 !border-[6px] px-1 text-[11px]" onClick={() => session.setHotbar(sel, null)} data-testid="hotbar-clear">
                Deixar vazio
              </PixelButton>
            </div>
          </div>
        </div>
        <h3 className="mb-1 mt-3 text-[13px] text-gold">Magias</h3>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {spells.map((s) => (
            <Option
              at={at('spell', s.id)}
              key={s.id}
              icon={s.icon}
              label={s.name}
              sub={s.unlocked ? `${s.manaCost} mana · recarga ${s.cooldownMs / 1000}s` : `libera no nível ${s.minLevel}${s.minMagicLevel ? ` · ML ${s.minMagicLevel}` : ''}`}
              active={isCur('spell', s.id)}
              dim={!s.unlocked}
              onClick={() => assign({ kind: 'spell', id: s.id })}
              testId={`hotbar-opt-${s.id}`}
            />
          ))}
        </div>
        <h3 className="mb-1 mt-3 text-[13px] text-gold">Poções automáticas</h3>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          <Option at={at('potion', 'health')} icon="item_potion_health" label="Poção de vida" sub="usa a menor que cobre o que falta" active={isCur('potion', 'health')} onClick={() => assign({ kind: 'potion', id: 'health' })} testId="hotbar-opt-potion-health" />
          <Option at={at('potion', 'mana')} icon="item_potion_mana" label="Poção de mana" sub="usa a menor que cobre o que falta" active={isCur('potion', 'mana')} onClick={() => assign({ kind: 'potion', id: 'mana' })} testId="hotbar-opt-potion-mana" />
        </div>
        <h3 className="mb-1 mt-3 text-[13px] text-gold">Itens da mochila</h3>
        {usable.length ? (
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {usable.map((it) => (
              <Option key={it.id} at={at('item', it.id)} icon={it.icon} label={it.name} sub={`${it.count} na mochila`} active={isCur('item', it.id)} onClick={() => assign({ kind: 'item', id: it.id })} testId={`hotbar-opt-${it.id}`} />
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-muted">Nenhum item usável na mochila (poções, comida…).</p>
        )}
      </div>
    </Panel>
  );
}
