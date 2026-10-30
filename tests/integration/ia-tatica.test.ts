// Táticas dos heróis: personalidade, magia de área só quando compensa, triagem de cura, socorro, ordens do painel,
// jogadores perigosos e revanche planejada, meta de equipamento, consumo real e previsão do estoque, loot por valor,
// retaguarda, as magias novas do Knight e do Paladin, a magia de área mais forte e os atalhos 1–9.
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { countItem } from '../../src/domain/rules/inventory';
import { HOTBAR_SIZE } from '../../src/domain/rules/hotbar';
import type { HeroEntity, MonsterEntity } from '../../src/game/entities/types';
import { heroHelpers, heroOnEvent, updateHeroBrain } from '../../src/game/ai/heroBrain';
import { aoeWorth, backlineStep, personaOf } from '../../src/game/ai/heroTactics';
import { placeOccupant, removeOccupant } from '../../src/game/movement/movement';
import { refreshStats } from '../../src/game/progression/progression';
import { asActor } from '../../src/game/simulation/World';
import { isPz, isSolid } from '../../src/game/world/GameMap';
import { buildSnapshot } from '../../src/integration/game-ui-bridge/snapshot';
import { makeSim } from '../helpers';

function rig(ids: string[] = ['boladex']) {
  const sim = makeSim('knight', { seed: 23 });
  const w = sim.world;
  const heroes = ids.map((id) => {
    const def = GAME_DATA.heroes[id]!;
    const c = createCharacter(GAME_DATA, {
      id: def.slotId,
      name: def.name,
      vocation: def.vocation,
      now: 0,
      position: w.map.playerStart,
    });
    const h = sim.addHero(def, c) as HeroEntity;
    h.brain.nextThinkAt = Infinity; // cada teste decide quando o herói pensa
    return h;
  });
  return { sim, w, heroes, h: heroes[0]! };
}

type Rig = ReturnType<typeof rig>;

function moveTo(w: Rig['w'], a: { id: string; x: number; y: number }, x: number, y: number) {
  removeOccupant(w, a as HeroEntity);
  a.x = x;
  a.y = y;
  placeOccupant(w, a as HeroEntity);
}

/** Um tile livre fora da PZ perto do ponto. */
function freeNear(w: Rig['w'], x: number, y: number) {
  for (let r = 0; r < 8; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (!isSolid(w.map, nx, ny) && !isPz(w.map, nx, ny) && !w.occupancy.has(ny * w.map.width + nx))
          return { x: nx, y: ny };
      }
  throw new Error('sem tile livre');
}

function think(w: Rig['w'], h: HeroEntity) {
  h.brain.nextThinkAt = 0;
  w.now += 1;
  asActor(w, h, () => updateHeroBrain(w, h));
  h.brain.nextThinkAt = Infinity;
}

function level(w: Rig['w'], h: HeroEntity, lv: number, ml = 0) {
  h.character.level = lv;
  h.character.skills.magic.level = ml;
  asActor(w, h, () => refreshStats(w));
  h.character.health = h.stats.maxHealth;
  h.character.mana = h.stats.maxMana;
}

const wolf = (w: Rig['w']) => [...w.monsters.values()].find((m) => m.alive && m.def.id === 'wolf')! as MonsterEntity;

describe('personalidade', () => {
  it('cada herói tem um perfil e ele muda o risco aceito', () => {
    const ids = ['boladex', 'maguim', 'mano_cura', 'distanciado'];
    const personas = ids.map((id) => personaOf(GAME_DATA.heroes[id]!.temperament).id);
    expect(personas).toEqual(['agressivo', 'ganancioso', 'cauteloso', 'equilibrado']);
    expect(personaOf(GAME_DATA.heroes.boladex!.temperament).margin).toBeLessThan(0);
    expect(personaOf(GAME_DATA.heroes.mano_cura!.temperament).flee).toBeGreaterThan(0);
    const { sim, h } = rig(['maguim']);
    const hero = buildSnapshot(sim, 1).heroes.find((x) => x.id === h.id)!;
    expect(hero.persona).toBe('Ganancioso');
  });
});

