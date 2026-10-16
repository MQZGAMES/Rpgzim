// IA dos monstros (máquina de estados): idle -> wandering -> chasing/attacking -> returning -> dead.
// Respeita obstáculos, zonas protegidas, limite de perseguição (leash) e intervalo de ataque.
// Escolhem o alvo entre todos os personagens-jogadores (humano e heróis) e o perseguem até perdê-lo.
// Monstros distantes de qualquer personagem "dormem" para economizar processamento.
import { chebyshev } from '../../domain/value-objects/position';
import { isPz } from '../world/GameMap';
import type { MonsterEntity, PlayerEntity } from '../entities/types';
import type { World } from '../simulation/World';
import { allActors, asActor, nextId } from '../simulation/World';
import { canEnter, greedyStepToward, isMoving, pathTo, placeOccupant, removeOccupant, settle, stepAway, tryStep } from '../movement/movement';
import { damagePlayer, hasLineOfSight, monsterSource } from '../combat/combat';

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
    pathGoal: null,
    targetId: null,
  };
  return m;
}

/** Procura um tile livre dentro do raio da área de surgimento. */
export function findSpawnCell(w: World, cx: number, cy: number, radius: number, avoidPlayer = 0): { x: number; y: number } | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = cx + w.rng.int(-radius, radius);
    const y = cy + w.rng.int(-radius, radius);
    if (!canEnter(w, x, y, true)) continue;
    if (avoidPlayer && allActors(w).some((a) => chebyshev({ x, y }, a) < avoidPlayer)) continue;
    return { x, y };
  }
  return canEnter(w, cx, cy, true) ? { x: cx, y: cy } : null;
}

function speedOf(w: World, m: MonsterEntity): number {
  return m.def.speed * (w.now < m.slowUntil ? m.slowFactor : 1);
}

const targetable = (w: World, a: PlayerEntity) => !a.dead && !isPz(w.map, a.x, a.y);

/** Personagem atacável mais próximo dentro do raio (ou null). */
function nearestActor(w: World, m: MonsterEntity, radius: number): PlayerEntity | null {
  let best: PlayerEntity | null = null;
  let bestD = Infinity;
  for (const a of allActors(w)) {
    if (!targetable(w, a)) continue;
    const d = chebyshev(m, a);
    if (d <= radius && d < bestD) {
      best = a;
      bestD = d;
    }
  }
  return best;
}

function actorById(w: World, id: string | null): PlayerEntity | null {
  if (!id) return null;
  if (w.human.id === id) return w.human;
  return w.heroes.get(id) ?? null;
}

