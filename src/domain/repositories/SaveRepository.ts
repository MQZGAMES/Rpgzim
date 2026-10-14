// Contrato de armazenamento. A implementação local (IndexedDB) pode ser trocada por uma API remota
// sem alterar os sistemas que salvam/carregam.
export interface SaveSlotSummary {
  slotId: string;
  name: string;
  vocation: string;
  level: number;
  updatedAt: number;
}

export interface SaveRepository<T> {
  list(): Promise<SaveSlotSummary[]>;
  load(slotId: string): Promise<T | null>;
  save(slotId: string, data: T, summary: SaveSlotSummary): Promise<void>;
  remove(slotId: string): Promise<void>;
}
