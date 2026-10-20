// Botão que se repete enquanto fica pressionado: no primeiro toque dispara e depois repete sozinho,
// respeitando a recarga do próprio atalho (magia ou item). Sem isso o jogador teria que ficar
// clicando toda vez que a recarga acabasse.
import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';

/** Intervalo mínimo entre repetições (o atalho só dispara de novo quando a recarga permite). */
const MIN_REPEAT_MS = 120;

export interface HoldRepeatOptions {
  /** Dispara a ação (a primeira vez e a cada repetição). */
  onFire: () => void;
  /** Recarga restante do atalho em ms (0 = pronto). */
  cooldownRemaining: number;
  /** Recarga total do atalho em ms (usada para o intervalo entre repetições). */
  cooldownMs: number;
  /** Repete enquanto o botão estiver pressionado (false = só dispara uma vez). */
  canRepeat?: boolean;
  /** Impede qualquer disparo (botão desabilitado de verdade). */
  disabled?: boolean;
  /** Chamado ao soltar um botão que ficou pressionado (`heldMs` = quanto tempo): cancela o que ficou pendente. */
  onRelease?: (heldMs: number) => void;
}

/** Acima disso o toque conta como "segurar" (e não como um toque rápido). */
export const HOLD_MS = 350;

/**
 * Retorna os manipuladores de ponteiro que repetem a ação enquanto o botão estiver pressionado.
 * A repetição espera a recarga acabar: nada de "erro de magia em recarga" a cada 80 ms.
 */
export function useHoldRepeat({ onFire, cooldownRemaining, cooldownMs, canRepeat = true, disabled = false, onRelease }: HoldRepeatOptions) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holding = useRef(false);
  const pressedAt = useRef(0);
  // os valores mais recentes ficam num ref: o callback do timer não fecha sobre props velho
  const state = useRef({ onFire, cooldownRemaining, cooldownMs, canRepeat, disabled, onRelease });
  state.current = { onFire, cooldownRemaining, cooldownMs, canRepeat, disabled, onRelease };

  const stop = useCallback(() => {
    const wasHolding = holding.current;
    holding.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    // soltou depois de segurar: nada continua disparando por conta própria (ex.: magia enfileirada)
    if (wasHolding) state.current.onRelease?.(performance.now() - pressedAt.current);
  }, []);

  // enquanto o botão está pressionado, reagenda a repetição para quando a recarga acabar
  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    const { cooldownRemaining: cd, cooldownMs: total, canRepeat: repeat, disabled: off } = state.current;
    if (off || !repeat) return;
    const wait = Math.max(MIN_REPEAT_MS, cd > 0 ? cd : total > 0 ? total : MIN_REPEAT_MS);
    timer.current = setTimeout(() => {
      if (!holding.current) return;
      const s = state.current;
      // ainda em recarga (a simulação pode ter atrasado): tenta de novo depois
      if (s.cooldownRemaining > 0) {
        schedule();
        return;
      }
      s.onFire();
      schedule();
    }, wait);
  }, []);

  const start = useCallback(() => {
    if (state.current.disabled) return;
    holding.current = true;
    pressedAt.current = performance.now();
    state.current.onFire();
    schedule();
  }, [schedule]);

  useEffect(() => stop, [stop]);

  const handlers = {
    onPointerDown: (e: ReactPointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // captura o ponteiro: soltar o botão fora dele ainda encerra a repetição
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ponteiro já liberado */
      }
      start();
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    onLostPointerCapture: stop,
    onPointerLeave: (e: ReactPointerEvent) => {
      // sem captura (navegador antigo), sair do botão com o dedo/mouse pressionado encerra a repetição
      if (e.buttons === 0) stop();
    },
  };

  return { handlers, stop };
}
