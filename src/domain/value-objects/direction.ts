// Direções: 8 para movimento, 4 para a orientação visual (padrão dos RPGs top-down de GBA).
export type Facing = 'down' | 'up' | 'left' | 'right';

export interface DirVector {
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
}

export const DIR8: readonly DirVector[] = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: -1, dy: -1 },
];

/** Converte um vetor analógico (joystick/teclado) na direção de 8 vias mais próxima, ou null na zona morta. */
export function vectorToDir(x: number, y: number, deadZone = 0.25): DirVector | null {
  const len = Math.hypot(x, y);
  if (len < deadZone) return null;
  const angle = Math.atan2(y, x); // 0 = direita, PI/2 = baixo
  const octant = Math.round(angle / (Math.PI / 4));
  const table: Record<number, DirVector> = {
    0: { dx: 1, dy: 0 },
    1: { dx: 1, dy: 1 },
    2: { dx: 0, dy: 1 },
    3: { dx: -1, dy: 1 },
    4: { dx: -1, dy: 0 },
    [-4]: { dx: -1, dy: 0 },
    [-3]: { dx: -1, dy: -1 },
    [-2]: { dx: 0, dy: -1 },
    [-1]: { dx: 1, dy: -1 },
  };
  return table[octant] ?? null;
}

/** Orientação visual a partir de um deslocamento. Na diagonal, preserva a orientação atual quando compatível. */
export function facingFrom(dx: number, dy: number, current: Facing): Facing {
  if (dx === 0 && dy === 0) return current;
  if (dx !== 0 && dy !== 0) {
    if ((current === 'left' && dx < 0) || (current === 'right' && dx > 0)) return current;
    if ((current === 'up' && dy < 0) || (current === 'down' && dy > 0)) return current;
    return dx < 0 ? 'left' : 'right';
  }
  if (dx !== 0) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}
