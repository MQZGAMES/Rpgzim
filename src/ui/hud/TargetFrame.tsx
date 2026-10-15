import { useSession, useSnap } from '../../integration/game-ui-bridge/hooks';
import { Bar, ItemIcon } from '../common/primitives';

export function TargetFrame() {
  const t = useSnap((s) => s.target);
  const session = useSession();
  if (!t) return null;
  return (
    <div className="frame-dark anim-pop pointer-events-auto flex w-[200px] items-center gap-2 !border-[10px]" data-testid="target-frame">
      <ItemIcon icon="ui_target" size={20} className="anim-glow" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between text-[12px] leading-none">
          <span className={`truncate ${t.isPlayer ? 'text-[#ff8a8a]' : 'text-[#ffb3a3]'}`}>
            {t.isPlayer && <ItemIcon icon="ui_skull" size={11} className="mr-1 inline-block align-[-1px]" />}
            {t.name}
          </span>
          <span className={`text-[9px] ${t.inRange ? 'text-heal' : 'text-muted'}`}>{t.inRange ? 'ao alcance' : `${t.distance} tiles`}</span>
        </div>
        <Bar className="mt-1" value={t.hp} max={t.maxHp} color="var(--color-hp)" height={6} />
      </div>
      <button type="button" aria-label="Cancelar alvo" className="btn-pixel flex h-8 w-8 items-center justify-center !border-[6px]" onClick={() => session.clearTarget()}>
        <ItemIcon icon="ui_close" size={12} />
      </button>
    </div>
  );
}
