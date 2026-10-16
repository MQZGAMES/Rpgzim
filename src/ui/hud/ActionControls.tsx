// Controles de ação. No toque: botão de ataque no canto e os 6 atalhos (magias/itens/poções) em grade ao redor.
// No desktop: barra inferior com atalhos numerados (1–6). Os atalhos são configuráveis (painel "Atalhos").
import type { HotbarSlotView } from '../../integration/game-ui-bridge/snapshot';
import { useSession, useSnap } from '../../integration/game-ui-bridge/hooks';
import { ItemIcon } from '../common/primitives';
import { SpellButton } from './SpellButton';

/** Um atalho: magia, item/poção (com quantidade e recarga) ou vazio (toque abre a configuração). */
export function HotbarSlot({ slot, size, keyHint }: { slot: HotbarSlotView; size: number; keyHint?: string }) {
  const session = useSession();
  if (slot.kind === 'spell' && slot.spell) return <SpellButton spell={slot.spell} size={size} keyHint={keyHint} onCast={() => session.useSlot(slot.index)} />;
  if (slot.kind === 'empty') {
    return (
      <button
        type="button"
        aria-label={`Atalho ${slot.index + 1} vazio: configurar`}
        title="Atalho vazio — toque para configurar"
        onClick={() => session.setPanel('hotbar')}
        className="relative flex items-center justify-center rounded-sm border-2 border-dashed border-[#6b5a86] bg-black/30 text-[18px] leading-none text-muted"
        style={{ width: size, height: size }}
        data-testid={`slot-${slot.index}`}
      >
        +{keyHint && <span className="text-outline absolute -left-[4px] -top-[6px] text-[10px] leading-none text-gold-light">{keyHint}</span>}
      </button>
    );
  }
  const cdPct = slot.cooldownRemaining > 0 ? Math.min(1, slot.cooldownRemaining / Math.max(slot.cooldownMs, 500)) : 0;
  return (
    <button
      type="button"
      aria-label={`${slot.name} (${slot.count})`}
      title={slot.name}
      onPointerDown={(e) => {
        e.preventDefault();
        session.useSlot(slot.index);
      }}
      className={`frame-slot relative flex items-center justify-center !border-[6px] active:translate-y-px ${slot.count === 0 ? 'opacity-55' : ''}`}
      style={{ width: size, height: size }}
      data-testid={slot.kind === 'potion' ? `potion-${slot.itemId}` : `slot-${slot.index}`}
    >
      <ItemIcon icon={slot.icon ?? 'ui_bag'} size={size - 16} className={slot.count === 0 ? 'grayscale' : ''} />
      {cdPct > 0 && <div className="pointer-events-none absolute inset-0" style={{ background: `conic-gradient(rgba(10,6,16,0.7) ${cdPct * 360}deg, transparent 0)` }} />}
      <span className="text-outline absolute -bottom-[6px] right-[-3px] text-[10px] leading-none">{slot.count}</span>
      {keyHint && <span className="text-outline absolute -left-[4px] -top-[6px] text-[10px] leading-none text-gold-light">{keyHint}</span>}
    </button>
  );
}

function InteractButton({ size = 56 }: { size?: number }) {
  const session = useSession();
  const it = useSnap((s) => s.interaction);
  if (!it) return null;
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.preventDefault();
        session.interact();
      }}
      className="btn-gold anim-pop pointer-events-auto flex max-w-full items-center gap-1 px-1 text-[12px]"
      style={{ minHeight: size - 12 }}
      data-testid="interact-button"
    >
      <ItemIcon icon={it.kind === 'loot' ? 'ui_bag' : it.kind === 'npc' ? 'ui_chat' : 'ui_hand'} size={18} />
      <span className="min-w-0 max-w-[120px] truncate">{it.label}</span>
    </button>
  );
}

