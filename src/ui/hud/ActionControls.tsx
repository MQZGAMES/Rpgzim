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

/**
 * Seleção de personagem (jogador ou herói): cada toque marca o próximo por perto e, depois do último, desmarca.
 * Com alguém marcado, o botão de ataque e as magias de ataque vão nele.
 */
function SelectActorButton({ width, height }: { width: number; height: number }) {
  const session = useSession();
  const sel = useSnap((s) => s.selectedActor);
  return (
    <button
      type="button"
      aria-label={sel ? `Selecionado: ${sel.name} (toque para o próximo)` : 'Selecionar jogador ou herói'}
      title={sel ? `${sel.name} — o ataque vai nele (toque: próximo / desmarcar)` : 'Selecionar jogador ou herói para atacar'}
      onPointerDown={(e) => {
        e.preventDefault();
        session.audio.unlock();
        session.cycleActorSelection();
      }}
      className={`${sel ? 'btn-gold anim-glow' : 'btn-pixel'} pointer-events-auto relative flex flex-col items-center justify-center !border-[6px]`}
      style={{ width, height }}
      data-testid="select-actor-button"
    >
      <ItemIcon icon="ui_players" size={18} />
      <span className="max-w-full truncate px-[2px] text-[9px] leading-none">{sel ? sel.name : 'Jogador'}</span>
    </button>
  );
}

export function TouchActions() {
  const session = useSession();
  const hotbar = useSnap((s) => s.hotbar);
  const hasTarget = useSnap((s) => s.target !== null);
  const hasSel = useSnap((s) => s.selectedActor !== null);
  const track = `${TOUCH_SLOT}px ${TOUCH_SLOT}px ${TOUCH_ATTACK}px`;
  return (
    <div className="safe-bottom pointer-events-none absolute bottom-0 right-0 z-20 pb-1 pr-[max(6px,env(safe-area-inset-right))]">
      <div className="pointer-events-none flex flex-col items-end" data-testid="touch-actions">
        <div className="flex flex-col items-end pb-1">
          <InteractButton />
        </div>
        {/* acima da grade, na coluna do botão de ataque: a seleção de jogador/herói */}
        <div className="pointer-events-none flex justify-end px-[4px]">
          <SelectActorButton width={TOUCH_ATTACK} height={TOUCH_SLOT} />
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
            aria-label={hasSel ? 'Atacar o personagem selecionado' : hasTarget ? 'Trocar alvo' : 'Selecionar alvo mais próximo'}
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
            <span className="text-[10px] leading-none">{hasSel ? 'Atacar' : hasTarget ? 'Trocar' : 'Atacar'}</span>
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
        <SelectActorButton width={58} height={46} />
        <button type="button" onClick={() => session.cycleTarget()} className="btn-gold flex h-[46px] flex-col items-center justify-center px-1 text-[10px]" title="Alvo mais próximo (Tab/Espaço)">
          <ItemIcon icon="ui_target" size={22} />
          Tab
        </button>
      </div>
    </div>
  );
}
