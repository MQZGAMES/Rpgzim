// Telhados como camadas independentes por construção. Ao entrar, o telhado some suavemente e revela
// o interior no mesmo mapa (sem troca de cena). Atrás da construção, o telhado fica translúcido.
import type Phaser from 'phaser';
import type { BuildingDef, GameMap } from '../world/GameMap';
import { roofRows, roofTileName } from '../world/roof';
import { DEPTH } from './depth';

interface Roof {
  b: BuildingDef;
  img: Phaser.GameObjects.RenderTexture;
  alpha: number;
}

const CHIMNEY_EXTRA = 20;

export class RoofView {
  private roofs: Roof[] = [];

  constructor(scene: Phaser.Scene, map: GameMap, tileNames: Record<string, number>) {
    for (const b of map.buildings) {
      const { top, bottom } = roofRows(b);
      const rows = bottom - top + 1;
      const rt = scene.add.renderTexture(b.x * 16, top * 16 - CHIMNEY_EXTRA, b.w * 16, rows * 16 + CHIMNEY_EXTRA).setOrigin(0, 0);
      for (let y = top; y <= bottom; y++)
        for (let x = b.x; x < b.x + b.w; x++) rt.drawFrame('tiles', tileNames[roofTileName(b, x, y)]!, (x - b.x) * 16, (y - top) * 16 + CHIMNEY_EXTRA);
      if (b.chimneyX !== undefined) {
        const ch = scene.textures.getFrame('objects', 'chimney');
        rt.drawFrame('objects', 'chimney', (b.chimneyX - b.x) * 16 + 2, CHIMNEY_EXTRA + 16 - ch.height + 6);
      }
      if (b.wall === 'marble') {
        // emblema solar dourado no telhado do templo
        const mid = Math.floor(b.w / 2) * 16;
        rt.drawFrame('icons', 'ui_star', mid, CHIMNEY_EXTRA + 18);
      }
      // a profundidade segue a linha da fachada: o que está ao sul da casa fica por cima do telhado
      rt.setDepth(DEPTH.ySortBase + (b.y + b.h) * 16 - 0.5);
      this.roofs.push({ b, img: rt, alpha: 1 });
    }
  }

  /** Atualiza a opacidade conforme a posição do jogador (em tiles fracionários). */
  update(deltaMs: number, insideId: string | null, px: number, py: number): void {
    const k = 1 - Math.exp(-deltaMs / 90);
    for (const r of this.roofs) {
      const { top, bottom } = roofRows(r.b);
      let target = 1;
      if (insideId === r.b.id) target = 0;
      else if (px > r.b.x - 0.6 && px < r.b.x + r.b.w - 0.4 && py >= top - 1.5 && py <= bottom) target = 0.45;
      r.alpha += (target - r.alpha) * k;
      if (Math.abs(r.alpha - target) < 0.01) r.alpha = target;
      r.img.setAlpha(r.alpha);
      r.img.setVisible(r.alpha > 0.01);
    }
  }
}
