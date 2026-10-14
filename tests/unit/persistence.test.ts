import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { SAVE_VERSION, SaveValidationError, parseSave, toSaveFile } from '../../src/game/persistence/saveSchema';
import { IndexedDbSaveRepository, MemorySaveRepository } from '../../src/game/persistence/repositories';
import { SaveService } from '../../src/game/persistence/SaveService';
import type { SaveFile } from '../../src/game/persistence/saveSchema';

const D = GAME_DATA;
const make = () => createCharacter(D, { id: 'hero-1', name: 'Aria', vocation: 'druid', now: 0, position: { x: 47, y: 11 } });

describe('formato de save', () => {
  it('ida e volta preserva o personagem', () => {
    const c = make();
    c.gold = 321;
    c.experience = 500;
    c.level = 4;
    c.skills.magic = { level: 3, tries: 12 };
    const file = toSaveFile(c);
    const back = parseSave(D, JSON.parse(JSON.stringify(file))).character;
    expect(back).toEqual(c);
  });
  it('migra saves da versão 1', () => {
    const c = make() as unknown as Record<string, unknown>;
    delete c.hotbar;
    delete c.stats;
    const parsed = parseSave(D, { version: 1, savedAt: 1, character: c });
    expect(parsed.version).toBe(SAVE_VERSION);
    expect(parsed.character.hotbar).toEqual(D.vocations.druid.spells);
    expect(parsed.character.stats.deaths).toBe(0);
  });
  it('migra saves da versão 2 (sem banco) com depósito vazio', () => {
    const c = make() as unknown as Record<string, unknown>;
    delete c.depot;
    delete c.bankGold;
    const parsed = parseSave(D, { version: 2, savedAt: 1, character: c });
    expect(parsed.character.bankGold).toBe(0);
    expect(parsed.character.depot).toHaveLength(D.balance.player.depotSlots);
    expect(parsed.character.depot.every((s) => s === null)).toBe(true);
  });
  it('preserva o depósito e o ouro do banco', () => {
    const c = make();
    c.depot[3] = { itemId: 'wolf_pelt', count: 7 };
    c.depot[4] = { itemId: 'hack_item', count: 1 };
    c.bankGold = 1234;
    const back = parseSave(D, JSON.parse(JSON.stringify(toSaveFile(c)))).character;
    expect(back.depot[3]).toEqual({ itemId: 'wolf_pelt', count: 7 });
    expect(back.depot[4]).toBeNull();
    expect(back.bankGold).toBe(1234);
  });
  it('rejeita dados inválidos', () => {
    expect(() => parseSave(D, null)).toThrow(SaveValidationError);
    expect(() => parseSave(D, { version: 99, character: {} })).toThrow(SaveValidationError);
    expect(() => parseSave(D, { version: SAVE_VERSION, character: { ...make(), vocation: 'pirate' } })).toThrow(/Vocação/);
  });
  it('sanitiza itens desconhecidos, quantidades e nível incoerente', () => {
    const c = make() as unknown as Record<string, unknown> & { inventory: unknown[]; equipment: Record<string, unknown> };
    c.inventory[0] = { itemId: 'hack_item', count: 5 };
    c.inventory[1] = { itemId: 'potion_health', count: 9999 };
    c.equipment.head = { itemId: 'sword_short', count: 1 }; // slot errado
    c.level = 1;
    c.experience = 5000;
    const parsed = parseSave(D, { version: SAVE_VERSION, savedAt: 0, character: c }).character;
    expect(parsed.inventory[0]).toBeNull();
    expect(parsed.inventory[1]?.count).toBe(50);
    expect(parsed.equipment.head).toBeUndefined();
    expect(parsed.level).toBeGreaterThan(1);
  });
});

describe('repositórios e serviço de save', () => {
  it('IndexedDB salva, lista, carrega e remove', async () => {
    const repo = new IndexedDbSaveRepository<SaveFile>(indexedDB);
    const c = make();
    await repo.save(c.id, toSaveFile(c), { slotId: c.id, name: c.name, vocation: c.vocation, level: 1, updatedAt: 5 });
    expect((await repo.list()).map((s) => s.slotId)).toContain(c.id);
    const loaded = await repo.load(c.id);
    expect(loaded?.character.name).toBe('Aria');
    await repo.remove(c.id);
    expect(await repo.load(c.id)).toBeNull();
  });
  it('SaveService grava e restaura com validação', async () => {
    const svc = new SaveService(new MemorySaveRepository<SaveFile>(), D);
    const c = make();
    c.gold = 77;
    await svc.save(c);
    const back = await svc.load(c.id);
    expect(back?.gold).toBe(77);
    const list = await svc.list();
    expect(list[0]).toMatchObject({ name: 'Aria', vocation: 'druid', level: 1 });
  });
});
