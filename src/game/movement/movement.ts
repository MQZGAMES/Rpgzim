// Movimento em grade de 8 direções com interpolação temporal.
// - Diagonais levam sqrt(2) vezes mais tempo (velocidade normalizada).
// - Passos consecutivos encadeiam no fim exato do anterior (sem engasgos, independente do FPS).
// - A ocupação reserva o tile de destino no início do passo (colisão entre criaturas confiável).
import { facingFrom } from '../../domain/value-objects/direction';
import type { TilePos } from '../../domain/value-objects/position';
import { cellIndex, inBounds, isPz, isSolid } from '../world/GameMap';
import type { Mover, PlayerEntity } from '../entities/types';
import type { World } from '../simulation/World';
import { warnThrottled } from '../simulation/World';
import { isPzLocked, pzLockMs } from '../social/social';
import { canStep, findPath } from './pathfinding';

export function isMoving(m: Mover, now: number): boolean {
  return m.move !== null && now < m.move.start + m.move.duration;
}

/** Libera o estado de movimento concluído. */
export function settle(m: Mover, now: number): void {
  if (m.move && now >= m.move.start + m.move.duration) m.move = null;
}

export function staticFree(w: World, x: number, y: number): boolean {
  return !isSolid(w.map, x, y);
}

export function occupant(w: World, x: number, y: number): string | undefined {
  return w.occupancy.get(cellIndex(w.map, x, y));
}

export function canEnter(w: World, x: number, y: number, forMonster: boolean, selfId?: string): boolean {
  if (!inBounds(w.map, x, y) || isSolid(w.map, x, y)) return false;
  if (forMonster && isPz(w.map, x, y)) return false;
  // PZ lock (atacou/matou outro personagem): não entra em áreas protegidas (lojas, templo, casas)
  if (!forMonster && selfId && isPz(w.map, x, y) && isPzLocked(w, selfId)) return false;
  const occ = occupant(w, x, y);
  if (occ === undefined || occ === selfId) return true;
  // em área protegida (PZ) os personagens passam um por dentro do outro (nada de congestionar templo, lojas e portas)
  if (!forMonster && selfId && isPz(w.map, x, y) && isActor(w, selfId) && isActor(w, occ)) return true;
  // fora dela, personagens nunca ocupam o mesmo tile: o caminho contorna e, se um insistir por
  // `SWAP_AFTER_MS` contra o outro, os dois trocam de lugar (ver `resolveStuck`) — ninguém trava porta nem rua
  return false;
}

/** O tile só está ocupado por outro personagem (jogador/herói): dá para planejar passando por ele e trocar de lugar. */
function blockedOnlyByActor(w: World, x: number, y: number, selfId: string): boolean {
  if (!inBounds(w.map, x, y) || isSolid(w.map, x, y)) return false;
  const occ = occupant(w, x, y);
  return occ !== undefined && occ !== selfId && isActor(w, occ);
}
/** Custo extra de planejar através de um personagem (prefere contornar quando há espaço). */
const ACTOR_PATH_COST = 10;

/** Personagens (jogador e heróis) que podem trocar de lugar entre si. */
function isActor(w: World, id: string | null): id is string {
  if (!id) return false;
  if (id === w.human.id) return true;
  return w.heroes.has(id);
}

/** O mover é um personagem (e não um monstro/NPC)? */
function isPlayerEntity(m: Mover): m is PlayerEntity {
  return 'character' in m;
}

/**
 * Tentativa de atravessar outro personagem. Se a insistência durar `SWAP_AFTER_MS`, os dois trocam
 * de lugar (quem empurrava passa e quem era empurrado recua) — destrava a trilha sem teleportar.
 */
