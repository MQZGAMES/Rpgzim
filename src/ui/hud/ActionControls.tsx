// Controles de ação. No toque: botão grande de alvo/ataque com magias em arco, poções e interação.
// No desktop: barra inferior com atalhos numerados.
import { useSession, useSnap } from '../../integration/game-ui-bridge/hooks';
import { ItemIcon } from '../common/primitives';
import { SpellButton } from './SpellButton';

function PotionButton({ kind, size = 44, keyHint }: { kind: 'health' | 'mana'; size?: number; keyHint?: string }) {
  const session = useSession();
  const count = useSnap((s) => (kind === 'health' ? s.potions.health : s.potions.mana));
  const cd = useSnap((s) => s.potions.cooldown > 0);
  return (
    <button
      type="button"
      aria-label={kind === 'health' ? 'Usar poção de vida' : 'Usar poção de mana'}
      title={kind === 'health' ? 'Poção de vida' : 'Poção de mana'}
      onPointerDown={(e) => {
        e.preventDefault();
        session.quickPotion(kind);
      }}
      className={`frame-slot relative flex items-center justify-center !border-[6px] active:translate-y-px ${count === 0 || cd ? 'opacity-60' : ''}`}
      style={{ width: size, height: size }}
      data-testid={`potion-${kind}`}
    >
      <ItemIcon icon={kind === 'health' ? 'item_potion_health' : 'item_potion_mana'} size={size - 16} />
      <span className="text-outline absolute -bottom-[6px] right-[-3px] text-[10px] leading-none">{count}</span>
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

export function TouchActions() {
  const session = useSession();
  const hotbar = useSnap((s) => s.hotbar);
  const hasTarget = useSnap((s) => s.target !== null);
  const ammo = useSnap((s) => s.ammo);
  // grade 3x3 alinhada ao canto: ataque no canto, magias em "L" ao redor (a 1ª mais perto do polegar),
  // poções na diagonal e o botão de interação no canto livre de cima
  const SPELL = 52;
  const cells: Record<number, string> = { 0: '3 / 2', 1: '2 / 3', 2: '3 / 1', 3: '1 / 3' };
  return (
    <div className="safe-bottom pointer-events-none absolute bottom-0 right-0 z-20 pb-2 pr-[max(10px,env(safe-area-inset-right))]">
      <div
        className="pointer-events-auto grid items-center justify-items-center gap-[10px]"
        style={{ gridTemplateColumns: `${SPELL}px ${SPELL}px 78px`, gridTemplateRows: `${SPELL}px ${SPELL}px 78px` }}
        data-testid="touch-actions"
      >
        <div className="flex w-full justify-end self-end" style={{ gridArea: '1 / 1 / 2 / 3' }}>
          <InteractButton />
        </div>
        {hotbar.slice(0, 4).map((sp, i) => (
          <div key={sp.id} style={{ gridArea: cells[i] }}>
            <SpellButton spell={sp} size={SPELL} onCast={() => session.cast(sp.id)} />
          </div>
        ))}
        <div style={{ gridArea: '2 / 1' }}>
          <PotionButton kind="health" size={46} />
        </div>
        <div style={{ gridArea: '2 / 2' }}>
          <PotionButton kind="mana" size={46} />
        </div>
        <button
          type="button"
          aria-label={hasTarget ? 'Trocar alvo' : 'Selecionar alvo mais próximo'}
          onPointerDown={(e) => {
            e.preventDefault();
            session.audio.unlock();
            session.cycleTarget();
          }}
          className={`btn-gold relative flex h-[78px] w-[78px] flex-col items-center justify-center ${hasTarget ? 'anim-glow' : ''}`}
          style={{ gridArea: '3 / 3' }}
          data-testid="attack-button"
        >
          <ItemIcon icon={hasTarget ? 'ui_target' : 'ui_attack'} size={30} />
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
        {hotbar.slice(0, 4).map((sp, i) => (
          <SpellButton key={sp.id} spell={sp} size={52} keyHint={String(i + 1)} onCast={() => session.cast(sp.id)} />
        ))}
        <div className="mx-1 h-12 w-[2px] bg-dusk" />
        <PotionButton kind="health" size={52} keyHint="5" />
        <PotionButton kind="mana" size={52} keyHint="6" />
        <button type="button" onClick={() => session.cycleTarget()} className="btn-gold flex h-[52px] flex-col items-center justify-center px-1 text-[10px]" title="Alvo mais próximo (Tab/Espaço)">
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
