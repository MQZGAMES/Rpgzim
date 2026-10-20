// Tela de jogo: cria sessão + engine dentro do efeito e as destrói na limpeza. Seguro com StrictMode
// (montar/desmontar/remontar gera uma sessão nova) e sem vazamentos ao voltar ao menu.
import { useEffect, useRef, useState } from 'react';
import type { CharacterState } from '../../domain/entities/character';
import { buildWorld } from '../../data/maps/world';
import { createGame, type GameHandle } from '../../game/Game';
import { GameSession } from '../../integration/game-ui-bridge/GameSession';
import { SessionContext } from '../../integration/game-ui-bridge/hooks';
import { useServices } from '../providers/services';
import { Hud } from '../../ui/hud/Hud';
import { MapInputLayer } from '../../ui/controls/MapInput';
import { installDebugApi } from '../debugApi';
import { resetViewportZoom } from '../preventZoom';

const PREF_KEY = 'rpgzim:prefs';
function loadPrefs(): { zoomBias: number; showFps: boolean; showLog: boolean } {
  try {
    return { zoomBias: 0, showFps: false, showLog: true, ...(JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') as object) };
  } catch {
    return { zoomBias: 0, showFps: false, showLog: true };
  }
}

export function GameScreen({ character, heroes = [], onExit }: { character: CharacterState; heroes?: CharacterState[]; onExit: () => void }) {
  const services = useServices();
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<GameHandle | null>(null);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  const [session, setSession] = useState<GameSession | null>(null);
  const [prefs, setPrefs] = useState(loadPrefs);

  useEffect(() => {
    if (!host.current) return;
    resetViewportZoom();
    const s = new GameSession({
      data: services.data,
      map: buildWorld(),
      character: structuredClone(character),
      heroes: heroes.map((h) => structuredClone(h)),
      saves: services.saves,
      audio: services.audio,
      touch: services.touch,
      onExit: () => exitRef.current(),
    });
    const h = createGame(host.current, s);
    h.setZoomBias(loadPrefs().zoomBias);
    handle.current = h;
    const uninstall = installDebugApi(s, () => h.game);
    s.pushMessage(`Bem-vindo a Pedraluz, ${character.name}! Fale com o Sacerdote Oriel para aprender o básico.`, 'system');
    setSession(s);
    return () => {
      uninstall();
      void s.saveNow().finally(() => s.dispose());
      h.destroy();
      handle.current = null;
      setSession(null);
    };
  }, [character, heroes, services]);

  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    } catch {
      /* ignora */
    }
    handle.current?.setZoomBias(prefs.zoomBias);
  }, [prefs]);

  return (
    <div className="fixed inset-0 touch-none overflow-hidden bg-ink" onContextMenu={(e) => e.preventDefault()}>
      <div ref={host} className="absolute inset-0" data-testid="game-canvas-host" />
      {session && (
        <SessionContext.Provider value={session}>
          <MapInputLayer />
          <Hud
            zoomBias={prefs.zoomBias}
            setZoomBias={(zoomBias) => setPrefs((p) => ({ ...p, zoomBias }))}
            showFps={prefs.showFps}
            setShowFps={(showFps) => setPrefs((p) => ({ ...p, showFps }))}
            showLog={prefs.showLog}
            setShowLog={(showLog) => setPrefs((p) => ({ ...p, showLog }))}
          />
        </SessionContext.Provider>
      )}
    </div>
  );
}
