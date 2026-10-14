// IA dos monstros (máquina de estados): idle -> wandering -> chasing/attacking -> returning -> dead.
// Respeita obstáculos, zonas protegidas, limite de perseguição (leash) e intervalo de ataque.
// Monstros distantes do jogador "dormem" para economizar processamento.
import { chebyshev } from '../../domain/value-objects/position';
import { isPz } from '../world/GameMap';
import type { MonsterEntity } from '../entities/types';
import type { World } from '../simulation/World';
import { nextId } from '../simulation/World';
import { canEnter, greedyStepToward, isMoving, pathTo, placeOccupant, settle, stepAway, tryStep } from '../movement/movement';
import { damagePlayer, hasLineOfSight } from '../combat/combat';

export function createMonster(w: World, monsterId: string, spawnId: string, x: number, y: number): MonsterEntity {
  const def = w.data.monsters[monsterId]!;
  const m: MonsterEntity = {
    id: nextId(w, `mon:${monsterId}:`),
    kind: 'monster',
    def,
    spawnId,
    homeX: x,
    homeY: y,
    x,
    y,
    facing: 'down',
    move: null,
    moveEnd: 0,
    hp: def.health,
    alive: true,
    state: 'idle',
    nextAttackAt: 0,
    nextThinkAt: 0,
    nextWanderAt: w.now + 500 + w.rng.next() * 2500,
    slowUntil: 0,
    slowFactor: 1,
    respawnAt: 0,
    path: null,
    pathAt: 0,
  };
  return m;
}

/** Procura um tile livre dentro do raio da área de surgimento. */
export function findSpawnCell(w: World, cx: number, cy: number, radius: number, avoidPlayer = 0): { x: number; y: number } | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = cx + w.rng.int(-radius, radius);
    const y = cy + w.rng.int(-radius, radius);
    if (!canEnter(w, x, y, true)) continue;
    if (avoidPlayer && chebyshev({ x, y }, w.player) < avoidPlayer) continue;
    return { x, y };
  }
  return canEnter(w, cx, cy, true) ? { x: cx, y: cy } : null;
}

function speedOf(w: World, m: MonsterEntity): number {
  return m.def.speed * (w.now < m.slowUntil ? m.slowFactor : 1);
}

