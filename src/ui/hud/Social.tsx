// Interação com outros personagens: modo de ataque, permissão de PK, grupo (quadro, painel de controle,
// convite) e o menu discreto que abre ao tocar num personagem (convidar, grupo, atacar).
import type { ReactNode } from 'react';
import { useLocal, useSession, useSnap } from '../../integration/game-ui-bridge/hooks';
import { Bar, ItemIcon, Panel, PixelButton, TapButton } from '../common/primitives';
import { useTap } from '../common/useTap';

/** Botão quadrado do HUD (menus, modo de ataque, PK, grupo), com um selo discreto de estado no canto. */
export function HudButton({
  icon,
  label,
  onClick,
  testId,
  hotkey,
  pip,
  pipClass = 'bg-[#3b2f52] text-parchment',
  pressed,
  dim = false,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  testId: string;
  hotkey?: string;
  pip?: string;
  pipClass?: string;
  pressed?: boolean;
  dim?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={hotkey ? `${label} (${hotkey})` : label}
      {...useTap(onClick)}
      className="btn-pixel relative flex h-10 w-10 items-center justify-center !border-[7px]"
      data-testid={testId}
    >
      <ItemIcon icon={icon} size={20} className={dim ? 'opacity-40 grayscale' : ''} />
      {pip && <span className={`pointer-events-none absolute -bottom-[5px] -right-[5px] rounded-sm px-[3px] text-[8px] font-bold leading-[11px] ${pipClass}`}>{pip}</span>}
    </button>
  );
}

/** Modo de ataque (seguir/parado), PK e atalho do grupo — entram na mesma grade dos botões de menu. */
export function QuickToggles() {
  const session = useSession();
  const stand = useSnap((s) => s.standAttack);
  const pvp = useSnap((s) => s.pvp);
  const partySize = useSnap((s) => s.party?.members.length ?? 0);
  return (
    <>
      <HudButton
        icon={stand ? 'ui_stand' : 'ui_follow'}
        label={stand ? 'Atacar parado: não persegue o alvo (toque para seguir)' : 'Seguir o alvo: persegue até alcançar (toque para atacar parado)'}
        onClick={() => session.setStandAttack(!stand)}
        testId="toggle-stand"
        pressed={stand}
        pip={stand ? 'parado' : undefined}
      />
      <HudButton
        icon="ui_skull"
        label={pvp ? 'PK ligado: personagens podem se atacar fora das áreas protegidas' : 'PK desligado: ninguém ataca jogadores'}
        onClick={() => session.setPvp(!pvp)}
        testId="toggle-pvp"
        pressed={pvp}
        dim={!pvp}
        pip={pvp ? 'PK on' : undefined}
        pipClass="bg-hp text-white"
      />
      {partySize > 0 && (
        <HudButton icon="ui_party" label="Grupo" hotkey="P" onClick={() => session.setPartyPanel(true)} testId="btn-party" pip={String(partySize)} pipClass="bg-[#2c6a8a] text-white" />
      )}
    </>
  );
}

const SKULL_LABEL = { white: 'Caveira branca', yellow: 'Caveira amarela', red: 'Caveira vermelha' } as const;
const SKULL_HINT = {
  white: 'Você atacou alguém sem caveira. Dura o PZ lock (2 min; 5 min se matar) e é renovada se você lutar nos últimos 30 s.',
  yellow: 'Você atacou uma caveira branca sem ter sido atacado por ela. Dura o PZ lock.',
  red: 'Caveira vermelha (3 mortes injustas): dura 24 h. Se morrer, perde TODOS os itens e o ouro.',
} as const;

