// Seguir o líder e perseguir alvos de forma fluida. Três ideias:
//  1. Seguir pela TRILHA do líder (os tiles que ele pisou): nada de refazer rota a cada passo e nunca anda por onde ele não passou.
//  2. Perseguir com caminho em cache: o próximo passo sai assim que o anterior termina; só replaneja quando o alvo se afasta,
//     o caminho acaba ou algo bloqueia. (Antes cada passo esperava um recálculo de 350 ms e quem tinha Corrida não alcançava.)
//  3. A velocidade usada é a real: nível/vocação, Corrida, lentidão e um "fôlego" para quem ficou para trás, proporcional à
//     velocidade do líder — se o líder é rápido demais, o seguidor simplesmente fica para trás (e alcança quando ele parar).
import type { TilePos } from '../../domain/value-objects/position';
import { chebyshev } from '../../domain/value-objects/position';
import type { MonsterEntity, PlayerEntity } from '../entities/types';
import type { World } from '../simulation/World';
import { actorById, partyOf } from '../social/social';
import { isPz } from '../world/GameMap';
import { canEnter, greedyStepToward, occupant, pathTo, tryStep } from './movement';

/** Current movement speed (tiles/s), including buffs and slows; independent of input method. */
export function actorSpeed(w: World, p: PlayerEntity): number {
  return p.stats.speed * (w.now < p.slowUntil ? p.slowFactor : 1);
}

/** Quem segue o líder (formação seguir/fila) e ficou para trás ganha um fôlego, limitado pela velocidade do líder. */
export function followCatchUp(w: World, p: PlayerEntity): number {
  const party = partyOf(w, p.id);
  if (!party || party.formation === 'free' || party.leaderId === p.id || p.targetId) return 1;
  const leader = actorById(w, party.leaderId);
  if (!leader || leader.dead) return 1;
  const d = chebyshev(leader, p);
  if (d <= 1) return 1;
  // o fôlego cobre a diferença de velocidade do líder (Corrida, nível) e mais um pouco; nunca passa de +60%
  const ratio =
    (leader.stats.speed * (leader.slowUntil > w.now ? leader.slowFactor : 1)) / Math.max(0.5, p.stats.speed);
  const need = Math.max(d > 2 ? 1.2 : 1.1, ratio * 1.12);
  return Math.min(d > 6 ? 1.6 : 1.4, need);
}

/** Próximo tile da trilha do líder que leva ao líder; null se o seguidor não está sobre a trilha. */
function nextCrumb(w: World, p: PlayerEntity): TilePos | null {
  const party = partyOf(w, p.id);
  const leader = party ? actorById(w, party.leaderId) : null;
  if (!party || !leader) return null;
  const trail = party.trail;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < trail.length; i++) {
    const d = chebyshev(trail[i]!, p);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best < 0 || bestD > 1) return null; // fora da trilha (longe, teletransporte, outro andar...)
  // o seguidor já pisa na trilha: o destino é o tile um pouco à frente dele (até 2 adiante, para suavizar curvas)
  for (const i of [best - 2, best - 1]) {
    if (i < 0) continue;
    const t = trail[i]!;
    if ((t.x !== p.x || t.y !== p.y) && chebyshev(t, p) <= 2) return t;
  }
  return best === 0 ? { x: leader.x, y: leader.y } : null;
}

/**
 * Um passo na direção do líder pela trilha dele. Retorna 'arrived' (já está dentro da tolerância), 'moved' ou 'none'
 * (sem trilha utilizável: quem chamou usa a rota normal).
 */
export function trailStep(w: World, p: PlayerEntity, tolerance: number): 'arrived' | 'moved' | 'none' {
  const party = partyOf(w, p.id);
  const leader = party ? actorById(w, party.leaderId) : null;
  if (!party || !leader || leader.id === p.id) return 'none';
  if (chebyshev(leader, p) <= tolerance) return 'arrived';
  const next = nextCrumb(w, p);
  if (!next) return 'none';
  const speed = actorSpeed(w, p) * followCatchUp(w, p);
  const dx = Math.sign(next.x - p.x);
  const dy = Math.sign(next.y - p.y);
  if (tryStep(w, p, dx, dy, speed, false)) return 'moved';
  // diagonal barrada: tenta cada eixo
  if (dx && dy && (tryStep(w, p, dx, 0, speed, false) || tryStep(w, p, 0, dy, speed, false))) return 'moved';
  return 'none';
}

/** Folga da formação: 1 tile vazio entre o seguidor e o líder e entre os seguidores (ninguém fica colado nem trava). */
export const FORMATION_GAP = 2;

