// Saves no repositório privado do jogador: um arquivo JSON por personagem em `saves/<id>.json`.
// O GitHub exige o `sha` atual para sobrescrever; em caso de conflito (outro aparelho gravou antes),
// buscamos o sha novo e tentamos de novo — vence a gravação mais recente.
import type { SaveRepository, SaveSlotSummary } from '../../../domain/repositories/SaveRepository';
import { GitHubError, type GitHubClient } from './GitHubClient';

const DIR = 'saves';

interface RemoteSave<T> {
  slotId: string;
  summary: SaveSlotSummary;
  data: T;
}

const fileOf = (slotId: string) => `${DIR}/${slotId.replace(/[^\w-]/g, '_')}.json`;

export class GitHubSaveRepository<T> implements SaveRepository<T> {
  private readonly shas = new Map<string, string>();

  constructor(
    private readonly client: GitHubClient,
    /** "dono/repositorio" */
    readonly fullName: string,
  ) {}

  async list(): Promise<SaveSlotSummary[]> {
    const files = (await this.client.listDir(this.fullName, DIR)).filter((f) => f.name.endsWith('.json'));
    const all = await Promise.all(
      files.map(async (f) => {
        const file = await this.client.getFile(this.fullName, f.path);
        if (!file) return null;
        try {
          const s = JSON.parse(file.text) as RemoteSave<T>;
          this.shas.set(s.slotId, file.sha);
          return s.summary;
        } catch {
          return null; // arquivo editado à mão/corrompido: ignorado
        }
      }),
    );
    return all.filter((s): s is SaveSlotSummary => !!s).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async load(slotId: string): Promise<T | null> {
    const file = await this.client.getFile(this.fullName, fileOf(slotId));
    if (!file) return null;
    this.shas.set(slotId, file.sha);
    return (JSON.parse(file.text) as RemoteSave<T>).data;
  }

  async save(slotId: string, data: T, summary: SaveSlotSummary, keepalive = false): Promise<void> {
    const text = JSON.stringify({ slotId, summary, data } satisfies RemoteSave<T>, null, 1);
    const msg = `Save: ${summary.name} (nível ${summary.level})`;
    const put = (sha: string | undefined) => this.client.putFile(this.fullName, fileOf(slotId), text, sha, msg, keepalive);
    try {
      this.shas.set(slotId, await put(this.shas.get(slotId)));
    } catch (e) {
      // 409/422: sha desatualizado ou ausente (arquivo criado em outro aparelho) -> busca o atual e repete
      if (!(e instanceof GitHubError) || (e.status !== 409 && e.status !== 422)) throw e;
      const cur = await this.client.getFile(this.fullName, fileOf(slotId));
      this.shas.set(slotId, await put(cur?.sha));
    }
  }

  async remove(slotId: string): Promise<void> {
    const cur = await this.client.getFile(this.fullName, fileOf(slotId));
    if (!cur) return;
    await this.client.deleteFile(this.fullName, fileOf(slotId), cur.sha, `Apaga personagem ${slotId}`);
    this.shas.delete(slotId);
  }
}