export function resolveStuck(w: World, m: PlayerEntity, blockedBy: string | null): void {
  if (!blockedBy || !isActor(w, blockedBy)) return;
  // insistência = tentativas seguidas contra o mesmo personagem; um intervalo grande sem tentar zera a contagem
  // (passos laterais no meio do caminho não zeram: quem desvia e volta continua "insistindo")
  if (m.stuckWith !== blockedBy || w.now - m.stuckAt > STUCK_FORGET_MS) {
    m.stuckWith = blockedBy;
    m.stuckSince = w.now;
    m.stuckAt = w.now;
    return;
  }
  m.stuckAt = w.now;
  if (w.now - m.stuckSince < SWAP_AFTER_MS) return;
  const other = w.human.id === blockedBy ? w.human : w.heroes.get(blockedBy);
  if (!other) return;
  swapPlaces(w, m, other);
  m.stuckWith = null;
  m.stuckSince = 0;
  other.stuckWith = null;
  other.stuckSince = 0;
}

/** Troca as posições de dois personagens (o bloqueado vai para o lugar de quem bloqueava). */
function swapPlaces(w: World, a: PlayerEntity, b: PlayerEntity): void {
  const ax = a.x;
  const ay = a.y;
  removeOccupant(w, a);
  removeOccupant(w, b);
  a.x = b.x;
  a.y = b.y;
  b.x = ax;
  b.y = ay;
  a.move = null;
  b.move = null;
  placeOccupant(w, a);
  placeOccupant(w, b);
  w.events.emit('actorsSwapped', { firstId: a.id, secondId: b.id });
}

/** Tempo de insistência antes de os personagens trocarem de lugar. */
export const SWAP_AFTER_MS = 5000;
/** Sem tentar passar por este tempo, a insistência é esquecida. */
const STUCK_FORGET_MS = 1500;

export function placeOccupant(w: World, m: Mover): void {
  w.occupancy.set(cellIndex(w.map, m.x, m.y), m.id);
}

export function removeOccupant(w: World, m: Mover): void {
  const i = cellIndex(w.map, m.x, m.y);
  if (w.occupancy.get(i) !== m.id) return;
  w.occupancy.delete(i);
  // outro personagem dividindo o tile (área protegida) volta a ser o ocupante
  const other = [w.human, ...w.heroes.values()].find((a) => a.id !== m.id && a.x === m.x && a.y === m.y);
  if (other) w.occupancy.set(i, other.id);
}

/** Tenta iniciar um passo. `speed` em tiles por segundo. */
export function tryStep(
  w: World,
  m: Mover,
  dx: number,
  dy: number,
  speed: number,
  forMonster: boolean,
): boolean {
  if (isMoving(m, w.now) || (dx === 0 && dy === 0)) return false;
  const nx = m.x + dx;
  const ny = m.y + dy;
  if (!canEnter(w, nx, ny, forMonster, m.id)) {
    if (!forMonster && m.id === w.human.id && isPz(w.map, nx, ny) && isPzLocked(w, m.id)) {
      warnThrottled(
        w,
        'pzlock',
        `PZ lock: você não pode entrar em áreas protegidas por mais ${Math.ceil(pzLockMs(w, m.id) / 1000)} s.`,
        2500,
      );
    }
    // barrado por outro personagem: conta a insistência (troca de lugar depois de alguns segundos)
    if (!forMonster && isPlayerEntity(m)) resolveStuck(w, m, occupant(w, nx, ny) ?? null);
    return false;
  }
  if (!canStep((x, y) => staticFree(w, x, y), m.x, m.y, dx, dy)) return false;
  const duration = (1000 / Math.max(0.5, speed)) * (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1);
  // encadeia no fim do passo anterior se ele terminou há pouco (movimento contínuo)
  const start = w.now - m.moveEnd < 80 ? Math.min(w.now, m.moveEnd) : w.now;
  removeOccupant(w, m);
  m.move = { fromX: m.x, fromY: m.y, start, duration };
  m.moveEnd = start + duration;
  m.x = nx;
  m.y = ny;
  m.facing = facingFrom(dx, dy, m.facing);
  placeOccupant(w, m);
  return true;
}

