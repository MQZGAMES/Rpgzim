import { useEffect, useState } from 'react';
import { uiImage } from '../../assets';
import type { SaveSlotSummary } from '../../domain/repositories/SaveRepository';
import { useServices } from '../providers/services';
import { PixelButton, SpriteFrame } from '../../ui/common/primitives';
import { CloudBadge, CloudPanel, useCloud } from './CloudPanel';
import { isHeroSlot } from '../heroes';
import { InstallHint } from './InstallHint';

export function TitleScreen({ onNew, onLoad }: { onNew: () => void; onLoad: (slotId: string) => void }) {
  const { saves, data, audio } = useServices();
  const [slots, setSlots] = useState<SaveSlotSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cloudOpen, setCloudOpen] = useState(false);
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

  return (
    <div className="fixed inset-0 overflow-y-auto bg-ink" onPointerDown={() => audio.unlock()}>
      <img src={uiImage('title_bg')} alt="" className="pixelated fixed inset-0 h-full w-full object-cover" draggable={false} />
      <div className="fixed inset-0 bg-gradient-to-b from-black/10 via-black/20 to-black/70" />
      <div className="safe-top safe-bottom safe-x relative mx-auto flex min-h-full max-w-[520px] flex-col items-center justify-between gap-6 py-6">
        <div className="mt-[6vh] text-center">
          <h1 className="font-pixel text-outline text-6xl tracking-wide text-gold-light drop-shadow-[0_4px_0_#33121f] sm:text-7xl">Rpgzim</h1>
          <p className="text-outline mt-2 text-[15px] text-parchment">Crônicas de Pedraluz</p>
        </div>
        <div className="frame-dark w-full max-w-[420px]" data-testid="title-menu">
          {slots === null ? (
            <p className="text-center text-muted">Carregando…</p>
          ) : (
            <>
              {slots.length > 0 && (
                <div className="mb-3">
                  <h2 className="mb-2 text-[13px] text-gold">Continuar aventura</h2>
                  <div className="flex flex-col gap-2">
                    {slots.map((s) => (
                      <div key={s.slotId} className="flex items-center gap-2">
                        <button type="button" onClick={() => onLoad(s.slotId)} className="btn-gold flex flex-1 items-center gap-2 text-left" data-testid={`slot-${s.slotId}`}>
                          <SpriteFrame sheet={data.vocations[s.vocation as keyof typeof data.vocations]?.sprite ?? 'knight'} scale={1} className="-my-2" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px]">{s.name}</span>
                            <span className="block text-[11px] text-parchment">
                              {data.vocations[s.vocation as keyof typeof data.vocations]?.name ?? s.vocation} · Nível {s.level}
                              {isHeroSlot(data, s.slotId) && <span className="ml-1 text-heal">· tem vida própria</span>}
                            </span>
                          </span>
                        </button>
                        {!isHeroSlot(data, s.slotId) && (
                        <PixelButton
                          className="h-12 px-1 text-[11px]"
                          ariaLabel={`Apagar ${s.name}`}
                          onClick={() => {
                            if (window.confirm(`Apagar o personagem ${s.name}? Esta ação não pode ser desfeita.`)) void saves.remove(s.slotId).then(refresh);
                          }}
                        >
                          Apagar
                        </PixelButton>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {slots.length < 6 && (
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
        </p>
      </div>
      {cloudOpen && <CloudPanel onClose={() => setCloudOpen(false)} onChanged={() => void refresh()} />}
    </div>
  );
}
