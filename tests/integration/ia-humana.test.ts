// Heróis com jeito de gente: tempo de reação, pausa depois de matar, sessões de jogo (saem para uma pausa e voltam),
// AFK, conversa entre eles (cumprimento e resposta "digitando"), anúncios de comércio e o jeito de escrever de cada um.
// Mais a temporada 2: XP pela metade, kit inicial com 50 poções de vida e de mana e o recomeço de todos os saves.
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { PLAYER_START } from '../../src/data/maps/world';
import { createCharacter } from '../../src/domain/rules/character';
import { countItem } from '../../src/domain/rules/inventory';
import { SEASON } from '../../src/domain/rules/season';
import type { HeroEntity, MonsterEntity } from '../../src/game/entities/types';
import { heroActivity, heroHelpers, profileOf } from '../../src/game/ai/heroBrain';
import { humanProfile, styleLine } from '../../src/game/ai/heroHuman';
import { placeOccupant, removeOccupant } from '../../src/game/movement/movement';
import { parseSave, toSaveFile } from '../../src/game/persistence/saveSchema';
import { acceptInvite, invite } from '../../src/game/social/social';
import { asActor } from '../../src/game/simulation/World';
import { refreshStats } from '../../src/game/progression/progression';
import { buildSnapshot } from '../../src/integration/game-ui-bridge/snapshot';
import { advance, makeSim } from '../helpers';

const D = GAME_DATA;

function withHeroes(ids: string[], level = 12, seed = 31) {
  const sim = makeSim('knight', { seed });
  const w = sim.world;
  const hs = ids.map((id) => {
    const def = D.heroes[id]!;
    const c = createCharacter(D, { id: def.slotId, name: def.name, vocation: def.vocation, now: 0, position: w.map.playerStart });
    c.level = level;
    return sim.addHero(def, c) as HeroEntity;
  });
  return { sim, w, hs };
}

function wolfNextTo(w: ReturnType<typeof withHeroes>['w'], h: HeroEntity): MonsterEntity {
  const m = [...w.monsters.values()].find((x) => x.def.id === 'wolf')! as MonsterEntity;
  removeOccupant(w, m as unknown as HeroEntity);
  m.x = h.x + 1;
  m.y = h.y;
  m.hp = 1e6;
  m.homeX = m.x; // (sem voltar para casa: fica brigando ali)
  m.homeY = m.y;
  m.state = 'attacking';
  m.targetId = h.id;
  placeOccupant(w, m as unknown as HeroEntity);
  return m;
}

describe('jeito de escrever e perfil humano', () => {
  it('cada um escreve do seu jeito: casual abrevia e tira acento, seco não festeja, animado exclama', () => {
    const zero = () => 0;
    const casual = styleLine('Você também vem? Valeu, está ótimo!', 'casual', zero);
    expect(casual).toContain('vc');
    expect(casual).toContain('tb');
    expect(casual).toContain('vlw');
    expect(casual).not.toMatch(/[áéíóúãõç]/);
    expect(styleLine('Bora caçar!', 'seco', zero)).toBe('Bora caçar.');
    expect(styleLine('Bora caçar!', 'animado', zero)).toBe('Bora caçar!!');
    expect(styleLine('Menos um!', 'casual', zero, true)).toMatch(/kkk$/);
  });

  it('perfil fixo por herói: tempo de reação humano, ritmo de magias e o estilo de cada um', () => {
    const p = (id: string) => humanProfile(D.heroes[id]!);
    expect(p('boladex')).toEqual(p('boladex'));
    for (const id of Object.keys(D.heroes)) {
      expect(p(id).reactionMs).toBeGreaterThanOrEqual(230);
      expect(p(id).reactionMs).toBeLessThanOrEqual(640);
      expect(p(id).apm).toBeGreaterThan(0.85);
    }
    expect([p('boladex').style, p('maguim').style, p('mano_cura').style, p('distanciado').style]).toEqual(['animado', 'casual', 'educado', 'seco']);
  });
});