/** Teleporte (renascer, carregar jogo). */
export function teleport(w: World, m: Mover, x: number, y: number): void {
  removeOccupant(w, m);
  m.x = x;
  m.y = y;
  m.move = null;
  placeOccupant(w, m);
}

/** Posição contínua (em tiles) para renderização no instante `now`. */
export function renderPos(m: Mover, now: number): { x: number; y: number } {
  if (!m.move) return { x: m.x, y: m.y };
  const t = Math.max(0, Math.min(1, (now - m.move.start) / m.move.duration));
  return { x: m.move.fromX + (m.x - m.move.fromX) * t, y: m.move.fromY + (m.y - m.move.fromY) * t };
}

export function pathTo(
  w: World,
  m: Mover,
  goal: TilePos,
  forMonster: boolean,
  opts: { stopWithin?: number; maxNodes?: number; extraCost?: (x: number, y: number) => number } = {},
): TilePos[] | null {
  const extra = opts.extraCost;
  return findPath({ x: m.x, y: m.y }, goal, {
    width: w.map.width,
    height: w.map.height,
    // personagens contam como passagem (com custo): o passo contra eles gera a insistência que vira troca de lugar
    passable: (x, y) =>
      canEnter(w, x, y, forMonster, m.id) || (!forMonster && blockedOnlyByActor(w, x, y, m.id)),
    staticFree: (x, y) => staticFree(w, x, y) && !(forMonster && isPz(w.map, x, y)),
    stopWithin: opts.stopWithin,
    maxNodes: opts.maxNodes,
    costAt: (x, y) =>
      (doorCells(w).has(cellIndex(w.map, x, y)) ? 3 : 0) +
      (extra ? extra(x, y) : 0) +
      (!forMonster && blockedOnlyByActor(w, x, y, m.id) ? ACTOR_PATH_COST : 0),
  });
}

const doorCache = new WeakMap<object, Set<number>>();
/** Células de porta (soleira e batente) — evitadas pelo pathfinding quando não são necessárias. */
function doorCells(w: World): Set<number> {
  let s = doorCache.get(w.map);
  if (!s) {
    s = new Set(w.map.doors.flatMap((d) => [cellIndex(w.map, d.x, d.y), cellIndex(w.map, d.x, d.y - 1)]));
    doorCache.set(w.map, s);
  }
  return s;
}

/** Passo guloso em direção ao alvo (barato); retorna false se nenhum vizinho aproxima. */
export function greedyStepToward(
  w: World,
  m: Mover,
  tx: number,
  ty: number,
  speed: number,
  forMonster: boolean,
): boolean {
  const cur = Math.hypot(tx - m.x, ty - m.y);
  let best: [number, number] | null = null;
  let bestD = cur - 0.01;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = m.x + dx;
      const ny = m.y + dy;
      if (!canEnter(w, nx, ny, forMonster, m.id)) continue;
      if (!canStep((x, y) => staticFree(w, x, y), m.x, m.y, dx, dy)) continue;
      const d = Math.hypot(tx - nx, ty - ny);
      if (d < bestD) {
        bestD = d;
        best = [dx, dy];
      }
    }
  return best ? tryStep(w, m, best[0], best[1], speed, forMonster) : false;
}

/** Passo que aumenta a distância (monstros que mantêm distância). */
export function stepAway(
  w: World,
  m: Mover,
  fx: number,
  fy: number,
  speed: number,
  forMonster: boolean,
): boolean {
  let best: [number, number] | null = null;
  let bestD = Math.hypot(fx - m.x, fy - m.y) + 0.01;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = m.x + dx;
      const ny = m.y + dy;
      if (!canEnter(w, nx, ny, forMonster, m.id)) continue;
      if (!canStep((x, y) => staticFree(w, x, y), m.x, m.y, dx, dy)) continue;
      const d = Math.hypot(fx - nx, fy - ny);
      if (d > bestD) {
        bestD = d;
        best = [dx, dy];
      }
    }
  return best ? tryStep(w, m, best[0], best[1], speed, forMonster) : false;
}
