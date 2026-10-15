// Ferramenta: mede o custo (CPU) de preparar um save para o GitHub com mochila e depósito cheios.
import { test } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { makeSim } from '../helpers';
import { parseSave, toSaveFile } from '../../src/game/persistence/saveSchema';
import { utf8ToBase64 } from '../../src/game/persistence/github/GitHubClient';

test('custo de um save', () => {
  const sim = makeSim('knight');
  const c = sim.world.player.character;
  c.inventory = c.inventory.map(() => ({ itemId: 'wolf_pelt', count: 50 }));
  c.depot = c.depot.map(() => ({ itemId: 'spider_silk', count: 99 }));
  const N = 500;
  let bytes = 0;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    const snap = sim.snapshotCharacter();
    const file = toSaveFile(snap);
    parseSave(GAME_DATA, file);
    const text = JSON.stringify({ slotId: c.id, summary: {}, data: file }, null, 1);
    bytes = utf8ToBase64(text).length;
  }
  process.stderr.write(`por save: ${((performance.now() - t0) / N).toFixed(3)} ms · payload base64: ${(bytes / 1024).toFixed(1)} KB
`);
});
