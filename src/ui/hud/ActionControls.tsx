// Controles de ação. No toque: botão de ataque no canto e os 6 atalhos (magias/itens/poções) em grade ao redor.
// No desktop: barra inferior com atalhos numerados (1–8). Os atalhos são configuráveis (painel "Atalhos").
import type { HotbarSlotView } from '../../integration/game-ui-bridge/snapshot';
import { useSession, useSnap } from '../../integration/game-ui-bridge/hooks';
import { ItemIcon } from '../common/primitives';
import { HOLD_MS, useHoldRepeat } from '../common/useHoldRepeat';
import { SpellButton } from './SpellButton';

/** Um atalho: magia, item/poção (com quantidade e recarga) ou vazio (toque abre a configuração). */
export function HotbarSlot({ slot, size, keyHint }: { slot: HotbarSlotView; size: number; keyHint?: string }) {
  const session = useSession();
  // manter pressionado repete o item/poção a cada recarga
  // (o hook é chamado sempre: trocar o tipo do atalho não pode mudar a quantidade de hooks)
  const { handlers } = useHoldRepeat({
    onFire: () => session.useSlot(slot.index),
    cooldownRemaining: slot.cooldownRemaining,
    cooldownMs: slot.cooldownMs,
    canRepeat: slot.count > 0,
    onRelease: (heldMs) => heldMs >= HOLD_MS && session.cancelQueuedSpell(),
  });
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
      {...handlers}
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

/**
 * Atalhos no celular: um quadrado de 3x3 botões colado ao canto inferior direito. O botão de ataque (um pouco
 * menor que antes) fica no canto e os 8 atalhos o cercam: o 1º ao lado, o 2º em cima, e assim por diante, do mais
 * perto para o mais longe. O quadrado inteiro captura o toque (os vãos nunca andam pelo mapa).
 * Célula de cada atalho: [linha, coluna] (1–3).
 */
export const TOUCH_CELLS: readonly (readonly [number, number])[] = [
  [3, 2], // 1
  [2, 3], // 2
  [2, 2], // 3
  [3, 1], // 4
  [1, 3], // 5
  [2, 1], // 6
  [1, 2], // 7
  [1, 1], // 8
];
export const TOUCH_SLOT = 44;
export const TOUCH_ATTACK = 54;
export const TOUCH_GAP = 5;

/** Contador de flechas (só com arco equipado): ícone e quantidade por tipo, mais forte primeiro; vermelho quando acabando. */
export function AmmoPill({ compact = false, fill = false }: { compact?: boolean; fill?: boolean }) {
  const ammo = useSnap((s) => s.ammo);
  if (!ammo) return null;
  const low = ammo.total < 20;
  return (
    <div
      className={`pointer-events-none flex items-center gap-2 rounded-sm border-2 px-[6px] text-[11px] leading-none ${fill ? 'w-full justify-center py-0' : 'py-[2px]'} ${
        ammo.total === 0 ? 'anim-glow border-hp bg-[#3a0a12]/85 text-hp-light' : low ? 'border-[#c87a2a] bg-[#2a1608]/85 text-[#ffb35a]' : 'border-[#5b4a78] bg-[#140e1e]/80 text-parchment'
      }`}
      title="Flechas na mochila: as mais fortes são usadas primeiro"
      data-testid="ammo-pill"
    >
      {ammo.types.length ? (
        ammo.types.map((t) => (
          <span key={t.itemId} className="inline-flex items-center gap-[2px]" title={`${t.name} (+${t.attack} de ataque)`}>
            <ItemIcon icon={t.icon} size={compact ? 12 : 16} />
            <b>{t.count}</b>
          </span>
        ))
      ) : (
        <span className="inline-flex items-center gap-[2px]">
          <ItemIcon icon="item_arrow" size={compact ? 14 : 16} className="grayscale" />
          <b>0</b>
        </span>
      )}
      {ammo.total === 0 && <span>sem flechas!</span>}
    </div>
  );
}

export function TouchActions() {
  const session = useSession();
  const hotbar = useSnap((s) => s.hotbar);
  const hasTarget = useSnap((s) => s.target !== null);
  const track = `${TOUCH_SLOT}px ${TOUCH_SLOT}px ${TOUCH_ATTACK}px`;
  return (
    <div className="safe-bottom pointer-events-none absolute bottom-0 right-0 z-20 pb-1 pr-[max(6px,env(safe-area-inset-right))]">
      <div className="pointer-events-none flex flex-col items-end" data-testid="touch-actions">
        {/* botões de ação (loot, falar...) ficam ACIMA do contador de flechas, que fica colado no quadrado de atalhos */}
        <div className="flex flex-col items-end pb-1">
          <InteractButton />
        </div>
        <div className="mb-[1px] px-[4px]" style={{ width: TOUCH_SLOT * 2 + TOUCH_ATTACK + TOUCH_GAP * 2 + 8 }}>
          <AmmoPill compact fill />
        </div>
        <div
          className="pointer-events-auto grid items-center justify-items-center p-[4px]"
          style={{ gridTemplateColumns: track, gridTemplateRows: track, gap: TOUCH_GAP }}
          data-testid="touch-grid"
        >
          {hotbar.map((slot) => (
            <div key={slot.index} style={{ gridRow: TOUCH_CELLS[slot.index]![0], gridColumn: TOUCH_CELLS[slot.index]![1] }}>
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
            className={`btn-gold relative flex flex-col items-center justify-center ${hasTarget ? 'anim-glow' : ''}`}
            style={{ gridRow: 3, gridColumn: 3, width: TOUCH_ATTACK, height: TOUCH_ATTACK }}
            data-testid="attack-button"
          >
            <ItemIcon icon={hasTarget ? 'ui_target' : 'ui_attack'} size={24} />
            <span className="text-[10px] leading-none">{hasTarget ? 'Trocar' : 'Atacar'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function DesktopActionBar() {
  const session = useSession();
  const hotbar = useSnap((s) => s.hotbar);
  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        <AmmoPill />
        <InteractButton size={44} />
      </div>
      <div className="frame-dark pointer-events-auto flex items-end gap-[6px] !border-[10px]">
        {hotbar.map((slot) => (
          <HotbarSlot key={slot.index} slot={slot} size={46} keyHint={String(slot.index + 1)} />
        ))}
        <button type="button" onClick={() => session.setPanel('hotbar')} className="btn-pixel flex h-[46px] w-7 items-center justify-center !border-[6px] text-[10px]" title="Configurar atalhos" data-testid="btn-hotbar-config">
          <ItemIcon icon="ui_gear" size={14} />
        </button>
        <div className="mx-1 h-10 w-[2px] bg-dusk" />
        <button type="button" onClick={() => session.cycleTarget()} className="btn-gold flex h-[46px] flex-col items-center justify-center px-1 text-[10px]" title="Alvo mais próximo (Tab/Espaço)">
          <ItemIcon icon="ui_target" size={22} />
          Tab
        </button>
      </div>
    </div>
  );
}
