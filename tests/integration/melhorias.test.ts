// Melhorias de combate e IA: isca do Knight (golpe em área vira a atenção), retarget dos monstros pelo
// mais próximo, cancelamento do ataque quando o alvo volta ao respawn, cura/poção do herói em grupo,
// coleta de loot durante o combate, sobreposição de personagens e troca de lugar após insistência.
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { chebyshev } from '../../src/domain/value-objects/position';
import { countItem } from '../../src/domain/rules/inventory';
import { canEnter, resolveStuck } from '../../src/game/movement/movement';
import { isPz } from '../../src/game/world/GameMap';
import { sendHome } from '../../src/game/ai/monsterAi';
import { asActor } from '../../src/game/simulation/World';
import type { GameSimulation } from '../../src/game/simulation/GameSimulation';
import { advance, makeSim } from '../helpers';
import { statDiff } from '../../src/ui/inventory/InventoryPanel';

function withHero(vocation: 'knight' | 'paladin' | 'druid' | 'sorcerer' = 'knight', seed = 21) {
  const sim = makeSim(vocation, { seed });
  const hero = GAME_DATA.heroes.boladex!;
  const c = createCharacter(GAME_DATA, { id: hero.slotId, name: hero.name, vocation: hero.vocation, now: 0, position: sim.world.map.playerStart });
  // o Knight só arrisca, lura e puxa criaturas com bastante poção na mochila
  c.inventory[0] = { itemId: 'potion_health', count: 40 };
  const h = sim.addHero(hero, c);
  return { sim, h, w: sim.world };
}

function putAt(sim: GameSimulation, a: { x: number; y: number; id: string }, x: number, y: number) {
  const w = sim.world;
  if (w.occupancy.get(a.y * w.map.width + a.x) === a.id) w.occupancy.delete(a.y * w.map.width + a.x);
  a.x = x;
  a.y = y;
  w.occupancy.set(y * w.map.width + x, a.id);
}

/** Tile livre fora da área protegida, longe dos monstros (campo aberto ao sul da vila). */
function openField(sim: GameSimulation): { x: number; y: number } {
  const w = sim.world;
  const free = (xx: number, yy: number) => canEnter(w, xx, yy, false, 'x') && !isPz(w.map, xx, yy) && !w.map.city[yy * w.map.width + xx];
  const s0 = w.map.playerStart;
  for (let r = 4; r < 60; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = s0.x + dx;
        const y = s0.y + dy;
        let ok = true;
        for (let k = -9; k <= 9 && ok; k++) ok = free(x + k, y);
        for (let k = -4; k <= 4 && ok; k++) ok = free(x, y + k);
        if (ok && [...w.monsters.values()].every((m) => chebyshev(m, { x, y }) > 10)) return { x, y };
      }
  throw new Error('sem campo aberto');
}

describe('Grito de Guerra do Knight atrai os monstros', () => {
  it('o monstro vira as costas para quem atacava e persegue o Knight', () => {
    const { sim, h, w } = withHero('knight');
    const spot = openField(sim);
    putAt(sim, h, spot.x, spot.y);
    // monstro adjacente que já persegue o jogador humano
    const monster = [...w.monsters.values()].find((m) => m.alive)!;
    putAt(sim, monster, spot.x + 1, spot.y);
    monster.targetId = w.human.id;
    monster.state = 'attacking';
    // o Knight conjura o Grito de Guerra (magia de área com isca)
    h.character.mana = 999;
    h.stats.magicLevel = 5;
    h.character.level = 10;
    h.character.skills.magic.level = 5;
    h.stats = { ...h.stats, magicLevel: 5 };
    // o conjurador é o herói: a conjuração roda no contexto dele
    const cast = asActor(w, h, () => sim.castSpell('war_cry'));
    expect(cast).toBe(true);
    // o monstro agora persegue o Knight, não o jogador humano
    expect(monster.targetId).toBe(h.id);
    expect(monster.tauntUntil).toBeGreaterThan(w.now);
  });

  it('só o Grito de Guerra é isca: o Redemoinho de Aço causa apenas dano', () => {
    expect(GAME_DATA.spells.war_cry?.attract).toBe(true);
    expect(GAME_DATA.spells.steel_whirlwind?.attract).toBeUndefined();
    // as outras magias de área não viram isca
    expect(GAME_DATA.spells.fire_nova?.attract).toBeUndefined();
  });
});

