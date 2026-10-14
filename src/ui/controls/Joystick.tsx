// Joystick virtual dinâmico e invisível: só aparece quando o polegar pressiona e arrasta na metade
// esquerda inferior da tela. Um toque sem arrasto é repassado ao mapa (andar até o ponto, alvo, NPC).
import { useRef, useState } from 'react';
import { uiImage } from '../../assets';
import { useSession } from '../../integration/game-ui-bridge/hooks';

const RADIUS = 46;
/** Distância (px CSS) de arrasto que ativa o joystick; abaixo disso o toque vale como clique no mapa. */
const DRAG_START = 12;

export function Joystick() {
  const session = useSession();
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const pointer = useRef<{ id: number; x: number; y: number; active: boolean } | null>(null);

  const update = (cx: number, cy: number, o: { x: number; y: number }) => {
    let dx = cx - o.x;
    let dy = cy - o.y;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    setKnob({ x: dx, y: dy });
    session.move(dx / RADIUS, dy / RADIUS);
  };

  const end = () => {
    const was = pointer.current?.active;
    pointer.current = null;
    setOrigin(null);
    setKnob({ x: 0, y: 0 });
    if (was) session.move(0, 0);
  };

  return (
    <div
      className="pointer-events-auto absolute bottom-0 left-0 z-10 h-[46%] w-[50%] touch-none"
      data-testid="joystick-zone"
      onPointerDown={(e) => {
        if (pointer.current) return;
        session.audio.unlock();
        pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY, active: false };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const p = pointer.current;
        if (!p || e.pointerId !== p.id) return;
        if (!p.active) {
          if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_START) return;
          p.active = true;
          setOrigin({ x: p.x, y: p.y });
        }
        update(e.clientX, e.clientY, { x: p.x, y: p.y });
      }}
      onPointerUp={(e) => {
        const p = pointer.current;
        if (!p || e.pointerId !== p.id) return;
        // toque curto sem arrasto: vale como toque no mapa
        if (!p.active) session.tapScreen(e.clientX, e.clientY);
        end();
      }}
      onPointerCancel={(e) => pointer.current?.id === e.pointerId && end()}
    >
      {origin && (
        <div className="pointer-events-none fixed" style={{ left: origin.x - 64, top: origin.y - 64, width: 128, height: 128 }} data-testid="joystick">
          <img src={uiImage('joystick_base')} alt="" className="pixelated h-full w-full opacity-90" draggable={false} />
          <img
            src={uiImage('joystick_knob')}
            alt=""
            draggable={false}
            className="pixelated absolute"
            style={{ width: 56, height: 56, left: 36 + knob.x, top: 36 + knob.y }}
          />
        </div>
      )}
    </div>
  );
}
