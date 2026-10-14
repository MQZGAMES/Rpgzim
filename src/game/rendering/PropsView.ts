// Objetos do cenário ordenados por profundidade, luzes suaves (aditivas) e portas com estado.
// Inclui culling: objetos fora da câmera ficam invisíveis (menos trabalho de renderização).
import Phaser from 'phaser';
import { PROPS } from '../../data/props';
import type { GameMap } from '../world/GameMap';
import { DEPTH, ySort } from './depth';

interface Cullable {
  obj: Phaser.GameObjects.Components.Visible & Phaser.GameObjects.GameObject;
  x: number;
  y: number;
  r: number;
}

export class PropsView {
  private cullables: Cullable[] = [];
  private doors = new Map<string, Phaser.GameObjects.Image>();
  private cullTimer = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    map: GameMap,
  ) {
    for (const p of map.props) {
      const def = PROPS[p.propId];
      if (!def) continue;
      const cx = (p.x + def.width / 2) * 16;
      const by = (p.y + 1) * 16 + (def.offsetY ?? 0);
      if (p.propId.startsWith('tree_')) {
        const sh = scene.add.image(cx, (p.y + 1) * 16 - 2, 'objects', 'shadow_l').setDepth(DEPTH.flat).setAlpha(0.8);
        this.cullables.push({ obj: sh, x: cx, y: by, r: 24 });
      }
      const spr = scene.add.sprite(cx, by, 'objects', def.frames[0]).setOrigin(0.5, 1);
      spr.setDepth(def.flat ? DEPTH.flat : ySort(p.y));
      if (def.frames.length > 1) spr.play({ key: `prop:${def.id}`, startFrame: (p.x * 7 + p.y * 3) % def.frames.length });
      this.cullables.push({ obj: spr, x: cx, y: by - spr.height / 2, r: Math.max(spr.width, spr.height) });
      if (def.light) {
        const glow = scene.add
          .image(cx, by - spr.height * 0.65, 'objects', def.light.color === 'warm' ? 'glow_warm' : 'glow_cool')
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(spr.depth + 0.5)
          .setScale(def.light.radius * 0.6)
          .setAlpha(0.32);
        scene.tweens.add({ targets: glow, alpha: { from: 0.24, to: 0.38 }, scale: { from: def.light.radius * 0.57, to: def.light.radius * 0.63 }, duration: 380 + ((p.x * 37) % 300), yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        this.cullables.push({ obj: glow, x: cx, y: by, r: 64 });
      }
    }
    for (const d of map.doors) {
      const img = scene.add.image(d.x * 16, (d.y + 1) * 16, 'objects', `door_${d.style}_closed`).setOrigin(0, 1).setDepth(DEPTH.doors);
      this.doors.set(d.id, img);
    }
  }

  setDoor(id: string, open: boolean): void {
    const img = this.doors.get(id);
    if (!img) return;
    const style = (img.frame.name as string).startsWith('door_temple') ? 'temple' : 'wood';
    img.setFrame(`door_${style}_${open ? 'open' : 'closed'}`);
  }

  update(deltaMs: number, view: Phaser.Geom.Rectangle): void {
    this.cullTimer -= deltaMs;
    if (this.cullTimer > 0) return;
    this.cullTimer = 200;
    const m = 48;
    for (const c of this.cullables) {
      const vis = c.x + c.r > view.x - m && c.x - c.r < view.right + m && c.y + c.r > view.y - m && c.y - c.r < view.bottom + m;
      if (c.obj.visible !== vis) c.obj.setVisible(vis);
    }
  }

  get count(): number {
    return this.cullables.length;
  }

  destroy(): void {
    this.cullables = [];
    this.doors.clear();
    void this.scene;
  }
}
