// Câmera que acompanha o jogador com suavização exponencial (independente do FPS) e zoom inteiro (pixel-perfect)
// recalculado ao redimensionar. Sem travar nos limites do mapa: perto das bordas o personagem continua no centro da
// tela (antes a câmera parava e ele, as criaturas e os outros personagens iam para baixo do HUD e dos atalhos); além
// da borda aparece a mata fechada (a cor de fundo).
import type Phaser from 'phaser';
import { computeZoom } from '../config/viewport';
import { setWorldTextZoom } from '../rendering/text';

export class CameraController {
  private x = 0;
  private y = 0;
  private initialized = false;
  private mapW = 0;
  private mapH = 0;
  zoom = 1;
  /** Ajuste fino escolhido pelo jogador (-1, 0, +1 tile de área mínima). */
  zoomBias = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    mapWidthPx: number,
    mapHeightPx: number,
  ) {
    const cam = scene.cameras.main;
    // margem de meia tela além do mapa em cada lado: a câmera centraliza o jogador em qualquer ponto
    this.mapW = mapWidthPx;
    this.mapH = mapHeightPx;
    cam.setRoundPixels(true);
    cam.setBackgroundColor('#0c150e');
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
    const padX = w / this.zoom / 2 + 32;
    const padY = h / this.zoom / 2 + 32;
    cam.setBounds(-padX, -padY, this.mapW + padX * 2, this.mapH + padY * 2);
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
