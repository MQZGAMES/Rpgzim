// Ferramenta: Paladin caçando sozinho (herói padrão, nível 4, 500 de ouro, kit inicial), mesmas sementes. Mede XP/h,
// abates, poções, mortes, tempo fugindo, tamanho do trem, Chuva de Flechas e quão perto as criaturas chegam.
// Uso (PowerShell): $env:RPGZIM_TOOLS='1'; $env:KITE_TAG='novo'; npx vitest run --testTimeout=3600000 tests/tools/paladin-kite.test.ts
import { test } from 'vitest';
import { appendFileSync } from 'node:fs';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { totalXpForLevel } from '../../src/domain/rules/experience';
import { chebyshev } from '../../src/domain/value-objects/position';
import { makeSim, advance } from '../helpers';
import type { HeroEntity } from '../../src/game/entities/types';

const SEEDS = (process.env.KITE_SEEDS ?? '11,23,37').split(',').map(Number);
const MINUTES = Number(process.env.KITE_MINUTES ?? 12);
const OUT = process.env.KITE_OUT ?? 'C:/Users/Public/paladin-kite.jsonl';

test('Paladin solo', () => {
  for (const seed of SEEDS) {
    const sim = makeSim('knight', { seed });
    const w = sim.world;
    const def = GAME_DATA.heroes.distanciado!;
    const c = createCharacter(GAME_DATA, { id: def.slotId, name: def.name, vocation: def.vocation, now: 0, position: w.map.playerStart });
    c.level = 4;
    c.experience = totalXpForLevel(4, GAME_DATA.balance.experience);
    c.gold = 500;
    const h = sim.addHero(def, c) as HeroEntity;
    let xp = 0, kills = 0, deaths = 0, hp = 0, mp = 0, rain = 0, maxTrain = 0, trainSec = 0, trainSum = 0, adjSec = 0, fightSec = 0;
    const modeS: Record<string, number> = {};
    h.scope.events.on('xpGained', (e) => { xp += e.amount; kills++; });
    h.scope.events.on('itemUsed', (e) => { if (e.itemId.startsWith('potion_health')) hp++; else if (e.itemId.startsWith('potion_mana')) mp++; });
    w.events.on('spellCast', (e) => { if (e.casterId === h.id && e.spellId === 'arrow_rain') rain++; });
    w.events.on('entityDied', (e) => { if (e.entityId === h.id) deaths++; });
    for (let s = 0; s < MINUTES * 60 * 4; s++) {
      advance(sim, 250, 50);
      w.player.character.health = w.player.stats.maxHealth;
      const train = [...w.monsters.values()].filter((m) => m.alive && m.targetId === h.id && chebyshev(m, h) <= 12);
      if (train.length) {
        fightSec += 0.25;
        trainSum += train.length * 0.25;
        if (train.length >= 3) trainSec += 0.25;
        if (train.some((m) => chebyshev(m, h) <= 1)) adjSec += 0.25;
      }
      maxTrain = Math.max(maxTrain, train.length);
      if (s % 4 === 0) modeS[h.brain.mode] = (modeS[h.brain.mode] ?? 0) + 1;
    }
    appendFileSync(OUT, JSON.stringify({ tag: process.env.KITE_TAG ?? '', seed, xp, kills, deaths, hp, mp, rain, maxTrain, avgTrain: +(trainSum / Math.max(1, fightSec)).toFixed(2), train3plusS: trainSec, adjacentShare: +(adjSec / Math.max(1, fightSec)).toFixed(2), level: h.character.level, modeS }) + '\n');
  }
});
