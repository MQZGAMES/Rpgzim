// Interação com outros personagens: modo de ataque, permissão de PK, grupo (painel, convite) e o menu
// que abre ao tocar num personagem (conversar, convidar/remover do grupo, passar liderança, atacar).
import { useLocal, useSession, useSnap } from '../../integration/game-ui-bridge/hooks';
import { Bar, ItemIcon, PixelButton } from '../common/primitives';

/** Botões discretos: modo de ataque (parado/seguir) e permissão de PK. */
export function QuickToggles() {
  const session = useSession();
  const stand = useSnap((s) => s.standAttack);
  const pvp = useSnap((s) => s.pvp);
  const skullMs = useSnap((s) => s.skullMs);
  return (
    <div className="pointer-events-auto flex flex-col items-end gap-1" data-testid="quick-toggles">
      <button
        type="button"
        onClick={() => session.setStandAttack(!stand)}
        className="btn-pixel flex h-9 items-center gap-1 !border-[6px] px-1 text-[11px] opacity-90"
        title={stand ? 'Atacar parado: não persegue o alvo (toque para seguir o alvo)' : 'Seguir o alvo: persegue até alcançar (toque para atacar parado)'}
        aria-label={stand ? 'Modo de ataque: parado' : 'Modo de ataque: seguir o alvo'}
        aria-pressed={stand}
        data-testid="toggle-stand"
      >
        <ItemIcon icon={stand ? 'ui_stand' : 'ui_follow'} size={16} />
        <span>{stand ? 'Parado' : 'Seguir'}</span>
      </button>
      <button
        type="button"
        onClick={() => session.setPvp(!pvp)}
        className={`btn-pixel flex h-9 items-center gap-1 !border-[6px] px-1 text-[11px] ${pvp ? 'text-hp-light' : 'opacity-75'}`}
        title={pvp ? 'PK ativado: personagens podem se atacar fora das áreas protegidas' : 'PK desativado: ninguém ataca jogadores'}
        aria-label={pvp ? 'PK ativado' : 'PK desativado'}
        aria-pressed={pvp}
        data-testid="toggle-pvp"
      >
        <ItemIcon icon="ui_skull" size={16} className={pvp ? '' : 'opacity-50 grayscale'} />
        <span>PK {pvp ? 'on' : 'off'}</span>
      </button>
      {skullMs > 0 && (
        <span className="text-outline text-[10px] text-hp-light" title="Você atacou ou matou um jogador">
          caveira {Math.ceil(skullMs / 60000)} min
        </span>
      )}
    </div>
  );
}

