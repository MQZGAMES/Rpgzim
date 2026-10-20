import { useSnap } from '../../integration/game-ui-bridge/hooks';
import { Bar, ItemIcon, SpriteFrame } from '../common/primitives';

export function StatusPanel() {
  const p = useSnap((s) => ({
    name: s.player.name,
    level: s.player.level,
    hp: s.player.hp,
    maxHp: s.player.maxHp,
    mana: s.player.mana,
    maxMana: s.player.maxMana,
    xpPct: s.player.xpPct,
    vocation: s.player.vocation,
    vocationName: s.player.vocationName,
    color: s.player.vocationColor,
    inPz: s.player.inPz,
    skull: s.pk.skull,
  }));
  return (
    <div className="frame-dark pointer-events-none flex w-[min(196px,calc(100vw-200px))] items-center gap-[6px] !border-[9px] sm:w-[250px] sm:!border-[11px]" data-testid="status-panel">
      <div className="frame-slot relative flex h-[44px] w-[36px] shrink-0 items-end justify-center overflow-hidden !border-[5px] sm:h-[52px] sm:w-[44px]">
        <SpriteFrame sheet={p.vocation} scale={1.25} className="-mb-[2px]" />
        <span className="text-outline absolute -top-[2px] left-0 right-0 text-center text-[10px] text-gold-light">{p.level}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1 leading-none">
          {p.skull && <ItemIcon icon={`ui_skull_${p.skull}`} size={13} title="Você está marcado (PK)" />}
          <span className="truncate text-[12px] text-parchment sm:text-[13px]">{p.name}</span>
          <span className="hidden text-[10px] sm:inline" style={{ color: p.color }}>
            {p.vocationName}
          </span>
          {p.inPz && (
            <span className="ml-auto text-[9px] text-heal" title="Área protegida: sem combate">
              PZ
            </span>
          )}
        </div>
        <Bar className="mt-[3px]" value={p.hp} max={p.maxHp} color="var(--color-hp)" label={`${p.hp}/${p.maxHp}`} height={10} />
        <Bar className="mt-[2px]" value={p.mana} max={p.maxMana} color="var(--color-mana)" label={`${p.mana}/${p.maxMana}`} height={10} />
        <div className="mt-[2px] flex items-center gap-1">
          <span className="text-[9px] leading-none text-gold-light">XP</span>
          <Bar className="flex-1" value={p.xpPct} max={1} color="var(--color-xp)" height={3} />
          <span className="w-8 text-right text-[9px] leading-none text-muted">{Math.floor(p.xpPct * 100)}%</span>
        </div>
      </div>
    </div>
  );
}

const BUFF_INFO: Record<string, { icon: string; label: string; tone: string }> = {
  manaShield: { icon: 'spell_mana_shield', label: 'Escudo de Mana: o dano sai da mana', tone: 'border-[#5aa8dd]' },
  haste: { icon: 'spell_haste', label: 'Corrida', tone: 'border-[#a6dcfa]' },
  defense: { icon: 'spell_iron_roar', label: 'Defesa aumentada', tone: 'border-[#8892a5]' },
  attackSpeed: { icon: 'spell_hunters_focus', label: 'Ataque mais rápido', tone: 'border-[#5cbba8]' },
  regen: { icon: 'spell_sap_blessing', label: 'Regeneração', tone: 'border-[#4fd08a]' },
  distanceDamage: { icon: 'spell_hunters_focus', label: 'Dano à distância', tone: 'border-[#eec84a]' },
};

/** Efeitos ativos no personagem (ex.: Escudo de Mana por 5 min), com o tempo que falta. */
export function BuffBar() {
  const buffs = useSnap((s) => s.buffs);
  if (!buffs.length) return null;
  return (
    <div className="pointer-events-none mt-[3px] flex gap-1" data-testid="buff-bar">
      {buffs.map((b) => {
        const info = BUFF_INFO[b.kind];
        if (!info) return null;
        const secs = Math.ceil(b.remainingMs / 1000);
        return (
          <span key={b.kind} className={`relative flex h-[26px] w-[26px] items-center justify-center rounded-sm border-2 bg-[#120d18]/85 ${info.tone}`} title={`${info.label} (${secs >= 60 ? `${Math.ceil(secs / 60)} min` : `${secs}s`})`} data-testid={`buff-${b.kind}`}>
            <ItemIcon icon={info.icon} size={18} className={b.kind === 'manaShield' ? 'anim-glow' : ''} />
            <span className="text-outline absolute -bottom-[5px] right-[-3px] text-[8px] leading-none text-parchment">{secs >= 60 ? `${Math.ceil(secs / 60)}m` : secs}</span>
          </span>
        );
      })}
    </div>
  );
}