describe('reação humana', () => {
  it('com a vida baixa bebe a poção um instante depois (no aperto, na hora)', () => {
    const { w, hs } = withHeroes(['boladex']);
    const h = hs[0]!;
    wolfNextTo(w, h);
    const used: string[] = [];
    h.scope.events.on('itemUsed', (e) => e.itemId.startsWith('potion_health') && used.push(e.itemId));
    asActor(w, h, () => refreshStats(w)); // (atributos do nível 12)
    h.character.mana = h.stats.maxMana;
    h.character.health = Math.round(h.stats.maxHealth * 0.36);
    asActor(w, h, () => heroHelpers.survive(w, h));
    expect(used).toHaveLength(0); // percebeu, ainda não reagiu
    w.now += Math.round(profileOf(h).reactionMs * 1.4);
    asActor(w, h, () => heroHelpers.survive(w, h));
    expect(used).toContain('potion_health');
    // no aperto: na hora
    used.length = 0;
    w.now += 5000;
    h.character.health = Math.round(h.stats.maxHealth * 0.2);
    asActor(w, h, () => heroHelpers.survive(w, h));
    expect(used).toContain('potion_health');
  });

  it('depois de matar, olha a tela antes de puxar a próxima criatura', () => {
    const { sim, w, hs } = withHeroes(['boladex'], 15);
    const h = hs[0]!;
    const wolves = [...w.monsters.values()].filter((m) => m.def.id === 'wolf' && m.alive);
    sim.teleportPlayer(5, 5);
    asActor(w, h, () => sim.teleportPlayer(wolves[0]!.x - 3, wolves[0]!.y));
    h.brain.mode = 'hunt';
    h.brain.quarry = 'wolf';
    h.brain.spot = { x: wolves[0]!.x, y: wolves[0]!.y };
    h.brain.human.lastTarget = 'monstro-que-acabou-de-morrer';
    h.targetId = null;
    asActor(w, h, () => heroHelpers.huntTick(w, h));
    expect(h.targetId).toBeNull(); // olhando a tela
    expect(h.brain.human.lookUntil).toBeGreaterThan(w.now);
    w.now = h.brain.human.lookUntil + 1;
    asActor(w, h, () => heroHelpers.huntTick(w, h));
    expect(h.targetId).not.toBeNull();
  });
});

describe('sessões de jogo, pausas e AFK (jogo de verdade)', () => {
  it('no fim da sessão avisa, desloga num lugar seguro e volta depois da pausa com o mesmo progresso', () => {
    const { sim, w, hs } = withHeroes(['boladex'], 9);
    w.lifelike = true;
    const h = hs[0]!;
    h.character.experience = 5000;
    const speech: string[] = [];
    sim.events.on('speech', (e) => speech.push(`${e.name}: ${e.text}`));
    const out: string[] = [];
    sim.events.on('heroLoggedOut', (e) => out.push(e.character.name));
    h.brain.human.sessionEnds = w.now + 1;
    advance(sim, 3000, 50);
    expect(w.heroes.has(h.id)).toBe(false);
    expect(out).toEqual(['Boladex']);
    expect(buildSnapshot(sim, 1).resting.map((r) => r.name)).toEqual(['Boladex']);
    // a pausa acaba: volta sozinho, com o mesmo progresso, e avisa no chat
    sim.resting[0]!.backAt = w.now + 500;
    advance(sim, 3000, 50);
    const back = [...w.heroes.values()].find((x) => x.hero.id === 'boladex')!;
    expect(back).toBeDefined();
    expect(back.character.experience).toBe(5000);
    expect(speech.length).toBeGreaterThanOrEqual(2); // a despedida e a volta
  });

  it('não sai do jogo no meio de um grupo com você', () => {
    const { sim, w, hs } = withHeroes(['boladex'], 9);
    w.lifelike = true;
    const h = hs[0]!;
    invite(w, w.human.id, h.id);
    acceptInvite(w, h.id, w.human.id);
    h.brain.human.sessionEnds = w.now + 1;
    advance(sim, 3000, 50);
    expect(w.heroes.has(h.id)).toBe(true);
  });

  it('AFK: fica parado (status "ausente") e volta se alguém o ataca', () => {
    const { sim, w, hs } = withHeroes(['maguim'], 9);
    w.lifelike = true;
    const h = hs[0]!;
    asActor(w, h, () => sim.teleportPlayer(48, 30)); // na praça (fora das construções, onde criatura ataca)
    h.brain.human.afkUntil = w.now + 60000;
    h.brain.human.sessionEnds = w.now + 3600000;
    const at = { x: h.x, y: h.y };
    advance(sim, 4000, 50);
    expect({ x: h.x, y: h.y }).toEqual(at);
    expect(heroActivity(w, h)).toBe('ausente (AFK)');
    wolfNextTo(w, h);
    advance(sim, 600, 50);
    expect(h.brain.human.afkUntil).toBe(0);
  });
});

