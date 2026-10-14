// Barramento de eventos tipado: subsistemas publicam acontecimentos sem conhecer quem os consome
// (renderização, áudio, interface, persistência).
export type Listener<T> = (payload: T) => void;

export class EventBus<M extends Record<string, unknown>> {
  private listeners: { [K in keyof M]?: Set<Listener<M[K]>> } = {};

  on<K extends keyof M>(type: K, fn: Listener<M[K]>): () => void {
    const set = (this.listeners[type] ??= new Set());
    set.add(fn);
    return () => set.delete(fn);
  }

  emit<K extends keyof M>(type: K, payload: M[K]): void {
    const set = this.listeners[type];
    if (!set) return;
    for (const fn of [...set]) fn(payload);
  }

  clear(): void {
    this.listeners = {};
  }
}
