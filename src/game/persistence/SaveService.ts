// Serviço de salvamento: serializa, valida e grava por meio do repositório (sem gravar a cada quadro).
// Salva em momentos relevantes (nível, troca de equipamento, comércio, renascimento), periodicamente e ao sair.
import type { CharacterState } from '../../domain/entities/character';
import type { GameData } from '../../domain/entities/gameData';
import type { SaveRepository, SaveSlotSummary } from '../../domain/repositories/SaveRepository';
import { parseSave, toSaveFile, type SaveFile } from './saveSchema';

export class SaveService {
  private pending: ReturnType<typeof setTimeout> | null = null;
  private lastSavedAt = 0;
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private readonly repo: SaveRepository<SaveFile>,
    private readonly data: GameData,
  ) {}

  list(): Promise<SaveSlotSummary[]> {
    return this.repo.list();
  }

  async load(slotId: string): Promise<CharacterState | null> {
    const raw = await this.repo.load(slotId);
    if (!raw) return null;
    return parseSave(this.data, raw).character;
  }

  /** Grava imediatamente (serializado: gravações concorrentes entram em fila). */
  save(character: CharacterState): Promise<void> {
    const file = toSaveFile(character);
    // valida o próprio save antes de gravar: nunca persiste um estado inconsistente
    parseSave(this.data, file);
    const summary: SaveSlotSummary = { slotId: character.id, name: character.name, vocation: character.vocation, level: character.level, updatedAt: file.savedAt };
    this.lastSavedAt = Date.now();
    this.writing = this.writing.then(() => this.repo.save(character.id, file, summary)).catch((e: unknown) => {
      console.error('Falha ao salvar', e);
      throw e;
    });
    return this.writing;
  }

  /** Agenda uma gravação agrupando pedidos próximos (debounce). */
  requestSave(get: () => CharacterState, delayMs = 1200): void {
    if (this.pending) clearTimeout(this.pending);
    this.pending = setTimeout(() => {
      this.pending = null;
      void this.save(get()).catch(() => undefined);
    }, delayMs);
  }

  async flush(get: () => CharacterState): Promise<void> {
    if (this.pending) {
      clearTimeout(this.pending);
      this.pending = null;
    }
    await this.save(get());
  }

  /** Envia já para a nuvem o que estiver pendente (se o repositório sincroniza). Não falha o jogo se der erro. */
  async flushRemote(keepalive = false): Promise<void> {
    const r = this.repo as SaveRepository<SaveFile> & { flushRemote?: (k: boolean) => Promise<void> };
    try {
      await r.flushRemote?.(keepalive);
    } catch {
      /* o status de sincronização mostra o erro */
    }
  }

  remove(slotId: string): Promise<void> {
    return this.repo.remove(slotId);
  }

  get lastSaveTime(): number {
    return this.lastSavedAt;
  }
}
