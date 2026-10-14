// Carrega spritesheets, atlases e a fonte bitmap; cria as animações compartilhadas.
import Phaser from 'phaser';
import { ASSETS, SHEETS } from '../../assets';
import { PROPS } from '../../data/props';

export const HUMANOID_DIRS = ['down', 'left', 'right', 'up'] as const;

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    this.load.spritesheet('tiles', ASSETS.tiles.url, { frameWidth: 16, frameHeight: 16 });
    this.load.atlas('objects', ASSETS.objects.url, ASSETS.objects.json);
    this.load.atlas('icons', ASSETS.icons.url, ASSETS.icons.json);
    this.load.atlas('fx', ASSETS.fx.url, ASSETS.fx.json);
    this.load.bitmapFont('pixel', ASSETS.font.url, ASSETS.font.xmlUrl);
    for (const s of SHEETS) this.load.spritesheet(s.key, s.url, { frameWidth: s.frameWidth, frameHeight: s.frameHeight });
  }

  create(): void {
    const a = this.anims;
    // humanoides: linhas baixo/esquerda/direita/cima com (parado, passo A, passo B)
    for (const s of SHEETS) {
      if (s.kind !== 'humanoid') continue;
      HUMANOID_DIRS.forEach((dir, row) => {
        a.create({ key: `${s.key}_walk_${dir}`, frames: a.generateFrameNumbers(s.key, { frames: [row * 3 + 1, row * 3, row * 3 + 2, row * 3] }), frameRate: 8, repeat: -1 });
      });
    }
    for (const s of SHEETS) {
      if (s.kind === 'blob') a.create({ key: `${s.key}_idle`, frames: a.generateFrameNumbers(s.key, { frames: [0, 1, 0, 2, 3, 2] }), frameRate: 7, repeat: -1 });
      if (s.kind === 'quad') a.create({ key: `${s.key}_walk`, frames: a.generateFrameNumbers(s.key, { frames: [1, 0, 2, 0] }), frameRate: 9, repeat: -1 });
    }
    // efeitos: sequências "<nome>_<i>" do atlas fx
    const fxNames = new Map<string, number>();
    for (const f of Object.keys(ASSETS.fx.frames)) {
      const m = /^(.*)_(\d+)$/.exec(f);
      if (m) fxNames.set(m[1]!, Math.max(fxNames.get(m[1]!) ?? 0, Number(m[2]) + 1));
    }
    for (const [name, count] of fxNames) {
      a.create({ key: `fx:${name}`, frames: a.generateFrameNames('fx', { prefix: `${name}_`, start: 0, end: count - 1 }), frameRate: name.startsWith('fx_levelup') ? 12 : 16, repeat: 0 });
    }
    // objetos animados (fogueiras, fonte, caldeirão...)
    for (const p of Object.values(PROPS)) {
      if (p.frames.length > 1) a.create({ key: `prop:${p.id}`, frames: p.frames.map((f) => ({ key: 'objects', frame: f })), frameRate: 1000 / (p.frameMs ?? 200), repeat: -1 });
    }
    this.scene.start('world');
  }
}
