// Seleção de personagem para atacar, ninguém empurrado para a PZ, aura da Corrida na morte, convite do jogador sempre
// aceito, legítima defesa em grupo, fuga que não trava e caça escolhida pelo custo-benefício.
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { castSpell } from '../../src/game/abilities/spells';
import { actorSource, damagePlayer } from '../../src/game/combat/combat';
import type { HeroEntity } from '../../src/game/entities/types';
import { answerInviteNow, huntChoiceDebug } from '../../src/game/ai/heroBrain';
import { SWAP_AFTER_MS, placeOccupant, removeOccupant, resolveStuck } from '../../src/game/movement/movement';
import { refreshStats } from '../../src/game/progression/progression';
import { invite, partyOf, registerAggression } from '../../src/game/social/social';
import { asActor } from '../../src/game/simulation/World';
import { isPz, isSolid } from '../../src/game/world/GameMap';
import { buildSnapshot } from '../../src/integration/game-ui-bridge/snapshot';
import { advance, makeSim, runUntil } from '../helpers';

function rig(ids: string[] = ['boladex'], vocation: 'knight' | 'sorcerer' = 'knight') {
  const sim = makeSim(vocation, { seed: 17 });
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
    return sim.addHero(def, c) as HeroEntity;
  });
  return { sim, w, heroes, h: heroes[0]! };
}

/** Um tile fora da PZ (livre) colado a outro na PZ. */
function pzBorder(w: ReturnType<typeof rig>['w']) {
  for (let y = 1; y < w.map.height - 1; y++)
    for (let x = 1; x < w.map.width - 1; x++) {
      if (!isPz(w.map, x, y) || isSolid(w.map, x, y)) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ox = x + dx;
        const oy = y + dy;
        if (!isPz(w.map, ox, oy) && !isSolid(w.map, ox, oy) && !w.occupancy.has(oy * w.map.width + ox))
          return { pz: { x, y }, out: { x: ox, y: oy } };
      }
    }
  throw new Error('sem borda de PZ');
}

describe('botão de seleção de personagem', () => {
  it('marca o herói por perto; o botão de ataque e a magia de ataque vão nele; depois do último, desmarca', () => {
    const { sim, w, h } = rig(['boladex'], 'sorcerer');
    sim.setPvp(true);
    h.brain.nextThinkAt = Infinity;
    const out = pzBorder(w).out;
    sim.teleportPlayer(out.x, out.y);
    removeOccupant(w, h);
    h.x = out.x + (isSolid(w.map, out.x + 2, out.y) ? -2 : 2);
    h.y = out.y;
    placeOccupant(w, h);
    expect(isPz(w.map, h.x, h.y)).toBe(false);
    sim.cycleActorSelection();
    expect(buildSnapshot(sim, 1).selectedActor?.id).toBe(h.id);
    expect(w.human.targetId).toBeNull(); // só marcou
    sim.cycleTarget(); // botão de ataque: vai no marcado
    expect(w.human.targetId).toBe(h.id);
    sim.setTarget(null);
    w.human.character.level = 10;
    w.human.character.mana = 500;
    castSpell(w, 'arcane_bolt');
    expect(w.human.targetId).toBe(h.id);
    sim.cycleActorSelection(); // só havia um: desmarca
    expect(buildSnapshot(sim, 1).selectedActor).toBeNull();
  });
});

describe('PZ e trocas de lugar', () => {
  it('ninguém é empurrado para dentro de uma área protegida', () => {
    const { w, h } = rig();
    const { pz, out } = pzBorder(w);
    const p = w.human;
    removeOccupant(w, p);
    p.x = pz.x;
    p.y = pz.y;
    placeOccupant(w, p);
    removeOccupant(w, h);
    h.x = out.x;
    h.y = out.y;
    placeOccupant(w, h);
    // o jogador (na PZ) insiste em sair pelo tile do herói: sem a regra, o herói iria parar dentro da PZ
    for (let t = 0; t <= SWAP_AFTER_MS + 500; t += 250) {
      w.now += 250;
      resolveStuck(w, p, h.id);
    }
    expect(h.x).toBe(out.x);
    expect(h.y).toBe(out.y);
    expect(p.x).toBe(pz.x);
  });
});

