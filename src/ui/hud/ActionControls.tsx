// Controles de ação. Os 9 atalhos (magias/itens/poções) seguem a mesma ordem 1–9 no celular e no desktop, sempre no
// canto inferior direito: no toque, um teclado 3x3 (1 2 3 / 4 5 6 / 7 8 9, de cima para baixo); no desktop, a barra
// com as teclas 1–9. Os atalhos são configuráveis (painel "Atalhos"). Não há botão de ataque: as magias de ataque
// também iniciam o ataque básico.
import { HOTBAR_SETS } from '../../domain/rules/hotbar';
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
 * Atalhos no celular: um teclado 3x3 no canto inferior direito, em ordem de leitura de cima para baixo
 * (1 2 3 / 4 5 6 / 7 8 9, igual às teclas do desktop), com o número em cada botão. Não há botão de ataque: qualquer
 * magia de ataque também mira e começa o ataque básico (mesmo sem mana). A seleção de jogador fica logo acima.
 * O bloco inteiro captura o toque (os vãos nunca andam pelo mapa).
 * Célula de cada atalho: [linha, coluna] (1–3).
 */
export const TOUCH_CELLS: readonly (readonly [number, number])[] = Array.from({ length: 9 }, (_, i) => [Math.floor(i / 3) + 1, (i % 3) + 1] as const);
export const TOUCH_SLOT = 46;
export const TOUCH_GAP = 5;
/** Largura do teclado de atalhos no toque (para o registro de mensagens não passar por baixo dele). */
export const TOUCH_GRID_W = TOUCH_SLOT * 3 + TOUCH_GAP * 2 + 8;

/**
 * Seleção de personagem (jogador ou herói): cada toque marca o próximo por perto e, depois do último, desmarca.
 * Com alguém marcado, as magias de ataque (e o ataque básico) vão nele.
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
      className={`${sel ? 'btn-gold anim-glow' : 'btn-pixel'} pointer-events-auto relative flex items-center justify-center gap-1 !border-[6px]`}
      style={{ width, height }}
      data-testid="select-actor-button"
    >
      <ItemIcon icon="ui_players" size={16} />
      <span className="max-w-full truncate px-[2px] text-[10px] leading-none">{sel ? sel.name : 'Jogador'}</span>
    </button>
  );
}

/**
 * Botão pequeno dos favoritos de atalhos: mostra o conjunto ativo (1 a 3) e cada toque passa para o próximo. Fica junto
 * dos atalhos (acima do teclado no toque, ao lado da engrenagem no desktop); a tecla 0 faz o mesmo.
 */
export function HotbarSetButton({ width, height }: { width: number; height: number }) {
  const session = useSession();
  const set = useSnap((s) => s.hotbarSet);
  return (
    <button
      type="button"
      aria-label={`Favoritos de atalhos: conjunto ${set + 1} de ${HOTBAR_SETS} (toque para trocar)`}
      title={`Favoritos de atalhos ${set + 1}/${HOTBAR_SETS} — toque para trocar (tecla 0)`}
      onPointerDown={(e) => {
        e.preventDefault();
        session.audio.unlock();
        session.setHotbarSet();
      }}
      className="btn-pixel pointer-events-auto relative flex flex-col items-center justify-center !border-[6px]"
      style={{ width, height }}
      data-testid="hotbar-set-button"
    >
      <span className="text-[13px] leading-none text-gold-light" data-testid="hotbar-set-current">
        {set + 1}
      </span>
      {/* um pontinho por conjunto; o ativo acende */}
      <span className="mt-[2px] flex gap-[2px]" aria-hidden>
        {Array.from({ length: HOTBAR_SETS }, (_, i) => (
          <span key={i} className={`h-[3px] w-[3px] ${i === set ? 'bg-gold-light' : 'bg-muted/60'}`} />
        ))}
      </span>
    </button>
  );
}

export function TouchActions() {
  const hotbar = useSnap((s) => s.hotbar);
  const cols = `${TOUCH_SLOT}px ${TOUCH_SLOT}px ${TOUCH_SLOT}px`;
  return (
    <div className="safe-bottom pointer-events-none absolute bottom-0 right-0 z-20 pb-1 pr-[max(6px,env(safe-area-inset-right))]">
      <div className="pointer-events-none flex flex-col items-end gap-1" data-testid="touch-actions">
        <InteractButton />
        {/* seleção de jogador/herói logo acima dos atalhos */}
        <div className="flex items-center gap-[4px] px-[4px]">
          <HotbarSetButton width={34} height={30} />
          <SelectActorButton width={TOUCH_GRID_W - 8 - 34 - 4} height={30} />
        </div>
        <div
          className="pointer-events-auto grid items-center justify-items-center p-[4px]"
          style={{ gridTemplateColumns: cols, gridTemplateRows: cols, gap: TOUCH_GAP }}
          data-testid="touch-grid"
        >
          {hotbar.map((slot) => (
            <div key={slot.index} style={{ gridRow: TOUCH_CELLS[slot.index]![0], gridColumn: TOUCH_CELLS[slot.index]![1] }}>
              <HotbarSlot slot={slot} size={TOUCH_SLOT} keyHint={String(slot.index + 1)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Desktop: a barra 1–9 no canto inferior direito, com a seleção de jogador acima (Tab/Espaço miram o mais próximo). */
export function DesktopActionBar() {
  const session = useSession();
  const hotbar = useSnap((s) => s.hotbar);
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-20 flex flex-col items-end gap-2">
      <InteractButton size={44} />
      <SelectActorButton width={150} height={34} />
      <div className="frame-dark pointer-events-auto flex items-end gap-[6px] !border-[10px]" data-testid="desktop-hotbar">
        {hotbar.map((slot) => (
          <HotbarSlot key={slot.index} slot={slot} size={46} keyHint={String(slot.index + 1)} />
        ))}
        <HotbarSetButton width={30} height={46} />
        <button type="button" onClick={() => session.setPanel('hotbar')} className="btn-pixel flex h-[46px] w-7 items-center justify-center !border-[6px] text-[10px]" title="Configurar atalhos" data-testid="btn-hotbar-config">
          <ItemIcon icon="ui_gear" size={14} />
        </button>
      </div>
    </div>
  );
}
