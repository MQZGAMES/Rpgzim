// Modo guerra: cada um por si ou guildas Red/Blue. Regras (caveira e PZ lock normais, guildas equilibradas em gente e
// nível, cada guilda é um grupo fixo, saco de morte aberto a todos) e a IA: sozinho não ataca quem é muito mais forte,
// em grupo ataca; foge quando o outro lado é forte demais; caveira primeiro; sem recursos, caça para se refazer; no
// cada um por si, grupo de heróis pode trair.
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { customHeroDef } from '../../src/data/heroes';
import { createCharacter } from '../../src/domain/rules/character';
import type { HeroEntity } from '../../src/game/entities/types';
import { canEnter } from '../../src/game/movement/movement';
import { warOdds } from '../../src/game/ai/heroWar';
import {
  acceptInvite,
  attackedRecently,
  canAttackActor,
  configureParty,
  guildOf,
  invite,
  isWarEnemy,
  kickFromParty,
  leaveParty,
  partyOf,
  skullOf,
  syncGuildParties,
} from '../../src/game/social/social';
import type { GameSimulation } from '../../src/game/simulation/GameSimulation';
import { asActor } from '../../src/game/simulation/World';
import { isPz } from '../../src/game/world/GameMap';
import { GameSimulation as Sim } from '../../src/game/simulation/GameSimulation';
import { createRng } from '../../src/domain/value-objects/rng';
import { parseSave, toSaveFile } from '../../src/game/persistence/saveSchema';
import { advance, makeSim, worldMap } from '../helpers';

const D = GAME_DATA;

function addHero(sim: GameSimulation, id: string, level: number): HeroEntity {
  const def = D.heroes[id] ?? customHeroDef({ id, name: id, vocation: 'knight' });
  const c = createCharacter(D, {
    id: def.slotId,
    name: def.name,
    vocation: def.vocation,
    now: 0,
    position: sim.world.map.playerStart,
  });
  c.level = level;
  c.gold = 1500; // com dinheiro: não está em recuperação
  const h = sim.addHero(def, c) as HeroEntity;
  h.character.mana = h.stats.maxMana;
  h.character.health = h.stats.maxHealth;
  h.brain.nextUpgradeTripAt = Infinity; // o ouro do teste não vira ida à vila para comprar equipamento
  return h;
}

/** Campo aberto longe de criaturas e de áreas protegidas (as criaturas somem). */
function field(sim: GameSimulation): { x: number; y: number } {
  const w = sim.world;
  for (const m of w.monsters.values()) {
    m.alive = false;
    m.respawnAt = Infinity;
  }
  const s0 = w.map.playerStart;
  for (let r = 8; r < 70; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = s0.x + dx;
        const y = s0.y + dy;
        let ok = true;
        for (let ky = -3; ky <= 3 && ok; ky++)
          for (let kx = -3; kx <= 6 && ok; kx++)
            ok =
              canEnter(w, x + kx, y + ky, false, 'x') &&
              !isPz(w.map, x + kx, y + ky) &&
              !w.map.city[(y + ky) * w.map.width + x + kx];
        if (ok) return { x, y };
      }
  throw new Error('sem campo');
}

function put(sim: GameSimulation, h: HeroEntity, x: number, y: number): void {
  asActor(sim.world, h, () => sim.teleportPlayer(x, y));
}

/** Parado (não pensa, não foge) e com vida de sobra: só serve de alvo. */
function dummy(h: HeroEntity): void {
  h.brain.nextThinkAt = Infinity;
}

