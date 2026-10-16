// Mini mapa: imagem do mundo (gerada a partir dos próprios tiles), sua posição, o grupo e o destino.
// Tocar num lugar faz o personagem caminhar até lá, contornando árvores, muros, água e, quando dá, monstros.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ASSETS } from '../../assets';
import type { GameSession } from '../../integration/game-ui-bridge/GameSession';
import { useSession } from '../../integration/game-ui-bridge/hooks';
import { Panel, PixelButton } from '../common/primitives';

type MiniState = ReturnType<GameSession['minimapState']>;

const pct = (v: number, total: number) => `${((v + 0.5) / total) * 100}%`;

export function MinimapPanel({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const [st, setSt] = useState<MiniState>(() => session.minimapState());
  const [zoomed, setZoomed] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const down = useRef<{ x: number; y: number } | null>(null);

  // posições ao vivo (fora do snapshot, para não redesenhar o HUD inteiro a cada passo)
  useEffect(() => {
    const id = window.setInterval(() => setSt(session.minimapState()), 250);
    return () => window.clearInterval(id);
  }, [session]);

  // abre centralizado em você
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const inner = el.firstElementChild as HTMLElement | null;
    if (!inner) return;
    const s = session.minimapState();
    el.scrollLeft = ((s.you.x + 0.5) / s.width) * inner.offsetWidth - el.clientWidth / 2;
    el.scrollTop = ((s.you.y + 0.5) / s.height) * inner.offsetHeight - el.clientHeight / 2;
  }, [zoomed, session]);

  const px = ASSETS.minimap.pxPerTile * (zoomed ? 2 : 1);
  return (
    <Panel title="Mini mapa" icon="ui_map" onClose={onClose} wide scroll={false} fill>
      <div className="flex min-h-0 flex-1 flex-col gap-2" data-testid="minimap-panel">
        <div className="flex items-center gap-2 text-[12px] text-muted">
          <span className="flex-1">Toque num lugar para ir até lá{zoomed ? '; arraste para olhar em volta' : ''}.</span>
          <PixelButton className="!border-[6px] px-1 text-[11px]" onClick={() => setZoomed(!zoomed)} data-testid="minimap-zoom">
            {zoomed ? 'Mundo inteiro' : 'Aproximar'}
          </PixelButton>
        </div>
        <div ref={scroller} className="frame-slot relative min-h-0 flex-1 overflow-auto !border-[6px]" style={{ touchAction: 'pan-x pan-y' }}>
          <div
            className="relative cursor-crosshair"
            style={zoomed ? { width: st.width * px, height: st.height * px } : { width: '100%', aspectRatio: `${st.width} / ${st.height}` }}
            // toque (sem arrasto para rolar) ou clique: caminha até o ponto — no pointerup, sem depender do click
            onPointerDown={(e) => {
              down.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerCancel={() => {
              down.current = null;
            }}
            onPointerUp={(e) => {
              const d = down.current;
              down.current = null;
              if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) return;
              const r = e.currentTarget.getBoundingClientRect();
              const x = Math.floor(((e.clientX - r.left) / r.width) * st.width);
              const y = Math.floor(((e.clientY - r.top) / r.height) * st.height);
              if (session.travelTo(x, y)) onClose();
            }}
            data-testid="minimap-image"
          >
            <img src={ASSETS.minimap.url} alt="Mapa do mundo" draggable={false} className="pixelated pointer-events-none absolute inset-0 h-full w-full" />
            {st.regions.map((r) => (
              <span
                key={r.name}
                className="text-outline pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[9px] leading-none text-parchment/90"
                style={{ left: pct(r.x, st.width), top: pct(r.y, st.height) }}
              >
                {r.name}
              </span>
            ))}
            {st.goal && (
              <span
                className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-gold bg-gold/40"
                style={{ left: pct(st.goal.x, st.width), top: pct(st.goal.y, st.height) }}
                title="Destino"
              />
            )}
            {st.party.map((m) => (
              <span
                key={m.id}
                className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                style={{ left: pct(m.x, st.width), top: pct(m.y, st.height) }}
              >
                <span className="h-[9px] w-[9px] rounded-full border-2 border-white bg-[#38a8e0] shadow" />
                <span className="text-outline mt-[1px] text-[9px] leading-none text-[#7fd8ff]">{m.name}</span>
              </span>
            ))}
            <span
              className="pointer-events-none absolute h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full border-2 border-white bg-gold shadow"
              style={{ left: pct(st.you.x, st.width), top: pct(st.you.y, st.height) }}
              data-testid="minimap-you"
              title="Você"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-muted">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-gold" /> você
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#38a8e0]" /> grupo
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rotate-45 border border-gold" /> destino
          </span>
        </div>
      </div>
    </Panel>
  );
}
