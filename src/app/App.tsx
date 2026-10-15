// Fluxo de telas: título -> criação de personagem -> jogo (e volta ao título ao sair).
import { useCallback, useState } from 'react';
import type { CharacterState } from '../domain/entities/character';
import type { VocationId } from '../domain/value-objects/ids';
import { createCharacter } from '../domain/rules/character';
import { buildWorld } from '../data/maps/world';
import { ServicesProvider, useServices } from './providers/services';
import { TitleScreen } from './routes/TitleScreen';
import { CreateCharacter } from './routes/CreateCharacter';
import { GameScreen } from './routes/GameScreen';
import { loadHeroesFor } from './heroes';

type Screen = { kind: 'title' } | { kind: 'create' } | { kind: 'game'; character: CharacterState; heroes: CharacterState[] } | { kind: 'error'; message: string };

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function Screens() {
  const { data, saves, audio } = useServices();
  const [screen, setScreen] = useState<Screen>({ kind: 'title' });
  const toTitle = useCallback(() => setScreen({ kind: 'title' }), []);

  const create = async (name: string, vocation: VocationId) => {
    audio.unlock();
    const start = buildWorld().playerStart;
    const c = createCharacter(data, { id: newId(), name, vocation, now: Date.now(), position: start });
    try {
      await saves.save(c);
    } catch {
      /* segue mesmo sem armazenamento persistente */
    }
    setScreen({ kind: 'game', character: c, heroes: await loadHeroesFor(saves, data, c.id) });
  };

  const load = async (slotId: string) => {
    audio.unlock();
    try {
      const c = await saves.load(slotId);
      if (c) setScreen({ kind: 'game', character: c, heroes: await loadHeroesFor(saves, data, c.id) });
      else setScreen({ kind: 'error', message: 'Save não encontrado.' });
    } catch (e) {
      setScreen({ kind: 'error', message: `Save inválido ou corrompido: ${(e as Error).message}` });
    }
  };

  switch (screen.kind) {
    case 'title':
      return <TitleScreen onNew={() => setScreen({ kind: 'create' })} onLoad={(id) => void load(id)} />;
    case 'create':
      return <CreateCharacter onBack={toTitle} onCreate={(n, v) => void create(n, v)} />;
    case 'game':
      return <GameScreen key={screen.character.id} character={screen.character} heroes={screen.heroes} onExit={toTitle} />;
    case 'error':
      return (
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <div className="frame-dark max-w-[360px] text-center">
            <p className="text-hp-light">{screen.message}</p>
            <button type="button" className="btn-pixel mt-3 px-2" onClick={toTitle}>
              Voltar
            </button>
          </div>
        </div>
      );
  }
}

export function App() {
  return (
    <ServicesProvider fallback={<div className="fixed inset-0 flex items-center justify-center text-gold-light">Carregando…</div>}>
      <Screens />
    </ServicesProvider>
  );
}
