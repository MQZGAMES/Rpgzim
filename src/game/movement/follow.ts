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
import { pathTo, tryStep } from './movement';

/** Velocidade atual do ator (tiles/s): base + buffs, lentidão e o fôlego de quem segue o líder e ficou para trás. */
export function actorSpeed(w: World, p: PlayerEntity): number {
  return p.stats.speed * followCatchUp(w, p) * (w.now < p.slowUntil ? p.slowFactor : 1);
}

/** Quem segue o líder (formação seguir/fila) e ficou para trás ganha um fôlego, limitado pela velocidade do líder. */
export function followCatchUp(w: World, p: PlayerEntity): number {
  const party = partyOf(w, p.id);
  if (!party || party.formation === 'free' || party.leaderId === p.id || p.targetId) return 1;
  const leader = actorById(w, party.leaderId);
  if (!leader || leader.dead) return 1;
  const d = chebyshev(leader, p);
  if (d <= 2) return 1;
  // o fôlego cobre a diferença de velocidade do líder (Corrida, nível) e mais um pouco; nunca passa de +60%
  const ratio = (leader.stats.speed * (leader.slowUntil > w.now ? leader.slowFactor : 1)) / Math.max(0.5, p.stats.speed);
  const need = Math.max(1.2, ratio * 1.12);
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
  const dx = Math.sign(next.x - p.x);
  const dy = Math.sign(next.y - p.y);
  if (tryStep(w, p, dx, dy, actorSpeed(w, p), false)) return 'moved';
  // diagonal barrada: tenta cada eixo
  if (dx && dy && (tryStep(w, p, dx, 0, actorSpeed(w, p), false) || tryStep(w, p, 0, dy, actorSpeed(w, p), false))) return 'moved';
  return 'none';
}

/**
 * Perseguição do alvo com caminho em cache. Chame quando o ator não está no meio de um passo. Retorna true se andou.
 * `stop` é a distância em que ele para de se aproximar (1 para corpo a corpo, alcance−1 para armas de distância).
 */
export function chaseStep(w: World, p: PlayerEntity, t: MonsterEntity | PlayerEntity, stop: number): boolean {
  if (isPz(w.map, p.x, p.y)) return false;
  const cache = p.chasePath;
  const targetMoved = !cache || chebyshev(cache.goal, t) > 2;
  const exhausted = !cache || cache.path.length === 0;
  // replaneja quando o alvo andou, o caminho acabou ou já passou do tempo (a rota envelhece com a vida em volta)
  if (targetMoved || exhausted || w.now >= p.chaseRecalcAt) {
    p.chaseRecalcAt = w.now + 600;
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
  if (tryStep(w, p, dx, dy, actorSpeed(w, p), false)) {
    route.path.shift();
    return true;
  }
  // bloqueado (alguém no caminho): refaz agora, sem esperar
  p.chaseRecalcAt = 0;
  p.chasePath = null;
  return false;
}