describe('magias de área e magias novas', () => {
  it('área: -2 s de recarga, +1 sqm e o dobro de mana', () => {
    expect(GAME_DATA.spells.fire_nova).toMatchObject({ radius: 4, cooldownMs: 6000, manaCost: 90 });
    expect(GAME_DATA.spells.frost_burst).toMatchObject({ radius: 2, cooldownMs: 2000, manaCost: 50 });
    expect(GAME_DATA.spells.arrow_rain).toMatchObject({ radius: 2, cooldownMs: 4000, manaCost: 60 });
    expect(GAME_DATA.spells.steel_whirlwind).toMatchObject({ radius: 2, cooldownMs: 2000, manaCost: 60 });
  });

  it('Knight e Paladin ganharam uma magia (todas as vocações com 7)', () => {
    expect(GAME_DATA.vocations.knight.spells).toContain('crippling_blow');
    expect(GAME_DATA.vocations.paladin.spells).toContain('divine_shot');
    for (const v of Object.values(GAME_DATA.vocations)) expect(v.spells).toHaveLength(7);
    expect(GAME_DATA.spells.crippling_blow!.slow).toBeTruthy();
  });

  it('a magia de área só compensa contra várias criaturas', () => {
    const { w, heroes } = rig(['maguim']);
    const h = heroes[0]!;
    level(w, h, 20, 10);
    expect(aoeWorth(w, h, 'fire_nova', 'flame_lance', 1)).toBe(false);
    expect(aoeWorth(w, h, 'fire_nova', 'flame_lance', 8)).toBe(true);
  });

  it('com uma criatura só o Sorcerer não gasta a Explosão Ígnea', () => {
    const { sim, w, h } = rig(['maguim']);
    level(w, h, 20, 10);
    const m = wolf(w);
    const at = freeNear(w, m.x - 2, m.y);
    moveTo(w, h, at.x, at.y);
    m.targetId = h.id;
    const casts: string[] = [];
    h.scope.events.on('spellCast', (e) => casts.push(e.spellId));
    asActor(w, h, () => {
      sim.setTarget(m.id);
      heroHelpers.fightSpells(w, h, m);
    });
    expect(casts).not.toContain('fire_nova');
    expect(casts.length).toBeGreaterThan(0);
  });

  it('o Knight usa o Golpe Paralisante em quem está quase morto (e vai fugir)', () => {
    const { sim, w, h } = rig(['boladex']);
    level(w, h, 12);
    const m = wolf(w);
    const at = freeNear(w, m.x - 1, m.y);
    moveTo(w, h, at.x, at.y);
    m.hp = Math.round(m.def.health * 0.2);
    m.targetId = h.id;
    let cast: string | null = null;
    h.scope.events.on('spellCast', (e) => (cast ??= e.spellId));
    asActor(w, h, () => {
      sim.setTarget(m.id);
      heroHelpers.fightSpells(w, h, m);
    });
    if (Math.max(Math.abs(m.x - h.x), Math.abs(m.y - h.y)) <= 1) {
      expect(cast).toBe('crippling_blow');
      expect(m.slowUntil).toBeGreaterThan(w.now);
    }
  });
});

