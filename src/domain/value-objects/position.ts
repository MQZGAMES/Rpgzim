// Posições em células do mapa (tiles). A distância de Chebyshev define alcance (diagonais contam como 1).
export interface TilePos {
  x: number;
  y: number;
}

export const chebyshev = (a: TilePos, b: TilePos): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const euclid = (a: TilePos, b: TilePos): number => Math.hypot(a.x - b.x, a.y - b.y);
export const samePos = (a: TilePos, b: TilePos): boolean => a.x === b.x && a.y === b.y;
export const posKey = (x: number, y: number): string => `${x},${y}`;
