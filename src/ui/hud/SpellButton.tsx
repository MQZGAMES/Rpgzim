import type { SpellView } from '../../integration/game-ui-bridge/snapshot';
import { ItemIcon } from '../common/primitives';

/** Botão de magia com varredura de recarga, custo de mana e estado indisponível. */
export function SpellButton({ spell, size = 48, keyHint, onCast }: { spell: SpellView; size?: number; keyHint?: string; onCast: () => void }) {
  const cdPct = spell.cooldownRemaining > 0 ? Math.min(1, spell.cooldownRemaining / Math.max(spell.cooldownMs, 1000)) : 0;
  const locked = !spell.unlocked;
  const noMana = spell.reason === 'Mana insuficiente.';
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.preventDefault();
        onCast();
      }}
      aria-label={`${spell.name} (${spell.manaCost} de mana)`}
      title={`${spell.name} — ${spell.words}\n${spell.description}\nMana: ${spell.manaCost} · Recarga: ${spell.cooldownMs / 1000}s${spell.reason ? `\n${spell.reason}` : ''}`}
      className="frame-slot relative flex items-center justify-center !border-[6px] active:translate-y-px"
      style={{ width: size, height: size }}
      data-testid={`spell-${spell.id}`}
    >
      <ItemIcon icon={spell.icon} size={size - 16} className={locked || noMana ? 'opacity-40 grayscale' : ''} />
      {cdPct > 0 && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: `conic-gradient(rgba(10,6,16,0.78) ${cdPct * 360}deg, transparent 0)` }}
        />
      )}
      {cdPct > 0 && <span className="text-outline absolute inset-0 flex items-center justify-center text-[12px]">{Math.ceil(spell.cooldownRemaining / 1000)}</span>}
      {locked && <span className="text-outline absolute inset-0 flex items-center justify-center text-[9px] text-gold-light">Nv {spell.minLevel}</span>}
      <span className={`text-outline absolute -bottom-[7px] right-[-4px] text-[9px] leading-none ${noMana ? 'text-hp-light' : 'text-mana-light'}`}>{spell.manaCost}</span>
      {keyHint && <span className="text-outline absolute -left-[4px] -top-[6px] text-[10px] leading-none text-gold-light">{keyHint}</span>}
    </button>
  );
}
