// PK estilo Tibia: caveiras branca/amarela/vermelha, PZ lock, mortes injustas, renovação de 30 s, perdas da morte,
// Amuleto da Perda e persistência entre sessões.
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { countItem } from '../../src/domain/rules/inventory';
import { actorSource, damagePlayer, respawnPlayer } from '../../src/game/combat/combat';
import { canEnter } from '../../src/game/movement/movement';
import {
  PZ_LOCK_ATTACK_MS,
  PZ_LOCK_KILL_MS,
  RED_SKULL_MS,
  SKULL_RENEW_MS,
  isPzLocked,
  loadPk,
  pzLockMs,
  registerAggression,
  savePk,
  skullOf,
  skullSeenBy,
  touchCombat,
  updateSocial,
} from '../../src/game/social/social';
import { asActor } from '../../src/game/simulation/World';
import type { GameSimulation } from '../../src/game/simulation/GameSimulation';
import type { HeroEntity } from '../../src/game/entities/types';
import { buildSnapshot } from '../../src/integration/game-ui-bridge/snapshot';
import { advance, makeSim } from '../helpers';

function world() {
  const sim = makeSim('knight', { seed: 5 });
  const hero = GAME_DATA.heroes.boladex!;
  const c = createCharacter(GAME_DATA, {
    id: hero.slotId,
    name: hero.name,
    vocation: hero.vocation,
    now: 0,
    position: sim.world.map.playerStart,
  });
  const h = sim.addHero(hero, c);
  h.brain.nextThinkAt = Infinity; // o herói não age sozinho nos testes
  sim.setPvp(true);
  return { sim, h, w: sim.world, human: sim.world.human };
}

/** O atacante mata a vítima com um golpe (a vítima toma o dano no próprio contexto). */
function kill(
  sim: GameSimulation,
  killer: HeroEntity | GameSimulation['world']['human'],
  victim: HeroEntity | GameSimulation['world']['human'],
) {
  const w = sim.world;
  victim.invulnerableUntil = 0;
  registerAggression(w, killer.id, victim.id);
  asActor(w, victim, () => damagePlayer(w, 999999, 'physical', actorSource(killer), true));
}