describe('conversa entre os heróis', () => {
  it('quem chega perto na vila é cumprimentado e o outro responde depois de "digitar"', () => {
    const { sim, w, hs } = withHeroes(['boladex', 'maguim'], 9);
    const [a, b] = hs as [HeroEntity, HeroEntity];
    asActor(w, b, () => sim.teleportPlayer(a.x + 2, a.y));
    for (const h of hs) {
      h.brain.mode = 'social';
      h.brain.modeUntil = w.now + 120000;
    }
    const speech: { name: string; text: string; at: number }[] = [];
    sim.events.on('speech', (e) => speech.push({ name: e.name, text: e.text, at: w.now }));
    advance(sim, 20000, 50);
    const greet = speech.find((s) => s.text.toLowerCase().includes('maguim') || s.text.toLowerCase().includes('boladex'));
    expect(greet).toBeDefined();
    const reply = speech.find((s) => s.name !== greet!.name && s.at > greet!.at);
    expect(reply).toBeDefined();
    expect(reply!.at - greet!.at).toBeGreaterThanOrEqual(1000); // "digitando"
  });

  it('quem está perto dá "gz" quando você sobe de nível (depois de digitar)', () => {
    const { sim, w, hs } = withHeroes(['boladex', 'maguim', 'mano_cura'], 9);
    for (const h of hs) asActor(w, h, () => sim.teleportPlayer(w.human.x + 2, w.human.y + 1));
    const speech: { text: string; at: number }[] = [];
    sim.events.on('speech', (e) => speech.push({ text: e.text, at: w.now }));
    const t0 = w.now;
    w.human.scope.events.emit('levelUp', { level: 2 });
    advance(sim, 6000, 50);
    const name = w.human.character.name;
    const gz = speech.filter((s) => s.text.includes(name) && /gz|parab|up|voando/i.test(s.text));
    expect(gz.length).toBeGreaterThan(0);
    expect(gz[0]!.at - t0).toBeGreaterThanOrEqual(1000); // "digitando"
  });

  it('anuncia no chat o que pôs à venda no mercado', () => {
    const { sim, w, hs } = withHeroes(['boladex'], 20);
    const h = hs[0]!;
    const speech: string[] = [];
    sim.events.on('speech', (e) => speech.push(e.text));
    h.character.inventory.fill(null);
    h.character.inventory[0] = { itemId: 'robe_mystic', count: 1 };
    asActor(w, h, () => {
      w.ui.market = { npcId: 'npc:broker' };
      heroHelpers.marketing(w, h);
    });
    expect(speech.some((t) => t.includes(D.items.robe_mystic!.name))).toBe(true);
  });
});

describe('temporada 2: XP pela metade e recomeço', () => {
  it('as criaturas dão metade da experiência', () => {
    expect(D.balance.creatures.xpRate).toBe(0.5);
    expect(D.monsters.slime!.experience).toBe(Math.round(D.balance.creatures.baseExperience * 0.5));
  });

  it('todo personagem novo começa com o equipamento básico e 50 poções de vida e 50 de mana', () => {
    for (const voc of ['knight', 'paladin', 'sorcerer', 'druid'] as const) {
      const c = createCharacter(D, { id: voc, name: `Teste ${voc}`, vocation: voc, now: 0, position: { ...PLAYER_START } });
      expect(countItem(c.inventory, 'potion_health'), voc).toBe(50);
      expect(countItem(c.inventory, 'potion_mana'), voc).toBe(50);
      expect(c.level).toBe(1);
      expect(c.season).toBe(SEASON);
    }
  });

  it('save de temporada anterior recomeça do nível 1 com o kit (mantém nome, vocação e configurações)', () => {
    const old = createCharacter(D, { id: 'veterano', name: 'Veterano', vocation: 'paladin', now: 123, position: { x: 200, y: 140 } });
    old.experience = 4_000_000;
    old.level = 80;
    old.gold = 99999;
    old.bankGold = 500000;
    old.depot[0] = { itemId: 'bow_royal', count: 1 };
    old.settings = { auto: { autoHeal: true, healBelow: 0.7 } };
    delete old.season; // (saves antigos não tinham temporada)
    const f = parseSave(D, toSaveFile(old), PLAYER_START);
    expect(f.reset).toBe(true);
    const c = f.character;
    expect([c.id, c.name, c.vocation, c.createdAt]).toEqual(['veterano', 'Veterano', 'paladin', 123]);
    expect(c.level).toBe(1);
    expect(c.experience).toBe(0);
    expect(c.bankGold).toBe(0);
    expect(c.depot.every((s) => !s)).toBe(true);
    expect(c.position).toEqual(PLAYER_START);
    expect(countItem(c.inventory, 'potion_health')).toBe(50);
    expect(countItem(c.inventory, 'potion_mana')).toBe(50);
    expect(c.settings?.auto).toMatchObject({ autoHeal: true });
    // gravado de novo, não recomeça outra vez
    expect(parseSave(D, toSaveFile(c), PLAYER_START).reset).toBeUndefined();
  });
});
