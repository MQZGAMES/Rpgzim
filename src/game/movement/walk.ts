// Planejamento de caminhada do ator em execução (`w.player`): usado pelo clique/toque do jogador e
// pela IA dos heróis. Destino bloqueado (água, árvore, muro, alguém parado) vira o tile livre mais próximo.
import type { TilePos } from '../../domain/value-objects/position';
import { isSolid } from '../world/GameMap';
import type { World } from '../simulation/World';
import { message } from '../simulation/World';
import { canEnter, pathTo } from './movement';

export function planWalk(w: World, x: number, y: number, opts: { quiet?: boolean; maxNodes?: number } = {}): boolean {
  const p = w.player;
  if (p.dead) return false;
  w.ui.pending = null;
  const maxNodes = opts.maxNodes ?? 12000;
  const solid = isSolid(w.map, x, y);
  let path = pathTo(w, p, { x, y }, false, { stopWithin: solid ? 1 : 0, maxNodes });
  for (let r = 1, tries = 0; !path && r <= 10 && tries < 8; r++) {
    const ring: { x: number; y: number; d: number }[] = [];
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (canEnter(w, nx, ny, false, p.id)) ring.push({ x: nx, y: ny, d: Math.hypot(dx, dy) + Math.hypot(nx - p.x, ny - p.y) * 0.01 });
      }
    ring.sort((a, b) => a.d - b.d);
    for (const n of ring.slice(0, 3)) {
      tries++;
      path = pathTo(w, p, n, false, { maxNodes });
      if (path) break;
    }
  }
  if (!path) {
    if (!opts.quiet) message(w, 'Não há caminho até lá.', 'warning');
    return false;
  }
  p.path = path;
  p.pathGoal = { x, y };
  return true;
}

/** Tile livre mais próximo de (x, y) — renascer no templo sem ocupar o mesmo tile de outro personagem. */
export function freeCellNear(w: World, x: number, y: number, selfId: string, radius = 4): TilePos {
  for (let r = 0; r <= radius; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (canEnter(w, x + dx, y + dy, false, selfId)) return { x: x + dx, y: y + dy };
      }
  return { x, y };
}
