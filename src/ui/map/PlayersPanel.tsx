// Personagens online: quem está no mundo (heróis e personagens logados com IA), onde estão e o que fazem.
// "Chamar para o grupo" convida na hora; quem entra no grupo vem andando até você (aparece no mini mapa).
// Todo personagem salvo pode ser logado (entra jogando sozinho, com a IA da vocação e do nível dele) ou deslogado.
import { useState } from 'react';
import { useLocal, useSession, useSnap } from '../../integration/game-ui-bridge/hooks';
import { VOCATION_IDS, type VocationId } from '../../domain/value-objects/ids';
import { Bar, ItemIcon, Panel, PixelButton, SpriteFrame } from '../common/primitives';

const VOCATION_NAME: Record<VocationId, string> = { knight: 'Knight', paladin: 'Paladin', sorcerer: 'Sorcerer', druid: 'Druid' };

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
      <PixelButton variant="gold" className="mt-2 w-full !border-[6px] py-[2px] text-[12px]" onClick={() => setOpen(true)} data-testid="create-hero-open">
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
        <PixelButton className="!border-[6px] px-1 text-[11px]" onClick={() => { setOpen(false); setError(null); }}>
          Cancelar
        </PixelButton>
        <PixelButton type="submit" variant="gold" className="!border-[6px] px-1 text-[11px]" disabled={busy} data-testid="create-hero-submit">
          Criar e colocar no jogo
        </PixelButton>
      </div>
    </form>
  );
}

