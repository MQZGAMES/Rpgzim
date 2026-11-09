import { useEffect, useState } from 'react';
import { uiImage } from '../../assets';
import type { SaveSlotSummary } from '../../domain/repositories/SaveRepository';
import { useServices } from '../providers/services';
import { PixelButton, SpriteFrame } from '../../ui/common/primitives';
import { CloudBadge, CloudPanel, useCloud } from './CloudPanel';
import { InstallHint } from './InstallHint';
import { MAX_CHARACTERS } from '../../integration/game-ui-bridge/GameSession';
import { VOCATION_IDS } from '../../domain/value-objects/ids';

/** Sem acento e em minúsculas (o filtro acha "joao" em "João"). */
const fold = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** "09/11 02:57" — vazio quando o save não tem data. */
const fmtSaved = (at: number) =>
  at > 0
    ? new Date(at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';

export function TitleScreen({ onNew, onLoad }: { onNew: () => void; onLoad: (slotId: string) => void }) {
  const { saves, data, audio, seasonReset } = useServices();
  const [seasonSeen, setSeasonSeen] = useState(false);
  const [slots, setSlots] = useState<SaveSlotSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cloudOpen, setCloudOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [vocFilter, setVocFilter] = useState<string>('all');
  const { account } = useCloud();

  const refresh = () =>
    saves
      .list()
      .then(setSlots)
      .catch(() => {
        setSlots([]);
        setError('Não foi possível ler os saves deste navegador.');
      });
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = fold(query.trim());
  const shown = (slots ?? [])
    .filter((s) => (vocFilter === 'all' || s.vocation === vocFilter) && (!q || fold(s.name).includes(q)))
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, 'pt-BR'));

  return (
    <div className="fixed inset-0 overflow-y-auto bg-ink" onPointerDown={() => audio.unlock()}>
      <img src={uiImage('title_bg')} alt="" className="pixelated fixed inset-0 h-full w-full object-cover" draggable={false} />
      <div className="fixed inset-0 bg-gradient-to-b from-black/10 via-black/20 to-black/70" />
      <div className="safe-top safe-bottom safe-x relative mx-auto flex min-h-full max-w-[520px] flex-col items-center justify-between gap-6 py-6">
        <div className="mt-[6vh] text-center">
          <h1 className="font-pixel text-outline text-6xl tracking-wide text-gold-light drop-shadow-[0_4px_0_#33121f] sm:text-7xl">Rpgzim</h1>
          <p className="text-outline mt-2 text-[15px] text-parchment">Crônicas de Pedraluz</p>
        </div>
        {seasonReset > 0 && !seasonSeen && (
          <div className="frame-parchment w-full max-w-[420px] text-[13px] text-[#3a2416]" data-testid="season-notice">
            <b>Nova temporada!</b> Todos os personagens recomeçaram do nível 1 com o equipamento básico, 50 poções de vida
            e 50 de mana. A experiência das criaturas agora é a metade, e os heróis estão mais parecidos com gente.
            <div className="mt-1 text-right">
              <PixelButton className="px-2 text-[12px]" onClick={() => setSeasonSeen(true)}>
                Bora!
              </PixelButton>
            </div>
          </div>
        )}
        <div className="frame-dark w-full max-w-[420px]" data-testid="title-menu">
          {slots === null ? (
            <p className="text-center text-muted">Carregando…</p>
          ) : (
            <>
              {slots.length > 0 && (
                <div className="mb-3">
                  <h2 className="mb-2 text-[13px] text-gold">Continuar aventura</h2>
                  {/* filtros: nome e vocação; a lista vem sempre do maior nível para o menor */}
                  <div className="mb-2 flex gap-2" data-testid="slot-filters">
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Buscar pelo nome"
                      aria-label="Buscar personagem pelo nome"
                      className="frame-slot min-w-0 flex-1 !border-[6px] bg-transparent px-1 py-[2px] text-[13px] text-parchment outline-none placeholder:text-muted"
                      data-testid="slot-search"
                      autoComplete="off"
                    />
                    <select
                      value={vocFilter}
                      onChange={(e) => setVocFilter(e.target.value)}
                      aria-label="Filtrar por vocação"
                      className="frame-slot !border-[6px] bg-[#1b1424] px-1 text-[13px] text-parchment outline-none"
                      data-testid="slot-vocation"
                    >
                      <option value="all">Todas</option>
                      {VOCATION_IDS.map((id) => (
                        <option key={id} value={id}>
                          {data.vocations[id].name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    {shown.length === 0 && <p className="text-center text-[12px] text-muted">Nenhum personagem com esse filtro.</p>}
                    {shown.map((s) => (
                      <div key={s.slotId} className="flex items-center gap-2">
                        <button type="button" onClick={() => onLoad(s.slotId)} className="btn-gold flex flex-1 items-center gap-2 text-left" data-testid={`slot-${s.slotId}`}>
                          <SpriteFrame sheet={data.vocations[s.vocation as keyof typeof data.vocations]?.sprite ?? 'knight'} scale={1} className="-my-2" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px]">{s.name}</span>
                            <span className="block text-[11px] text-parchment">
                              {data.vocations[s.vocation as keyof typeof data.vocations]?.name ?? s.vocation} · Nível {s.level}
                            </span>
                            {s.updatedAt > 0 && (
                              <span className="block text-[10px] text-muted" data-testid={`slot-saved-${s.slotId}`}>
                                Último salvamento: {fmtSaved(s.updatedAt)}
                              </span>
                            )}
                          </span>
                        </button>
                        <PixelButton
                          className="h-12 px-1 text-[11px]"
                          ariaLabel={`Apagar ${s.name}`}
                          onClick={() => {
                            if (window.confirm(`Apagar o personagem ${s.name}? Esta ação não pode ser desfeita.`)) void saves.remove(s.slotId).then(refresh);
                          }}
                        >
                          Apagar
                        </PixelButton>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {slots.length < MAX_CHARACTERS && (
                <PixelButton variant={slots.length ? 'stone' : 'gold'} className="w-full py-1 text-base" onClick={onNew}>
                  Novo personagem
                </PixelButton>
              )}
              {error && <p className="mt-2 text-[12px] text-hp-light">{error}</p>}
              <CloudBadge onOpen={() => setCloudOpen(true)} />
              <InstallHint />
            </>
          )}
        </div>
        <p className="text-outline text-center text-[11px] text-muted">
          RPG de fantasia em pixel art · {account ? `progresso sincronizado com o GitHub (${account.repo})` : 'progresso salvo neste navegador'}
          <br />
          Melhor no celular deitado ou em pé · teclado, mouse e toque
          <br />
          <span className="text-[10px] opacity-70" data-testid="app-version">versão {__APP_VERSION__}</span>
        </p>
      </div>
      {cloudOpen && <CloudPanel onClose={() => setCloudOpen(false)} onChanged={() => void refresh()} />}
    </div>
  );
}
