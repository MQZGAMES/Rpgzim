// Guardas da cidade: criatura que entra nas ruas da vila (lurada para dentro ou perseguindo alguém) é abatida pelos
// guardas — lanças a cada 0,7 s, três acertos derrubam qualquer uma. Morte pela guarda não dá XP nem loot (não vale
// trazer monstros para a guarda matar). Os guardas são os NPCs marcados com `guard` nos dados.
import { chebyshev } from '../../domain/value-objects/position';
import type { MonsterEntity, NpcEntity } from '../entities/types';
import { damageMonster } from '../combat/combat';
import type { World } from '../simulation/World';

/** Intervalo entre as lanças da guarda. */
export const GUARD_INTERVAL_MS = 700;
/** Fração da vida máxima que cada lança tira. */
export const GUARD_HIT = 0.34;
/** Distância (tiles) até onde a lança aparece saindo do guarda (mais longe, a patrulha da rua resolve). */
const GUARD_SIGHT = 12;

const nextShotAt = new WeakMap<World, number>();
const lastShout = new WeakMap<NpcEntity, number>();

const inCity = (w: World, m: MonsterEntity): boolean => w.map.city[m.y * w.map.width + m.x] === 1;

export function updateCityGuards(w: World): void {
  if (w.now < (nextShotAt.get(w) ?? 0)) return;
  nextShotAt.set(w, w.now + GUARD_INTERVAL_MS);
  const guards = [...w.npcs.values()].filter((n) => n.def.guard);
  if (!guards.length) return;
  for (const m of w.monsters.values()) {
    if (!m.alive || !inCity(w, m)) continue;
    const g = guards.reduce((a, b) => (chebyshev(b, m) < chebyshev(a, m) ? b : a));
    if (chebyshev(g, m) <= GUARD_SIGHT)
      w.events.emit('attack', {
        sourceId: g.id,
        targetId: m.id,
        kind: 'distance',
        element: 'physical',
        projectile: 'proj_spear',
        from: { x: g.x, y: g.y },
        to: { x: m.x, y: m.y },
      });
    if (w.now - (lastShout.get(g) ?? -Infinity) > 20000) {
      lastShout.set(g, w.now);
      w.events.emit('speech', {
        entityId: g.id,
        name: g.def.name,
        text: `${m.def.name} dentro da vila! Guarda, lanças!`,
        position: { x: g.x, y: g.y },
      });
    }
    damageMonster(w, m, Math.ceil(m.def.health * GUARD_HIT), 'physical', g.id, { guard: true });
  }
}
