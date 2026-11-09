// Ferramenta (RPGZIM_TOOLS=1): quantos personagens ativos (heróis com a IA) o jogo aguenta. Para N personagens, deixa
// todos jogando um tempo e mede, por quadro de 16 ms: a simulação (IA, movimento, combate) e a montagem da tela
// (buildSnapshot, a cada 80 ms no jogo). CAP_N=10,20,40,80 · CAP_WAR=off|ffa|guilds · CAP_WARMUP=60 (s)
import { test } from 'vitest';
import { customHeroDef } from '../../src/data/heroes';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { refreshStats } from '../../src/game/progression/progression';
import { heroSnapshot } from '../../src/game/ai/heroes';
import type { WarMode } from '../../src/game/social/social';
import { asActor } from '../../src/game/simulation/World';
import { buildSnapshot } from '../../src/integration/game-ui-bridge/snapshot';
import { makeSim } from '../helpers';
import type { HeroEntity } from '../../src/game/entities/types';

const pct = (xs: number[], p: number) =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))]!;

test('capacidade', { timeout: 3_600_000 }, () => {
  const counts = (process.env.CAP_N ?? '0,10,20,40,80').split(',').map(Number);
  const war = (process.env.CAP_WAR ?? 'off') as WarMode;
  const warmup = Number(process.env.CAP_WARMUP ?? 60);
  const vocs = ['knight', 'sorcerer', 'druid', 'paladin'] as const;
  const rows: string[] = [];
  for (const n of counts) {
    const sim = makeSim('knight', { seed: 9 });
    const w = sim.world;
    for (let i = 0; i < n; i++) {
      const def = customHeroDef({ id: `bot_${i}`, name: `Bot${i}`, vocation: vocs[i % 4]! });
      const c = createCharacter(GAME_DATA, {
        id: def.slotId,
        name: def.name,
        vocation: def.vocation,
        now: 0,
        position: w.map.playerStart,
      });
      c.level = 8 + ((i * 7) % 30);
      c.gold = 1500;
      const h = sim.addHero(def, c) as HeroEntity;
      asActor(w, h, () => refreshStats(w));
      h.character.health = h.stats.maxHealth;
      h.character.mana = h.stats.maxMana;
    }
    if (war !== 'off') sim.setWar(war);
    // aquecimento: todos saem do templo e se espalham pelo mapa (caça, vila, grupos)
    for (let t = 0; t < warmup * 1000; t += 50) sim.update(50);
    const simMs: number[] = [];
    const snapMs: number[] = [];
    const frames = 1500; // ~24 s de jogo
    for (let f = 0; f < frames; f++) {
      const t0 = performance.now();
      sim.update(16);
      simMs.push(performance.now() - t0);
      if (f % 5 === 0) {
        const t1 = performance.now();
        buildSnapshot(sim, f);
        snapMs.push(performance.now() - t1);
      }
    }
    // salvar todos (autosave a cada minuto: o custo de clonar cada personagem)
    const t2 = performance.now();
    for (const h of w.heroes.values()) heroSnapshot(w, h);
    const saveMs = performance.now() - t2;
    const avg = simMs.reduce((a, b) => a + b, 0) / simMs.length;
    const snapAvg = snapMs.reduce((a, b) => a + b, 0) / snapMs.length;
    // custo médio por quadro: simulação + 1/5 do snapshot (publicado a cada ~5 quadros)
    const perFrame = avg + snapAvg / 5;
    rows.push(
      `${String(n).padStart(4)} heróis | sim ${avg.toFixed(2)} ms (p95 ${pct(simMs, 0.95).toFixed(2)}, p99 ${pct(simMs, 0.99).toFixed(2)}) | tela ${snapAvg.toFixed(2)} ms | total/quadro ${perFrame.toFixed(2)} ms (${((perFrame / 16.7) * 100).toFixed(0)}% de 60 fps) | salvar todos ${saveMs.toFixed(1)} ms | monstros ${w.monsters.size}`,
    );
  }
  process.stderr.write(`\n=== capacidade (guerra ${war}, aquecimento ${warmup}s) ===\n${rows.join('\n')}\n`);
});
