// Serviços da aplicação (dados, persistência, áudio) criados uma vez e compartilhados via contexto.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { GAME_DATA } from '../../data';
import type { GameData } from '../../domain/entities/gameData';
import { createBrowserRepository } from '../../game/persistence/repositories';
import { SaveService } from '../../game/persistence/SaveService';
import type { SaveFile } from '../../game/persistence/saveSchema';
import { AudioService } from '../../game/audio/AudioService';

export interface Services {
  data: GameData;
  saves: SaveService;
  audio: AudioService;
  touch: boolean;
}

const ServicesContext = createContext<Services | null>(null);

export function useServices(): Services {
  const s = useContext(ServicesContext);
  if (!s) throw new Error('Serviços indisponíveis');
  return s;
}

export function detectTouch(): boolean {
  if (typeof window === 'undefined') return false;
  if (new URLSearchParams(window.location.search).has('touch')) return true;
  return window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
}

export function ServicesProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [services, setServices] = useState<Services | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const repo = await createBrowserRepository<SaveFile>();
      if (!alive) return;
      setServices({ data: GAME_DATA, saves: new SaveService(repo, GAME_DATA), audio: new AudioService(), touch: detectTouch() });
    })();
    return () => {
      alive = false;
    };
  }, []);
  if (!services) return <>{fallback}</>;
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}