describe('monstros trocam de alvo pelo mais próximo', () => {
  it('não rouba o alvo de quem já está sendo perseguido à mesma distância', () => {
    const { sim, w } = withHero();
    const spot = openField(sim);
    sim.teleportPlayer(spot.x, spot.y);
    const monster = [...w.monsters.values()].find((m) => m.alive)!;
    putAt(sim, monster, spot.x + 2, spot.y);
    monster.targetId = w.human.id;
    monster.state = 'chasing';
    advance(sim, 100, 50);
    // o herói está mais longe: o monstro continua no jogador humano
    expect(monster.targetId).toBe(w.human.id);
  });
});

describe('alvo que volta ao respawn', () => {
  it('cancela o ataque e mira o inimigo mais próximo', () => {
    const { sim, w } = withHero();
    const spot = openField(sim);
    sim.teleportPlayer(spot.x, spot.y);
    const monster = [...w.monsters.values()].find((m) => m.alive)!;
    putAt(sim, monster, spot.x + 1, spot.y);
    sim.setTarget(monster.id);
    expect(w.player.targetId).toBe(monster.id);
    // o monstro volta para casa (leva o jogador junto)
    sendHome(w, monster);
    // o ataque foi cancelado
    expect(w.player.targetId).not.toBe(monster.id);
  });
});

describe('herói em grupo: cura, poções e loot', () => {
  it('o herói usa poção de mana quando a mana está baixa', () => {
    const { sim, h } = withHero('knight');
    h.character.mana = 0;
    h.stats.maxMana = 100;
    // dá uma poção de mana na mochila
    h.character.inventory[0] = { itemId: 'potion_mana', count: 3 };
    expect(countItem(h.character.inventory, 'potion_mana')).toBe(3);
    // o cérebro roda e percebe a mana baixa
    advance(sim, 1000, 50);
    expect(h.character.mana).toBeGreaterThan(0);
  });

  it('o herói pega o loot do chão sem largar a criatura que está atacando', () => {
    const { sim, h, w } = withHero('knight');
    const spot = openField(sim);
    putAt(sim, h, spot.x, spot.y);
    // monstro adjacente (vira o alvo do herói)
    const monster = [...w.monsters.values()].find((m) => m.alive)!;
    putAt(sim, monster, spot.x + 1, spot.y);
    monster.hp = 1e6; // não morre durante o teste
    h.brain.mode = 'hunt';
    h.brain.quarry = monster.def.id;
    h.brain.spot = { x: monster.x, y: monster.y };
    h.brain.modeUntil = w.now + 600000;
    asActor(w, h, () => sim.setTarget(monster.id));
    // um saco de loot no mesmo tile do herói
    w.lootBags.set('bag-test', { id: 'bag-test', x: spot.x, y: spot.y, items: [{ itemId: 'slime_gel', count: 2 }], gold: 7, expiresAt: w.now + 60000, sourceName: 'Slime' });
    advance(sim, 1500, 50);
    // pegou o loot E continua com o mesmo alvo
    expect(countItem(h.character.inventory, 'slime_gel')).toBeGreaterThan(0);
    expect(h.targetId).toBe(monster.id);
  });
});

describe('personagens não se sobrepõem', () => {
  it('fora da cidade ninguém entra no tile de outro personagem', () => {
    const { sim, h, w } = withHero();
    const spot = openField(sim);
    sim.teleportPlayer(spot.x, spot.y);
    putAt(sim, h, spot.x + 1, spot.y);
    expect(canEnter(w, spot.x + 1, spot.y, false, w.human.id)).toBe(false);
  });

  it('nem na cidade os personagens se sobrepõem (a troca de lugar destrava a rua)', () => {
    const { sim, h, w } = withHero();
    const door = w.map.doors.find((d) => d.buildingId === 'temple')!;
    sim.teleportPlayer(door.x, door.y);
    putAt(sim, h, door.x + 1, door.y);
    expect(canEnter(w, h.x, h.y, false, w.human.id)).toBe(false);
  });

  it('insistindo por mais de 5 s os personagens trocam de lugar', () => {
    const { sim, h, w } = withHero();
    const spot = openField(sim);
    sim.teleportPlayer(spot.x, spot.y);
    putAt(sim, h, spot.x + 1, spot.y);
    const before = { x: w.human.x, y: w.human.y };
    const heroBefore = { x: h.x, y: h.y };
    // menos de 5 s: ainda não troca
    w.human.stuckSince = w.now - 3000;
    w.human.stuckAt = w.now;
    w.human.stuckWith = h.id;
    resolveStuck(w, w.human, h.id);
    expect([w.human.x, w.human.y]).toEqual([before.x, before.y]);
    // mais de 5 s: troca
    w.human.stuckSince = w.now - 6000;
    w.human.stuckAt = w.now;
    resolveStuck(w, w.human, h.id);
    expect([w.human.x, w.human.y]).toEqual([heroBefore.x, heroBefore.y]);
    expect([h.x, h.y]).toEqual([before.x, before.y]);
  });
});