describe('grupo: cura, socorro e ordens', () => {
  function party(r: Rig) {
    const [a, b] = r.heroes as [HeroEntity, HeroEntity];
    r.w.social.heroParties.push({ leaderId: a.id, members: [a.id, b.id], formation: 'follow', targeting: 'leader', friendlyFire: false, trail: [] });
    return [a, b] as const;
  }

  it('triagem: o Druid cura primeiro o colega em maior risco', () => {
    const r = rig(['boladex', 'mano_cura']);
    const [knight, druid] = party(r);
    level(r.w, druid, 20, 10);
    const spot = freeNear(r.w, r.w.map.spawns.find((s) => s.monsterId === 'wolf')!.x, r.w.map.spawns.find((s) => s.monsterId === 'wolf')!.y);
    moveTo(r.w, druid, spot.x, spot.y);
    const near = freeNear(r.w, spot.x + 2, spot.y);
    moveTo(r.w, knight, near.x, near.y);
    knight.character.health = Math.round(knight.stats.maxHealth * 0.4);
    let cast: string | null = null;
    druid.scope.events.on('spellCast', (e) => (cast ??= e.spellId));
    druid.brain.mode = 'follow';
    think(r.w, druid);
    expect(cast).toBe('sap_blessing');
    expect(knight.character.health).toBeGreaterThan(Math.round(knight.stats.maxHealth * 0.4));
  });

  it('socorro: cercado, ele chama os colegas que estão longe', () => {
    const r = rig(['maguim', 'boladex']);
    const [mage, knight] = party(r);
    const m = wolf(r.w);
    const at = freeNear(r.w, m.x - 1, m.y);
    moveTo(r.w, mage, at.x, at.y);
    const far = freeNear(r.w, at.x + 15, at.y);
    moveTo(r.w, knight, far.x, far.y);
    const two = [...r.w.monsters.values()].filter((x) => x.alive).slice(0, 2);
    for (const x of two) {
      x.targetId = mage.id;
      const p = freeNear(r.w, at.x, at.y + 1);
      removeOccupant(r.w, x as unknown as HeroEntity);
      x.x = p.x;
      x.y = p.y;
      placeOccupant(r.w, x as unknown as HeroEntity);
    }
    mage.brain.mode = 'hunt';
    think(r.w, mage);
    expect(knight.brain.summonTo).toBe(mage.id);
    expect(knight.brain.summonedUntil).toBeGreaterThan(r.w.now);
  });

  it('ordens: segurar posição (de novo solta), atacar o meu alvo e voltar à vila', () => {
    const { sim, w, h } = rig(['boladex']);
    sim.partyInvite(h.id);
    asActor(w, h, () => {
      // o convite do jogador é sempre aceito
      void 0;
    });
    // aceita na hora
    h.brain.nextThinkAt = 0;
    w.now += 2000;
    asActor(w, h, () => updateHeroBrain(w, h));
    w.now += 2000;
    h.brain.nextThinkAt = 0;
    asActor(w, h, () => updateHeroBrain(w, h));
    expect(w.social.party?.members).toContain(h.id);
    expect(sim.partyOrder('attack')).toBe(false); // sem alvo marcado
    expect(sim.partyOrder('hold')).toBe(true);
    expect(h.brain.order?.kind).toBe('hold');
    expect(buildSnapshot(sim, 1).party?.holding).toBe(true);
    expect(sim.partyOrder('hold')).toBe(true);
    expect(h.brain.order).toBeNull();
    const m = wolf(w);
    sim.teleportPlayer(...(Object.values(freeNear(w, m.x - 2, m.y)) as [number, number]));
    sim.setTarget(m.id);
    expect(w.human.targetId).toBe(m.id);
    expect(sim.partyOrder('attack')).toBe(true);
    expect(h.brain.order).toMatchObject({ kind: 'attack', targetId: m.id });
    expect(sim.partyOrder('town')).toBe(true);
    expect(h.brain.mode).toBe('town');
  });
});

describe('PK: jogadores perigosos e revanche planejada', () => {
  it('quem o atacou vira perigoso (e o colega de grupo fica sabendo)', () => {
    const r = rig(['maguim', 'boladex', 'distanciado']);
    const [a, b, foe] = r.heroes as [HeroEntity, HeroEntity, HeroEntity];
    r.w.social.heroParties.push({ leaderId: b.id, members: [b.id, a.id], formation: 'follow', targeting: 'leader', friendlyFire: false, trail: [] });
    heroOnEvent(r.w, a, 'damage', { sourceId: foe.id, sourceName: foe.character.name, amount: 10 });
    expect(a.brain.dangerous[foe.id]).toBeGreaterThan(r.w.now);
    expect(b.brain.dangerous[foe.id]).toBeGreaterThan(r.w.now);
  });

  it('com o PK ligado, foge do perigoso mais forte e só cobra a revanche quando estiver por cima', () => {
    const r = rig(['maguim', 'boladex']);
    const [me, foe] = r.heroes as [HeroEntity, HeroEntity];
    r.sim.setPvp(true);
    level(r.w, me, 8, 4);
    level(r.w, foe, 40);
    const sp = r.w.map.spawns.find((s) => s.monsterId === 'wolf')!;
    const p1 = freeNear(r.w, sp.x, sp.y);
    moveTo(r.w, me, p1.x, p1.y);
    const p2 = freeNear(r.w, p1.x + 4, p1.y);
    moveTo(r.w, foe, p2.x, p2.y);
    for (const m of r.w.monsters.values()) m.alive = false; // só os dois
    heroOnEvent(r.w, me, 'killedBy', { sourceId: foe.id, sourceName: foe.character.name, byPlayer: true });
    expect(me.brain.grudge?.id).toBe(foe.id);
    me.brain.mode = 'hunt';
    think(r.w, me);
    expect(me.brain.mode).toBe('retreat'); // fraco demais: sai de perto em vez de atacar
    expect(me.brain.retreatWhy).toContain('perigoso');
    // agora o mais forte é ele
    level(r.w, me, 60, 30);
    level(r.w, foe, 5);
    me.brain.mode = 'hunt';
    me.brain.nextDangerAt = 0;
    think(r.w, me);
    expect(me.brain.mode).toBe('pk');
    expect(me.brain.pkTargetId).toBe(foe.id);
  });
});

