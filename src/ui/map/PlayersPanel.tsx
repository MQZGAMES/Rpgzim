// Personagens: quem está no mundo, em pausa ou fora do jogo, numa lista enxuta (nome, vocação e nível) com busca —
// cabe uma lista grande. O que cada um está fazendo aparece ao tocar nele no mapa.
// "Chamar para o grupo" convida na hora; quem entra no grupo vem andando até você (aparece no mini mapa).
// Todo personagem salvo pode ser logado (entra jogando sozinho, com a IA da vocação e do nível dele) ou deslogado.
import { useState, type ReactNode } from 'react';
import { useLocal, useSession, useSnap } from '../../integration/game-ui-bridge/hooks';
import { VOCATION_IDS, type VocationId } from '../../domain/value-objects/ids';
import { Panel, PixelButton, SpriteFrame } from '../common/primitives';

const VOCATION_NAME: Record<VocationId, string> = {
  knight: 'Knight',
  paladin: 'Paladin',
  sorcerer: 'Sorcerer',
  druid: 'Druid',
};

/** Criar um personagem sem sair do jogo: nome + vocação; ele nasce no templo e já sai jogando com a IA. */
function CreateHeroForm() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [vocation, setVocation] = useState<VocationId>('knight');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <PixelButton
        variant="gold"
        className="mt-2 w-full !border-[6px] py-[2px] text-[12px]"
        onClick={() => setOpen(true)}
        data-testid="create-hero-open"
      >
        + Criar personagem (joga com a IA)
      </PixelButton>
    );
  return (
    <form
      className="frame-slot mt-2 flex flex-col gap-2 !border-[6px] p-1"
      data-testid="create-hero-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        void session.createAiCharacter(name, vocation).then((err) => {
          setBusy(false);
          setError(err);
          if (!err) {
            setName('');
            setOpen(false);
          }
        });
      }}
    >
      <input
        value={name}
        maxLength={16}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome do personagem"
        aria-label="Nome do novo personagem"
        className="frame-slot !border-[5px] bg-transparent px-1 py-[2px] text-[13px] text-parchment outline-none placeholder:text-muted"
        data-testid="create-hero-name"
        autoComplete="off"
      />
      <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label="Vocação do novo personagem">
        {VOCATION_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={vocation === id}
            onClick={() => setVocation(id)}
            className={`flex flex-col items-center rounded-sm border-2 py-[2px] text-[10px] ${vocation === id ? 'border-gold bg-[#3a2a12] text-gold-light' : 'border-transparent text-muted'}`}
            data-testid={`create-hero-voc-${id}`}
          >
            <span className="flex h-[34px] items-end overflow-hidden">
              <SpriteFrame sheet={id} scale={1.1} />
            </span>
            {VOCATION_NAME[id]}
          </button>
        ))}
      </div>
      {error && <p className="text-[11px] text-hp-light">{error}</p>}
      <div className="flex justify-end gap-1">
        <PixelButton
          className="!border-[6px] px-1 text-[11px]"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Cancelar
        </PixelButton>
        <PixelButton
          type="submit"
          variant="gold"
          className="!border-[6px] px-1 text-[11px]"
          disabled={busy}
          data-testid="create-hero-submit"
        >
          Criar e colocar no jogo
        </PixelButton>
      </div>
    </form>
  );
}

/** Busca sem acento e sem maiúsculas ("joao" acha "João"). */
const fold = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Linha enxuta: ponto de status, nome, vocação e nível; as ações ficam à direita. */
function Row({
  dot,
  name,
  vocation,
  level,
  nameClass = 'text-parchment',
  dim = false,
  testId,
  children,
}: {
  dot: string;
  name: string;
  vocation: string;
  level: number;
  nameClass?: string;
  dim?: boolean;
  testId: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`frame-slot flex min-h-[34px] items-center gap-2 !border-[5px] px-1 text-[12px] ${dim ? 'opacity-80' : ''}`}
      data-testid={testId}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <b className={`min-w-0 flex-1 truncate ${nameClass}`} title={name}>
        {name}
      </b>
      <span className="shrink-0 text-[11px] text-muted">{vocation}</span>
      <span className="w-10 shrink-0 text-right text-gold-light">nv {level}</span>
      {children && <div className="flex shrink-0 gap-1">{children}</div>}
    </div>
  );
}

const ACT = 'shrink-0 !border-[5px] px-1 text-[11px] min-h-[28px]';