describe('modo guerra: regras', () => {
  it('guildas Red/Blue: equilibradas em gente e nível; cada guilda é um grupo fixo', () => {
    const sim = makeSim('knight', { seed: 5 });
    const w = sim.world;
    const levels = [50, 46, 40, 30, 22, 15];
    const hs = ['boladex', 'maguim', 'mano_cura', 'distanciado', 'extra_a', 'extra_b'].map((id, i) =>
      addHero(sim, id, levels[i]!),
    );
    invite(w, hs[2]!.id, hs[3]!.id);
    acceptInvite(w, hs[3]!.id, hs[2]!.id);
    sim.setWar('guilds');
    const all = [w.human, ...hs];
    const of = (g: number) => all.filter((a) => guildOf(w, a.id) === g);
    expect(of(0).length + of(1).length).toBe(7);
    expect(Math.abs(of(0).length - of(1).length)).toBeLessThanOrEqual(1);
    // os dois mais fortes ficam em lados opostos e a soma dos níveis fica parecida
    expect(guildOf(w, hs[0]!.id)).not.toBe(guildOf(w, hs[1]!.id));
    const sum = (g: number) => of(g).reduce((t, a) => t + a.character.level, 0);
    expect(Math.abs(sum(0) - sum(1))).toBeLessThanOrEqual(25);
    expect(w.social.pvp).toBe(true);
    // a guilda inteira é um grupo (o do jogador é o grupo dele, com ele de líder)
    for (const g of [0, 1]) {
      const p = partyOf(w, of(g)[0]!.id)!;
      expect(p.guild).toBe(g);
      expect([...p.members].sort()).toEqual(
        of(g)
          .map((a) => a.id)
          .sort(),
      );
    }
    expect(w.social.party?.leaderId).toBe(w.human.id);
    expect(w.social.party?.formation).toBe('free'); // cada um segue a própria caça
    // ninguém entra nem sai
    const mine = w.social.party!;
    const mate = mine.members.find((id) => id !== w.human.id)!;
    const enemy = hs.find((h) => !mine.members.includes(h.id))!;
    expect(invite(w, w.human.id, enemy.id)).toBe('locked');
    expect(kickFromParty(w, w.human.id, mate)).toBe('locked');
    expect(leaveParty(w, mate)).toBe('locked');
    const at = field(sim);
    const m = w.heroes.get(mate)!;
    put(sim, m, at.x, at.y);
    sim.teleportPlayer(at.x + 1, at.y);
    expect(canAttackActor(w, w.human, m)).not.toBeNull();
    // sair das guildas desfaz os grupos
    sim.setWar('ffa');
    expect(w.social.party).toBeNull();
    expect(w.social.heroParties.length).toBe(0);
  });

  it('quem entra depois vai para a guilda com menos gente e já entra no grupo dela', () => {
    const sim = makeSim('knight', { seed: 9 });
    const w = sim.world;
    addHero(sim, 'boladex', 20);
    addHero(sim, 'maguim', 20);
    sim.setWar('guilds');
    const late = addHero(sim, 'mano_cura', 20);
    const n = (g: number) => [w.human, ...w.heroes.values()].filter((a) => guildOf(w, a.id) === g).length;
    expect(guildOf(w, late.id)).not.toBeNull();
    expect(Math.abs(n(0) - n(1))).toBeLessThanOrEqual(1);
    expect(partyOf(w, late.id)?.guild).toBe(guildOf(w, late.id));
  });

  it('guerra tem prejuízo de verdade: caveira branca, morte injusta e o PZ lock de 5 min; desligar o PK encerra a guerra', () => {
    const sim = makeSim('knight', { seed: 3 });
    const w = sim.world;
    const a = addHero(sim, 'boladex', 30);
    const b = addHero(sim, 'maguim', 8);
    sim.setWar('ffa');
    const at = field(sim);
    put(sim, a, at.x, at.y);
    put(sim, b, at.x + 1, at.y);
    dummy(a);
    dummy(b);
    for (let i = 0; i < 400 && !b.dead; i++) {
      asActor(w, a, () => {
        w.player.targetId = b.id;
      });
      advance(sim, 100);
    }
    expect(b.dead).toBe(true);
    expect(skullOf(w, a.id)?.kind).toBe('white');
    expect(w.social.unjust.get(a.id)?.length).toBe(1);
    expect(w.social.pzLocks.get(a.id) ?? 0).toBeGreaterThan(w.now + 4 * 60000);
    // o saco de morte fica no chão para qualquer um
    expect([...w.lootBags.values()].some((l) => l.ownerId === b.id)).toBe(true);
    sim.setPvp(false);
    expect(w.social.war.mode).toBe('off');
    expect(isWarEnemy(w, a.id, b.id)).toBe(false);
  });
});

describe('modo guerra: salvar', () => {
  it('a escolha fica salva no personagem e volta ao abrir o jogo (guildas sorteadas de novo)', () => {
    const sim = makeSim('knight', { seed: 4 });
    addHero(sim, 'boladex', 20);
    sim.setWar('guilds');
    const saved = parseSave(D, JSON.parse(JSON.stringify(toSaveFile(sim.snapshotCharacter()))));
    if (!saved || 'error' in saved) throw new Error('save inválido');
    const again = new Sim({ data: D, map: worldMap(), character: saved.character, rng: createRng(8) });
    again.addHero(
      D.heroes.maguim!,
      createCharacter(D, {
        id: 'maguim',
        name: 'Maguim',
        vocation: 'sorcerer',
        now: 0,
        position: again.world.map.playerStart,
      }),
    );
    expect(again.world.social.war.mode).toBe('guilds');
    expect(again.world.social.pvp).toBe(true);
    expect(guildOf(again.world, again.world.human.id)).not.toBeNull();
    again.setWar('off');
    expect(again.world.human.character.flags.war).toBe(false);
  });
});

