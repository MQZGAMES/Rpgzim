// Toque confiável em botões. O `click` que o navegador gera depois de um toque some quando dois toques
// acontecem em menos de ~300 ms (o Chrome trata como "toque duplo"): tocar no mapa e logo em seguida num
// botão do menu não fazia nada. Aqui o toque age no `pointerup` (sem arrasto: rolar uma lista não aciona o
// botão em que o dedo parou) e o `click` só vale para mouse/teclado ou se o toque não foi tratado.
import { useRef, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent } from 'react';

const SLOP = 12;

export function useTap(handler: (() => void) | undefined, disabled = false) {
  const down = useRef<{ id: number; x: number; y: number } | null>(null);
  const handledAt = useRef(-Infinity);
  if (!handler) return {};
  return {
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.pointerType !== 'mouse') down.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e: ReactPointerEvent) => {
      const d = down.current;
      down.current = null;
      if (disabled || !d || d.id !== e.pointerId || Math.hypot(e.clientX - d.x, e.clientY - d.y) > SLOP) return;
      handledAt.current = e.timeStamp;
      handler();
    },
    onPointerCancel: () => {
      down.current = null;
    },
    // toque já tratado: cancela o click sintético (senão ele cai no painel que acabou de abrir e o fecha)
    onTouchEnd: (e: ReactTouchEvent) => {
      if (e.timeStamp - handledAt.current < 400 && e.cancelable) e.preventDefault();
    },
    onClick: (e: { timeStamp: number }) => {
      // o click que vem logo depois do toque já tratado não repete a ação
      if (disabled || e.timeStamp - handledAt.current < 800) return;
      handler();
    },
  };
}