/** Posição de cada atalho na grade 3x3 do toque (linha / coluna): o 1º fica colado no botão de ataque. */
export const TOUCH_SLOT_CELLS = ['3 / 2', '2 / 3', '3 / 1', '1 / 3', '2 / 1', '2 / 2'] as const;
export const TOUCH_SLOT = 48;
const ATTACK = 70;

export function TouchActions() {
  const session = useSession();
  const hotbar = useSnap((s) => s.hotbar);
  const hasTarget = useSnap((s) => s.target !== null);
  const ammo = useSnap((s) => s.ammo);
  return (
    <div className="safe-bottom pointer-events-none absolute bottom-0 right-0 z-20 pb-2 pr-[max(10px,env(safe-area-inset-right))]">
      <div
        className="pointer-events-none grid items-center justify-items-center gap-[8px]"
        style={{ gridTemplateColumns: `${TOUCH_SLOT}px ${TOUCH_SLOT}px ${ATTACK}px`, gridTemplateRows: `${TOUCH_SLOT}px ${TOUCH_SLOT}px ${ATTACK}px` }}
        data-testid="touch-actions"
      >
        <div className="flex w-full justify-end self-end" style={{ gridArea: '1 / 1 / 2 / 3' }}>
          <InteractButton />
        </div>
        {hotbar.map((slot) => (
          <div key={slot.index} className="pointer-events-auto" style={{ gridArea: TOUCH_SLOT_CELLS[slot.index] }}>
            <HotbarSlot slot={slot} size={TOUCH_SLOT} />
          </div>
        ))}
        <button
          type="button"
          aria-label={hasTarget ? 'Trocar alvo' : 'Selecionar alvo mais próximo'}
          onPointerDown={(e) => {
            e.preventDefault();
            session.audio.unlock();
            session.cycleTarget();
          }}
          className={`btn-gold pointer-events-auto relative flex flex-col items-center justify-center ${hasTarget ? 'anim-glow' : ''}`}
          style={{ gridArea: '3 / 3', width: ATTACK, height: ATTACK }}
          data-testid="attack-button"
        >
          <ItemIcon icon={hasTarget ? 'ui_target' : 'ui_attack'} size={28} />
          <span className="text-[10px] leading-none">{hasTarget ? 'Trocar' : 'Atacar'}</span>
          {ammo !== null && (
            <span className={`text-outline absolute -left-[6px] -top-[8px] text-[10px] leading-none ${ammo === 0 ? 'text-hp-light' : 'text-parchment'}`}>
              <ItemIcon icon="item_arrow" size={12} className="inline-block align-middle" />
              {ammo}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

export function DesktopActionBar() {
  const session = useSession();
  const hotbar = useSnap((s) => s.hotbar);
  const ammo = useSnap((s) => s.ammo);
  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2">
      <InteractButton size={44} />
      <div className="frame-dark pointer-events-auto flex items-end gap-2 !border-[10px]">
        {hotbar.map((slot) => (
          <HotbarSlot key={slot.index} slot={slot} size={48} keyHint={String(slot.index + 1)} />
        ))}
        <button type="button" onClick={() => session.setPanel('hotbar')} className="btn-pixel flex h-[48px] w-7 items-center justify-center !border-[6px] text-[10px]" title="Configurar atalhos" data-testid="btn-hotbar-config">
          <ItemIcon icon="ui_gear" size={14} />
        </button>
        <div className="mx-1 h-11 w-[2px] bg-dusk" />
        <button type="button" onClick={() => session.cycleTarget()} className="btn-gold flex h-[48px] flex-col items-center justify-center px-1 text-[10px]" title="Alvo mais próximo (Tab/Espaço)">
          <ItemIcon icon="ui_target" size={22} />
          Tab
        </button>
        {ammo !== null && (
          <span className={`text-outline self-center text-[11px] ${ammo === 0 ? 'text-hp-light' : ''}`}>
            <ItemIcon icon="item_arrow" size={14} className="inline-block align-middle" /> {ammo}
          </span>
        )}
      </div>
    </div>
  );
}
