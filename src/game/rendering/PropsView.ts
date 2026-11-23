// Objetos do cenário ordenados por profundidade, luzes suaves (aditivas) e portas com estado.
// O mundo tem ~10 mil objetos (e ~4 mil sombras e ~1,7 mil luzes). Manter todos na lista de desenho, mesmo invisíveis,
// fazia o Phaser ordenar e testar ~16 mil itens a cada quadro. Aqui o mundo é dividido em blocos e só os blocos perto
// da câmera têm objetos de verdade (reaproveitados de um pool); o resto é só dado.
import Phaser from 'phaser';
import { PROPS } from '../../data/props';
import type { GameMap } from '../world/GameMap';
import { DEPTH, ySort } from './depth';

/** Lado de um bloco, em tiles. */
const CHUNK = 16;
/** Folga ao redor da câmera, em pixels: cobre sprites altos (copas) e o movimento entre duas atualizações. */
const MARGIN = 160;
const REFRESH_MS = 200;

interface PropRec {
  /** Posição do desenho (pés do sprite), em pixels. */
  cx: number;
  by: number;
  frame0: string;
  frameCount: number;
  animKey: string;
  startFrame: number;
  depth: number;
  /** Altura (y) da sombra de árvore, ou null se não tem. */
  shadowY: number | null;
  glow: { radius: number; color: 'warm' | 'cool'; period: number } | null;
  /** Desempate estável entre objetos de mesma profundidade (ordem de criação, como antes). */
  tie: number;
}

interface Live {
  rec: PropRec;
  shadow: Phaser.GameObjects.Image | null;
  sprite: Phaser.GameObjects.Sprite;
  glow: Phaser.GameObjects.Image | null;
}

/** Sine.InOut com ida e volta (o mesmo vaivém dos tweens de antes): 0..1. */
function pingPong(elapsed: number, duration: number): number {
  const t = (elapsed % (2 * duration)) / duration;
  const u = t < 1 ? t : 2 - t;
  return 0.5 - 0.5 * Math.cos(Math.PI * u);
}

export class PropsView {
  private readonly chunksX: number;
  private readonly chunksY: number;
  private readonly chunks: PropRec[][];
  private readonly live = new Map<number, Live[]>();
  private readonly glows: Live[] = [];
  private readonly spritePool: Phaser.GameObjects.Sprite[] = [];
  private readonly imagePool: Phaser.GameObjects.Image[] = [];
  private doors = new Map<string, Phaser.GameObjects.Image>();
  private cullTimer = 0;
  private elapsed = 0;
  private rangeKey = '';

