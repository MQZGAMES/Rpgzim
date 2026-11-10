import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GAME_DATA as D } from '../../src/data';
import { createCharacter } from '../../src/domain/rules/character';
import { SaveService } from '../../src/game/persistence/SaveService';
import {
  IndexedDbSaveRepository,
  LocalStorageSaveRepository,
  MemorySaveRepository,
} from '../../src/game/persistence/repositories';
import { toSaveFile, type SaveFile } from '../../src/game/persistence/saveSchema';

const make = () =>
  createCharacter(D, {
    id: 'review-save',
    name: 'Aria',
    vocation: 'druid',
    now: 0,
    position: { x: 47, y: 11 },
  });
afterEach(() => vi.restoreAllMocks());

describe('save failure recovery', () => {
  it('reports failure, preserves last successful time and resumes the queued saves', async () => {
    const repo = new MemorySaveRepository<SaveFile>();
    const save = vi.spyOn(repo, 'save').mockRejectedValueOnce(new Error('storage unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = new SaveService(repo, D);
    const c = make();
    const first = service.save(c);
    expect(service.lastSaveTime).toBe(0);
    c.gold = 123;
    const second = service.save(c);
    await expect(first).rejects.toThrow('storage unavailable');
    await expect(second).resolves.toBeUndefined();
    expect(save).toHaveBeenCalledTimes(2);
    expect((await service.load(c.id))?.gold).toBe(123);
    expect(service.lastSaveTime).toBeGreaterThan(0);
  });

  it('does not announce an IndexedDB save as successful if its transaction aborts', async () => {
    const repo = new IndexedDbSaveRepository<SaveFile>();
    const c = make();
    const data = toSaveFile(c);
    const original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      const request = original.call(this, value, key);
      request.addEventListener('success', () => this.transaction.abort());
      return request;
    });
    await expect(
      repo.save(c.id, data, {
        slotId: c.id,
        name: c.name,
        vocation: c.vocation,
        level: c.level,
        updatedAt: data.savedAt,
      }),
    ).rejects.toThrow();
    expect(await repo.load(c.id)).toBeNull();
  });

  it('ignores malformed localStorage summaries instead of breaking the character list', async () => {
    const entries = new Map<string, string>();
    const storage = {
      get length() {
        return entries.size;
      },
      key: (i: number) => [...entries.keys()][i] ?? null,
      getItem: (k: string) => entries.get(k) ?? null,
      setItem: (k: string, v: string) => {
        entries.set(k, v);
      },
      removeItem: (k: string) => {
        entries.delete(k);
      },
      clear: () => entries.clear(),
    } satisfies Storage;
    entries.set('rpgzim:save:broken', '{}');
    entries.set('rpgzim:save:invalid', '{"summary":{"slotId":"bad","updatedAt":"yesterday"}}');
    const repo = new LocalStorageSaveRepository<SaveFile>(storage);
    const c = make();
    const data = toSaveFile(c);
    await repo.save(c.id, data, {
      slotId: c.id,
      name: c.name,
      vocation: c.vocation,
      level: c.level,
      updatedAt: data.savedAt,
    });
    expect((await repo.list()).map((s) => s.slotId)).toEqual([c.id]);
  });
});
