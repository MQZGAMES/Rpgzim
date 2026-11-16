// Camadas de tiles (terreno, caminhos, água animada, decoração, pisos e paredes).
import type Phaser from 'phaser';
import type { GameMap } from '../world/GameMap';
import { BIOME_KIND } from '../world/MapBuilder';
import { DEPTH } from './depth';

export class MapView {
  private waterLayers: Phaser.Tilemaps.TilemapLayer[] = [];
  private lavaLayers: Phaser.Tilemaps.TilemapLayer[] = [];
  private waterFrame = 0;
  private waterTimer = 0;

  constructor(scene: Phaser.Scene, map: GameMap, tileNames: Record<string, number>) {
    const W = map.width;
    const to2d = (data: Int32Array) => {
      const rows: number[][] = [];
      for (let y = 0; y < map.height; y++) rows.push(Array.from(data.subarray(y * W, y * W + W)));
      return rows;
    };
    // insertNull: célula vazia (-1) vira null em vez de um objeto Tile. As 12 camadas cobrem o mundo inteiro e quase
    // todas são esparsas (água, lava, pisos, paredes): sem isso o Phaser criava ~1,5 milhão de objetos no mapa dobrado
    const layer = (data: Int32Array | number[][], depth: number) => {
      const tm = scene.make.tilemap({ data: Array.isArray(data) ? data : to2d(data), tileWidth: 16, tileHeight: 16, insertNull: true });
      const ts = tm.addTilesetImage('tiles', 'tiles', 16, 16, 0, 0)!;
      const l = tm.createLayer(0, ts, 0, 0)!;
      l.setDepth(depth);
      l.setCullPadding(2, 2);
      return l;
    };
    layer(map.layers.ground, DEPTH.ground);
    layer(map.layers.dirt, DEPTH.dirt);
    layer(map.layers.cobble, DEPTH.cobble);
    // água e lava: três camadas pré-montadas de cada, uma visível por vez (animação barata); a borda da água tem a
    // cor do bioma em volta (neve, areia, lama...)
    for (let f = 0; f < 3; f++) {
      const water: number[][] = [];
      const lava: number[][] = [];
      let anyLava = false;
      for (let y = 0; y < map.height; y++) {
        const wRow: number[] = [];
        const lRow: number[] = [];
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          const cfg = map.waterConfig[i]!;
          const kind = BIOME_KIND[map.biome?.[i] ?? 0] ?? '';
          wRow.push(cfg ? tileNames[kind && cfg < 15 ? `water_${kind}_${f}_${cfg}` : `water_${f}_${cfg}`]! : -1);
          const lc = map.lavaConfig?.[i] ?? 0;
          if (lc) anyLava = true;
          lRow.push(lc ? tileNames[`lava_${f}_${lc}`]! : -1);
        }
        water.push(wRow);
        lava.push(lRow);
      }
      const l = layer(water, DEPTH.water);
      l.setVisible(f === 0);
      this.waterLayers.push(l);
      if (anyLava) {
        const ll = layer(lava, DEPTH.water);
        ll.setVisible(f === 0);
        this.lavaLayers.push(ll);
      }
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
    this.lavaLayers[this.waterFrame]?.setVisible(false);
    this.waterFrame = (this.waterFrame + 1) % this.waterLayers.length;
    this.waterLayers[this.waterFrame]!.setVisible(true);
    this.lavaLayers[this.waterFrame]?.setVisible(true);
  }
}
