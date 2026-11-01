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
import { damagePlayer, hasLineOfSight, monsterSource, setTarget } from '../combat/combat';

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
    tauntUntil: 0,
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
  // Se outro personagem estiver estritamente mais perto, trocar de alvo é melhor do que ignorar
  // a ameaça próxima. Empates mantêm o alvo atual (quem o monstro já está atacando ou quem o atraiu).
  // Durante a isca (taunt) o monstro não troca: foi o conjure que puxou a atenção dele.
  const nearest = nearestActor(w, m, m.def.aggroRadius);
  if (nearest && w.now >= m.tauntUntil && (!p || chebyshev(m, nearest) < chebyshev(m, p))) {
    p = nearest;
    m.targetId = nearest.id;
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
      // corpo a corpo: cerca o alvo — cada criatura mira uma casa livre ao redor dele e contorna árvores, lagos e as
      // outras criaturas pelo caminho calculado (antes ia em linha reta e fazia fila atrás da primeira)
      if (range <= 1) {
        surround(w, m, p);
        break;
      }
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

/**
 * Casa ao redor do alvo para esta criatura: livre (ou a dela mesma), fora de área protegida, sem outra criatura já
 * indo para lá; entre as livres, a mais perto. Sem nenhuma livre, null (fica por perto esperando vaga).
 */
function surroundSlot(w: World, m: MonsterEntity, p: { x: number; y: number; id: string }): { x: number; y: number } | null {
  const claimed = new Set<string>();
  for (const o of w.monsters.values())
    if (o !== m && o.alive && o.targetId === p.id && o.pathGoal) claimed.add(`${o.pathGoal.x},${o.pathGoal.y}`);
  let best: { x: number; y: number; score: number } | null = null;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const x = p.x + dx;
      const y = p.y + dy;
      const mine = x === m.x && y === m.y;
      if (!mine && !canEnter(w, x, y, true, m.id)) continue;
      const score = chebyshev({ x, y }, m) + (claimed.has(`${x},${y}`) ? 8 : 0) + (dx && dy ? 0.3 : 0);
      if (!best || score < best.score) best = { x, y, score };
    }
  return best;
}

/** Aproximação corpo a corpo: caminho até a casa escolhida ao redor do alvo, refeito quando o alvo anda ou trava. */
function surround(w: World, m: MonsterEntity, p: PlayerEntity): void {
  const slot = surroundSlot(w, m, p);
  const goal = slot ?? { x: p.x, y: p.y };
  const changed = !m.pathGoal || m.pathGoal.x !== goal.x || m.pathGoal.y !== goal.y;
  if (!m.path?.length || changed || w.now - m.pathAt > 1200) {
    m.path = pathTo(w, m, goal, true, { stopWithin: slot ? 0 : 2, maxNodes: 3000 });
    m.pathGoal = goal;
    m.pathAt = w.now;
  }
  if (followPath(w, m)) return;
  // sem rota (cercado de outras criaturas, alvo do outro lado de um obstáculo): um passo que aproxime e replaneja logo
  m.pathAt = 0;
  greedyStepToward(w, m, goal.x, goal.y, speedOf(w, m), true);
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
  m.tauntUntil = 0;
  m.path = null;
  m.pathGoal = null;
  m.slowUntil = 0;
  m.nextWanderAt = w.now + 1500;
  // Um alvo que voltou ao respawn não pode continuar recebendo ataques: o ataque é cancelado (sem escolher
  // outro alvo sozinho — o próximo ataque/magia seleciona o inimigo mais próximo).
  for (const a of allActors(w)) {
    if (a.targetId !== m.id) continue;
    asActor(w, a, () => {
      setTarget(w, null);
      a.queuedSpell = null;
    });
  }
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
  m.tauntUntil = 0;
  m.move = null;
  m.slowUntil = 0;
  m.nextAttackAt = w.now + 1000;
  placeOccupant(w, m);
  w.events.emit('entitySpawned', { entityId: m.id });
}
