import { useSnap } from '../../integration/game-ui-bridge/hooks';
import { Bar, SpriteFrame } from '../common/primitives';

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
  }));
  return (
    <div className="frame-dark pointer-events-auto flex w-[min(196px,calc(100vw-160px))] items-center gap-[6px] !border-[9px] sm:w-[250px] sm:!border-[11px]" data-testid="status-panel">
      <div className="frame-slot relative flex h-[44px] w-[36px] shrink-0 items-end justify-center overflow-hidden !border-[5px] sm:h-[52px] sm:w-[44px]">
        <SpriteFrame sheet={p.vocation} scale={1.25} className="-mb-[2px]" />
        <span className="text-outline absolute -top-[2px] left-0 right-0 text-center text-[10px] text-gold-light">{p.level}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1 leading-none">
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
