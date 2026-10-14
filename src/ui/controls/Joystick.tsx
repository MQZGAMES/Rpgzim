// Joystick virtual dinâmico: aparece onde o polegar toca (metade esquerda inferior da tela).
import { useRef, useState } from 'react';
import { uiImage } from '../../assets';
import { useSession } from '../../integration/game-ui-bridge/hooks';

const RADIUS = 46;

export function Joystick() {
  const session = useSession();
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const pointer = useRef<number | null>(null);

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
    pointer.current = null;
    setOrigin(null);
    setKnob({ x: 0, y: 0 });
    session.move(0, 0);
  };

  return (
    <div
      className="pointer-events-auto absolute bottom-0 left-0 z-10 h-[46%] w-[50%] touch-none"
      data-testid="joystick-zone"
      onPointerDown={(e) => {
        if (pointer.current !== null) return;
        session.audio.unlock();
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        const o = { x: e.clientX, y: e.clientY };
        setOrigin(o);
        setKnob({ x: 0, y: 0 });
      }}
      onPointerMove={(e) => {
        if (e.pointerId !== pointer.current || !origin) return;
        update(e.clientX, e.clientY, origin);
      }}
      onPointerUp={(e) => e.pointerId === pointer.current && end()}
      onPointerCancel={(e) => e.pointerId === pointer.current && end()}
    >
      {origin ? (
        <div className="pointer-events-none fixed" style={{ left: origin.x - 64, top: origin.y - 64, width: 128, height: 128 }}>
          <img src={uiImage('joystick_base')} alt="" className="pixelated h-full w-full opacity-90" draggable={false} />
          <img
            src={uiImage('joystick_knob')}
            alt=""
            draggable={false}
            className="pixelated absolute"
            style={{ width: 56, height: 56, left: 36 + knob.x, top: 36 + knob.y }}
          />
        </div>
      ) : (
        <div className="pointer-events-none absolute bottom-[calc(24px+env(safe-area-inset-bottom))] left-[calc(22px+env(safe-area-inset-left))] h-[104px] w-[104px] opacity-35">
          <img src={uiImage('joystick_base')} alt="" className="pixelated h-full w-full" draggable={false} />
          <img src={uiImage('joystick_knob')} alt="" className="pixelated absolute left-[29px] top-[29px] h-[46px] w-[46px]" draggable={false} />
        </div>
      )}
    </div>
  );
}
