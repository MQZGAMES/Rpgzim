// Fuga de perto: como gente foge de um bolo de criaturas. Em vez de traçar uma rota até a vila (longe, cara e, com
// as criaturas no caminho, muitas vezes impossível), olha as casas em volta e corre para a que fica mais longe de
// quem o persegue, sem passar encostado nelas, sem acordar as que estão paradas e, no empate, na direção do abrigo.
// O herói é mais rápido que as criaturas: alguns trechos assim e elas desistem.
// Dados puros, sem estado: o cérebro (heroBrain) decide QUANDO fugir; aqui fica só o caminho.
import type { TilePos } from '../../domain/value-objects/position';
import type { HeroEntity, MonsterEntity } from '../entities/types';
import { canEnter } from '../movement/movement';
import type { World } from '../simulation/World';
import { isPz, isSolid } from '../world/GameMap';

/** Raio (tiles) da área olhada em volta do herói. */
const RADIUS = 8;
const SIZE = RADIUS * 2 + 1;
const CELLS = SIZE * SIZE;

// memória reaproveitada entre as buscas (uma busca por herói fugindo, a cada ~0,7 s)
const cost = new Float32Array(CELLS);
const danger = new Float32Array(CELLS);
const parent = new Int16Array(CELLS);
const done = new Uint8Array(CELLS);

const cheb = (ax: number, ay: number, bx: number, by: number) =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));

/**
 * Caminho (sem a casa de origem) até a casa mais segura ao alcance, ou null se ficar onde está é o melhor que há
 * (encurralado). `threats` são as criaturas que o perseguem; `toward` é o abrigo (só desempata a direção).
 */
export function escapePath(
  w: World,
  h: HeroEntity,
  threats: readonly MonsterEntity[],
  toward: TilePos | null,
): TilePos[] | null {
  const ox = h.x - RADIUS;
  const oy = h.y - RADIUS;
  const chasing = new Set(threats);
  // criaturas na área: as que o perseguem pesam pelo alcance do golpe; as paradas, pelo raio em que o notariam
  const near: { m: MonsterEntity; chase: boolean }[] = [];
  for (const m of w.monsters.values())
    if (m.alive && cheb(m.x, m.y, h.x, h.y) <= RADIUS + 3) near.push({ m, chase: chasing.has(m) });
  for (let i = 0; i < CELLS; i++) {
    const x = ox + (i % SIZE);
    const y = oy + Math.floor(i / SIZE);
    let d = 0;
    for (const { m, chase } of near) {
      const dist = cheb(x, y, m.x, m.y);
      if (chase) d += dist <= 1 ? 6 : dist === 2 ? 3 : dist === 3 ? 1 : 0;
      else if (m.state !== 'returning' && dist <= Math.min(3, m.def.aggroRadius)) d += 2.5 - dist * 0.5;
    }
    danger[i] = d;
    cost[i] = Infinity;
    done[i] = 0;
    parent[i] = -1;
  }
  const start = RADIUS * SIZE + RADIUS;
  cost[start] = 0;
  // Dijkstra numa janela pequena (289 casas): varredura linear basta e não aloca nada
  for (;;) {
    let cur = -1;
    let best = Infinity;
    for (let i = 0; i < CELLS; i++)
      if (!done[i] && cost[i]! < best) {
        best = cost[i]!;
        cur = i;
      }
    if (cur < 0) break;
    done[cur] = 1;
    const cx = cur % SIZE;
    const cy = Math.floor(cur / SIZE);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
        const ni = ny * SIZE + nx;
        if (done[ni]) continue;
        const wx = ox + nx;
        const wy = oy + ny;
        if (!canEnter(w, wx, wy, false, h.id)) continue;
        // sem cortar quina de parede
        if (dx && dy && (isSolid(w.map, ox + cx + dx, oy + cy) || isSolid(w.map, ox + cx, oy + cy + dy)))
          continue;
        const step = (dx && dy ? Math.SQRT2 : 1) + danger[ni]! * 0.5;
        if (best + step < cost[ni]!) {
          cost[ni] = best + step;
          parent[ni] = cur;
        }
      }
  }
  const safetyAt = (x: number, y: number): number => {
    let s = RADIUS;
    for (const m of threats) s = Math.min(s, cheb(x, y, m.x, m.y));
    return s;
  };
  const value = (i: number): number => {
    const x = ox + (i % SIZE);
    const y = oy + Math.floor(i / SIZE);
    let v = safetyAt(x, y) * 2 - danger[i]! - cost[i]! * 0.35;
    if (toward) v += (cheb(h.x, h.y, toward.x, toward.y) - cheb(x, y, toward.x, toward.y)) * 0.6;
    if (isPz(w.map, x, y)) v += 100; // abrigo ao alcance: as criaturas não entram
    return v;
  };
  let goal = -1;
  let top = value(start) + 0.5;
  for (let i = 0; i < CELLS; i++) {
    if (i === start || cost[i] === Infinity) continue;
    const v = value(i);
    if (v > top) {
      top = v;
      goal = i;
    }
  }
  if (goal < 0) return null;
  const path: TilePos[] = [];
  for (let n = goal; n !== start && n >= 0; n = parent[n]!)
    path.push({ x: ox + (n % SIZE), y: oy + Math.floor(n / SIZE) });
  return path.reverse();
}