export function updateMonster(w: World, m: MonsterEntity): void {
  const p = w.player;
  if (!m.alive) {
    if (w.now >= m.respawnAt) respawn(w, m);
    return;
  }
  settle(m, w.now);
  const dist = chebyshev(m, p);
  if (dist > w.data.balance.world.aiSleepDistance && m.state !== 'returning') {
    // jogador muito longe: quem perseguia desiste e volta para casa; os demais "dormem"
    if (m.state === 'chasing' || m.state === 'attacking') {
      m.state = 'returning';
      m.path = null;
    } else return;
  }
  const homeDist = chebyshev(m, { x: m.homeX, y: m.homeY });
  const playerTargetable = !p.dead && !isPz(w.map, p.x, p.y);

  switch (m.state) {
    case 'idle':
    case 'wandering': {
      if (playerTargetable && dist <= m.def.aggroRadius) {
        m.state = 'chasing';
        break;
      }
      if (!isMoving(m, w.now) && w.now >= m.nextWanderAt) {
        m.nextWanderAt = w.now + 1500 + w.rng.next() * 3000;
        const dx = w.rng.int(-1, 1);
        const dy = w.rng.int(-1, 1);
        if (Math.abs(m.x + dx - m.homeX) <= m.def.wanderRadius && Math.abs(m.y + dy - m.homeY) <= m.def.wanderRadius) {
          m.state = tryStep(w, m, dx, dy, speedOf(w, m) * 0.6, true) ? 'wandering' : 'idle';
        }
      }
      break;
    }
    case 'chasing':
    case 'attacking': {
      if (!playerTargetable || homeDist > m.def.leashRadius) {
        m.state = 'returning';
        m.path = null;
        break;
      }
      const range = m.def.attack.range;
      const los = hasLineOfSight(w, m, p);
      const inRange = dist <= range && (range <= 1 || los);
      if (inRange) {
        m.state = 'attacking';
        // olha para o jogador
        if (!isMoving(m, w.now)) m.facing = Math.abs(p.x - m.x) >= Math.abs(p.y - m.y) ? (p.x < m.x ? 'left' : 'right') : p.y < m.y ? 'up' : 'down';
        if (w.now >= m.nextAttackAt && !isMoving(m, w.now)) {
          m.nextAttackAt = w.now + m.def.attack.intervalMs;
          const a = m.def.attack;
          w.events.emit('attack', { sourceId: m.id, targetId: p.id, kind: a.kind === 'ranged' ? 'distance' : 'melee', element: a.element, projectile: a.projectile, from: { x: m.x, y: m.y }, to: { x: p.x, y: p.y } });
          damagePlayer(w, w.rng.int(a.min, a.max), a.element, m);
        }
        // atiradores recuam se o jogador encostar
        if (m.def.behavior === 'skirmisher' && dist <= 1 && !isMoving(m, w.now)) stepAway(w, m, p.x, p.y, speedOf(w, m), true);
        break;
      }
      m.state = 'chasing';
      if (isMoving(m, w.now)) break;
      if (!greedyStepToward(w, m, p.x, p.y, speedOf(w, m), true)) {
        if (!m.path || w.now - m.pathAt > 800) {
          m.path = pathTo(w, m, { x: p.x, y: p.y }, true, { stopWithin: 1, maxNodes: 400 });
          m.pathAt = w.now;
        }
        followPath(w, m);
      }
      break;
    }
    case 'returning': {
      if (homeDist <= 1) {
        m.state = 'idle';
        m.hp = m.def.health;
        m.path = null;
        break;
      }
      if (playerTargetable && dist <= 2 && homeDist <= m.def.leashRadius - 2) {
        m.state = 'chasing';
        break;
      }
      if (isMoving(m, w.now)) break;
      if (!greedyStepToward(w, m, m.homeX, m.homeY, speedOf(w, m), true)) {
        if (!m.path || w.now - m.pathAt > 1500) {
          m.path = pathTo(w, m, { x: m.homeX, y: m.homeY }, true, { stopWithin: 1, maxNodes: 800 });
          m.pathAt = w.now;
          if (!m.path) {
            // preso: teletransporta de volta para a área (evita monstros travados para sempre)
            const cell = findSpawnCell(w, m.homeX, m.homeY, 2);
            if (cell) {
              w.occupancy.delete(m.y * w.map.width + m.x);
              m.x = cell.x;
              m.y = cell.y;
              placeOccupant(w, m);
            }
          }
        }
        followPath(w, m);
      }
      break;
    }
    case 'dead':
      break;
  }
}

function followPath(w: World, m: MonsterEntity): void {
  const next = m.path?.[0];
  if (!next) return;
  if (tryStep(w, m, next.x - m.x, next.y - m.y, speedOf(w, m), true)) m.path!.shift();
  else m.path = null;
}

function respawn(w: World, m: MonsterEntity): void {
  const spawn = w.map.spawns.find((s) => s.id === m.spawnId);
  if (!spawn) return;
  const cell = findSpawnCell(w, spawn.x, spawn.y, spawn.radius, 6);
  if (!cell) {
    m.respawnAt = w.now + 2000;
    return;
  }
  m.x = cell.x;
  m.y = cell.y;
  m.homeX = spawn.x;
  m.homeY = spawn.y;
  m.hp = m.def.health;
  m.alive = true;
  m.state = 'idle';
  m.move = null;
  m.slowUntil = 0;
  m.nextAttackAt = w.now + 1000;
  placeOccupant(w, m);
  w.events.emit('entitySpawned', { entityId: m.id });
}
