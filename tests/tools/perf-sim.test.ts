// Mede o custo de CPU da simulação (sem renderização) por quadro de 16 ms.
import { test } from 'vitest';
import { makeSim } from '../helpers';

test('custo da simulação por quadro', () => {
  const sim = makeSim('knight', { seed: 5 });
  const scenarios: [string, () => void][] = [
    ['vila (monstros dormindo)', () => sim.teleportPlayer(47, 24)],
    ['bosque (perseguição + combate)', () => {
      sim.teleportPlayer(84, 30);
      sim.cycleTarget();
    }],
  ];
  for (const [label, setup] of scenarios) {
    setup();
    for (let i = 0; i < 120; i++) sim.update(16);
    const frames = 3000;
    const t0 = performance.now();
    let kills = sim.world.player.character.stats.monstersKilled;
    for (let i = 0; i < frames; i++) {
      sim.world.player.character.health = 9999; // mantém o jogador vivo para medir combate contínuo
      if (!sim.world.player.targetId) sim.cycleTarget();
      sim.update(16);
    }
    const ms = (performance.now() - t0) / frames;
    kills = sim.world.player.character.stats.monstersKilled - kills;
    const active = [...sim.world.monsters.values()].filter((m) => m.state === 'chasing' || m.state === 'attacking').length;
    console.log(`${label}: ${ms.toFixed(3)} ms por quadro (${sim.world.monsters.size} monstros, ${active} em combate, ${kills} abatidos)`);
  }
});