describe('explosão ígnea do mago', () => {
  it('tem raio 3 (um quadrado maior que antes, para todos os lados)', () => {
    expect(GAME_DATA.spells.fire_nova?.radius).toBe(3);
  });
});

/** Remove os monstros vivos (cenários de movimento/grupo sem combate paralelo). */
function clearMonsters(sim: GameSimulation) {
  for (const m of sim.world.monsters.values()) {
    m.alive = false;
    m.respawnAt = Infinity;
  }
}

describe('herói em grupo: isca, poção para o colega e loot à distância', () => {
  it('o Knight puxa para si o monstro que bate no líder (golpe em área com isca)', () => {
    const { sim, h, w } = withHero('knight');
    clearMonsters(sim);
    const spot = openField(sim);
    sim.teleportPlayer(spot.x, spot.y);
    putAt(sim, h, spot.x + 1, spot.y);
    w.social.party = { leaderId: w.human.id, members: [w.human.id, h.id], formation: 'follow', targeting: 'leader', friendlyFire: false, trail: [] };
    h.brain.mode = 'follow';
    h.character.level = 10;
    h.character.mana = 999;
    h.stats = { ...h.stats, maxMana: 999 };
    // monstro encostado nos dois, batendo no jogador humano
    const monster = [...w.monsters.values()][0]!;
    monster.alive = true;
    putAt(sim, monster, spot.x, spot.y + 1);
    monster.targetId = w.human.id;
    monster.state = 'attacking';
    w.human.character.health = w.human.stats.maxHealth;
    advance(sim, 1500, 50);
    expect(monster.targetId).toBe(h.id);
  });

  it('o herói dá poção de vida ao colega que está morrendo', () => {
    const { sim, h, w } = withHero('knight');
    clearMonsters(sim);
    const spot = openField(sim);
    sim.teleportPlayer(spot.x, spot.y);
    putAt(sim, h, spot.x + 1, spot.y);
    w.social.party = { leaderId: w.human.id, members: [w.human.id, h.id], formation: 'follow', targeting: 'leader', friendlyFire: false, trail: [] };
    h.brain.mode = 'hunt';
    h.brain.modeUntil = w.now + 600000;
    h.brain.quarry = 'slime';
    h.brain.nextGiftAt = 0;
    h.character.inventory[0] = { itemId: 'potion_health', count: 5 };
    w.human.character.health = Math.floor(w.human.stats.maxHealth * 0.2);
    const before = countItem(w.human.character.inventory, 'potion_health');
    advance(sim, 2000, 50);
    expect(countItem(w.human.character.inventory, 'potion_health')).toBeGreaterThan(before);
  });

  it('o herói enxerga o loot da tela toda (8 tiles) e vai buscá-lo', () => {
    const { sim, h, w } = withHero('knight');
    clearMonsters(sim);
    const spot = openField(sim);
    putAt(sim, h, spot.x, spot.y);
    sim.teleportPlayer(spot.x - 9, spot.y); // o humano fica longe
    h.brain.mode = 'hunt';
    h.brain.quarry = 'slime';
    h.brain.spot = { x: spot.x, y: spot.y };
    h.brain.modeUntil = w.now + 600000;
    w.lootBags.set('far-bag', { id: 'far-bag', x: spot.x + 8, y: spot.y, items: [{ itemId: 'slime_gel', count: 3 }], gold: 0, expiresAt: w.now + 120000, sourceName: 'Slime' });
    advance(sim, 8000, 50);
    expect(countItem(h.character.inventory, 'slime_gel')).toBeGreaterThanOrEqual(3);
  });

  it('com a criatura a distância, o herói pega o loot no caminho sem largar o alvo', () => {
    const { sim, h, w } = withHero('knight');
    clearMonsters(sim);
    const spot = openField(sim);
    putAt(sim, h, spot.x, spot.y);
    sim.teleportPlayer(spot.x - 9, spot.y);
    const monster = [...w.monsters.values()][0]!;
    monster.alive = true;
    monster.def = { ...monster.def, aggroRadius: 0 }; // parada: não vem até ele
    putAt(sim, monster, spot.x + 9, spot.y);
    monster.state = 'idle';
    h.brain.mode = 'hunt';
    h.brain.quarry = monster.def.id;
    h.brain.spot = { x: monster.x, y: monster.y };
    h.brain.modeUntil = w.now + 600000;
    asActor(w, h, () => sim.setTarget(monster.id));
    w.lootBags.set('near-bag', { id: 'near-bag', x: spot.x + 4, y: spot.y, items: [{ itemId: 'slime_gel', count: 2 }], gold: 0, expiresAt: w.now + 120000, sourceName: 'Slime' });
    // pega o loot no caminho e, no instante da coleta, continua com o alvo selecionado (as duas coisas juntas)
    let got = false;
    for (let t = 0; t < 6000 && !got; t += 50) {
      advance(sim, 50, 50);
      got = countItem(h.character.inventory, 'slime_gel') >= 2;
    }
    expect(got).toBe(true);
    expect(h.targetId).toBe(monster.id);
  });
});