describe('PK: caveiras e PZ lock', () => {
  it('atacar quem não tem caveira dá caveira branca e PZ lock de 2 min (a caveira dura o PZ lock)', () => {
    const { w, h, human } = world();
    registerAggression(w, human.id, h.id);
    expect(skullOf(w, human.id)?.kind).toBe('white');
    expect(pzLockMs(w, human.id)).toBe(PZ_LOCK_ATTACK_MS);
    expect(skullOf(w, human.id)!.until - w.now).toBe(PZ_LOCK_ATTACK_MS);
    expect(skullOf(w, h.id)).toBeNull(); // quem apanha não ganha nada
  });

  it('quem REVIDA contra o agressor não fica com caveira amarela (só o PZ lock)', () => {
    const { w, h, human } = world();
    registerAggression(w, human.id, h.id); // o humano ataca primeiro: caveira branca
    registerAggression(w, h.id, human.id); // o herói (vítima) revida
    expect(skullOf(w, h.id)).toBeNull();
    expect(isPzLocked(w, h.id)).toBe(true);
  });

  it('um TERCEIRO que ataca a caveira branca sem ter sido atacado por ela fica com caveira amarela', () => {
    const { sim, w, h, human } = world();
    registerAggression(w, human.id, 'hero:vitima'); // o humano é agressor (branca)
    // o herói nunca foi atacado pelo humano: se bater nele, é um terceiro
    expect(skullOf(w, h.id)).toBeNull();
    registerAggression(w, h.id, human.id);
    expect(skullOf(w, h.id)?.kind).toBe('yellow');
    expect(skullOf(w, h.id)!.until - w.now).toBe(PZ_LOCK_ATTACK_MS);
    // e matar a caveira amarela não é morte injusta (só PZ lock de 5 min)
    kill(sim, human, h);
    expect(w.social.unjust.get(human.id) ?? []).toHaveLength(0);
    expect(pzLockMs(w, human.id)).toBe(PZ_LOCK_KILL_MS);
  });

  it('atacar uma caveira vermelha é justo (sem caveira, só PZ lock)', () => {
    const b = world();
    b.w.social.skulls.set(b.h.id, { kind: 'red', until: b.w.now + RED_SKULL_MS });
    registerAggression(b.w, b.human.id, b.h.id);
    expect(skullOf(b.w, b.human.id)).toBeNull();
    expect(isPzLocked(b.w, b.human.id)).toBe(true);
  });

  it('o PZ lock impede entrar em áreas protegidas (lojas, templo) e a caveira some junto com ele', () => {
    const { sim, w, human } = world();
    const door = w.map.doors.find((d) => d.buildingId === 'temple')!;
    sim.teleportPlayer(door.x, door.y + 2);
    expect(canEnter(w, door.x, door.y, false, human.id)).toBe(true);
    registerAggression(w, human.id, 'hero:boladex');
    expect(canEnter(w, door.x, door.y, false, human.id)).toBe(false);
    advance(sim, PZ_LOCK_ATTACK_MS - 1000, 250);
    expect(skullOf(w, human.id)?.kind).toBe('white'); // ainda marcado enquanto o PZ lock durar
    advance(sim, 1500, 250);
    updateSocial(w);
    expect(isPzLocked(w, human.id)).toBe(false);
    expect(skullOf(w, human.id)).toBeNull(); // só some quando o PZ some
    expect(canEnter(w, door.x, door.y, false, human.id)).toBe(true);
  });

  it('matar quem não tem caveira: PZ lock e caveira de 5 min, aviso na tela; 3 mortes injustas = VERMELHA de 24 h', () => {
    const { sim, w, h, human } = world();
    const notices: { text: string; danger: boolean }[] = [];
    sim.events.on('pkNotice', (e) => notices.push(e));
    kill(sim, human, h);
    respawnPlayer2(sim, h);
    expect(notices.some((n) => n.danger && n.text.includes('MORTE INJUSTA'))).toBe(true);
    expect(pzLockMs(w, human.id)).toBe(PZ_LOCK_KILL_MS);
    expect(skullOf(w, human.id)!.until - w.now).toBe(PZ_LOCK_KILL_MS); // a caveira acompanha o PZ lock
    for (let i = 0; i < 2; i++) {
      kill(sim, human, h);
      respawnPlayer2(sim, h);
    }
    expect(skullOf(w, human.id)?.kind).toBe('red');
    expect(skullOf(w, human.id)!.until - w.now).toBe(RED_SKULL_MS);
    expect(notices.at(-1)!.text).toContain('VERMELHA');
  });

  it('matar uma caveira branca/amarela não é morte injusta, mesmo repetido', () => {
    const { sim, w, h, human } = world();
    for (let i = 0; i < 3; i++) {
      w.social.skulls.set(h.id, { kind: 'white', until: w.now + 120000 });
      kill(sim, human, h);
      respawnPlayer2(sim, h);
    }
    expect(skullOf(w, human.id)?.kind).not.toBe('red');
    expect(w.social.unjust.get(human.id) ?? []).toHaveLength(0);
    expect(pzLockMs(w, human.id)).toBeGreaterThan(4 * 60000);
  });

  describe('quem matou: o último personagem que bateu e o de maior dano (até 2)', () => {
    const hit = (
      w: ReturnType<typeof world>['w'],
      victim: HeroEntity,
      raw: number,
      src: { id: string; name: string; kind: 'player' | 'monster' },
    ) => {
      victim.invulnerableUntil = 0;
      asActor(w, victim, () => damagePlayer(w, raw, 'fire', src, true));
    };
    const monster = { id: 'mon:troll', name: 'Troll', kind: 'monster' as const };
    const second = (sim: GameSimulation) => {
      const def = GAME_DATA.heroes.maguim!;
      const c = createCharacter(GAME_DATA, {
        id: def.slotId,
        name: def.name,
        vocation: def.vocation,
        now: 0,
        position: sim.world.map.playerStart,
      });
      const m = sim.addHero(def, c);
      m.brain.nextThinkAt = Infinity;
      return m;
    };

    it('matar junto com criaturas também é morte injusta (o dano dos monstros não tira o crédito)', () => {
      const { w, h, human } = world();
      h.character.health = h.stats.maxHealth = 400;
      registerAggression(w, human.id, h.id);
      hit(w, h, 10, actorSource(human));
      hit(w, h, 150, monster);
      hit(w, h, 150, monster);
      hit(w, h, 999, monster); // golpe final de uma criatura
      expect(h.dead).toBe(true);
      expect(w.social.unjust.get(human.id)).toHaveLength(1);
      expect(pzLockMs(w, human.id)).toBe(PZ_LOCK_KILL_MS);
    });

    it('o último que bateu e o que deu mais dano pegam os dois; um terceiro que só raspou, não', () => {
      const { sim, w, h, human } = world();
      const m = second(sim);
      const third = { id: 'hero:longe', name: 'Longe', kind: 'player' as const }; // não é personagem do mundo
      h.character.health = h.stats.maxHealth = 700;
      hit(w, h, 600, actorSource(m)); // maior dano
      hit(w, h, 50, third);
      hit(w, h, 60, actorSource(human)); // último golpe
      expect(h.dead).toBe(true);
      expect(w.social.unjust.get(human.id)).toHaveLength(1);
      expect(w.social.unjust.get(m.id)).toHaveLength(1);
    });

    it('com três personagens, quem não foi o último nem o de maior dano escapa da morte injusta', () => {
      const { sim, w, h, human } = world();
      const m = second(sim);
      h.character.health = h.stats.maxHealth = 1000;
      hit(w, h, 100, actorSource(human));
      hit(w, h, 700, monster);
      hit(w, h, 150, actorSource(m)); // maior dano entre personagens
      hit(w, h, 999, monster);
      expect(h.dead).toBe(true);
      // o último PERSONAGEM a bater também foi o de maior dano: só ele
      expect(w.social.unjust.get(m.id)).toHaveLength(1);
      expect(w.social.unjust.get(human.id) ?? []).toHaveLength(0);
    });

    it('quem foi morto injustamente vê o assassino com caveira amarela e se vinga sem caveira (só PZ lock)', () => {
      const { sim, w, h, human } = world();
      kill(sim, h, human); // o herói mata o jogador injustamente
      expect(w.social.unjust.get(h.id)).toHaveLength(1);
      expect(skullSeenBy(w, human.id, h.id)).toBe('white'); // enquanto tiver a branca, aparece a branca
      // passa a caveira branca do herói: para o jogador ele continua amarelo
      w.social.skulls.delete(h.id);
      w.social.pzLocks.delete(h.id);
      respawnPlayer2(sim, human as unknown as HeroEntity);
      expect(skullSeenBy(w, human.id, h.id)).toBe('yellow');
      expect(skullSeenBy(w, 'outro', h.id)).toBeNull();
      expect(buildSnapshot(sim, 1).heroes.find((x) => x.id === h.id)!.skull).toBe('yellow');
      registerAggression(w, human.id, h.id);
      expect(skullOf(w, human.id)).toBeNull();
      expect(isPzLocked(w, human.id)).toBe(true);
      kill(sim, human, h);
      expect(h.dead).toBe(true);
      expect(w.social.unjust.get(human.id) ?? []).toHaveLength(0);
      expect(skullOf(w, human.id)).toBeNull();
      expect(pzLockMs(w, human.id)).toBe(PZ_LOCK_KILL_MS);
    });

    it('quem dá o MAIOR dano e o último golpe pega a morte (injusta se a vítima não tinha caveira)', () => {
      const { sim, w, h, human } = world();
      const notices: string[] = [];
      sim.events.on('pkNotice', (e) => notices.push(e.text));
      h.character.health = h.stats.maxHealth = 400;
      registerAggression(w, human.id, h.id);
      hit(w, h, 100, monster);
      hit(w, h, 120, actorSource(human));
      hit(w, h, 500, actorSource(human)); // maior dano e golpe final
      expect(h.dead).toBe(true);
      expect(w.social.unjust.get(human.id)).toHaveLength(1);
      expect(pzLockMs(w, human.id)).toBe(PZ_LOCK_KILL_MS);
      expect(notices.some((t) => t.includes('MORTE INJUSTA'))).toBe(true);
    });
  });

  it('com menos de 30 s de PZ lock/caveira, qualquer combate renova para 30 s; sem lutar por 30 s tudo acaba', () => {
    const { sim, w, human } = world();
    registerAggression(w, human.id, 'hero:boladex');
    advance(sim, PZ_LOCK_ATTACK_MS - 10000, 250); // faltam ~10 s
    updateSocial(w);
    const left = () => skullOf(w, human.id)!.until - w.now;
    expect(left()).toBeLessThan(SKULL_RENEW_MS);
    touchCombat(w, human.id); // lutou (atacou ou foi atacado)
    expect(left()).toBe(SKULL_RENEW_MS);
    expect(pzLockMs(w, human.id)).toBe(SKULL_RENEW_MS);
    advance(sim, SKULL_RENEW_MS + 500, 250);
    updateSocial(w);
    expect(skullOf(w, human.id)).toBeNull();
    expect(isPzLocked(w, human.id)).toBe(false);
    // com mais de 30 s restantes nada é renovado; caveira vermelha nunca renova
    const b = world();
    registerAggression(b.w, b.human.id, 'hero:boladex');
    const before = pzLockMs(b.w, b.human.id);
    touchCombat(b.w, b.human.id);
    expect(pzLockMs(b.w, b.human.id)).toBe(before);
    b.w.social.skulls.set(b.human.id, { kind: 'red', until: b.w.now + 5000 });
    touchCombat(b.w, b.human.id);
    expect(skullOf(b.w, b.human.id)!.until - b.w.now).toBe(5000);
  });

  it('ser atacado por uma criatura também renova o PZ lock/caveira que está acabando', () => {
    const { w, human } = world();
    w.social.skulls.set(human.id, { kind: 'white', until: w.now + 8000 });
    w.social.pzLocks.set(human.id, w.now + 8000);
    human.invulnerableUntil = 0;
    damagePlayer(w, 1, 'physical', { id: 'mon:x', name: 'Slime', kind: 'monster' }, true);
    expect(skullOf(w, human.id)!.until - w.now).toBe(SKULL_RENEW_MS);
    expect(pzLockMs(w, human.id)).toBe(SKULL_RENEW_MS);
  });
});

