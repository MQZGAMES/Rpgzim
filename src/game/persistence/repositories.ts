// Implementações do contrato SaveRepository: IndexedDB (padrão), localStorage (alternativa) e memória (testes).
import type { SaveRepository, SaveSlotSummary } from '../../domain/repositories/SaveRepository';

const DB_NAME = 'rpgzim';
const DB_VERSION = 1;
const STORE_SAVES = 'saves';
const STORE_META = 'meta';

interface Stored<T> {
  slotId: string;
  data: T;
  summary: SaveSlotSummary;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('Falha no IndexedDB'));
  });
}

export class IndexedDbSaveRepository<T> implements SaveRepository<T> {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory: IDBFactory = indexedDB) {}

  private db(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const open = this.factory.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains(STORE_SAVES)) db.createObjectStore(STORE_SAVES, { keyPath: 'slotId' });
        if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error ?? new Error('IndexedDB indisponível'));
      open.onblocked = () => reject(new Error('IndexedDB bloqueado'));
    });
    return this.dbPromise;
  }

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.db();
    return db.transaction(STORE_SAVES, mode).objectStore(STORE_SAVES);
  }

  async list(): Promise<SaveSlotSummary[]> {
    const all = (await req((await this.store('readonly')).getAll())) as Stored<T>[];
    return all.map((s) => s.summary).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async load(slotId: string): Promise<T | null> {
    const s = (await req((await this.store('readonly')).get(slotId))) as Stored<T> | undefined;
    return s ? s.data : null;
  }

  async save(slotId: string, data: T, summary: SaveSlotSummary): Promise<void> {
    const store = await this.store('readwrite');
    await req(store.put({ slotId, data, summary } satisfies Stored<T>));
  }

  async remove(slotId: string): Promise<void> {
    await req((await this.store('readwrite')).delete(slotId));
  }
}

export class LocalStorageSaveRepository<T> implements SaveRepository<T> {
  private readonly prefix = 'rpgzim:save:';
  constructor(private readonly storage: Storage = localStorage) {}

  async list(): Promise<SaveSlotSummary[]> {
    const out: SaveSlotSummary[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (!key?.startsWith(this.prefix)) continue;
      try {
        out.push((JSON.parse(this.storage.getItem(key) ?? 'null') as Stored<T>).summary);
      } catch {
        /* entrada corrompida é ignorada */
      }
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async load(slotId: string): Promise<T | null> {
    const raw = this.storage.getItem(this.prefix + slotId);
    return raw ? (JSON.parse(raw) as Stored<T>).data : null;
  }
  async save(slotId: string, data: T, summary: SaveSlotSummary): Promise<void> {
    this.storage.setItem(this.prefix + slotId, JSON.stringify({ slotId, data, summary }));
  }
  async remove(slotId: string): Promise<void> {
    this.storage.removeItem(this.prefix + slotId);
  }
}

export class MemorySaveRepository<T> implements SaveRepository<T> {
  private readonly map = new Map<string, Stored<T>>();
  async list(): Promise<SaveSlotSummary[]> {
    return [...this.map.values()].map((s) => s.summary).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async load(slotId: string): Promise<T | null> {
    const s = this.map.get(slotId);
    return s ? structuredClone(s.data) : null;
  }
  async save(slotId: string, data: T, summary: SaveSlotSummary): Promise<void> {
    this.map.set(slotId, { slotId, data: structuredClone(data), summary });
  }
  async remove(slotId: string): Promise<void> {
    this.map.delete(slotId);
  }
}

/** Escolhe o melhor armazenamento disponível no navegador. */
export async function createBrowserRepository<T>(): Promise<SaveRepository<T>> {
  try {
    if (typeof indexedDB !== 'undefined') {
      const repo = new IndexedDbSaveRepository<T>();
      await repo.list();
      return repo;
    }
  } catch {
    /* modo privado/sem IndexedDB: usa localStorage */
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('rpgzim:probe', '1');
      localStorage.removeItem('rpgzim:probe');
      return new LocalStorageSaveRepository<T>();
    }
  } catch {
    /* sem armazenamento persistente */
  }
  return new MemorySaveRepository<T>();
}
