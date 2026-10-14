// Empacotamento de sprites em atlas (formato JSON Hash do Phaser) e folhas em grade.
import { PixelCanvas } from './canvas.ts';

export interface AtlasEntry {
  name: string;
  canvas: PixelCanvas;
  /** Metadados livres exportados no manifesto (ex.: âncora, pegada de colisão). */
  meta?: Record<string, unknown>;
}

export interface PackedAtlas {
  image: PixelCanvas;
  json: {
    frames: Record<string, { frame: { x: number; y: number; w: number; h: number }; rotated: false; trimmed: false; spriteSourceSize: { x: number; y: number; w: number; h: number }; sourceSize: { w: number; h: number } }>;
    meta: { app: string; image: string; size: { w: number; h: number }; scale: string };
  };
}

export function packAtlas(entries: AtlasEntry[], imageName: string, maxWidth = 512, padding = 2): PackedAtlas {
  const sorted = [...entries].sort((a, b) => b.canvas.h - a.canvas.h || b.canvas.w - a.canvas.w);
  const placements: { e: AtlasEntry; x: number; y: number }[] = [];
  let x = padding;
  let y = padding;
  let rowH = 0;
  let usedW = 0;
  for (const e of sorted) {
    if (x + e.canvas.w + padding > maxWidth) {
      x = padding;
      y += rowH + padding;
      rowH = 0;
    }
    placements.push({ e, x, y });
    x += e.canvas.w + padding;
    usedW = Math.max(usedW, x);
    rowH = Math.max(rowH, e.canvas.h);
  }
  const totalH = y + rowH + padding;
  const w = nextPow2(usedW);
  const h = nextPow2(totalH);
  const image = new PixelCanvas(w, h);
  const frames: PackedAtlas['json']['frames'] = {};
  for (const p of placements) {
    image.blit(p.e.canvas, p.x, p.y);
    const { w: fw, h: fh } = p.e.canvas;
    frames[p.e.name] = {
      frame: { x: p.x, y: p.y, w: fw, h: fh },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: fw, h: fh },
      sourceSize: { w: fw, h: fh },
    };
  }
  return { image, json: { frames, meta: { app: 'rpgzim-artgen', image: imageName, size: { w, h }, scale: '1' } } };
}

function nextPow2(v: number): number {
  let p = 1;
  while (p < v) p *= 2;
  return p;
}

/** Monta uma folha em grade com quadros de tamanho fixo. */
export function gridSheet(frames: PixelCanvas[], frameW: number, frameH: number, columns: number): PixelCanvas {
  const rows = Math.ceil(frames.length / columns);
  const sheet = new PixelCanvas(frameW * columns, frameH * rows);
  frames.forEach((f, i) => sheet.blit(f, (i % columns) * frameW, Math.floor(i / columns) * frameH));
  return sheet;
}
