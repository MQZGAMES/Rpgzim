// Inicialização do Phaser. O canvas usa a resolução física (CSS x devicePixelRatio) para manter o
// pixel art nítido; a câmera aplica zoom inteiro. A sessão é injetada pelo registry (sem globais).
import Phaser from 'phaser';
import type { GameSession } from '../integration/game-ui-bridge/GameSession';
import { devicePixelRatioSafe } from './config/viewport';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';

export interface GameHandle {
  game: Phaser.Game;
  setZoomBias(bias: number): void;
  destroy(): void;
}

export function createGame(parent: HTMLElement, session: GameSession): GameHandle {
  const dpr = devicePixelRatioSafe();
  const size = () => ({ w: Math.max(1, Math.round(parent.clientWidth * dpr)), h: Math.max(1, Math.round(parent.clientHeight * dpr)) });
  const s0 = size();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: s0.w,
    height: s0.h,
    backgroundColor: '#120d18',
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    disableContextMenu: true,
    banner: false,
    fps: { target: 60, smoothStep: true },
    input: { activePointers: 3 },
    scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr },
    render: { powerPreference: 'high-performance', batchSize: 4096 },
    callbacks: {
      preBoot: (g) => {
        g.registry.set('session', session);
        g.registry.set('touch', session.local.get().touch);
      },
    },
    scene: [BootScene, WorldScene],
  });
  const ro = new ResizeObserver(() => {
    const s = size();
    if (game.scale.width !== s.w || game.scale.height !== s.h) game.scale.resize(s.w, s.h);
  });
  ro.observe(parent);
  return {
    game,
    setZoomBias(bias: number) {
      game.registry.set('zoomBias', bias);
      const scene = game.scene.getScene('world') as WorldScene | null;
      if (scene?.sys.isActive()) scene.setZoomBias(bias);
    },
    destroy() {
      ro.disconnect();
      game.destroy(true);
    },
  };
}
