// Configuração dos atalhos: escolha uma posição (numerada, no mesmo lugar da tela) e vincule uma magia,
// uma poção automática ou um item usável da mochila. Uma entrada já usada em outro atalho troca de lugar.
import { useState } from 'react';
import type { HotbarEntry } from '../../domain/rules/hotbar';
import { useLocal, useSession, useSnap } from '../../integration/game-ui-bridge/hooks';
import type { HotbarSlotView } from '../../integration/game-ui-bridge/snapshot';
import { ItemIcon, Panel, PixelButton } from '../common/primitives';
import { TOUCH_ROWS } from '../hud/ActionControls';

function SlotPreview({ slot, selected, onSelect }: { slot: HotbarSlotView; selected: boolean; onSelect: () => void }) {
  const icon = slot.spell?.icon ?? slot.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Atalho ${slot.index + 1}: ${slot.name}`}
      aria-pressed={selected}
      className={`relative flex h-12 w-12 items-center justify-center ${selected ? 'btn-gold' : 'frame-slot !border-[6px]'}`}
      data-testid={`hotbar-pick-${slot.index}`}
    >
      {icon ? <ItemIcon icon={icon} size={28} /> : <span className="text-muted">+</span>}
      <span className="text-outline absolute -left-[5px] -top-[7px] text-[12px] leading-none text-gold-light">{slot.index + 1}</span>
    </button>
  );
}

function Option({ icon, label, sub, active, onClick, dim = false, testId }: { icon: string; label: string; sub: string; active: boolean; onClick: () => void; dim?: boolean; testId: string }) {
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
  return (
    <Panel title="Atalhos" icon="ui_book" onClose={onClose}>
      <div data-testid="hotbar-panel">
        <p className="text-[12px] text-muted">Toque numa posição e escolha o que ela usa. As posições são as mesmas da tela{touch ? ' (o 1 fica colado no botão de ataque)' : ' (teclas 1–8)'}.</p>
        <div className="mt-2 flex justify-center">
          {touch ? (
            // mesma "pirâmide" da tela: o atalho 1 fica colado no botão de ataque
            <div className="flex flex-col items-end">
              {TOUCH_ROWS.map((row, r) => (
                <div key={r} className="flex items-center justify-end gap-2 py-1" style={{ marginRight: r < 2 ? 14 : 0 }}>
                  {row.map((i) => (hotbar[i] ? <SlotPreview key={i} slot={hotbar[i]!} selected={sel === i} onSelect={() => setSel(i)} /> : null))}
                  {r === 2 && (
                    <div className="btn-gold flex h-[60px] w-[60px] items-center justify-center opacity-70" aria-hidden>
                      <ItemIcon icon="ui_attack" size={24} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex gap-2">
              {hotbar.map((slot) => (
                <SlotPreview key={slot.index} slot={slot} selected={sel === slot.index} onSelect={() => setSel(slot.index)} />
              ))}
            </div>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between text-[12px]">
          <span>
            Atalho <b className="text-gold-light">{sel + 1}</b>: {current?.name ?? 'Vazio'}
          </span>
          <PixelButton className="!border-[6px] px-1 text-[11px]" onClick={() => session.setHotbar(sel, null)} data-testid="hotbar-clear">
            Deixar vazio
          </PixelButton>
        </div>
        <h3 className="mb-1 mt-3 text-[13px] text-gold">Magias</h3>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {book.map((s) => (
            <Option
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
          <Option icon="item_potion_health" label="Poção de vida" sub="usa a menor que cobre o que falta" active={isCur('potion', 'health')} onClick={() => assign({ kind: 'potion', id: 'health' })} testId="hotbar-opt-potion-health" />
          <Option icon="item_potion_mana" label="Poção de mana" sub="usa a menor que cobre o que falta" active={isCur('potion', 'mana')} onClick={() => assign({ kind: 'potion', id: 'mana' })} testId="hotbar-opt-potion-mana" />
        </div>
        <h3 className="mb-1 mt-3 text-[13px] text-gold">Itens da mochila</h3>
        {usable.length ? (
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {usable.map((it) => (
              <Option key={it.id} icon={it.icon} label={it.name} sub={`${it.count} na mochila`} active={isCur('item', it.id)} onClick={() => assign({ kind: 'item', id: it.id })} testId={`hotbar-opt-${it.id}`} />
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-muted">Nenhum item usável na mochila (poções, comida…).</p>
        )}
      </div>
    </Panel>
  );
}
