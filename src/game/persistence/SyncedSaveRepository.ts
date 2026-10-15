// Armazenamento "local primeiro" com sincronização opcional na nuvem (repositório GitHub do jogador).
// - Gravar: sempre no navegador na hora; o envio para a nuvem é agrupado (no máx. 1 por slot a cada N s)
//   para não criar um commit a cada evento.
// - Ler/listar: junta local + nuvem e fica com a versão mais recente (e a copia para o navegador).
// - Sem conta ou sem internet: funciona só com o local; o status informa o erro.
import type { SaveRepository, SaveSlotSummary } from '../../domain/repositories/SaveRepository';

export type SyncState = 'local' | 'syncing' | 'synced' | 'error';
export interface SyncStatus {
  state: SyncState;
  message: string;
  lastSyncAt: number | null;
}

export interface RemoteRepository<T> extends SaveRepository<T> {
  save(slotId: string, data: T, summary: SaveSlotSummary, keepalive?: boolean): Promise<void>;
}

interface Pending<T> {
  data: T;
  summary: SaveSlotSummary;
}

export class SyncedSaveRepository<T> implements SaveRepository<T> {
  private remote: RemoteRepository<T> | null = null;
  private readonly pending = new Map<string, Pending<T>>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly lastPush = new Map<string, number>();
  private listeners = new Set<(s: SyncStatus) => void>();
  private status: SyncStatus = { state: 'local', message: 'Salvando só neste navegador.', lastSyncAt: null };

  constructor(
    private readonly local: SaveRepository<T>,
    /** Momento em que os dados foram salvos (para decidir qual versão é a mais nova). */
    private readonly stamp: (data: T) => number,
    /** Resumo exibido na lista de personagens, derivado do próprio save. */
    private readonly summarize: (slotId: string, data: T) => SaveSlotSummary,
    private readonly pushIntervalMs = 15000,
  ) {}

  // ------------------------------------------------------------------ conta/estado
  setRemote(remote: RemoteRepository<T> | null): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.pending.clear();
    this.remote = remote;
    this.setStatus(remote ? { state: 'synced', message: 'Conectado.', lastSyncAt: this.status.lastSyncAt } : { state: 'local', message: 'Salvando só neste navegador.', lastSyncAt: null });
  }
  get hasRemote(): boolean {
    return !!this.remote;
  }
  getStatus(): SyncStatus {
    return this.status;
  }
  subscribe(fn: (s: SyncStatus) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private setStatus(s: SyncStatus): void {
    this.status = s;
    for (const l of this.listeners) l(s);
  }
  private fail(e: unknown): void {
    this.setStatus({ state: 'error', message: `Falha na sincronização: ${(e as Error).message ?? e}`, lastSyncAt: this.status.lastSyncAt });
  }
  private ok(): void {
    this.setStatus({ state: 'synced', message: 'Sincronizado com o GitHub.', lastSyncAt: Date.now() });
  }

  // ------------------------------------------------------------------ SaveRepository
  async list(): Promise<SaveSlotSummary[]> {
    const local = await this.local.list();
    if (!this.remote) return local;
    let remote: SaveSlotSummary[] = [];
    try {
      this.setStatus({ ...this.status, state: 'syncing', message: 'Buscando personagens na nuvem…' });
      remote = await this.remote.list();
      this.ok();
    } catch (e) {
      this.fail(e);
    }
    const byId = new Map<string, SaveSlotSummary>();
    for (const s of [...local, ...remote]) {
      const cur = byId.get(s.slotId);
      if (!cur || s.updatedAt > cur.updatedAt) byId.set(s.slotId, s);
    }
    return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async load(slotId: string): Promise<T | null> {
    const local = await this.local.load(slotId);
    if (!this.remote) return local;
    let remote: T | null = null;
    try {
      remote = await this.remote.load(slotId);
      this.ok();
    } catch (e) {
      this.fail(e);
    }
    if (remote && (!local || this.stamp(remote) > this.stamp(local))) {
      // versão da nuvem é mais nova (jogou em outro aparelho): atualiza o navegador
      await this.local.save(slotId, remote, this.summarize(slotId, remote));
      return remote;
    }
    if (local && (!remote || this.stamp(local) > this.stamp(remote))) {
      // o navegador está à frente (ex.: jogou offline): envia
      this.queue(slotId, local, this.summarize(slotId, local), true);
    }
    return local;
  }

  async save(slotId: string, data: T, summary: SaveSlotSummary): Promise<void> {
    await this.local.save(slotId, data, summary);
    if (this.remote) this.queue(slotId, data, summary, false);
  }

  async remove(slotId: string): Promise<void> {
    this.pending.delete(slotId);
    clearTimeout(this.timers.get(slotId));
    this.timers.delete(slotId);
    await this.local.remove(slotId);
    if (this.remote) {
      try {
        await this.remote.remove(slotId);
        this.ok();
      } catch (e) {
        this.fail(e);
      }
    }
  }

  // ------------------------------------------------------------------ envio para a nuvem
  private queue(slotId: string, data: T, summary: SaveSlotSummary, now: boolean): void {
    this.pending.set(slotId, { data, summary });
    if (this.timers.has(slotId)) return;
    const wait = now ? 0 : Math.max(0, (this.lastPush.get(slotId) ?? 0) + this.pushIntervalMs - Date.now());
    this.timers.set(
      slotId,
      setTimeout(() => {
        this.timers.delete(slotId);
        void this.push(slotId);
      }, wait),
    );
  }

  private async push(slotId: string, keepalive = false): Promise<void> {
    const p = this.pending.get(slotId);
    if (!p || !this.remote) return;
    this.pending.delete(slotId);
    this.lastPush.set(slotId, Date.now());
    this.setStatus({ ...this.status, state: 'syncing', message: 'Enviando para o GitHub…' });
    try {
      await this.remote.save(slotId, p.data, p.summary, keepalive);
      this.ok();
    } catch (e) {
      // mantém para a próxima tentativa (sem sobrescrever uma versão mais nova que chegou nesse meio-tempo)
      if (!this.pending.has(slotId)) this.pending.set(slotId, p);
      this.fail(e);
    }
  }

  /** Envia já tudo o que está pendente (sair do jogo, fechar a aba, "Sincronizar agora"). */
  async flushRemote(keepalive = false): Promise<void> {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    await Promise.all([...this.pending.keys()].map((id) => this.push(id, keepalive)));
  }

  /** Sincronização completa: envia o que só existe/está mais novo no navegador e baixa o que está mais novo na nuvem. */
  async syncAll(): Promise<void> {
    if (!this.remote) return;
    this.setStatus({ ...this.status, state: 'syncing', message: 'Sincronizando…' });
    try {
      const [local, remote] = await Promise.all([this.local.list(), this.remote.list()]);
      const remoteById = new Map(remote.map((s) => [s.slotId, s]));
      const localById = new Map(local.map((s) => [s.slotId, s]));
      for (const s of local) {
        const r = remoteById.get(s.slotId);
        if (!r || s.updatedAt > r.updatedAt) {
          const data = await this.local.load(s.slotId);
          if (data) await this.remote.save(s.slotId, data, s);
        }
      }
      for (const r of remote) {
        const l = localById.get(r.slotId);
        if (!l || r.updatedAt > l.updatedAt) {
          const data = await this.remote.load(r.slotId);
          if (data) await this.local.save(r.slotId, data, r);
        }
      }
      this.ok();
    } catch (e) {
      this.fail(e);
      throw e;
    }
  }
}
