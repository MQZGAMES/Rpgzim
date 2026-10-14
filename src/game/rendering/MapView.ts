// Camadas de tiles (terreno, caminhos, água animada, decoração, pisos e paredes).
import type Phaser from 'phaser';
import type { GameMap } from '../world/GameMap';
import { DEPTH } from './depth';

export class MapView {
  private waterLayers: Phaser.Tilemaps.TilemapLayer[] = [];
  private waterFrame = 0;
  private waterTimer = 0;

  constructor(scene: Phaser.Scene, map: GameMap, tileNames: Record<string, number>) {
    const W = map.width;
    const to2d = (data: Int32Array) => {
      const rows: number[][] = [];
      for (let y = 0; y < map.height; y++) rows.push(Array.from(data.subarray(y * W, y * W + W)));
      return rows;
    };
    const layer = (data: Int32Array | number[][], depth: number) => {
      const tm = scene.make.tilemap({ data: Array.isArray(data) ? data : to2d(data), tileWidth: 16, tileHeight: 16 });
      const ts = tm.addTilesetImage('tiles', 'tiles', 16, 16, 0, 0)!;
      const l = tm.createLayer(0, ts, 0, 0)!;
      l.setDepth(depth);
      l.setCullPadding(2, 2);
      return l;
    };
    layer(map.layers.ground, DEPTH.ground);
    layer(map.layers.dirt, DEPTH.dirt);
    layer(map.layers.cobble, DEPTH.cobble);
    // água: três camadas pré-montadas, uma visível por vez (animação barata)
    for (let f = 0; f < 3; f++) {
      const rows: number[][] = [];
      for (let y = 0; y < map.height; y++) {
        const row: number[] = [];
        for (let x = 0; x < W; x++) {
          const cfg = map.waterConfig[y * W + x]!;
          row.push(cfg ? tileNames[`water_${f}_${cfg}`]! : -1);
        }
        rows.push(row);
      }
      const l = layer(rows, DEPTH.water);
      l.setVisible(f === 0);
      this.waterLayers.push(l);
    }
    layer(map.layers.decor, DEPTH.decor);
    layer(map.layers.floor, DEPTH.floor);
    layer(map.layers.walls, DEPTH.walls);
  }

  update(deltaMs: number): void {
    this.waterTimer += deltaMs;
    if (this.waterTimer < 280) return;
    this.waterTimer = 0;
    this.waterLayers[this.waterFrame]!.setVisible(false);
    this.waterFrame = (this.waterFrame + 1) % this.waterLayers.length;
    this.waterLayers[this.waterFrame]!.setVisible(true);
  }
}