describe('modo guerra: IA', () => {
  it('sozinho não ataca quem é muito mais forte; em grupo, ataca e mata', () => {
    const sim = makeSim('knight', { seed: 11 });
    const w = sim.world;
    const at = field(sim);
    const strong = addHero(sim, 'boladex', 45);
    const weak = addHero(sim, 'distanciado', 22);
    sim.setWar('ffa');
    put(sim, strong, at.x + 5, at.y);
    put(sim, weak, at.x, at.y);
    dummy(strong);
    expect(warOdds(w, weak, strong)).toBeLessThan(0.9);
    advance(sim, 12000);
    expect(attackedRecently(w, weak.id, strong.id, 12000)).toBe(false);

    expect(weak.brain.mode).not.toBe('pk'); // sozinho contra ele: não puxa a briga
    // ele volta com três colegas e forma grupo: agora o lado deles vence
    put(sim, weak, at.x, at.y);
    asActor(w, weak, () => (w.player.path = null));
    weak.brain.mode = 'decide';
    const m1 = addHero(sim, 'maguim', 24);
    const m2 = addHero(sim, 'mano_cura', 24);
    const k3 = addHero(sim, 'extra_k', 26);
    put(sim, m1, at.x, at.y + 1);
    put(sim, m2, at.x - 1, at.y);
    put(sim, k3, at.x, at.y - 1);
    for (const m of [m1, m2, k3]) {
      invite(w, weak.id, m.id);
      acceptInvite(w, m.id, weak.id);
    }
    configureParty(w, weak.id, { formation: 'follow' });
    expect(partyOf(w, weak.id)?.members.length).toBe(4);
    expect(warOdds(w, weak, strong)).toBeGreaterThan(1.6);
    let hitBy = 0;
    for (let t = 0; t < 120 && !strong.dead; t++) {
      advance(sim, 250);
      hitBy = [weak, m1, m2, k3].filter((h) => attackedRecently(w, h.id, strong.id, 60000)).length;
    }
    expect(hitBy).toBeGreaterThanOrEqual(2); // o grupo foi junto, não só o líder
    expect(strong.dead).toBe(true);
  });

  it('foge quando o outro lado é forte demais', () => {
    const sim = makeSim('knight', { seed: 13 });
    const w = sim.world;
    const at = field(sim);
    const prey = addHero(sim, 'maguim', 15);
    const a = addHero(sim, 'boladex', 40);
    const b = addHero(sim, 'distanciado', 40);
    sim.setWar('guilds');
    w.social.war.guilds.set(prey.id, 0);
    w.social.war.guilds.set(a.id, 1);
    w.social.war.guilds.set(b.id, 1);
    syncGuildParties(w);
    put(sim, prey, at.x, at.y);
    put(sim, a, at.x + 5, at.y);
    put(sim, b, at.x + 5, at.y + 1);
    dummy(a);
    dummy(b);
    let fled = false;
    for (let t = 0; t < 20 && !fled; t++) {
      advance(sim, 250);
      fled = prey.brain.mode === 'retreat';
    }
    expect(fled).toBe(true);
    expect(attackedRecently(w, prey.id, a.id, 10000) || attackedRecently(w, prey.id, b.id, 10000)).toBe(
      false,
    );
  });

  it('guildas: não ataca a própria guilda, ataca o inimigo da outra', () => {
    const sim = makeSim('knight', { seed: 17 });
    const w = sim.world;
    const at = field(sim);
    const k = addHero(sim, 'boladex', 30);
    const mate = addHero(sim, 'mano_cura', 18);
    const foe = addHero(sim, 'maguim', 18);
    sim.setWar('guilds');
    w.social.war.guilds.set(k.id, 0);
    w.social.war.guilds.set(mate.id, 0);
    w.social.war.guilds.set(foe.id, 1);
    w.social.war.guilds.set(w.human.id, 0);
    syncGuildParties(w);
    put(sim, k, at.x, at.y);
    put(sim, mate, at.x + 2, at.y);
    put(sim, foe, at.x + 4, at.y + 1);
    dummy(mate);
    dummy(foe);
    advance(sim, 8000);
    expect(attackedRecently(w, k.id, mate.id, 8000)).toBe(false);
    expect(attackedRecently(w, k.id, foe.id, 8000)).toBe(true);
  });

  it('caveira primeiro: entre dois alvos parecidos, ataca o que tem caveira', () => {
    const sim = makeSim('knight', { seed: 19 });
    const w = sim.world;
    const at = field(sim);
    const k = addHero(sim, 'boladex', 35);
    const clean = addHero(sim, 'maguim', 15);
    const skulled = addHero(sim, 'distanciado', 15);
    sim.setWar('ffa');
    w.social.skulls.set(skulled.id, { kind: 'white', until: w.now + 10 * 60000 });
    put(sim, k, at.x, at.y);
    put(sim, clean, at.x + 3, at.y);
    put(sim, skulled, at.x + 4, at.y + 1);
    dummy(clean);
    dummy(skulled);
    advance(sim, 4000);
    expect(k.brain.pkTargetId).toBe(skulled.id);
  });

  it('sem dinheiro nem poções (em recuperação): não puxa briga equilibrada, mas aproveita quem está quase morto', () => {
    const sim = makeSim('knight', { seed: 29 });
    const w = sim.world;
    const at = field(sim);
    const k = addHero(sim, 'boladex', 30);
    const foe = addHero(sim, 'extra_r', 26);
    sim.setWar('ffa');
    k.character.gold = 0;
    k.character.bankGold = 0;
    k.character.inventory = k.character.inventory.map((st) => (st && /potion/.test(st.itemId) ? null : st));
    put(sim, k, at.x, at.y);
    put(sim, foe, at.x + 4, at.y);
    dummy(foe);
    advance(sim, 8000);
    expect(attackedRecently(w, k.id, foe.id, 8000)).toBe(false);
    foe.character.health = Math.round(foe.stats.maxHealth * 0.15);
    put(sim, k, at.x, at.y);
    k.brain.mode = 'decide';
    asActor(w, k, () => (w.player.path = null));
    advance(sim, 3000);
    expect(k.brain.pkTargetId).toBe(foe.id); // oportunidade: foi para cima
  });

  it('cada um por si: um herói ganancioso trai o colega ferido do grupo', () => {
    const sim = makeSim('knight', { seed: 31 });
    const w = sim.world;
    const at = field(sim);
    const traitor = addHero(sim, 'boladex', 30);
    traitor.hero = {
      ...traitor.hero,
      temperament: { bravery: 0.9, greed: 1, discipline: 0.5, sociability: 0.1, caution: 0.1 },
    };
    const mate = addHero(sim, 'maguim', 24);
    mate.character.gold = 3000;
    sim.setWar('ffa');
    invite(w, traitor.id, mate.id);
    acceptInvite(w, mate.id, traitor.id);
    traitor.brain.affinity[mate.id] = -0.2;
    put(sim, traitor, at.x, at.y);
    put(sim, mate, at.x + 2, at.y);
    mate.character.health = Math.round(mate.stats.maxHealth * 0.4);
    let betrayed = false;
    for (let t = 0; t < 60 && !betrayed; t++) {
      traitor.brain.nextBetrayAt = 0;
      advance(sim, 1000);
      betrayed = traitor.brain.pkTargetId === mate.id || attackedRecently(w, traitor.id, mate.id, 2000);
    }
    expect(betrayed).toBe(true);
    expect(partyOf(w, traitor.id)).toBeNull();
  });

  it('o grupo do jogador não trai nem se desfaz sozinho na guerra', () => {
    const sim = makeSim('knight', { seed: 37 });
    const w = sim.world;
    const at = field(sim);
    const h = addHero(sim, 'boladex', 40);
    h.hero = {
      ...h.hero,
      temperament: { bravery: 0.9, greed: 1, discipline: 0.5, sociability: 0.1, caution: 0.1 },
    };
    sim.setWar('ffa');
    invite(w, w.human.id, h.id);
    acceptInvite(w, h.id, w.human.id);
    sim.teleportPlayer(at.x + 2, at.y);
    put(sim, h, at.x, at.y);
    w.human.character.health = Math.round(w.human.stats.maxHealth * 0.3);
    w.human.character.gold = 5000;
    for (let t = 0; t < 30; t++) {
      h.brain.nextBetrayAt = 0;
      advance(sim, 1000);
    }
    expect(attackedRecently(w, h.id, w.human.id, 30000)).toBe(false);
    expect(partyOf(w, h.id)).toBe(w.social.party);
  });

  it('simulação: cada um por si por 8 min — há mortes por PK e elas contam como injustas', () => {
    const sim = makeSim('knight', { seed: 23 });
    const w = sim.world;
    const hs = [
      addHero(sim, 'boladex', 25),
      addHero(sim, 'maguim', 25),
      addHero(sim, 'mano_cura', 25),
      addHero(sim, 'distanciado', 25),
      addHero(sim, 'extra_1', 20),
      addHero(sim, 'extra_2', 30),
    ];
    // todos começam no mesmo campo (longe do templo), para a guerra começar logo
    const at = field(sim);
    hs.forEach((h, i) => put(sim, h, at.x + (i % 3) * 2, at.y + Math.floor(i / 3) * 2));
    let pvpDeaths = 0;
    for (const h of hs) h.scope.events.on('playerDied', (e) => void (e.byPlayer && pvpDeaths++));
    sim.setWar('ffa');
    advance(sim, 8 * 60000, 50);
    expect(pvpDeaths).toBeGreaterThan(0);
    // prejuízo real: as mortes da guerra contam como injustas (caveira)
    expect([...w.social.unjust.values()].some((l) => l.length > 0)).toBe(true);
  }, 120000);
});