export function updateMonster(w: World, m: MonsterEntity): void {
  if (!m.alive) {
    if (w.now >= m.respawnAt) respawn(w, m);
    return;
  }
  settle(m, w.now);
  const sleepDist = Math.min(...allActors(w).map((a) => chebyshev(m, a)));
  if (sleepDist > w.data.balance.world.aiSleepDistance && m.state !== 'returning') {
    // ninguém por perto: quem perseguia desiste e volta para casa; os demais "dormem"
    if (m.state === 'chasing' || m.state === 'attacking') {
      m.state = 'returning';
      m.path = null;
      m.targetId = null;
    } else return;
  }
  // alvo atual (ou o mais próximo para quem está ocioso)
  let p = actorById(w, m.targetId);
  if (m.state === 'chasing' || m.state === 'attacking') {
    if (!p || !targetable(w, p)) {
      p = nearestActor(w, m, m.def.aggroRadius);
      m.targetId = p?.id ?? null;
    }
  } else if (m.state === 'idle' || m.state === 'wandering') {
    p = nearestActor(w, m, m.def.aggroRadius);
    m.targetId = p?.id ?? null;
  } else if (m.state === 'returning') {
    p = nearestActor(w, m, 2);
  }
  const homeDist = chebyshev(m, { x: m.homeX, y: m.homeY });
  if (!p) {
    if (m.state === 'chasing' || m.state === 'attacking') {
      m.state = 'returning';
      m.path = null;
      m.targetId = null;
    }
    if (m.state !== 'returning') {
      wander(w, m);
      return;
    }
  }
  const dist = p ? chebyshev(m, p) : Infinity;
  const playerTargetable = !!p && targetable(w, p);

  switch (m.state) {
    case 'idle':
    case 'wandering': {
      if (playerTargetable && dist <= m.def.aggroRadius) {
        m.state = 'chasing';
        break;
      }
      wander(w, m);
      break;
    }
    case 'chasing':
    case 'attacking': {
      if (!p || !playerTargetable || homeDist > m.def.leashRadius) {
        m.state = 'returning';
        m.path = null;
        m.targetId = null;
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
          const target = p;
          // o dano é resolvido no contexto do alvo (mensagens/janelas dele, não do jogador humano)
          asActor(w, target, () => damagePlayer(w, w.rng.int(a.min, a.max), a.element, monsterSource(m)));
        }
        // atiradores recuam se o jogador encostar
        if (m.def.behavior === 'skirmisher' && dist <= 1 && !isMoving(m, w.now)) stepAway(w, m, p.x, p.y, speedOf(w, m), true);
        break;
      }
      m.state = 'chasing';
      if (isMoving(m, w.now)) break;
      // caminho livre e perto: passo direto; com obstáculo no meio (árvore, pedra, casa, cerca), contorna pelo A*
      if (los && dist <= 4 && greedyStepToward(w, m, p.x, p.y, speedOf(w, m), true)) {
        m.path = null;
        break;
      }
      const stop = range <= 1 ? 1 : Math.max(1, range - 1);
      const goalMoved = !m.pathGoal || chebyshev(m.pathGoal, p) > 1;
      if (!m.path?.length || goalMoved || w.now - m.pathAt > 1500) {
        m.path = pathTo(w, m, { x: p.x, y: p.y }, true, { stopWithin: stop, maxNodes: 3000 });
        m.pathGoal = { x: p.x, y: p.y };
        m.pathAt = w.now;
      }
      if (!followPath(w, m)) {
        // bloqueado (outro monstro no caminho): tenta um passo direto e replaneja logo
        greedyStepToward(w, m, p.x, p.y, speedOf(w, m), true);
        m.pathAt = 0;
      }
      break;
    }
    case 'returning': {
      // desistiu (alvo fugiu além do limite, entrou numa construção ou morreu): volta por teleporte
      // para o ponto de origem e com a vida cheia — puxar o monstro para longe não dá vantagem
      sendHome(w, m);
      break;
    }
    case 'dead':
      break;
  }
}

function wander(w: World, m: MonsterEntity): void {
  if (isMoving(m, w.now) || w.now < m.nextWanderAt) return;
  m.nextWanderAt = w.now + 1500 + w.rng.next() * 3000;
  const dx = w.rng.int(-1, 1);
  const dy = w.rng.int(-1, 1);
  if (Math.abs(m.x + dx - m.homeX) <= m.def.wanderRadius && Math.abs(m.y + dy - m.homeY) <= m.def.wanderRadius) {
    m.state = tryStep(w, m, dx, dy, speedOf(w, m) * 0.6, true) ? 'wandering' : 'idle';
  }
}

function followPath(w: World, m: MonsterEntity): boolean {
  const next = m.path?.[0];
  if (!next) return false;
  if (tryStep(w, m, next.x - m.x, next.y - m.y, speedOf(w, m), true)) {
    m.path!.shift();
    return true;
  }
  m.path = null;
  return false;
}

/** Teleporta o monstro de volta ao ponto de origem, com a vida cheia e sem alvo. */
export function sendHome(w: World, m: MonsterEntity): void {
  const from = { x: m.x, y: m.y };
  const cell = findSpawnCell(w, m.homeX, m.homeY, 2, 3) ?? (canEnter(w, m.homeX, m.homeY, true) ? { x: m.homeX, y: m.homeY } : null);
  if (cell && (cell.x !== m.x || cell.y !== m.y)) {
    removeOccupant(w, m);
    m.x = cell.x;
    m.y = cell.y;
    placeOccupant(w, m);
  }
  m.move = null;
  m.hp = m.def.health;
  m.state = 'idle';
  m.targetId = null;
  m.path = null;
  m.pathGoal = null;
  m.slowUntil = 0;
  m.nextWanderAt = w.now + 1500;
  w.events.emit('monsterReturned', { entityId: m.id, from, to: { x: m.x, y: m.y } });
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
  m.targetId = null;
  m.move = null;
  m.slowUntil = 0;
  m.nextAttackAt = w.now + 1000;
  placeOccupant(w, m);
  w.events.emit('entitySpawned', { entityId: m.id });
}
