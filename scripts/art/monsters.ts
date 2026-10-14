// Monstros não humanoides desenhados proceduralmente: Slime do Musgo e Javali Espinhento.
// (O Goblin Saqueador reaproveita o sistema de personagens em characters.ts.)
import { PixelCanvas, mix, type Color } from './lib/canvas.ts';
import { P } from './lib/palette.ts';
import { hash2 } from './lib/rng.ts';

const sel = (n: Color) => mix(n, P.outline, 0.8);

// ------------------------------------------------------------------ Slime do Musgo (quadros 24x24)
export const SLIME_W = 24;
export const SLIME_H = 24;

function slimeFrame(rx: number, ry: number, eyeDy = 0, dead = false): PixelCanvas {
  const c = new PixelCanvas(SLIME_W, SLIME_H);
  const n = P.nature;
  const cx = 12;
  const bottom = 21;
  const cy = bottom - ry;
  if (dead) {
    c.ellipse(12, 19, 8, 2.6, (x, y, nx, ny) => (ny < -0.2 ? n[3]! : nx > 0.3 || ny > 0.5 ? n[1]! : n[2]!));
    c.set(9, 18, P.white);
    c.set(14, 19, n[4]!);
    c.outline(sel);
    return c;
  }
  c.ellipse(cx, cy, rx, ry, (x, y, nx, ny) => {
    const shade = nx * 0.45 + ny * 0.75;
    if (ny > 0.55 && y >= bottom - 2) return n[1]!;
    if (shade > 0.55) return n[1]!;
    if (shade > 0.05) return n[2]!;
    if (shade > -0.55) return n[3]!;
    return n[4]!;
  });
  // brilho especular e reflexo interno
  c.set(Math.round(cx - rx * 0.5), Math.round(cy - ry * 0.55), P.white);
  c.set(Math.round(cx - rx * 0.5) + 1, Math.round(cy - ry * 0.55), n[4]!);
  c.set(Math.round(cx - rx * 0.5), Math.round(cy - ry * 0.55) + 1, n[4]!);
  // tufos de musgo no topo
  const topY = Math.round(cy - ry);
  for (let i = -3; i <= 3; i++) {
    if (hash2(i, 3, 5) < 0.55) c.set(cx + i, topY + (Math.abs(i) > 2 ? 1 : 0), P.forest[2]!);
    if (hash2(i, 4, 5) < 0.3) c.set(cx + i, topY - 1 + (Math.abs(i) > 2 ? 1 : 0), P.forest[3]!);
  }
  c.set(cx + 1, topY - 1, P.pink[3]!);
  // olhos
  const ey = Math.round(cy - ry * 0.05) + eyeDy;
  for (const ex of [cx - 3, cx + 2]) {
    c.set(ex, ey, P.outline);
    c.set(ex + 1, ey, P.outline);
    c.set(ex, ey + 1, P.outline);
    c.set(ex + 1, ey + 1, P.outline);
    c.set(ex, ey, P.white);
  }
  c.set(cx - 1, ey + 3, n[1]!);
  c.set(cx, ey + 3, n[1]!);
  c.outline(sel);
  return c;
}

export function buildSlimeFrames(): PixelCanvas[] {
  return [
    slimeFrame(7, 5.5),
    slimeFrame(7.6, 4.9, 1),
    slimeFrame(6.6, 6.2),
    slimeFrame(6.1, 7, -1),
    slimeFrame(0, 0, 0, true),
  ];
}

// ------------------------------------------------------------------ Javali Espinhento (quadros 32x24, olhando para a direita)
export const BOAR_W = 32;
export const BOAR_H = 24;

function boarFrame(step: number, dead = false): PixelCanvas {
  const c = new PixelCanvas(BOAR_W, BOAR_H);
  const f = P.leather;
  const fur = (x: number, y: number, nx: number, ny: number): Color => {
    const shade = nx * 0.25 + ny * 0.8;
    if (shade < -0.55) return f[4]!;
    if (shade < -0.1) return f[3]!;
    if (shade < 0.45) return f[2]!;
    return f[1]!;
  };
  const legs = (offsets: number[]) => {
    const xs = [7, 10, 18, 21];
    xs.forEach((x, i) => {
      const dy = offsets[i] ?? 0;
      for (let y = 15; y <= 19 - dy; y++) {
        c.set(x, y, i % 2 ? f[1]! : f[2]!);
        c.set(x + 1, y, f[1]!);
      }
      c.set(x, 20 - dy, P.outline);
      c.set(x + 1, 20 - dy, P.iron[1]!);
    });
  };
  if (!dead) {
    const legOff = step === 0 ? [0, 0, 0, 0] : step === 1 ? [1, 0, 0, 1] : [0, 1, 1, 0];
    legs(legOff);
  }
  const bob = step === 0 ? 0 : 1;
  // corpo e cabeça
  c.ellipse(13, 11 + bob, 9.5, 5.5, fur);
  c.ellipse(22, 12 + bob, 5, 4.2, fur);
  // focinho
  c.rect(25, 12 + bob, 3, 3, P.pink[1]!);
  c.set(27, 12 + bob, P.pink[2]!);
  c.set(26, 13 + bob, P.outline);
  c.set(27, 14 + bob, P.pink[0]!);
  // presas
  c.set(25, 15 + bob, P.bone[3]!);
  c.set(26, 14 + bob, P.bone[3]!);
  c.set(24, 15 + bob, P.bone[2]!);
  // olho e orelha
  c.set(22, 10 + bob, P.outline);
  c.set(23, 10 + bob, P.red[3]!);
  c.set(19, 7 + bob, f[2]!);
  c.set(20, 6 + bob, f[1]!);
  c.set(20, 7 + bob, f[3]!);
  c.set(21, 7 + bob, f[2]!);
  // crina espinhosa ao longo do dorso
  for (let x = 6; x <= 20; x++) {
    const top = 11 + bob - Math.round(Math.sqrt(Math.max(0, 1 - ((x - 13) / 9.5) ** 2)) * 5.5);
    const spike = x % 2 === 0 ? 2 : 1;
    for (let k = 1; k <= spike; k++) c.set(x, top - k + 1, k === spike ? P.bone[2]! : P.wood[0]!);
  }
  // cauda
  c.set(3, 9 + bob, f[1]!);
  c.set(2, 8 + bob, f[2]!);
  c.set(3, 10 + bob, f[1]!);
  // barriga mais clara
  for (let x = 8; x <= 18; x++) c.paint(x, 15 + bob, f[3]!);
  c.outline(sel);
  if (dead) {
    // virado de lado: espelha verticalmente e escurece
    const out = new PixelCanvas(BOAR_W, BOAR_H);
    out.blit(c, 0, 3, { flipY: true });
    out.map((col) => (col ? mix(col, P.black, 0.2) : 0));
    for (const x of [8, 12, 18, 22]) {
      out.vline(x, 8, 9, f[1]!);
      out.set(x, 7, P.iron[1]!);
    }
    return out;
  }
  return c;
}

export function buildBoarFrames(): PixelCanvas[] {
  return [boarFrame(0), boarFrame(1), boarFrame(2), boarFrame(0, true)];
}