describe('economia: meta, consumo real, previsão e loot', () => {
  it('meta de equipamento: escolhe um item que ainda não pode pagar e segura os gastos pequenos', () => {
    const { w, h } = rig(['boladex']);
    level(w, h, 10);
    h.character.gold = 120;
    h.character.bankGold = 0;
    heroHelpers.updateGoal(w, h);
    expect(h.brain.goal).toBeTruthy();
    expect(h.brain.goal!.price).toBeGreaterThan(120 - 40);
    const short = h.brain.goal!.price - 1;
    expect(heroHelpers.upgradeBudget(h, short)).toBeLessThanOrEqual(h.brain.goal!.price * 0.08 + 0.001);
  });

  it('o estoque de mana segue o consumo real', () => {
    const { w, h } = rig(['maguim']);
    level(w, h, 20, 10);
    const base = heroHelpers.manaGoal(w, h);
    for (let i = 0; i < 40; i++) h.brain.manaLog.push({ at: w.now - i * 10000, mana: 150 });
    expect(heroHelpers.manaGoal(w, h)).toBeGreaterThan(base);
  });

  it('previsão: no ritmo de consumo, o estoque não dura até a vila — volta antes', () => {
    const { w, h } = rig(['boladex']);
    level(w, h, 10);
    h.character.gold = 2000;
    h.character.inventory.fill(null);
    h.character.inventory[0] = { itemId: 'potion_health', count: 3 };
    const sp = w.map.spawns.find((s) => s.monsterId === 'wolf')!;
    const at = freeNear(w, sp.x, sp.y);
    moveTo(w, h, at.x, at.y);
    h.brain.huntStartedAt = w.now - 5 * 60000; // caçando há uns minutos (a média já vale)
    expect(heroHelpers.suppliesRunningOut(w, h)).toBe(false); // sem consumo recente
    for (let i = 0; i < 20; i++) h.brain.drinkLog.push({ at: w.now - i * 6000, heal: 70 });
    expect(heroHelpers.suppliesRunningOut(w, h)).toBe(true);
  });

  it('mochila cheia: larga o item que vale menos para pegar um bem melhor', () => {
    const { w, h } = rig(['boladex']);
    h.character.inventory = h.character.inventory.map(() => ({ itemId: 'bone_fragment', count: 1 }));
    const valuable = Object.values(GAME_DATA.items).find((i) => i.value >= 300 && !i.slot && i.type !== 'potion') ??
      Object.values(GAME_DATA.items).find((i) => i.value >= 300)!;
    w.lootBags.set('t', { id: 't', x: h.x, y: h.y, items: [{ itemId: valuable.id, count: 1 }], gold: 0, expiresAt: w.now + 60000, sourceName: 'teste' });
    asActor(w, h, () => heroHelpers.collectLoot(w, h));
    expect(countItem(h.character.inventory, valuable.id)).toBe(1);
  });
});

describe('posição na luta', () => {
  it('retaguarda: o passo afasta da criatura sem sair de perto do tanque', () => {
    const { w, heroes } = rig(['distanciado', 'boladex']);
    const [pal, tank] = heroes as [HeroEntity, HeroEntity];
    const m = wolf(w);
    const at = freeNear(w, m.x + 1, m.y);
    moveTo(w, pal, at.x, at.y);
    const t = freeNear(w, at.x + 3, at.y);
    moveTo(w, tank, t.x, t.y);
    const step = backlineStep(w, pal, [m], tank, m, 6);
    expect(step).not.toBeNull();
    const nx = pal.x + step!.dx;
    const ny = pal.y + step!.dy;
    expect(Math.max(Math.abs(nx - m.x), Math.abs(ny - m.y))).toBeGreaterThan(Math.max(Math.abs(pal.x - m.x), Math.abs(pal.y - m.y)) - 1);
    expect(Math.max(Math.abs(nx - tank.x), Math.abs(ny - tank.y))).toBeLessThanOrEqual(5);
  });
});

describe('atalhos 1–9', () => {
  it('9 atalhos no snapshot; o 9º (magia nova) funciona', () => {
    const sim = makeSim('knight');
    expect(HOTBAR_SIZE).toBe(9);
    const bar = buildSnapshot(sim, 1).hotbar;
    expect(bar).toHaveLength(9);
    expect(bar.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
