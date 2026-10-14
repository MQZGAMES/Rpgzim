import { useSnap } from '../../integration/game-ui-bridge/hooks';
import { Bar, Panel, SpriteFrame, formatTime } from '../common/primitives';

export function CharacterPanel({ onClose }: { onClose: () => void }) {
  const p = useSnap((s) => s.player);
  const stats = useSnap((s) => s.stats);
  const skills = useSnap((s) => s.skills);
  const buffs = useSnap((s) => s.buffs);
  const row = (k: string, v: string | number) => (
    <div className="flex justify-between border-b border-dusk py-[3px] text-[13px]">
      <span className="text-muted">{k}</span>
      <span>{v}</span>
    </div>
  );
  return (
    <Panel title="Personagem" onClose={onClose} icon="ui_char" wide>
      <div className="flex gap-3">
        <div className="frame-slot flex h-[108px] w-[84px] shrink-0 items-end justify-center !border-[6px]">
          <SpriteFrame sheet={p.vocation} scale={3} walk />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-lg text-gold-light">{p.name}</div>
          <div className="text-[13px]" style={{ color: p.vocationColor }}>
            {p.vocationName} · Nível {p.level}
          </div>
          <Bar className="mt-2" value={p.xpPct} max={1} color="var(--color-xp)" height={8} label={`${Math.floor(p.xpPct * 100)}%`} />
          <div className="mt-1 text-[11px] text-muted">
            XP total {p.xp} · faltam {p.xpToNext} para o nível {p.level + 1}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 text-[13px] text-gold">Atributos</h3>
          {row('Vida', `${p.hp} / ${p.maxHp}`)}
          {row('Mana', `${p.mana} / ${p.maxMana}`)}
          {row('Arma', stats.weaponName)}
          {row('Ataque', stats.weaponAttack)}
          {row('Alcance', `${stats.range} tile${stats.range > 1 ? 's' : ''}`)}
          {row('Intervalo de ataque', `${(stats.attackInterval / 1000).toFixed(2)}s`)}
          {row('Armadura', stats.armor)}
          {row('Defesa (escudo)', stats.shieldDefense)}
          {row('Velocidade', p.speed.toFixed(1))}
          {stats.damageReduction > 0 && row('Redução de dano', `${Math.round(stats.damageReduction * 100)}%`)}
        </div>
        <div>
          <h3 className="mb-1 mt-3 text-[13px] text-gold sm:mt-0">Skills</h3>
          {skills.map((s) => (
            <div key={s.id} className="py-[3px]" data-testid={`skill-${s.id}`}>
              <div className="flex justify-between text-[13px]">
                <span>{s.label}</span>
                <span>
                  {s.level}
                  {s.level !== s.base && <span className="text-heal"> ({s.base}+{s.level - s.base})</span>}
                </span>
              </div>
              <Bar value={s.pct} max={1} color={s.id === 'magic' ? 'var(--color-mana-light)' : 'var(--color-heal)'} height={3} />
            </div>
          ))}
          <h3 className="mb-1 mt-3 text-[13px] text-gold">Histórico</h3>
          {row('Monstros derrotados', p.kills)}
          {row('Mortes', p.deaths)}
          {row('Tempo de jogo', formatTime(p.playTimeMs))}
          {buffs.length > 0 && (
            <>
              <h3 className="mb-1 mt-3 text-[13px] text-gold">Efeitos ativos</h3>
              {buffs.map((b) => row(b.kind === 'defense' ? 'Brado de Ferro' : b.kind === 'attackSpeed' ? 'Foco do Caçador' : b.kind === 'regen' ? 'Regeneração' : b.kind, `${Math.ceil(b.remainingMs / 1000)}s`))}
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}
