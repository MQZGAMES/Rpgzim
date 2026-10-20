// IA do Boladex: a régua de ameaça e as decisões que ela guia (fugir cedo, não se jogar em grupo forte, estoque de poções).
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { assess, fightMargin, RISKY_MARGIN, SAFE_MARGIN } from '../../src/game/ai/heroThreat';
import { updateHeroBrain } from '../../src/game/ai/heroBrain';
import type { HeroEntity, MonsterEntity } from '../../src/game/entities/types';
import { makeSim } from '../helpers';

function setup() {
  const sim = makeSim('knight', { seed: 21 });
  const w = sim.world;
  const hero = GAME_DATA.heroes.boladex!;
  const c = createCharacter(GAME_DATA, { id: hero.slotId, name: hero.name, vocation: hero.vocation, now: 0, position: w.map.playerStart });
  const h = sim.addHero(hero, c) as HeroEntity;
  return { sim, w, h };
}
const proto = (id: string, n: number) => Array.from({ length: n }, () => ({ def: GAME_DATA.monsters[id]!, hp: GAME_DATA.monsters[id]!.health }) as unknown as MonsterEntity);

describe('régua de ameaça', () => {
  it('um slime é seguro; um grupo de trolls num herói fraco não é', () => {
    const { w, h } = setup();
    expect(fightMargin(w, h, proto('slime', 2))).toBeGreaterThan(SAFE_MARGIN);
    expect(fightMargin(w, h, proto('troll', 4))).toBeLessThan(RISKY_MARGIN);
  });

  it('poções na mochila aumentam a margem', () => {
    const { w, h } = setup();
    const before = fightMargin(w, h, proto('orc', 3));
    h.character.inventory[10] = { itemId: 'potion_health_great', count: 10 };
    expect(fightMargin(w, h, proto('orc', 3))).toBeGreaterThan(before);
  });

  it('foge ainda com vida quando cercado por criaturas fortes', () => {
    const { w, h } = setup();
    for (const m of w.monsters.values()) {
      m.alive = false;
      m.respawnAt = Infinity;
    }
    const field = [...w.monsters.values()][0]!;
    h.character.health = Math.round(h.stats.maxHealth * 0.6);
    h.brain.mode = 'hunt';
    h.x = field.x;
    h.y = field.y;
    const mons = [...w.monsters.values()].slice(0, 4);
    mons.forEach((m, i) => {
      m.def = GAME_DATA.monsters.troll!;
      m.hp = m.def.health;
      m.alive = true;
      m.x = h.x + (i % 2);
      m.y = h.y + 1 + Math.floor(i / 2);
      m.targetId = h.id;
      m.state = 'attacking';
    });
    expect(assess(w, h).margin).toBeLessThan(RISKY_MARGIN);
    h.brain.nextThinkAt = 0;
    updateHeroBrain(w, h);
    expect(h.brain.mode).toBe('retreat');
  });
});