/** Revive o herói (mortes repetidas nos testes). */
function respawnPlayer2(sim: GameSimulation, h: HeroEntity) {
  asActor(sim.world, h, () => respawnPlayer(sim.world));
}

describe('morte: perdas, Amuleto da Perda e caveira', () => {
  const rig = (loseEquip: boolean) => {
    const t = world();
    const c = t.human.character;
    c.inventory.fill(null);
    c.inventory[0] = { itemId: 'potion_health', count: 4 };
    c.inventory[5] = { itemId: 'slime_gel', count: 7 };
    c.gold = 321;
    (t.w.rng as { chance: (p: number) => boolean }).chance = () => loseEquip;
    t.human.invulnerableUntil = 0;
    return t;
  };
  const die = (t: ReturnType<typeof world>) =>
    asActor(t.w, t.human, () =>
      damagePlayer(t.w, 999999, 'fire', { id: 'mon:x', name: 'Troll', kind: 'monster' }, true),
    );

  it('perde TODA a mochila e o dinheiro (saco no chão, sem expirar) e cada equipado tem 10% de chance de cair', () => {
    const t = rig(false);
    const equipped = Object.keys(t.human.character.equipment).length;
    die(t);
    const bag = [...t.w.lootBags.values()].find((b) => b.ownerId === t.human.id)!;
    expect(bag).toBeTruthy();
    expect(bag.gold).toBe(321);
    expect(bag.items.map((i) => i.itemId).sort()).toEqual(['potion_health', 'slime_gel']);
    expect(bag.expiresAt).toBe(Infinity);
    expect(t.human.character.gold).toBe(0);
    expect(t.human.character.inventory.every((s) => s === null)).toBe(true);
    expect(Object.keys(t.human.character.equipment)).toHaveLength(equipped); // 10% não saiu
    // o equipado, com a sorte contra, também cai
    const u = rig(true);
    die(u);
    const ub = [...u.w.lootBags.values()].find((b) => b.ownerId === u.human.id)!;
    expect(Object.keys(u.human.character.equipment)).toHaveLength(0);
    expect(ub.items.length).toBeGreaterThan(2);
    // sem ouro não vira saco com ouro zero; qualquer um pode pegar (o saco não é do dono)
    expect(ub.sourceName).toContain('morto');
  });

  it('o Amuleto da Perda protege tudo e se desfaz', () => {
    const t = rig(true);
    t.human.character.equipment.amulet = { itemId: 'amulet_loss', count: 1 };
    die(t);
    expect([...t.w.lootBags.values()].some((b) => b.ownerId === t.human.id)).toBe(false);
    expect(t.human.character.gold).toBe(321);
    expect(countItem(t.human.character.inventory, 'potion_health')).toBe(4);
    expect(t.human.character.equipment.amulet).toBeUndefined(); // sumiu
    expect(Object.keys(t.human.character.equipment).length).toBeGreaterThan(0); // o equipamento ficou
  });

  it('a loja vende o Amuleto da Perda por 10.000 em todas as lojas', () => {
    for (const shop of Object.values(GAME_DATA.shops))
      expect(shop.sells.find((o) => o.itemId === 'amulet_loss')?.price).toBe(10000);
  });

  it('caveira vermelha perde todos os equipados; branca/amarela renascem sem caveira e sem PZ lock', () => {
    const t = rig(false);
    t.w.social.skulls.set(t.human.id, { kind: 'red', until: t.w.now + RED_SKULL_MS });
    die(t);
    expect(Object.keys(t.human.character.equipment)).toHaveLength(0);
    expect(skullOf(t.w, t.human.id)?.kind).toBe('red'); // a caveira continua contando as 24 h
    expect(isPzLocked(t.w, t.human.id)).toBe(false);
    const u = rig(false);
    registerAggression(u.w, u.human.id, 'hero:boladex');
    expect(isPzLocked(u.w, u.human.id)).toBe(true);
    die(u);
    expect(skullOf(u.w, u.human.id)).toBeNull();
    expect(isPzLocked(u.w, u.human.id)).toBe(false);
  });
});