/** Tempo restante: "14:32" (min:s) ou, acima de 1 h, "23h 59m". */
export function formatPkTime(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** PK estilo Tibia: caveira (cor e tempo) e PZ lock. Branca/amarela duram o PZ lock: um chip só; a vermelha tem o seu. */
export function PkBadge() {
  const pk = useSnap((s) => s.pk);
  if (!pk.skull && pk.pzLockMs <= 0) return null;
  const together = pk.skull && pk.skull !== 'red';
  return (
    <div className="pointer-events-none mt-[2px] flex items-center gap-2" data-testid="pk-badge">
      {pk.skull && (
        <span className="text-outline flex items-center gap-1 rounded-sm bg-[#120d18]/80 px-1 text-[11px] text-parchment" title={`${SKULL_LABEL[pk.skull]}: ${SKULL_HINT[pk.skull]}`} data-testid="pk-skull">
          <ItemIcon icon={`ui_skull_${pk.skull}`} size={14} />
          {together && <ItemIcon icon="ui_lock" size={11} />}
          {formatPkTime(pk.skullMs)}
        </span>
      )}
      {pk.pzLockMs > 0 && !together && (
        <span className="text-outline flex items-center gap-1 rounded-sm bg-[#3a0a12]/85 px-1 text-[11px] text-hp-light" title="PZ lock: você não pode entrar em áreas protegidas (lojas, templo, casas)" data-testid="pk-pzlock">
          <ItemIcon icon="ui_lock" size={12} />
          PZ {formatPkTime(pk.pzLockMs)}
        </span>
      )}
      {together && <span className="sr-only" data-testid="pk-pzlock">PZ lock {formatPkTime(pk.pzLockMs)}</span>}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
  testId,
}: {
  value: T;
  options: { v: T; label: string; hint: string }[];
  onChange: (v: T) => void;
  disabled: boolean;
  testId: string;
}) {
  return (
    <div className="flex gap-1" role="radiogroup" data-testid={testId}>
      {options.map((o) => (
        <PixelButton
          key={o.v}
          variant={o.v === value ? 'gold' : undefined}
          className="flex-1 !border-[6px] px-1 text-[12px]"
          disabled={disabled && o.v !== value}
          title={o.hint}
          onClick={() => o.v !== value && onChange(o.v)}
          data-testid={`${testId}-${o.v}`}
        >
          {o.label}
        </PixelButton>
      ))}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="mt-3">
      <div className="text-[13px] text-gold-light">{title}</div>
      <div className="mb-1 text-[11px] text-muted">{hint}</div>
      {children}
    </section>
  );
}

/** Painel de controle do grupo: líder, formação, alvo, treino entre membros, sair/desfazer. */
export function PartyPanel() {
  const session = useSession();
  const open = useLocal((s) => s.partyPanel);
  const party = useSnap((s) => s.party);
  if (!open || !party) return null;
  const lead = party.youAreLeader;
  return (
    <Panel title="Grupo" icon="ui_party" onClose={() => session.setPartyPanel(false)}>
      <div data-testid="party-panel">
        <div className="text-[11px] text-muted">A XP é dividida igualmente entre os membros por perto.</div>
        <Section title="Membros" hint={`Coroa: escolher o líder (inclusive você de volta)${lead ? ' · X: remover do grupo' : ''}.`}>
          <div className="flex flex-col gap-1">
            {party.members.map((m) => (
              <div key={m.id} className={`frame-slot flex items-center gap-2 !border-[6px] px-1 py-[2px] text-[12px] ${m.near ? '' : 'opacity-70'}`}>
                {m.isLeader ? <ItemIcon icon="ui_crown" size={14} title="Líder" /> : <span className="w-[14px]" />}
                <span className={`min-w-0 flex-1 truncate ${m.isYou ? 'text-gold-light' : 'text-[#7fd8ff]'}`}>
                  {m.name}
                  {m.isYou ? ' (você)' : ''} <span className="text-muted">nv {m.level}</span>
                </span>
                <Bar className="w-[60px]" value={m.dead ? 0 : m.hp} max={m.maxHp} color="var(--color-heal)" height={4} />
                {!m.isLeader && (
                  <TapButton
                    className="btn-pixel flex h-8 w-8 items-center justify-center !border-[6px]"
                    title={m.isYou ? 'Voltar a ser o líder' : `Tornar ${m.name} o líder`}
                    aria-label={m.isYou ? 'Voltar a ser o líder' : `Tornar ${m.name} o líder`}
                    onTap={() => session.partyPassLeader(m.id)}
                    data-testid={`party-lead-${m.isYou ? 'you' : m.id}`}
                  >
                    <ItemIcon icon="ui_crown" size={14} />
                  </TapButton>
                )}
                {lead && !m.isYou && (
                  <>
                    <TapButton
                      className="btn-pixel flex h-8 w-8 items-center justify-center !border-[6px]"
                      title={`Remover ${m.name}`}
                      aria-label={`Remover ${m.name}`}
                      onTap={() => session.partyKick(m.id)}
                      data-testid={`party-kick-${m.id}`}
                    >
                      <ItemIcon icon="ui_close" size={12} />
                    </TapButton>
                  </>
                )}
              </div>
            ))}
          </div>
        </Section>
        <Section title="Formação" hint="Como os membros andam fora de combate.">
          <Segmented
            value={party.formation}
            disabled={false}
            testId="party-formation"
            onChange={(formation) => session.configureParty({ formation })}
            options={[
              { v: 'free', label: 'Livre', hint: 'Cada um segue o próprio caminho' },
              { v: 'follow', label: 'Seguir', hint: 'Todos andam perto do líder' },
              { v: 'line', label: 'Fila', hint: 'Em fila, pisando nos passos do líder' },
            ]}
          />
        </Section>
        <Section title="Alvo" hint="Quem cada membro ataca em combate.">
          <Segmented
            value={party.targeting}
            disabled={false}
            testId="party-targeting"
            onChange={(targeting) => session.configureParty({ targeting })}
            options={[
              { v: 'leader', label: 'Alvo do líder', hint: 'Todos focam o mesmo inimigo do líder' },
              { v: 'nearest', label: 'Mais próximo', hint: 'Cada um ataca o inimigo mais perto de si' },
            ]}
          />
        </Section>
        <Section title="Ataque entre membros" hint="Treino: cada um usa a arma que tem e todos param de bater com 50% de vida até o outro se curar. Duelo: vale até morrer. Sem caveira e sem perder ouro.">
          <Segmented
            value={!party.friendlyFire ? 'off' : party.sparMode}
            disabled={false}
            testId="party-ff"
            onChange={(v) => session.configureParty(v === 'off' ? { friendlyFire: false } : { friendlyFire: true, sparMode: v })}
            options={[
              { v: 'off', label: 'Bloqueado', hint: 'Membros não se atacam' },
              { v: 'training', label: 'Treino', hint: 'Param com 50% de vida' },
              { v: 'duel', label: 'Duelo', hint: 'Até morrer' },
            ]}
          />
        </Section>
        <div className="mt-4 flex gap-2">
          <PixelButton className="flex-1" onClick={() => session.partyLeave()} data-testid="party-leave">
            Sair do grupo
          </PixelButton>
          {lead && (
            <PixelButton className="flex-1" onClick={() => session.disbandParty()} data-testid="party-disband">
              Desfazer grupo
            </PixelButton>
          )}
        </div>
      </div>
    </Panel>
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

function MiniAction({ icon, label, onClick, testId, gold = false }: { icon: string; label: string; onClick: () => void; testId: string; gold?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...useTap(onClick)}
      className={`${gold ? 'btn-gold' : 'btn-pixel'} flex h-9 w-9 shrink-0 items-center justify-center !border-[6px]`}
      data-testid={testId}
    >
      <ItemIcon icon={icon} size={18} />
    </button>
  );
}

/** Menu discreto ao tocar num personagem: nome, vida e ações por ícone. Toque 2x ataca (se permitido). */
export function ActorMenu() {
  const session = useSession();
  const id = useLocal((s) => s.actorMenu);
  const hero = useSnap((s) => s.heroes.find((h) => h.id === id) ?? null);
  if (!id || !hero) return null;
  const inParty = hero.inParty;
  const canInvite = !inParty;
  const canAttack = !hero.attackBlocked;
  return (
    <div className="frame-dark anim-pop pointer-events-auto flex items-center gap-2 !border-[8px] text-[12px]" role="dialog" aria-label={hero.name} data-testid="actor-menu">
      <div className="w-[118px] min-w-0">
        <div className="flex items-center gap-1 truncate">
          {hero.isLeader && <ItemIcon icon="ui_crown" size={11} />}
          {hero.skull && <ItemIcon icon={`ui_skull_${hero.skull}`} size={12} title={SKULL_LABEL[hero.skull]} />}
          <b className={inParty ? 'text-[#7fd8ff]' : 'text-[#8ff0b0]'}>{hero.name}</b>
        </div>
        <div className="truncate text-[10px] text-muted">
          {hero.vocationName} nv {hero.level} · {hero.dead ? 'morto' : hero.activity}
        </div>
        <Bar className="mt-[2px]" value={hero.hp} max={hero.maxHp} color="var(--color-heal)" height={3} />
      </div>
      {canInvite && <MiniAction icon="ui_party" label={`Convidar ${hero.name} para o grupo`} onClick={() => session.partyInvite(hero.id)} testId="actor-invite" />}
      {inParty && <MiniAction icon="ui_gear" label="Controles do grupo" onClick={() => session.setPartyPanel(true)} testId="actor-party" />}
      {canAttack && <MiniAction icon="ui_attack" gold label={`Atacar ${hero.name} (ou toque 2x no personagem)`} onClick={() => session.attackActor(hero.id)} testId="actor-attack" />}
      <MiniAction icon="ui_close" label="Fechar" onClick={() => session.closeActorMenu()} testId="actor-close" />
    </div>
  );
}