export function PlayersPanel({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const heroes = useSnap((s) => s.heroes);
  const me = useSnap((s) => ({ name: s.player.name, vocation: s.player.vocation, level: s.player.level }));
  const offline = useLocal((s) => s.offline);
  const resting = useSnap((s) => s.resting);
  const guildWar = useSnap((s) => s.war.mode === 'guilds');
  const [query, setQuery] = useState('');
  const q = fold(query.trim());
  const match = (name: string) => !q || fold(name).includes(q);
  const vocName = (v: string) => VOCATION_NAME[v as VocationId] ?? v;
  const byLevel = <T extends { level: number; name: string }>(a: T, b: T) =>
    b.level - a.level || a.name.localeCompare(b.name, 'pt-BR');
  const online = heroes.filter((h) => match(h.name)).sort(byLevel);
  const paused = resting.filter((r) => match(r.name));
  const out = offline.filter((o) => match(o.name)).sort(byLevel);
  return (
    <Panel title="Personagens" icon="ui_players" onClose={onClose}>
      <div data-testid="players-panel">
        <p className="text-[12px] text-muted">
          {heroes.length + 1} no mundo · {resting.length} em pausa · {offline.length} fora. Logado, o
          personagem joga sozinho com a IA; toque nele no mapa para ver o que está fazendo.
        </p>
        <CreateHeroForm />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value.slice(0, 30))}
          placeholder="Buscar pelo nome…"
          aria-label="Buscar personagem"
          className="mt-2 h-9 w-full border-2 border-ink bg-[#1a1220] px-2 text-[13px] text-parchment"
          data-testid="players-search"
        />
        <h3 className="mb-1 mt-2 text-[13px] text-gold">No mundo ({heroes.length + 1})</h3>
        <div className="flex flex-col gap-1">
          <Row
            dot="bg-gold"
            name={`${me.name} (você)`}
            vocation={vocName(me.vocation)}
            level={me.level}
            nameClass="text-gold-light"
            dim
            testId="player-row-me"
          />
          {online.map((h) => (
            <Row
              key={h.id}
              dot={h.dead ? 'bg-muted' : 'bg-heal'}
              name={h.name}
              vocation={h.vocationName}
              level={h.level}
              nameClass={h.inParty ? 'text-[#7fd8ff]' : 'text-[#8ff0b0]'}
              testId={`player-row-${h.id}`}
            >
              <PixelButton
                className={ACT}
                disabled={h.dead}
                title={`Ir andando até ${h.name}, onde estiver`}
                onClick={() => session.goToActor(h.id)}
                data-testid={`player-goto-${h.id}`}
              >
                Ir
              </PixelButton>
              {h.inParty ? (
                <PixelButton
                  className={ACT}
                  title="Controles do grupo"
                  onClick={() => session.setPartyPanel(true)}
                  data-testid={`player-party-${h.id}`}
                >
                  Grupo
                </PixelButton>
              ) : guildWar ? null : (
                <PixelButton
                  variant="gold"
                  className={ACT}
                  disabled={h.dead}
                  title={`Chamar ${h.name} para o grupo`}
                  onClick={() => session.partyInvite(h.id)}
                  data-testid={`player-invite-${h.id}`}
                >
                  +Grupo
                </PixelButton>
              )}
              <PixelButton
                className={ACT}
                title={`Tirar ${h.name} do jogo (o progresso é salvo)`}
                onClick={() => void session.logoutCharacter(h.id)}
                data-testid={`player-logout-${h.id}`}
              >
                Sair
              </PixelButton>
            </Row>
          ))}
        </div>
        {resting.length > 0 && (
          <>
            <h3 className="mb-1 mt-3 text-[13px] text-gold">
              Numa pausa ({resting.length}, voltam sozinhos)
            </h3>
            <div className="flex flex-col gap-1" data-testid="resting-list">
              {paused.map((r) => (
                <Row
                  key={r.id}
                  dot="bg-mana"
                  name={`${r.name} · ~${r.backInMin} min`}
                  vocation={vocName(r.vocation)}
                  level={r.level}
                  dim
                  testId={`resting-row-${r.id}`}
                >
                  <PixelButton
                    className={ACT}
                    title={`Deslogar ${r.name} de vez (não volta sozinho)`}
                    onClick={() => void session.logoutCharacter(r.id)}
                    data-testid={`resting-logout-${r.id}`}
                  >
                    Sair
                  </PixelButton>
                </Row>
              ))}
            </div>
          </>
        )}
        {offline.length > 0 && (
          <>
            <h3 className="mb-1 mt-3 text-[13px] text-gold">Fora do jogo ({offline.length})</h3>
            <div className="flex flex-col gap-1">
              {out.map((o) => (
                <Row
                  key={o.id}
                  dot="bg-muted"
                  name={o.name}
                  vocation={vocName(o.vocation)}
                  level={o.level}
                  dim
                  testId={`offline-row-${o.id}`}
                >
                  <PixelButton
                    variant="gold"
                    className={ACT}
                    title={`Colocar ${o.name} no jogo: ele joga sozinho com a IA`}
                    onClick={() => session.loginCharacter(o.id)}
                    data-testid={`player-login-${o.id}`}
                  >
                    Logar
                  </PixelButton>
                </Row>
              ))}
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
