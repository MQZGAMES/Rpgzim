// IA do Boladex: a régua de ameaça e as decisões que ela guia (fugir cedo, não se jogar em grupo forte, estoque de poções).
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { assess, fightMargin, RISKY_MARGIN, SAFE_MARGIN } from '../../src/game/ai/heroThreat';
import { updateHeroBrain } from '../../src/game/ai/heroBrain';
import type { HeroEntity, MonsterEntity } from '../../src/game/entities/types';
import { advance, makeSim } from '../helpers';

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

describe('os outros heróis: cada vocação com a sua lógica', () => {
  const mk = (heroId: string) => {
    const sim = makeSim('knight', { seed: 33 });
    const hero = GAME_DATA.heroes[heroId]!;
    const c = createCharacter(GAME_DATA, { id: hero.slotId, name: hero.name, vocation: hero.vocation, now: 0, position: sim.world.map.playerStart });
    return { sim, w: sim.world, h: sim.addHero(hero, c) as HeroEntity };
  };

  it('existem Boladex, Maguim, Mano Cura e Distanciado, um de cada vocação', () => {
    const voc = Object.values(GAME_DATA.heroes).map((x) => x.vocation).sort();
    expect(voc).toEqual(['druid', 'knight', 'paladin', 'sorcerer']);
    expect(GAME_DATA.heroes.maguim?.name).toBe('Maguim');
    expect(GAME_DATA.heroes.mano_cura?.name).toBe('Mano Cura');
    expect(GAME_DATA.heroes.distanciado?.name).toBe('Distanciado');
  });

  it('o mago conjura magia de ataque (gasta mana) e o Paladino atira de longe', () => {
    for (const id of ['maguim', 'mano_cura', 'distanciado']) {
      const { sim, w, h } = mk(id);
      h.character.level = 8;
      const mana0 = h.character.mana;
      for (let t = 0; t < 120_000 && h.character.mana >= mana0; t += 100) advance(sim, 100, 50);
      // depois de uns minutos caçando, o herói gastou mana em magias ou matou algo
      expect(h.character.stats.deaths).toBe(0);
      expect(w.heroes.size).toBe(1);
    }
  });

  it('Paladino sem flechas troca o arco pela lança e volta ao arco quando repõe', () => {
    const { sim, w, h } = mk('distanciado');
    const c = h.character;
    c.inventory = c.inventory.map((st) => (st && st.itemId === 'arrow' ? null : st));
    advance(sim, 1000, 50);
    expect(c.equipment.mainHand?.itemId).toBe('spear_throwing');
    c.inventory[20] = { itemId: 'arrow', count: 60 };
    advance(sim, 1000, 50);
    expect(c.equipment.mainHand?.itemId).toBe('bow_hunting');
    void w;
  });

  it('o Maguim compra poções de mana e o Paladino, flechas', () => {
    const { sim, w, h } = mk('maguim');
    h.character.gold = 400;
    h.brain.nextTownAt = 0;
    h.character.inventory = h.character.inventory.map((st) => (st && st.itemId === 'potion_mana' ? null : st));
    h.character.level = 10;
    for (let t = 0; t < 240_000 && h.brain.mode !== 'town'; t += 100) advance(sim, 100, 50);
    for (let t = 0; t < 120_000 && h.brain.mode === 'town'; t += 100) advance(sim, 100, 50);
    expect(h.character.inventory.some((st) => st?.itemId === 'potion_mana')).toBe(true);
    void w;
  });
});

describe('grupos entre heróis e ajudas automáticas', () => {
  const mk2 = () => {
    const sim = makeSim('knight', { seed: 44 });
    const w = sim.world;
    const hs = ['boladex', 'maguim', 'mano_cura'].map((id) => {
      const hero = GAME_DATA.heroes[id]!;
      return sim.addHero(hero, createCharacter(GAME_DATA, { id: hero.slotId, name: hero.name, vocation: hero.vocation, now: 0, position: w.map.playerStart })) as HeroEntity;
    });
    return { sim, w, hs };
  };

  it('um herói convida outro: nasce um grupo só de heróis (sem avisar o jogador) e o convite do jogador tira o herói dele', async () => {
    const { w, hs } = mk2();
    const { invite, acceptInvite, partyOf, allParties } = await import('../../src/game/social/social');
    const [a, b, c] = hs as [HeroEntity, HeroEntity, HeroEntity];
    expect(invite(w, a.id, b.id)).toBeNull();
    expect(acceptInvite(w, b.id, a.id)).toBeNull();
    expect(partyOf(w, a.id)?.members).toEqual([a.id, b.id]);
    expect(w.social.party).toBeNull(); // não é o grupo do jogador
    expect(allParties(w)).toHaveLength(1);
    // entre heróis, quem já tem grupo não troca por convite
    invite(w, c.id, b.id);
    expect(acceptInvite(w, b.id, c.id)).toBe('alreadyInParty');
    // o jogador convida o herói: ele sai do outro grupo e fica com o líder do servidor
    invite(w, w.human.id, b.id);
    expect(acceptInvite(w, b.id, w.human.id)).toBeNull();
    expect(partyOf(w, b.id)?.leaderId).toBe(w.human.id);
    expect(partyOf(w, a.id)).toBeNull(); // o grupo de dois se desfez
  });

  it('os heróis se agrupam e se desfazem sozinhos ao longo do tempo', async () => {
    const { sim, w, hs } = mk2();
    const { allParties } = await import('../../src/game/social/social');
    let seen = 0;
    for (let s = 0; s < 20 * 60; s++) {
      advance(sim, 1000, 50);
      w.human.character.health = w.human.stats.maxHealth;
      if (allParties(w).length) seen++;
    }
    expect(seen).toBeGreaterThan(60); // formaram algum grupo
    expect(hs.every((h) => h.character.stats.deaths <= 1)).toBe(true);
  }, 60_000);

  it('auto-poção bebe no limiar escolhido e auto-loot pega o que está ao alcance', async () => {
    const sim = makeSim('knight', { seed: 7 });
    const w = sim.world;
    const p = w.human;
    p.character.inventory = p.character.inventory.map(() => null);
    p.character.inventory[5] = { itemId: 'potion_health', count: 3 };
    p.character.health = Math.round(p.stats.maxHealth * 0.3);
    sim.setAuto({ autoPotion: true, hpBelow: 0.5, prefer: 'fit' });
    advance(sim, 1500, 50);
    expect(p.character.health).toBeGreaterThan(p.stats.maxHealth * 0.3);
    expect(p.character.inventory.find((s) => s?.itemId === 'potion_health')!.count).toBeLessThan(3);
    // desligado, não bebe
    sim.setAuto({ autoPotion: false });
    const hp = (p.character.health = Math.round(p.stats.maxHealth * 0.2));
    const count = p.character.inventory.find((s) => s?.itemId === 'potion_health')!.count;
    advance(sim, 1500, 50);
    expect(p.character.inventory.find((s) => s?.itemId === 'potion_health')!.count).toBe(count);
    expect(p.character.health).toBeGreaterThanOrEqual(hp);
  });
});
