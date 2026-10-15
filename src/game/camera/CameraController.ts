// Câmera que acompanha o jogador com suavização exponencial (independente do FPS), zoom inteiro
// (pixel-perfect) recalculado ao redimensionar e limites do mapa.
import type Phaser from 'phaser';
import { computeZoom } from '../config/viewport';
import { setWorldTextZoom } from '../rendering/text';

export class CameraController {
  private x = 0;
  private y = 0;
  private initialized = false;
  zoom = 1;
  /** Ajuste fino escolhido pelo jogador (-1, 0, +1 tile de área mínima). */
  zoomBias = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    mapWidthPx: number,
    mapHeightPx: number,
  ) {
    const cam = scene.cameras.main;
    cam.setBounds(0, 0, mapWidthPx, mapHeightPx);
    cam.setRoundPixels(true);
    cam.setBackgroundColor('#120d18');
    this.resize();
  }

  resize(): void {
    const cam = this.scene.cameras.main;
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    cam.setSize(w, h);
    // toque: área mínima menor (personagem maior na tela); desktop: mostra mais do mundo
    const touch = Boolean(this.scene.registry.get('touch'));
    const [short, long] = touch ? [11, 15] : [12, 20];
    this.zoom = Math.max(1, computeZoom(w, h, short + this.zoomBias * 2, long + this.zoomBias * 3));
    cam.setZoom(this.zoom);
    setWorldTextZoom(this.zoom);
  }

  /** `tx`, `ty`: centro do jogador em pixels do mundo. */
  update(tx: number, ty: number, deltaMs: number): void {
    const cam = this.scene.cameras.main;
    if (!this.initialized) {
      this.x = tx;
      this.y = ty;
      this.initialized = true;
    }
    const k = 1 - Math.exp(-deltaMs / 70);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
    if (Math.abs(tx - this.x) < 0.05) this.x = tx;
    if (Math.abs(ty - this.y) < 0.05) this.y = ty;
    // arredonda para o pixel da tela (1/zoom px do mundo) para evitar tremulação
    const snap = (v: number) => Math.round(v * this.zoom) / this.zoom;
    cam.centerOn(snap(this.x), snap(this.y));
  }
}