export function PlayersPanel({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const heroes = useSnap((s) => s.heroes);
  const me = useSnap((s) => ({ name: s.player.name, region: s.region }));
  const offline = useLocal((s) => s.offline);
  const resting = useSnap((s) => s.resting);
  const guildWar = useSnap((s) => s.war.mode === 'guilds');
  return (
    <Panel title="Personagens online" icon="ui_players" onClose={onClose}>
      <div data-testid="players-panel">
        <p className="text-[12px] text-muted">
          {heroes.length + 1} no mundo. Chame para o grupo: a pessoa entra e vem andando até você (aparece no
          mini mapa). "Ir até": você vai andando até ela, onde estiver, e para ao chegar perto.
          Logar/Deslogar: o personagem entra ou sai do jogo; logado, ele joga sozinho com a IA da vocação e do
          nível dele.
        </p>
        <CreateHeroForm />
        <div className="mt-2 flex flex-col gap-2">
          <div className="frame-slot flex items-center gap-2 !border-[6px] px-1 py-1 text-[12px] opacity-80">
            <span className="h-2 w-2 rounded-full bg-gold" />
            <span className="flex-1 truncate text-gold-light">{me.name} (você)</span>
            <span className="truncate text-[11px] text-muted">{me.region ?? ''}</span>
          </div>
          {heroes.map((h) => (
            <div
              key={h.id}
              className="frame-slot flex flex-wrap items-center gap-2 !border-[6px] px-1 py-1"
              data-testid={`player-row-${h.id}`}
            >
              <div className="relative flex h-[40px] w-[32px] shrink-0 items-end justify-center overflow-hidden">
                <SpriteFrame
                  sheet={h.vocation}
                  scale={1.2}
                  className={h.dead ? 'opacity-40 grayscale' : ''}
                />
                <span
                  className={`absolute right-0 top-0 h-2 w-2 rounded-full ${h.dead ? 'bg-muted' : 'bg-heal'}`}
                  title={h.dead ? 'morto' : 'online'}
                />
              </div>
              <div className="min-w-0 flex-1 text-[12px]">
                {/* nome longo encolhe com "…"; o nível fica sempre visível (a vocação encolhe antes do nome) */}
                <div className="flex min-w-0 items-center gap-1">
                  {h.isLeader && <ItemIcon icon="ui_crown" size={11} title="Líder do grupo" />}
                  {h.skull && <ItemIcon icon={`ui_skull_${h.skull}`} size={12} title="Tem caveira" />}
                  <b className={`min-w-0 truncate ${h.inParty ? 'text-[#7fd8ff]' : 'text-[#8ff0b0]'}`} title={h.name}>
                    {h.name}
                  </b>
                  <span className="min-w-0 shrink-[3] truncate text-muted">· {h.vocationName}</span>
                  <span className="shrink-0 text-gold-light" data-testid={`player-level-${h.id}`}>
                    nv {h.level}
                  </span>
                </div>
                <div className="truncate text-[11px] text-muted">
                  {h.region} · {h.dead ? 'morto' : h.activity} · {h.distance} tiles
                </div>
                <Bar className="mt-[2px]" value={h.hp} max={h.maxHp} color="var(--color-heal)" height={3} />
              </div>
              {/* no celular os botões vão para a linha de baixo (o nome e a atividade ficam legíveis) */}
              <div className="flex w-full justify-end gap-1 sm:w-auto">
                <PixelButton
                  className="shrink-0 !border-[6px] px-1 text-[11px]"
                  disabled={h.dead}
                  title={`Ir andando até ${h.name}, onde estiver (para ao chegar perto; não ataca)`}
                  onClick={() => session.goToActor(h.id)}
                  data-testid={`player-goto-${h.id}`}
                >
                  Ir até
                </PixelButton>
                <PixelButton
                  className="shrink-0 !border-[6px] px-1 text-[11px]"
                  title={`Tirar ${h.name} do jogo (o progresso é salvo)`}
                  onClick={() => void session.logoutCharacter(h.id)}
                  data-testid={`player-logout-${h.id}`}
                >
                  Deslogar
                </PixelButton>
                {h.inParty ? (
                  <PixelButton
                    className="shrink-0 !border-[6px] px-1 text-[11px]"
                    onClick={() => session.setPartyPanel(true)}
                    data-testid={`player-party-${h.id}`}
                  >
                    No grupo
                  </PixelButton>
                ) : guildWar ? null : (
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
            </div>
          ))}
        </div>
        {resting.length > 0 && (
          <>
            <h3 className="mb-1 mt-3 text-[13px] text-gold">Numa pausa (voltam sozinhos)</h3>
            <div className="flex flex-col gap-2" data-testid="resting-list">
              {resting.map((r) => (
                <div key={r.id} className="frame-slot flex items-center gap-2 !border-[6px] px-1 py-1 opacity-80" data-testid={`resting-row-${r.id}`}>
                  <div className="relative flex h-[40px] w-[32px] shrink-0 items-end justify-center overflow-hidden">
                    <SpriteFrame sheet={r.vocation} scale={1.2} className="opacity-70" />
                  </div>
                  <div className="min-w-0 flex-1 text-[12px]">
                    <div className="flex min-w-0 items-center gap-1">
                      <b className="min-w-0 truncate text-parchment" title={r.name}>{r.name}</b>
                      <span className="shrink-0 text-gold-light">nv {r.level}</span>
                    </div>
                    <div className="text-[11px] text-muted">volta em ~{r.backInMin} min</div>
                  </div>
                  <PixelButton
                    className="shrink-0 !border-[6px] px-1 text-[11px]"
                    title={`Deslogar ${r.name} de vez (não volta sozinho)`}
                    onClick={() => void session.logoutCharacter(r.id)}
                    data-testid={`resting-logout-${r.id}`}
                  >
                    Deslogar
                  </PixelButton>
                </div>
              ))}
            </div>
          </>
        )}
        {offline.length > 0 && (
          <>
            <h3 className="mb-1 mt-3 text-[13px] text-gold">Fora do jogo</h3>
            <div className="flex flex-col gap-2">
              {offline.map((o) => (
                <div
                  key={o.id}
                  className="frame-slot flex items-center gap-2 !border-[6px] px-1 py-1 opacity-90"
                  data-testid={`offline-row-${o.id}`}
                >
                  <div className="relative flex h-[40px] w-[32px] shrink-0 items-end justify-center overflow-hidden">
                    <SpriteFrame sheet={o.vocation} scale={1.2} className="opacity-60 grayscale" />
                    <span
                      className="absolute right-0 top-0 h-2 w-2 rounded-full bg-muted"
                      title="fora do jogo"
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 items-center gap-1 text-[12px]">
                    <b className="min-w-0 truncate text-parchment" title={o.name}>{o.name}</b>
                    <span className="min-w-0 shrink-[3] truncate text-muted">· {VOCATION_NAME[o.vocation as VocationId] ?? o.vocation}</span>
                    <span className="shrink-0 text-gold-light">nv {o.level}</span>
                  </div>
                  <PixelButton
                    variant="gold"
                    className="shrink-0 !border-[6px] px-1 text-[11px]"
                    title={`Colocar ${o.name} no jogo: ele joga sozinho com a IA`}
                    onClick={() => session.loginCharacter(o.id)}
                    data-testid={`player-login-${o.id}`}
                  >
                    Logar
                  </PixelButton>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
