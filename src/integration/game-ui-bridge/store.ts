// Store observável consumida pelo React (useSyncExternalStore). Publica instantâneos do jogo em no
// máximo ~12 Hz (ou imediatamente após eventos relevantes) sem recriar a engine.
import type { MessageKind } from '../../domain/events/gameEvents';
import type { UiSnapshot } from './snapshot';

export type Panel = 'inventory' | 'character' | 'spells' | 'settings' | 'help' | 'hotbar' | null;

export interface ChatMessage {
  id: number;
  text: string;
  kind: MessageKind;
  at: number;
}

export interface UiLocalState {
  panel: Panel;
  messages: ChatMessage[];
  banner: { id: number; title: string; subtitle?: string } | null;
  levelUp: { id: number; level: number } | null;
  ready: boolean;
  saving: boolean;
  lastSaved: number | null;
  fps: number;
  touch: boolean;
  /** Personagem (herói) tocado: abre o menu com conversar, grupo e atacar. */
  actorMenu: string | null;
  /** Painel de controle do grupo aberto. */
  partyPanel: boolean;
}

type Listener = () => void;

export class Store<T> {
  private listeners = new Set<Listener>();
  constructor(private state: T) {}
  get = (): T => this.state;
  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  set(next: T): void {
    if (next === this.state) return;
    this.state = next;
    for (const l of [...this.listeners]) l();
  }
  update(patch: Partial<T>): void {
    this.set({ ...this.state, ...patch });
  }
}

export function createLocalStore(touch: boolean): Store<UiLocalState> {
  return new Store<UiLocalState>({ panel: null, messages: [], banner: null, levelUp: null, ready: false, saving: false, lastSaved: null, fps: 0, touch, actorMenu: null, partyPanel: false });
}

export function createSnapshotStore(initial: UiSnapshot): Store<UiSnapshot> {
  return new Store<UiSnapshot>(initial);
}
