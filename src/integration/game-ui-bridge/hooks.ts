// Hooks React para observar as stores do jogo com seletores (re-render somente quando a fatia muda).
import { createContext, useContext, useRef, useSyncExternalStore } from 'react';
import type { GameSession } from './GameSession';
import type { Store, UiLocalState } from './store';
import type { UiSnapshot } from './snapshot';

export const SessionContext = createContext<GameSession | null>(null);

export function useSession(): GameSession {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession fora de uma sessão de jogo');
  return s;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}

function useStoreSelector<S, T>(store: Store<S>, selector: (s: S) => T, eq: (a: T, b: T) => boolean = deepEqual): T {
  const cache = useRef<{ s: S; v: T } | null>(null);
  const get = () => {
    const s = store.get();
    const c = cache.current;
    if (c && c.s === s) return c.v;
    const v = selector(s);
    if (c && eq(c.v, v)) {
      cache.current = { s, v: c.v };
      return c.v;
    }
    cache.current = { s, v };
    return v;
  };
  return useSyncExternalStore(store.subscribe, get, get);
}

export function useSnap<T>(selector: (s: UiSnapshot) => T, eq?: (a: T, b: T) => boolean): T {
  return useStoreSelector(useSession().snapshot, selector, eq);
}

export function useLocal<T>(selector: (s: UiLocalState) => T, eq?: (a: T, b: T) => boolean): T {
  return useStoreSelector(useSession().local, selector, eq);
}
