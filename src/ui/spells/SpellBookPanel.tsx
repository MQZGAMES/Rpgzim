import { useSession, useSnap } from '../../integration/game-ui-bridge/hooks';
import { ItemIcon, Panel, PixelButton } from '../common/primitives';

const TARGET_LABEL: Record<string, string> = { target: 'Alvo', self: 'Si mesmo', areaSelf: 'Área ao redor', areaTarget: 'Área no alvo' };

export function SpellBookPanel({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const book = useSnap((s) => s.spellbook);
  const hotbar = useSnap((s) => s.hotbar.map((h) => h.spell?.id ?? null));
  return (
    <Panel title="Grimório" onClose={onClose} icon="ui_book" wide>
      <div className="mb-2 flex items-center gap-2">
        <p className="flex-1 text-[12px] text-muted">Magias gastam mana, têm recarga e evoluem seu Magic Level. Coloque cada magia num atalho (1–6).</p>
        <PixelButton className="!border-[6px] px-1 text-[11px]" onClick={() => session.setPanel('hotbar')} data-testid="open-hotbar">
          Atalhos
        </PixelButton>
      </div>
      <div className="flex flex-col gap-2">
        {book.map((s) => (
          <div key={s.id} className={`frame-tooltip flex gap-3 ${s.unlocked ? '' : 'opacity-70'}`}>
            <ItemIcon icon={s.icon} size={40} className={s.unlocked ? '' : 'grayscale'} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-gold-light">{s.name}</span>
                <span className="text-[11px] italic" style={{ color: s.color }}>
                  “{s.words}”
                </span>
              </div>
              <div className="text-[12px] leading-snug text-parchment">{s.description}</div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted">
                <span className="text-mana-light">{s.manaCost} mana</span>
                <span>Recarga {s.cooldownMs / 1000}s</span>
                <span>{TARGET_LABEL[s.target]}</span>
                <span className={s.unlocked ? '' : 'text-hp-light'}>
                  Nível {s.minLevel}
                  {s.minMagicLevel > 0 ? ` · ML ${s.minMagicLevel}` : ''}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1">
                <span className="text-[11px] text-muted">Atalho:</span>
                {hotbar.map((_, i) => (
                  <PixelButton key={i} variant={hotbar[i] === s.id ? 'gold' : 'stone'} className="h-7 w-7 !border-[6px] text-[11px]" onClick={() => session.setHotbar(i, { kind: 'spell', id: s.id })} ariaLabel={`Colocar no atalho ${i + 1}`}>
                    {i + 1}
                  </PixelButton>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
