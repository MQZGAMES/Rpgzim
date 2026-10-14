// Ordem de profundidade. Objetos e criaturas usam a base (pés) em pixels: quem está mais ao sul
// é desenhado por cima. Telhados usam a linha da fachada, então árvores à frente da casa ficam por cima.
export const DEPTH = {
  ground: 0,
  dirt: 1,
  cobble: 2,
  water: 3,
  decor: 4,
  floor: 5,
  walls: 8,
  doors: 9,
  flat: 20,
  ySortBase: 100,
  overlay: 50000,
  text: 60000,
} as const;

export const TILE_PX = 16;

/** Profundidade de algo cuja base está na borda inferior do tile `tileY` (pode ser fracionário). */
export function ySort(tileY: number, bias = 0): number {
  return DEPTH.ySortBase + (tileY + 1) * TILE_PX + bias;
}
