// Tamanhos da mochila (28) e do depósito (50): saves antigos crescem sem perder nada.
import { expect, test } from 'vitest';
import { GAME_DATA as D } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { parseSave, toSaveFile } from '../../src/game/persistence/saveSchema';
test('save antigo de 20/40 espaços cresce para 28/50 sem perder itens', () => {
  const c = createCharacter(D, { id: 'a', name: 'Velho', vocation: 'knight', now: 0, position: { x: 1, y: 1 } });
  const file = toSaveFile(c) as unknown as { character: { inventory: unknown[]; depot: unknown[] } };
  file.character.inventory = file.character.inventory.slice(0, 20);
  file.character.inventory[19] = { itemId: 'potion_health', count: 5 };
  file.character.depot = new Array(40).fill(null);
  file.character.depot[39] = { itemId: 'dagger', count: 1 };
  const p = parseSave(D, file);
  expect(p.character.inventory).toHaveLength(28);
  expect(p.character.depot).toHaveLength(50);
  expect(p.character.inventory[19]).toEqual({ itemId: 'potion_health', count: 5 });
  expect(p.character.depot[39]).toEqual({ itemId: 'dagger', count: 1 });
});