  constructor(
    private readonly scene: Phaser.Scene,
    map: GameMap,
  ) {
    this.chunksX = Math.ceil(map.width / CHUNK);
    this.chunksY = Math.ceil(map.height / CHUNK);
    this.chunks = Array.from({ length: this.chunksX * this.chunksY }, () => []);
    let tie = 0;
    for (const p of map.props) {
      const def = PROPS[p.propId];
      if (!def) continue;
      const rec: PropRec = {
        cx: (p.x + def.width / 2) * 16,
        by: (p.y + 1) * 16 + (def.offsetY ?? 0),
        frame0: def.frames[0]!,
        frameCount: def.frames.length,
        animKey: `prop:${def.id}`,
        startFrame: (p.x * 7 + p.y * 3) % def.frames.length,
        depth: def.flat ? DEPTH.flat : ySort(p.y),
        shadowY: p.propId.startsWith('tree_') ? (p.y + 1) * 16 - 2 : null,
        glow: def.light ? { radius: def.light.radius, color: def.light.color, period: 380 + ((p.x * 37) % 300) } : null,
        tie: tie++ * 2e-6,
      };
      const cxk = Math.min(this.chunksX - 1, Math.max(0, Math.floor(p.x / CHUNK)));
      const cyk = Math.min(this.chunksY - 1, Math.max(0, Math.floor(p.y / CHUNK)));
      this.chunks[cyk * this.chunksX + cxk]!.push(rec);
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

  private acquireImage(frame: string): Phaser.GameObjects.Image {
    const img = this.imagePool.pop() ?? this.scene.add.image(0, 0, 'objects', frame);
    img.setFrame(frame).setActive(true).setVisible(true);
    return img;
  }

  private acquireSprite(frame: string): Phaser.GameObjects.Sprite {
    const spr = this.spritePool.pop() ?? this.scene.add.sprite(0, 0, 'objects', frame);
    spr.setFrame(frame).setActive(true).setVisible(true);
    return spr;
  }

  private activate(index: number): void {
    const recs = this.chunks[index]!;
    const list: Live[] = [];
    for (const rec of recs) {
      let shadow: Phaser.GameObjects.Image | null = null;
      if (rec.shadowY !== null)
        shadow = this.acquireImage('shadow_l').setOrigin(0.5, 0.5).setPosition(rec.cx, rec.shadowY).setBlendMode(Phaser.BlendModes.NORMAL).setScale(1).setAlpha(0.8).setDepth(DEPTH.flat + rec.tie);
      const sprite = this.acquireSprite(rec.frame0).setOrigin(0.5, 1).setPosition(rec.cx, rec.by).setDepth(rec.depth + rec.tie + 1e-6);
      if (rec.frameCount > 1) sprite.play({ key: rec.animKey, startFrame: rec.startFrame });
      let glow: Phaser.GameObjects.Image | null = null;
      if (rec.glow) {
        glow = this.acquireImage(rec.glow.color === 'warm' ? 'glow_warm' : 'glow_cool')
          .setOrigin(0.5, 0.5)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setPosition(rec.cx, rec.by - sprite.height * 0.65)
          .setDepth(sprite.depth + 0.5)
          .setScale(rec.glow.radius * 0.6)
          .setAlpha(0.32);
      }
      const item = { rec, shadow, sprite, glow };
      list.push(item);
      if (glow) this.glows.push(item);
    }
    this.live.set(index, list);
  }

  private release(index: number): void {
    const list = this.live.get(index);
    if (!list) return;
    for (const it of list) {
      if (it.shadow) this.releaseImage(it.shadow);
      if (it.glow) this.releaseImage(it.glow);
      it.sprite.anims.stop();
      it.sprite.setVisible(false).setActive(false);
      this.spritePool.push(it.sprite);
      if (it.glow) this.glows.splice(this.glows.indexOf(it), 1);
    }
    this.live.delete(index);
  }

  private releaseImage(img: Phaser.GameObjects.Image): void {
    img.setVisible(false).setActive(false);
    this.imagePool.push(img);
  }

  update(deltaMs: number, view: Phaser.Geom.Rectangle): void {
    this.elapsed += deltaMs;
    this.cullTimer -= deltaMs;
    if (this.cullTimer <= 0) {
      this.cullTimer = REFRESH_MS;
      this.refresh(view);
    }
    // luzes: um vaivém suave de brilho e tamanho (só as que estão perto da câmera)
    for (const g of this.glows) {
      const gl = g.rec.glow!;
      const k = pingPong(this.elapsed, gl.period);
      g.glow!.setAlpha(0.24 + 0.14 * k).setScale(gl.radius * (0.57 + 0.06 * k));
    }
  }

  private refresh(view: Phaser.Geom.Rectangle): void {
    const x0 = Math.max(0, Math.floor((view.x - MARGIN) / (CHUNK * 16)));
    const x1 = Math.min(this.chunksX - 1, Math.floor((view.right + MARGIN) / (CHUNK * 16)));
    const y0 = Math.max(0, Math.floor((view.y - MARGIN) / (CHUNK * 16)));
    const y1 = Math.min(this.chunksY - 1, Math.floor((view.bottom + MARGIN) / (CHUNK * 16)));
    const key = `${x0},${y0},${x1},${y1}`;
    if (key === this.rangeKey) return;
    this.rangeKey = key;
    for (const index of [...this.live.keys()]) {
      const cx = index % this.chunksX;
      const cy = Math.floor(index / this.chunksX);
      if (cx < x0 || cx > x1 || cy < y0 || cy > y1) this.release(index);
    }
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const index = cy * this.chunksX + cx;
        if (!this.live.has(index)) this.activate(index);
      }
  }

  get count(): number {
    let n = 0;
    for (const l of this.live.values()) n += l.length;
    return n;
  }

  destroy(): void {
    this.live.clear();
    this.glows.length = 0;
    this.spritePool.length = 0;
    this.imagePool.length = 0;
    this.doors.clear();
    void this.scene;
  }
}