describe('alvo que volta ao respawn: só cancela', () => {
  it('não escolhe outro alvo sozinho (o próximo ataque seleciona o mais próximo)', () => {
    const { sim, w } = withHero();
    const spot = openField(sim);
    sim.teleportPlayer(spot.x, spot.y);
    const [a, b] = [...w.monsters.values()].filter((m) => m.alive);
    putAt(sim, a!, spot.x + 1, spot.y);
    putAt(sim, b!, spot.x + 2, spot.y);
    sim.setTarget(a!.id);
    sendHome(w, a!);
    expect(w.player.targetId).toBeNull();
    // o próximo ataque (botão de alvo) seleciona o inimigo mais próximo
    sim.cycleTarget();
    expect(w.player.targetId).not.toBeNull();
  });
});

describe('mochila: organizar e diferença de atributos', () => {
  it('organizar remove os espaços vazios entre os itens sem mudar a ordem', () => {
    const sim = makeSim('knight');
    const inv = sim.world.player.character.inventory;
    inv.fill(null);
    inv[3] = { itemId: 'potion_health', count: 2 };
    inv[9] = { itemId: 'axe_hand', count: 1 };
    inv[15] = { itemId: 'slime_gel', count: 4 };
    sim.organizeInventory();
    expect(inv.slice(0, 3).map((s) => s?.itemId)).toEqual(['potion_health', 'axe_hand', 'slime_gel']);
    expect(inv.slice(3).every((s) => s === null)).toBe(true);
    expect(inv.length).toBe(GAME_DATA.balance.player.inventorySlots);
  });

  it('a diferença com slot vazio é o ganho inteiro; com item equipado, a diferença entre eles', () => {
    const view = (atk: number | null, def: number | null) => ({ atk, def }) as never;
    expect(statDiff(view(12, null), view(10, null))).toBe('+2 atq');
    expect(statDiff(view(null, 5), view(null, 8))).toBe('-3 def');
    expect(statDiff(view(null, 8), null)).toBe('+8 def');
    expect(statDiff(view(10, null), view(10, null))).toBeNull();
  });
});

describe('Knight em grupo "lura" criaturas', () => {
  it('com o grupo parado, o Knight ataca a criatura ociosa mais próxima para trazê-la ao grupo', () => {
    const { sim, h, w } = withHero('knight');
    clearMonsters(sim);
    const spot = openField(sim);
    sim.teleportPlayer(spot.x, spot.y);
    putAt(sim, h, spot.x + 1, spot.y);
    w.social.party = { leaderId: w.human.id, members: [w.human.id, h.id], formation: 'follow', targeting: 'leader', friendlyFire: false, trail: [] };
    h.brain.mode = 'follow';
    const monster = [...w.monsters.values()][0]!;
    monster.alive = true;
    monster.def = { ...monster.def, aggroRadius: 0 }; // ociosa: não vem sozinha
    putAt(sim, monster, spot.x + 6, spot.y);
    monster.state = 'idle';
    advance(sim, 1500, 50);
    expect(h.targetId).toBe(monster.id);
  });
});