/** Painel do grupo: membros, vida, líder e ações. */
export function PartyFrame() {
  const session = useSession();
  const party = useSnap((s) => s.party);
  if (!party) return null;
  return (
    <div className="frame-dark pointer-events-auto mt-1 w-[220px] !border-[10px] sm:w-[260px]" data-testid="party-frame">
      <div className="mb-1 flex items-center gap-1 text-[11px] text-gold-light">
        <ItemIcon icon="ui_party" size={14} />
        <span className="flex-1">Grupo · XP dividida</span>
        <button type="button" className="text-[11px] text-hp-light underline" onClick={() => session.partyLeave()} data-testid="party-leave">
          sair
        </button>
      </div>
      {party.members.map((m) => (
        <div key={m.id} className={`flex items-center gap-1 text-[11px] ${m.near ? '' : 'opacity-60'}`}>
          {m.isLeader ? <ItemIcon icon="ui_crown" size={12} title="Líder" /> : <span className="w-3" />}
          <span className={`w-[78px] truncate ${m.isYou ? 'text-gold-light' : 'text-parchment'}`}>{m.isYou ? `${m.name} (você)` : m.name}</span>
          <span className="w-[30px] text-muted">nv {m.level}</span>
          <Bar className="flex-1" value={m.dead ? 0 : m.hp} max={m.maxHp} color="var(--color-heal)" height={4} />
          {party.youAreLeader && !m.isYou && (
            <span className="flex gap-1">
              <button type="button" className="text-[10px] text-gold-light underline" title="Passar liderança" onClick={() => session.partyPassLeader(m.id)}>
                líder
              </button>
              <button type="button" className="text-[10px] text-hp-light underline" title="Remover do grupo" onClick={() => session.partyKick(m.id)}>
                remover
              </button>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** Convite de grupo recebido. */
export function InvitePrompt() {
  const session = useSession();
  const invite = useSnap((s) => s.invite);
  if (!invite) return null;
  return (
    <div className="frame-dark anim-pop pointer-events-auto w-[260px] !border-[10px] text-center text-[13px]" role="dialog" aria-label="Convite de grupo" data-testid="invite-prompt">
      <div className="flex items-center justify-center gap-1">
        <ItemIcon icon="ui_party" size={16} />
        <b className="text-gold-light">{invite.fromName}</b> convidou você para o grupo.
      </div>
      <div className="mt-1 text-[11px] text-muted">{invite.fromName} será o líder; a XP é dividida igualmente.</div>
      <div className="mt-2 flex justify-center gap-2">
        <PixelButton variant="gold" className="px-2" onClick={() => session.partyAccept()}>
          Aceitar
        </PixelButton>
        <PixelButton className="px-2" onClick={() => session.partyDecline()}>
          Recusar
        </PixelButton>
      </div>
    </div>
  );
}

/** Menu ao tocar num personagem (herói). */
export function ActorMenu() {
  const session = useSession();
  const id = useLocal((s) => s.actorMenu);
  const hero = useSnap((s) => s.heroes.find((h) => h.id === id) ?? null);
  const party = useSnap((s) => s.party);
  const pvp = useSnap((s) => s.pvp);
  if (!id || !hero) return null;
  const inParty = hero.inParty;
  const canInvite = !inParty && (!party || party.youAreLeader);
  return (
    <div className="frame-dark anim-pop pointer-events-auto w-[236px] !border-[10px] text-[12px] sm:w-[260px]" role="dialog" aria-label={hero.name} data-testid="actor-menu">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[14px]">
            {hero.isLeader && <ItemIcon icon="ui_crown" size={12} />}
            {hero.skull && <ItemIcon icon="ui_skull" size={12} title="Tem caveira" />}
            <b className={inParty ? 'text-[#7fd8ff]' : 'text-[#8ff0b0]'}>{hero.name}</b>
            <span className="text-muted">· {hero.vocationName} nv {hero.level}</span>
          </div>
          <div className="text-[11px] text-muted">
            {hero.dead ? 'morto' : hero.activity} · {hero.distance} tiles
          </div>
        </div>
        <button type="button" aria-label="Fechar" className="btn-pixel flex h-8 w-8 items-center justify-center !border-[6px]" onClick={() => session.closeActorMenu()}>
          <ItemIcon icon="ui_close" size={12} />
        </button>
      </div>
      <Bar className="mt-1" value={hero.hp} max={hero.maxHp} color="var(--color-heal)" height={5} />
      <div className="mt-2 flex flex-wrap gap-1">
        <PixelButton className="!border-[6px] px-1 text-[11px]" onClick={() => session.talkTo(hero.id)}>
          Conversar
        </PixelButton>
        {canInvite && (
          <PixelButton className="!border-[6px] px-1 text-[11px]" onClick={() => session.partyInvite(hero.id)}>
            Convidar p/ grupo
          </PixelButton>
        )}
        {inParty && party?.youAreLeader && (
          <>
            <PixelButton className="!border-[6px] px-1 text-[11px]" onClick={() => session.partyPassLeader(hero.id)}>
              Passar liderança
            </PixelButton>
            <PixelButton className="!border-[6px] px-1 text-[11px]" onClick={() => session.partyKick(hero.id)}>
              Remover do grupo
            </PixelButton>
          </>
        )}
        {pvp && (
          <PixelButton
            variant="gold"
            className="!border-[6px] px-1 text-[11px]"
            disabled={!!hero.attackBlocked}
            title={hero.attackBlocked ?? `Atacar ${hero.name} (você ganha caveira)`}
            onClick={() => session.attackActor(hero.id)}
          >
            Atacar
          </PixelButton>
        )}
      </div>
      {pvp && hero.attackBlocked && <div className="mt-1 text-[10px] text-muted">{hero.attackBlocked}</div>}
    </div>
  );
}
