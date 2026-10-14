// A* em grade com 8 direções (sem cortar quinas de paredes) e linha de visão por Bresenham.
import type { TilePos } from '../../domain/value-objects/position';

export type Passable = (x: number, y: number) => boolean;

const SQRT2 = Math.SQRT2;
const DIRS: readonly [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

/** Movimento diagonal só é permitido se as duas células ortogonais adjacentes forem livres (estáticas). */
export function canStep(staticFree: Passable, x: number, y: number, dx: number, dy: number): boolean {
  if (dx !== 0 && dy !== 0) return staticFree(x + dx, y) && staticFree(x, y + dy);
  return true;
}

class MinHeap {
  private items: { k: number; v: number }[] = [];
  get size() {
    return this.items.length;
  }
  push(v: number, k: number) {
    const a = this.items;
    a.push({ k, v });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p]!.k <= a[i]!.k) break;
      [a[p], a[i]] = [a[i]!, a[p]!];
      i = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l]!.k < a[m]!.k) m = l;
        if (r < a.length && a[r]!.k < a[m]!.k) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return top.v;
  }
}

export interface PathOptions {
  width: number;
  height: number;
  /** Célula livre para entrar (inclui ocupação dinâmica). */
  passable: Passable;
  /** Célula livre de obstáculos estáticos (para a regra das quinas). */
  staticFree: Passable;
  maxNodes?: number;
  /** Custo adicional para entrar numa célula (ex.: evitar portas quando não é o destino). */
  costAt?: (x: number, y: number) => number;
  /** Aceita parar a esta distância (Chebyshev) do destino — útil para alvos ocupados. */
  stopWithin?: number;
}

/** Retorna os passos (sem a origem) até o destino, ou null se não houver caminho. */
export function findPath(from: TilePos, to: TilePos, o: PathOptions): TilePos[] | null {
  const W = o.width;
  const H = o.height;
  if (to.x < 0 || to.y < 0 || to.x >= W || to.y >= H) return null;
  const stop = o.stopWithin ?? 0;
  const done = (x: number, y: number) => Math.max(Math.abs(x - to.x), Math.abs(y - to.y)) <= stop;
  if (done(from.x, from.y)) return [];
  const maxNodes = o.maxNodes ?? 4000;
  const start = from.y * W + from.x;
  const g = new Map<number, number>([[start, 0]]);
  const parent = new Map<number, number>();
  const closed = new Set<number>();
  const heap = new MinHeap();
  const h = (x: number, y: number) => {
    const dx = Math.abs(x - to.x);
    const dy = Math.abs(y - to.y);
    return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
  };
  heap.push(start, h(from.x, from.y));
  let expanded = 0;
  while (heap.size) {
    const cur = heap.pop();
    if (closed.has(cur)) continue;
    closed.add(cur);
    const cx = cur % W;
    const cy = (cur - cx) / W;
    if (done(cx, cy)) {
      const out: TilePos[] = [];
      let n = cur;
      while (n !== start) {
        out.push({ x: n % W, y: Math.floor(n / W) });
        n = parent.get(n)!;
      }
      return out.reverse();
    }
    if (++expanded > maxNodes) return null;
    const gc = g.get(cur)!;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (closed.has(ni)) continue;
      const isGoal = nx === to.x && ny === to.y;
      if (!isGoal && !o.passable(nx, ny)) continue;
      if (isGoal && !o.staticFree(nx, ny) && stop === 0) continue;
      if (!canStep(o.staticFree, cx, cy, dx, dy)) continue;
      const ng = gc + cost + (o.costAt?.(nx, ny) ?? 0);
      if (ng < (g.get(ni) ?? Infinity)) {
        g.set(ni, ng);
        parent.set(ni, cur);
        heap.push(ni, ng + h(nx, ny));
      }
    }
  }
  return null;
}

/** Linha de visão: nenhuma célula intermediária pode bloquear a visão. */
export function lineOfSight(a: TilePos, b: TilePos, blocks: Passable): boolean {
  let x0 = a.x;
  let y0 = a.y;
  const dx = Math.abs(b.x - x0);
  const dy = -Math.abs(b.y - y0);
  const sx = x0 < b.x ? 1 : -1;
  const sy = y0 < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    if (x0 === b.x && y0 === b.y) return true;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
    if (x0 === b.x && y0 === b.y) return true;
    if (blocks(x0, y0)) return false;
  }
}