describe('Corrida e morte', () => {
  it('morrer encerra a Corrida (e os demais efeitos)', () => {
    const { sim, w } = rig();
    const p = w.human;
    p.character.level = 10;
    p.character.mana = 200;
    asActor(w, p, () => refreshStats(w));
    sim.update(16);
    expect(castSpell(w, 'haste')).toBe(true);
    expect(p.buffs.some((b) => b.kind === 'haste')).toBe(true);
    p.invulnerableUntil = 0;
    damagePlayer(w, 999999, 'physical', { id: 'mon:x', name: 'Troll', kind: 'monster' }, true);
    expect(p.dead).toBe(true);
    expect(p.buffs).toHaveLength(0);
  });
});

describe('convites e grupo', () => {
  it('o herói nunca recusa o convite do jogador, nem com rixa, e sai do grupo em que estava', () => {
    const { w, heroes } = rig(['boladex', 'maguim']);
    const [a, b] = heroes as [HeroEntity, HeroEntity];
    invite(w, b.id, a.id);
    asActor(w, a, () => answerInviteNow(w, a));
    // (entre heróis pode recusar; força o grupo deles para o teste)
    if (!partyOf(w, a.id)) {
      w.social.heroParties.push({ leaderId: b.id, members: [b.id, a.id], formation: 'follow', targeting: 'leader', friendlyFire: false, trail: [] });
    }
    a.brain.grudge = { id: w.human.id, until: w.now + 60000 };
    a.brain.affinity[w.human.id] = -0.9;
    for (let i = 0; i < 5; i++) {
      invite(w, w.human.id, a.id);
      asActor(w, a, () => answerInviteNow(w, a));
      expect(w.social.party?.members).toContain(a.id);
      expect(partyOf(w, a.id)).toBe(w.social.party);
    }
  });

  it('em grupo de heróis, quem é atacado no PK revida (não fica parado apanhando)', () => {
    const { sim, w, heroes } = rig(['boladex', 'distanciado']);
    const [a, b] = heroes as [HeroEntity, HeroEntity];
    w.social.heroParties.push({ leaderId: a.id, members: [a.id, b.id], formation: 'follow', targeting: 'leader', friendlyFire: false, trail: [] });
    sim.setPvp(true);
    const out = pzBorder(w).out;
    sim.teleportPlayer(out.x, out.y);
    for (const x of [a, b]) {
      removeOccupant(w, x);
      x.x = out.x + 2;
      x.y = out.y;
    }
    placeOccupant(w, a);
    expect(isPz(w.map, a.x, a.y)).toBe(false);
    registerAggression(w, w.human.id, a.id);
    asActor(w, a, () => damagePlayer(w, 5, 'physical', actorSource(w.human), true));
    a.brain.nextThinkAt = 0;
    advance(sim, 400, 50);
    expect(a.brain.mode).toBe('pk');
    expect(a.targetId).toBe(w.human.id);
  });
});

describe('caça pelo custo-benefício', () => {
  it('um herói de nível 30 bem equipado não escolhe slime nem sapo', () => {
    const { w, h } = rig();
    h.character.level = 30;
    h.character.skills.sword.level = 45;
    h.character.skills.shielding.level = 40;
    h.character.equipment.mainHand = { itemId: 'sword_obsidian', count: 1 };
    h.character.inventory[0] = { itemId: 'potion_health_great', count: 40 };
    asActor(w, h, () => refreshStats(w));
    h.character.health = h.stats.maxHealth;
    const top = asActor(w, h, () => huntChoiceDebug(w, h)).split(' > ')[0]!;
    const id = top.split('(')[0]!;
    expect(['slime', 'toad', 'boar', 'goblin']).not.toContain(id);
    expect(GAME_DATA.monsters[id]!.level!).toBeGreaterThanOrEqual(15);
  });

  it('na fuga cercado, mas com caminho até o abrigo, ele anda (não trava revidando parado)', () => {
    const { sim, w, h } = rig(['mano_cura']);
    const sp = w.map.spawns.find((s) => s.monsterId === 'bandit')!;
    removeOccupant(w, h);
    h.x = sp.x;
    h.y = sp.y;
    placeOccupant(w, h);
    h.brain.retreatWhy = 'teste';
    h.brain.mode = 'retreat';
    const start = { x: h.x, y: h.y };
    expect(runUntil(sim, () => h.dead || h.x !== start.x || h.y !== start.y || h.brain.mode !== 'retreat', 8000, 50)).toBe(true);
  });
});
