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
    <div className="frame-dark pointer-events-auto flex w-[220px] items-center gap-2 !border-[12px] sm:w-[260px]" data-testid="status-panel">
      <div className="frame-slot relative flex h-[56px] w-[46px] shrink-0 items-end justify-center overflow-hidden !border-[6px]">
        <SpriteFrame sheet={p.vocation} scale={1.5} className="-mb-[2px]" />
        <span className="text-outline absolute -top-[2px] left-0 right-0 text-center text-[10px] text-gold-light">{p.level}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1 leading-none">
          <span className="truncate text-[13px] text-parchment">{p.name}</span>
          <span className="text-[10px]" style={{ color: p.color }}>
            {p.vocationName}
          </span>
          {p.inPz && (
            <span className="ml-auto text-[9px] text-heal" title="Área protegida: sem combate">
              PZ
            </span>
          )}
        </div>
        <Bar className="mt-1" value={p.hp} max={p.maxHp} color="var(--color-hp)" label={`${p.hp}/${p.maxHp}`} height={11} />
        <Bar className="mt-[3px]" value={p.mana} max={p.maxMana} color="var(--color-mana)" label={`${p.mana}/${p.maxMana}`} height={11} />
        <div className="mt-[3px] flex items-center gap-1">
          <span className="text-[9px] leading-none text-gold-light">XP</span>
          <Bar className="flex-1" value={p.xpPct} max={1} color="var(--color-xp)" height={3} />
          <span className="w-8 text-right text-[9px] leading-none text-muted">{Math.floor(p.xpPct * 100)}%</span>
        </div>
      </div>
    </div>
  );
}