describe('PK: persistência e interface', () => {
  it('a caveira vermelha e o PZ lock valem entre sessões (tempo real)', () => {
    const { w, human } = world();
    w.social.skulls.set(human.id, { kind: 'red', until: w.now + 20 * 3600000 });
    w.social.pzLocks.set(human.id, w.now + 90000);
    w.social.unjust.set(human.id, [w.now - 1000, w.now - 2000]);
    savePk(w, human);
    expect(human.character.pk?.skull).toBe('red');
    // outra sessão (relógio da simulação recomeça do zero): continua marcado pelo tempo restante
    const next = world();
    next.human.character.pk = structuredClone(human.character.pk);
    loadPk(next.w, next.human);
    expect(skullOf(next.w, next.human.id)?.kind).toBe('red');
    expect(skullOf(next.w, next.human.id)!.until - next.w.now).toBeGreaterThan(19 * 3600000);
    expect(pzLockMs(next.w, next.human.id)).toBeGreaterThan(80000);
    expect(next.w.social.unjust.get(next.human.id)).toHaveLength(2);
  });

  it('o snapshot informa a caveira (tipo e tempo) e o PZ lock', () => {
    const { sim, w, h, human } = world();
    registerAggression(w, human.id, h.id);
    const pk = buildSnapshot(sim, 1).pk;
    expect(pk.skull).toBe('white');
    expect(pk.skullMs).toBeGreaterThan(110000); // a caveira dura o PZ lock (2 min)
    expect(pk.pzLockMs).toBeGreaterThan(110000);
  });
});

