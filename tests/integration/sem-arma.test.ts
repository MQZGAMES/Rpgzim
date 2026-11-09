// Mago sem arma (perdeu numa morte): o dano que a IA estima vem das magias, limitado pela mana que dá para gastar —
// sem poção de mana ele não "mata como se a mana fosse infinita" (ia para o ninho de aranhas e ficava preso curando).
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import type { HeroEntity, MonsterEntity } from '../../src/game/entities/types';
import { heroDpsVs } from '../../src/game/ai/heroThreat';
import { refreshStats } from '../../src/game/progression/progression';
import { asActor } from '../../src/game/simulation/World';
import { makeSim } from '../helpers';

describe('mago sem arma', () => {
  it('sem mana nem poção de mana, a estimativa de dano cai bastante', () => {
    const sim = makeSim('knight', { seed: 2 });
    const w = sim.world;
    const def = GAME_DATA.heroes.mano_cura!;
    const c = createCharacter(GAME_DATA, {
      id: def.slotId,
      name: def.name,
      vocation: def.vocation,
      now: 0,
      position: w.map.playerStart,
    });
    c.level = 18;
    const h = sim.addHero(def, c) as HeroEntity;
    delete h.character.equipment.mainHand;
    asActor(w, h, () => refreshStats(w));
    const spider = [...w.monsters.values()].find((m) => m.def.id === 'widow_spider') as MonsterEntity;
    h.character.mana = h.stats.maxMana;
    h.character.inventory = h.character.inventory.map((st) => (st && /mana/.test(st.itemId) ? null : st));
    h.character.inventory[0] = { itemId: 'potion_mana', count: 20 };
    const stocked = heroDpsVs(w, h, spider);
    h.character.mana = 20;
    h.character.inventory = h.character.inventory.map((st) => (st && /mana/.test(st.itemId) ? null : st));
    const dry = heroDpsVs(w, h, spider);
    expect(dry).toBeLessThan(stocked * 0.75); // (antes da correção as duas estimativas eram iguais)
  });
});
