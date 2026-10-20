// Personagens online: quem está no mundo (heróis com vida própria), onde estão e o que fazem.
// "Chamar para o grupo" convida na hora; quem entra no grupo vem andando até você (aparece no mini mapa).
import { useSession, useSnap } from '../../integration/game-ui-bridge/hooks';
import { Bar, ItemIcon, Panel, PixelButton, SpriteFrame } from '../common/primitives';

export function PlayersPanel({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const heroes = useSnap((s) => s.heroes);
  const me = useSnap((s) => ({ name: s.player.name, region: s.region }));
  return (
    <Panel title="Personagens online" icon="ui_players" onClose={onClose}>
      <div data-testid="players-panel">
        <p className="text-[12px] text-muted">
          {heroes.length + 1} no mundo. Chame para o grupo: a pessoa entra e vem andando até você (aparece no mini mapa).
        </p>
        <div className="mt-2 flex flex-col gap-2">
          <div className="frame-slot flex items-center gap-2 !border-[6px] px-1 py-1 text-[12px] opacity-80">
            <span className="h-2 w-2 rounded-full bg-gold" />
            <span className="flex-1 truncate text-gold-light">{me.name} (você)</span>
            <span className="truncate text-[11px] text-muted">{me.region ?? ''}</span>
          </div>
          {heroes.map((h) => (
            <div key={h.id} className="frame-slot flex items-center gap-2 !border-[6px] px-1 py-1" data-testid={`player-row-${h.id}`}>
              <div className="relative flex h-[40px] w-[32px] shrink-0 items-end justify-center overflow-hidden">
                <SpriteFrame sheet={h.vocation} scale={1.2} className={h.dead ? 'opacity-40 grayscale' : ''} />
                <span className={`absolute right-0 top-0 h-2 w-2 rounded-full ${h.dead ? 'bg-muted' : 'bg-heal'}`} title={h.dead ? 'morto' : 'online'} />
              </div>
              <div className="min-w-0 flex-1 text-[12px]">
                <div className="flex items-center gap-1">
                  {h.isLeader && <ItemIcon icon="ui_crown" size={11} title="Líder do grupo" />}
                  {h.skull && <ItemIcon icon={`ui_skull_${h.skull}`} size={12} title="Tem caveira" />}
                  <b className={h.inParty ? 'text-[#7fd8ff]' : 'text-[#8ff0b0]'}>{h.name}</b>
                  <span className="truncate text-muted">
                    · {h.vocationName} nv {h.level}
                  </span>
                </div>
                <div className="truncate text-[11px] text-muted">
                  {h.region} · {h.dead ? 'morto' : h.activity} · {h.distance} tiles
                </div>
                <Bar className="mt-[2px]" value={h.hp} max={h.maxHp} color="var(--color-heal)" height={3} />
              </div>
              {h.inParty ? (
                <PixelButton className="shrink-0 !border-[6px] px-1 text-[11px]" onClick={() => session.setPartyPanel(true)} data-testid={`player-party-${h.id}`}>
                  No grupo
                </PixelButton>
              ) : (
                <PixelButton
                  variant="gold"
                  className="shrink-0 !border-[6px] px-1 text-[11px]"
                  disabled={h.dead}
                  title={`Chamar ${h.name} para o grupo`}
                  onClick={() => session.partyInvite(h.id)}
                  data-testid={`player-invite-${h.id}`}
                >
                  + Grupo
                </PixelButton>
              )}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
