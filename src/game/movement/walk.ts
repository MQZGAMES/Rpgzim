// Planejamento de caminhada do ator em execução (`w.player`): usado pelo clique/toque do jogador e
// pela IA dos heróis. Destino bloqueado (água, árvore, muro, alguém parado) vira o tile livre mais próximo.
import type { TilePos } from '../../domain/value-objects/position';
import { isSolid } from '../world/GameMap';
import type { World } from '../simulation/World';
import { message } from '../simulation/World';
import { canEnter, pathTo } from './movement';

/** Custo extra perto de monstros vivos: o caminho contorna as criaturas quando dá (viagem pelo mini mapa). */
function monsterAvoidance(w: World): (x: number, y: number) => number {
  const danger = new Map<number, number>();
  for (const m of w.monsters.values()) {
    if (!m.alive) continue;
    const r = Math.min(3, Math.max(2, m.def.aggroRadius));
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const i = (m.y + dy) * w.map.width + (m.x + dx);
        danger.set(i, Math.max(danger.get(i) ?? 0, (r + 1 - d) * 4));
      }
  }
  return (x, y) => danger.get(y * w.map.width + x) ?? 0;
}

export function planWalk(w: World, x: number, y: number, opts: { quiet?: boolean; maxNodes?: number; avoidMonsters?: boolean } = {}): boolean {
  const p = w.player;
  if (p.dead) return false;
  w.ui.pending = null;
  const maxNodes = opts.maxNodes ?? 12000;
  const solid = isSolid(w.map, x, y);
  const extraCost = opts.avoidMonsters ? monsterAvoidance(w) : undefined;
  let path = pathTo(w, p, { x, y }, false, { stopWithin: solid ? 1 : 0, maxNodes, extraCost });
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
      path = pathTo(w, p, n, false, { maxNodes, extraCost });
      if (path) break;
    }
  }
  if (!path) {
    if (!opts.quiet) message(w, 'Não há caminho até lá.', 'warning');
    return false;
  }
  p.path = path;
  // o destino guardado é o ponto alcançável (o último passo do caminho), não o tile tocado: se alguém cruzar
  // o caminho, o replanejamento mira um lugar possível (tocar num telhado/árvore/água não "trava" mais)
  p.pathGoal = path.length ? { ...path[path.length - 1]! } : { x: p.x, y: p.y };
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