describe('PK: o tempo é o do relógio (não o do jogo ativo)', () => {
  it('com o relógio real, caveira e PZ lock passam mesmo com o jogo parado (pausado ou fechado)', () => {
    const { sim, w, human } = world();
    let real = 1_000_000;
    w.social.clock = () => real;
    registerAggression(w, human.id, 'hero:boladex'); // caveira branca + PZ lock de 2 min
    expect(skullOf(w, human.id)?.kind).toBe('white');
    // o jogo fica parado (o tempo da simulação não anda), mas o relógio avança 3 min
    const simNow = w.now;
    real += 3 * 60000;
    expect(w.now).toBe(simNow);
    expect(skullOf(w, human.id)).toBeNull();
    expect(isPzLocked(w, human.id)).toBe(false);
    void sim;
  });

  it('salvou com caveira branca e voltou depois do prazo: sumiu; a vermelha só some depois de 24 h', () => {
    const { w, human } = world();
    const now = Date.now();
    human.character.pk = { skull: 'white', skullUntil: now - 1000, pzLockUntil: now - 1000, unjust: [] };
    loadPk(w, human);
    expect(skullOf(w, human.id)).toBeNull();
    expect(isPzLocked(w, human.id)).toBe(false);
    // caveira vermelha com 23 h restantes continua; passadas as 24 h, some
    human.character.pk = { skull: 'red', skullUntil: now + 23 * 3600000, pzLockUntil: 0, unjust: [] };
    loadPk(w, human);
    expect(skullOf(w, human.id)?.kind).toBe('red');
    w.social.skulls.clear();
    human.character.pk = { skull: 'red', skullUntil: now - 5 * 60000, pzLockUntil: 0, unjust: [] };
    loadPk(w, human);
    expect(skullOf(w, human.id)).toBeNull();
  });
});
