// Canvas de pixels RGBA para desenhar pixel art proceduralmente e via templates ASCII.
// Cores são inteiros 0xRRGGBBAA (0 = transparente).
import { encodePng } from './png.ts';

export type Color = number;

export function rgb(hex: string, a = 255): Color {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}

export const TRANSPARENT: Color = 0;

export function channels(c: Color): [number, number, number, number] {
  return [(c >>> 24) & 255, (c >>> 16) & 255, (c >>> 8) & 255, c & 255];
}

export function pack(r: number, g: number, b: number, a = 255): Color {
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return ((cl(r) << 24) | (cl(g) << 16) | (cl(b) << 8) | cl(a)) >>> 0;
}

export function withAlpha(c: Color, a: number): Color {
  const [r, g, b] = channels(c);
  return pack(r, g, b, a);
}

export function mix(c1: Color, c2: Color, t: number): Color {
  const a = channels(c1);
  const b = channels(c2);
  return pack(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t);
}

export class PixelCanvas {
  readonly w: number;
  readonly h: number;
  readonly data: Uint32Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.data = new Uint32Array(w * h);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x: number, y: number): Color {
    if (!this.inBounds(x, y)) return 0;
    return this.data[y * this.w + x]!;
  }

  set(x: number, y: number, c: Color): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (!this.inBounds(x, y)) return;
    this.data[y * this.w + x] = c >>> 0;
  }

  /** Mistura alfa (para sombras e brilhos translúcidos). */
  blend(x: number, y: number, c: Color): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (!this.inBounds(x, y)) return;
    const [sr, sg, sb, sa] = channels(c);
    if (sa === 0) return;
    const dst = this.data[y * this.w + x]!;
    const [dr, dg, db, da] = channels(dst);
    const a = sa / 255;
    const outA = sa + da * (1 - a);
    if (outA === 0) return;
    const r = (sr * sa + dr * da * (1 - a)) / outA;
    const g = (sg * sa + dg * da * (1 - a)) / outA;
    const b = (sb * sa + db * da * (1 - a)) / outA;
    this.data[y * this.w + x] = pack(r, g, b, outA);
  }

  /** Define o pixel apenas se já houver algo opaco nele (pinta "dentro" da forma). */
  paint(x: number, y: number, c: Color): void {
    if (this.get(x, y) !== 0) this.set(x, y, c);
  }

  fill(c: Color): this {
    this.data.fill(c >>> 0);
    return this;
  }

  rect(x: number, y: number, w: number, h: number, c: Color): this {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
    return this;
  }

  strokeRect(x: number, y: number, w: number, h: number, c: Color): this {
    for (let i = x; i < x + w; i++) {
      this.set(i, y, c);
      this.set(i, y + h - 1, c);
    }
    for (let j = y; j < y + h; j++) {
      this.set(x, j, c);
      this.set(x + w - 1, j, c);
    }
    return this;
  }

  hline(x0: number, x1: number, y: number, c: Color): this {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, c);
    return this;
  }

  vline(x: number, y0: number, y1: number, c: Color): this {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, c);
    return this;
  }

  line(x0: number, y0: number, x1: number, y1: number, c: Color): this {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
    return this;
  }

  /** Elipse preenchida centrada em (cx, cy) — aceita centros fracionários. */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Color | ((x: number, y: number, nx: number, ny: number) => Color)): this {
    const x0 = Math.floor(cx - rx - 1);
    const x1 = Math.ceil(cx + rx + 1);
    const y0 = Math.floor(cy - ry - 1);
    const y1 = Math.ceil(cy + ry + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) {
          const col = typeof c === 'function' ? c(x, y, nx, ny) : c;
          if (col) this.set(x, y, col);
        }
      }
    }
    return this;
  }

  disc(cx: number, cy: number, r: number, c: Color | ((x: number, y: number, nx: number, ny: number) => Color)): this {
    return this.ellipse(cx, cy, r, r, c);
  }

  /** Desenha um template ASCII. Caracteres ausentes da legenda (ou '.') são transparentes. */
  ascii(rows: readonly string[], legend: Record<string, Color>, ox = 0, oy = 0, flipX = false): this {
    const width = Math.max(...rows.map((r) => r.length));
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i]!;
        if (ch === '.' || ch === ' ') continue;
        const col = legend[ch];
        if (col === undefined) throw new Error(`Caractere sem cor na legenda: "${ch}"`);
        if (col === 0) continue;
        const x = flipX ? ox + width - 1 - i : ox + i;
        this.set(x, oy + j, col);
      }
    });
    return this;
  }

  blit(src: PixelCanvas, dx: number, dy: number, opts: { flipX?: boolean; flipY?: boolean; alpha?: boolean } = {}): this {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const sx = opts.flipX ? src.w - 1 - x : x;
        const sy = opts.flipY ? src.h - 1 - y : y;
        const c = src.get(sx, sy);
        if (c === 0) continue;
        if (opts.alpha) this.blend(dx + x, dy + y, c);
        else this.set(dx + x, dy + y, c);
      }
    }
    return this;
  }

  /** Recorta uma região em um novo canvas. */
  crop(x: number, y: number, w: number, h: number): PixelCanvas {
    const out = new PixelCanvas(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.set(i, j, this.get(x + i, y + j));
    return out;
  }

  clone(): PixelCanvas {
    const out = new PixelCanvas(this.w, this.h);
    out.data.set(this.data);
    return out;
  }

  map(fn: (c: Color, x: number, y: number) => Color): this {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        this.data[i] = fn(this.data[i]!, x, y) >>> 0;
      }
    return this;
  }

  isOpaque(x: number, y: number): boolean {
    return (this.get(x, y) & 255) > 0;
  }

  /**
   * Contorno automático: cada pixel transparente vizinho (4-conexo) de um pixel opaco recebe
   * a cor retornada por `color(vizinho, dx, dy)`. Permite "sel-out" (contorno colorido).
   */
  outline(color: Color | ((neighbor: Color, x: number, y: number) => Color), diagonals = false): this {
    const src = this.clone();
    const dirs = diagonals
      ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
      : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (src.isOpaque(x, y)) continue;
        for (const [dx, dy] of dirs) {
          const n = src.get(x + dx!, y + dy!);
          if ((n & 255) > 128) {
            const c = typeof color === 'function' ? color(n, x, y) : color;
            if (c) this.set(x, y, c);
            break;
          }
        }
      }
    }
    return this;
  }

  /** Amplia por fator inteiro (pré-visualizações). */
  scaled(f: number): PixelCanvas {
    const out = new PixelCanvas(this.w * f, this.h * f);
    for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) out.set(x, y, this.get(Math.floor(x / f), Math.floor(y / f)));
    return out;
  }

  toPng(): Buffer {
    const rgba = new Uint8Array(this.w * this.h * 4);
    for (let i = 0; i < this.data.length; i++) {
      const c = this.data[i]!;
      rgba[i * 4] = (c >>> 24) & 255;
      rgba[i * 4 + 1] = (c >>> 16) & 255;
      rgba[i * 4 + 2] = (c >>> 8) & 255;
      rgba[i * 4 + 3] = c & 255;
    }
    return encodePng(this.w, this.h, rgba);
  }
}