/** Nota de um tile para quem segue: perto da distância ideal do líder, longe dos colegas e fora da frente do líder. */
function spotScore(
  t: { x: number; y: number },
  leader: PlayerEntity,
  mates: readonly PlayerEntity[],
): number {
  const dl = chebyshev(t, leader);
  let s = Math.abs(dl - FORMATION_GAP) * 3 + (dl <= 1 ? 6 : 0);
  for (const m of mates) if (chebyshev(m, t) <= 1) s += 2;
  // à frente do líder (para onde ele está andando) é o caminho dele: evita ficar ali
  const ldx = leader.move ? Math.sign(leader.x - leader.move.fromX) : 0;
  const ldy = leader.move ? Math.sign(leader.y - leader.move.fromY) : 0;
  if (ldx || ldy) {
    for (let k = 1; k <= 2; k++) if (t.x === leader.x + ldx * k && t.y === leader.y + ldy * k) s += 5;
  }
  return s;
}

/**
 * Seguidor perto do líder, mas colado nele ou num colega (ou no caminho do líder): dá um passo para um tile melhor
 * (1 tile vazio entre todos). Retorna true se andou.
 */
export function spreadStep(w: World, p: PlayerEntity): boolean {
  const party = partyOf(w, p.id);
  if (!party || party.formation === 'free' || party.leaderId === p.id) return false;
  const leader = actorById(w, party.leaderId);
  if (!leader || leader.dead || chebyshev(leader, p) > FORMATION_GAP + 1) return false;
  // dentro de área protegida os personagens se atravessam: não precisa abrir espaço
  if (isPz(w.map, p.x, p.y)) return false;
  const mates = party.members
    .filter((id) => id !== p.id && id !== leader.id)
    .map((id) => actorById(w, id))
    .filter((a): a is PlayerEntity => !!a && !a.dead);
  const here = spotScore(p, leader, mates);
  if (here === 0) return false;
  let best: { dx: number; dy: number; s: number } | null = null;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const t = { x: p.x + dx, y: p.y + dy };
      if (!canEnter(w, t.x, t.y, false, p.id) || occupant(w, t.x, t.y) !== undefined) continue;
      if (isPz(w.map, t.x, t.y)) continue;
      const s = spotScore(t, leader, mates) + (dx && dy ? 0.1 : 0);
      if (s < here - 0.5 && (!best || s < best.s)) best = { dx, dy, s };
    }
  return !!best && tryStep(w, p, best.dx, best.dy, actorSpeed(w, p), false);
}

/**
 * Perseguição do alvo com caminho em cache. Chame quando o ator não está no meio de um passo. Retorna true se andou.
 * `stop` é a distância em que ele para de se aproximar (1 para corpo a corpo, alcance−1 para armas de distância).
 */
export function chaseStep(w: World, p: PlayerEntity, t: MonsterEntity | PlayerEntity, stop: number): boolean {
  if (isPz(w.map, p.x, p.y)) return false;
  // Equal/lower-level players can be closed on instead of keeping an eternal gap.
  // Only pursuit gets this bounded bonus; haste, equipment and slows still affect real speed.
  const speed = actorSpeed(w, p) * (t.kind === 'player' && t.character.level <= p.character.level ? 1.12 : 1);
  const cache = p.chasePath;
  // (o alvo andou 2 casas já é rota velha: com 3 o perseguidor ia até onde o alvo estava e parecia travado)
  const targetMoved = !cache || chebyshev(cache.goal, t) > 1;
  const exhausted = !cache || cache.path.length === 0;
  // replaneja quando o alvo andou, o caminho acabou ou já passou do tempo (a rota envelhece com a vida em volta)
  if (targetMoved || exhausted || w.now >= p.chaseRecalcAt) {
    p.chaseRecalcAt = w.now + 400;
    const path = pathTo(w, p, { x: t.x, y: t.y }, false, { stopWithin: stop, maxNodes: 2500 });
    p.chasePath = path?.length ? { goal: { x: t.x, y: t.y }, path } : null;
  }
  const route = p.chasePath;
  if (!route?.path.length) return false;
  const next = route.path[0]!;
  const dx = next.x - p.x;
  const dy = next.y - p.y;
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
    p.chasePath = null; // o ator foi deslocado: refaz na próxima
    return false;
  }
  if (tryStep(w, p, dx, dy, speed, false)) {
    route.path.shift();
    return true;
  }
  // bloqueado (alguém no caminho): desvia na hora com um passo que aproxime e refaz a rota no próximo passo
  p.chaseRecalcAt = 0;
  p.chasePath = null;
  return greedyStepToward(w, p, t.x, t.y, speed, false);
}
