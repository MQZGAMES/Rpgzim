// Ferramenta: heróis em vários níveis soltos por N minutos. Aponta (1) quando um herói fica PARADO apanhando sem
// atacar nem fugir por mais de 3 s e (2) o que cada um caça (nível da criatura x nível dele).
import { test } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { refreshStats } from '../../src/game/progression/progression';
import { asActor } from '../../src/game/simulation/World';
import { partyOf } from '../../src/game/social/social';
import { makeSim, advance } from '../helpers';
import type { HeroEntity } from '../../src/game/entities/types';

test('heróis travados', { timeout: 900_000 }, () => {
  if (!process.env.RPGZIM_TOOLS) return;
  const minutes = Number(process.env.HERO_MINUTES ?? 20);
  const levels = (process.env.HERO_LEVELS ?? '30,30,30,30').split(',').map(Number);
  const sim = makeSim('druid', { seed: Number(process.env.HERO_SEED ?? 11) });
  const w = sim.world;
  const defs = Object.values(GAME_DATA.heroes);
  const heroes = defs.map((def, i) => {
    const c = createCharacter(GAME_DATA, {
      id: def.slotId,
      name: def.name,
      vocation: def.vocation,
      now: 0,
      position: w.map.playerStart,
    });
    const level = levels[i % levels.length]!;
    c.level = level;
    c.bankGold = 20000 + level * 400;
    for (const k of ['sword', 'club', 'axe', 'distance', 'shielding'] as const)
      if (c.skills[k]) c.skills[k].level = Math.round(10 + level * 1.1);
    c.skills.magic.level = def.vocation === 'sorcerer' || def.vocation === 'druid' ? Math.round(level * 1.1) : Math.round(level / 4);
    const h = sim.addHero(def, c) as HeroEntity;
    asActor(w, h, () => refreshStats(w));
    h.character.health = h.stats.maxHealth;
    h.character.mana = h.stats.maxMana;
    return h;
  });
  // HERO_PARTY=1: todos no grupo do jogador, que fica parado (imortal) numa área de caça (HERO_SPOT=monstro)
  if (process.env.HERO_PARTY) {
    const sp = w.map.spawns.find((s) => s.monsterId === (process.env.HERO_SPOT ?? 'orc'))!;
    sim.teleportPlayer(sp.x, sp.y);
    w.social.party = {
      leaderId: w.human.id,
      members: [w.human.id, ...heroes.map((h) => h.id)],
      formation: 'follow',
      targeting: (process.env.HERO_TARGETING as 'leader' | 'nearest' | 'lure') ?? 'nearest',
      friendlyFire: false,
      trail: [],
    };
    for (const h of heroes) {
      h.x = sp.x;
      h.y = sp.y + 1;
    }
  }
  const t = () =>
    `${String(Math.floor(w.now / 60000)).padStart(2, '0')}:${String(Math.floor((w.now % 60000) / 1000)).padStart(2, '0')}`;
  const log: string[] = [];
  const hitAt = new Map<string, number>();
  const actedAt = new Map<string, number>();
  sim.events.on('damage', (e) => {
    if (heroes.some((h) => h.id === e.targetId) && e.amount > 0) hitAt.set(e.targetId, w.now);
    if (heroes.some((h) => h.id === e.sourceId)) actedAt.set(e.sourceId!, w.now);
  });
  const stuckSince = new Map<string, { at: number; x: number; y: number }>();
  const huntTime: Record<string, Record<string, number>> = {};
  let stuckEvents = 0;
  for (let s = 0; s < minutes * 60 * 4; s++) {
    advance(sim, 250, 50);
    w.human.character.health = w.human.stats.maxHealth;
    for (const h of heroes) {
      if (h.dead) {
        stuckSince.delete(h.id);
        continue;
      }
      if (h.brain.mode === 'hunt' && h.brain.quarry) {
        const r = (huntTime[h.character.name] ??= {});
        r[h.brain.quarry] = (r[h.brain.quarry] ?? 0) + 0.25;
      }
      const beingHit = w.now - (hitAt.get(h.id) ?? -1e9) < 1200;
      const acting = w.now - (actedAt.get(h.id) ?? -1e9) < 2500 || w.now - h.lastAttackAt < 2500;
      const st = stuckSince.get(h.id);
      if (beingHit && !acting && (!st || (st.x === h.x && st.y === h.y))) {
        if (!st) stuckSince.set(h.id, { at: w.now, x: h.x, y: h.y });
        else if (w.now - st.at > 3000) {
          stuckEvents++;
          const mons = [...w.monsters.values()]
            .filter((m) => m.alive && m.targetId === h.id)
            .map((m) => `${m.def.id}@${Math.max(Math.abs(m.x - h.x), Math.abs(m.y - h.y))}`);
          log.push(
            `${t()} TRAVADO ${h.character.name} modo=${h.brain.mode} alvo=${h.targetId} hp=${h.character.health}/${h.stats.maxHealth} mana=${h.character.mana} path=${h.path?.length ?? 0} move=${!!h.move} pz=${w.map.tiles ? '' : ''} atacantes=[${mons.join(',')}] grupo=${!!partyOf(w, h.id)} arma=${h.character.equipment.mainHand?.itemId}`,
          );
          stuckSince.set(h.id, { at: w.now + 1e9, x: h.x, y: h.y });
        }
      } else stuckSince.delete(h.id);
    }
  }
  const hunts = Object.entries(huntTime)
    .map(
      ([name, r]) =>
        `${name}: ` +
        Object.entries(r)
          .sort((a, b) => b[1] - a[1])
          .map(([id, sec]) => `${id}(n${w.data.monsters[id]?.level}) ${Math.round(sec / 60)}min`)
          .join(', '),
    )
    .join('\n');
  process.stderr.write(
    log.join('\n') +
      `\n\nTRAVADAS: ${stuckEvents}\nCAÇAS:\n${hunts}\n` +
      heroes
        .map(
          (h) =>
            `${h.character.name}: nível ${h.character.level} mortes ${h.character.stats.deaths} modo ${h.brain.mode}`,
        )
        .join(' | ') +
      '\n',
  );
});
