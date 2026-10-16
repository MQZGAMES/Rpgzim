// Camada única de entrada do mapa (toque e mouse), por cima do canvas e por baixo do HUD.
// Por que não o input do Phaser: ele usa uma cópia em cache da posição do canvas, que fica velha no iPhone
// (barra de endereço, área segura, app instalado, rotação) — os toques caíam deslocados e, perto do topo,
// "fora do jogo". Aqui a posição é medida a cada toque, igual no celular e no desktop.
// - Toque/clique curto: anda até o ponto, seleciona monstro/personagem ou fala com NPC.
// - Celular: pressionar e arrastar na metade esquerda inferior vira o joystick (invisível até arrastar).
// - Mouse: cursor de "mão" sobre o que dá para clicar.
import { useRef, useState } from 'react';
import { uiImage } from '../../assets';
import { useLocal, useSession } from '../../integration/game-ui-bridge/hooks';

const RADIUS = 46;
/** Movimento (px CSS) que transforma o toque em arrasto (joystick); abaixo disso vale como toque no mapa. */
const TAP_SLOP = 14;
/** Toque mais longo que isso (sem virar joystick) não conta como toque. */
const TAP_MAX_MS = 900;

type Tracked = { id: number; x: number; y: number; t: number; joy: boolean; moved: boolean };

export function MapInputLayer() {
  const session = useSession();
  const touch = useLocal((s) => s.touch);
  const pointers = useRef(new Map<number, Tracked>());
  const joyId = useRef<number | null>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const moveJoy = (cx: number, cy: number, o: { x: number; y: number }) => {
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
  const endJoy = () => {
    joyId.current = null;
    setOrigin(null);
    setKnob({ x: 0, y: 0 });
    session.move(0, 0);
  };

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-[5] touch-none select-none"
      data-testid="map-input"
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        session.audio.unlock();
        const r = e.currentTarget.getBoundingClientRect();
        const lx = e.clientX - r.left;
        const ly = e.clientY - r.top;
        // joystick: só no toque, na metade esquerda inferior e se não houver outro em uso
        const joy = touch && e.pointerType !== 'mouse' && joyId.current === null && lx < r.width * 0.5 && ly > r.height * 0.54;
        pointers.current.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, joy, moved: false });
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ponteiro já liberado */
        }
      }}
      onPointerMove={(e) => {
        const p = pointers.current.get(e.pointerId);
        if (!p) {
          // mouse sem botão pressionado: só o cursor
          if (e.pointerType === 'mouse') e.currentTarget.style.cursor = session.hoverScreen(e.clientX, e.clientY) ? 'pointer' : 'default';
          return;
        }
        if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) >= TAP_SLOP) {
          p.moved = true;
          if (p.joy && joyId.current === null) {
            joyId.current = p.id;
            setOrigin({ x: p.x, y: p.y });
          }
        }
        if (joyId.current === p.id) moveJoy(e.clientX, e.clientY, { x: p.x, y: p.y });
      }}
      onPointerUp={(e) => {
        const p = pointers.current.get(e.pointerId);
        pointers.current.delete(e.pointerId);
        if (!p) return;
        if (joyId.current === p.id) return endJoy();
        if (!p.moved && e.timeStamp - p.t <= TAP_MAX_MS) session.tapScreen(e.clientX, e.clientY);
      }}
      onPointerCancel={(e) => {
        const p = pointers.current.get(e.pointerId);
        pointers.current.delete(e.pointerId);
        if (p && joyId.current === p.id) endJoy();
      }}
      onLostPointerCapture={(e) => {
        // o navegador tirou o ponteiro (ex.: notificação, troca de app): nunca deixa o joystick "preso"
        if (joyId.current === e.pointerId) {
          pointers.current.delete(e.pointerId);
          endJoy();
        }
      }}
    >
      {/* área do joystick (só referência visual/testes; quem trata o toque é a camada inteira) */}
      {touch && <div className="pointer-events-none absolute bottom-0 left-0 h-[46%] w-[50%]" data-testid="joystick-zone" />}
      {origin && (
        <div className="pointer-events-none fixed" style={{ left: origin.x - 64, top: origin.y - 64, width: 128, height: 128 }} data-testid="joystick">
          <img src={uiImage('joystick_base')} alt="" className="pixelated h-full w-full opacity-90" draggable={false} />
          <img src={uiImage('joystick_knob')} alt="" draggable={false} className="pixelated absolute" style={{ width: 56, height: 56, left: 36 + knob.x, top: 36 + knob.y }} />
        </div>
      )}
    </div>
  );
}
