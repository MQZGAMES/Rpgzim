// Composição do telhado de uma construção (puro, sem engine): escolhe o tile de cada célula do telhado.
// O telhado cobre as colunas da construção, da linha y-1 até a linha y+h-3 (logo acima da fachada).
import type { BuildingDef } from './GameMap';

export function roofRows(b: BuildingDef): { top: number; bottom: number } {
  return { top: b.y - 1, bottom: b.y + b.h - 3 };
}

export function roofTileName(b: BuildingDef, x: number, y: number): string {
  const { top, bottom } = roofRows(b);
  const part = x === b.x ? 'l' : x === b.x + b.w - 1 ? 'r' : 'm';
  let row: string;
  if (y === top) row = 'ridge';
  else if (y === bottom) row = 'eave';
  else if (y === top + 1) row = 'dark';
  else if (y === bottom - 1) row = 'light';
  else row = 'mid';
  return `roof_${b.roof}_${row}_${part}`;
}

/** Em frente à porta ou a uma janela (linha logo abaixo da fachada) ou na soleira: o interior fica visível. */
export function isPeekingInside(b: BuildingDef, x: number, y: number): boolean {
  const frontRow = b.y + b.h;
  if (y !== frontRow && !(y === frontRow - 1 && x === b.doorX)) return false;
  return x === b.doorX || b.windows.includes(x);
}
