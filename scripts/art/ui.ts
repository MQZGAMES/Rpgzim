// Molduras 9-slice da interface (usadas com CSS border-image), joystick e cenário da tela título.
import { PixelCanvas, mix, withAlpha, type Color } from './lib/canvas.ts';
import { P, type Ramp } from './lib/palette.ts';
import { bayer, hash2, mulberry32, periodicNoise } from './lib/rng.ts';

export interface UiImage {
  name: string;
  canvas: PixelCanvas;
}
const out: UiImage[] = [];

/** Moldura 24x24 com fatia de 8 px: contorno, chanfro de madeira/metal, rebites dourados e miolo. */
function frame(name: string, opts: { border: Ramp; fill: Color; fillAlt?: Color; rivets?: boolean; inset?: boolean; size?: number }) {
  const size = opts.size ?? 24;
  const c = new PixelCanvas(size, size);
  const b = opts.border;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.min(x, y, size - 1 - x, size - 1 - y);
      const corner = (x === 0 || x === size - 1) && (y === 0 || y === size - 1);
      if (corner) continue;
      let col: Color;
      if (d === 0) col = P.outline;
      else if (d === 1) col = opts.inset ? b[1]! : x < size - 2 && y < size - 2 && (x === 1 || y === 1) ? b[4]! : b[2]!;
      else if (d === 2) col = opts.inset ? b[1]! : b[3]!;
      else if (d === 3) col = opts.inset ? b[2]! : b[2]!;
      else if (d === 4) col = P.outline;
      else {
        col = opts.fill;
        if (opts.fillAlt && hash2(x, y, 3) < 0.08) col = opts.fillAlt;
        if (opts.inset && (x === 5 || y === 5)) col = mix(opts.fill, P.black, 0.35);
      }
      c.set(x, y, col);
    }
  if (opts.rivets) {
    for (const [x, y] of [[2, 2], [size - 3, 2], [2, size - 3], [size - 3, size - 3]] as const) {
      c.set(x, y, P.gold[4]!);
      c.set(x + (x < 4 ? 1 : -1), y, P.gold[2]!);
      c.set(x, y + (y < 4 ? 1 : -1), P.gold[2]!);
    }
  }
  out.push({ name, canvas: c });
}

frame('panel_dark', { border: P.wood, fill: withAlpha(mix(P.purple[0]!, P.black, 0.35), 238), rivets: true });
frame('panel_parchment', { border: P.wood, fill: P.plaster[4]!, fillAlt: P.plaster[3]!, rivets: true });
frame('button', { border: P.stone, fill: P.stone[2]! });
frame('button_pressed', { border: P.stone, fill: P.stone[1]!, inset: true });
frame('button_gold', { border: P.gold, fill: P.red[2]! });
frame('button_gold_pressed', { border: P.gold, fill: P.red[1]!, inset: true });
frame('slot', { border: P.stone, fill: withAlpha(P.black, 150), inset: true });
frame('slot_parchment', { border: P.woodLight, fill: P.plaster[3]!, inset: true });
frame('tooltip', { border: P.gold, fill: withAlpha(mix(P.purple[0]!, P.black, 0.5), 245) });

function joystick() {
  const base = new PixelCanvas(64, 64);
  base.disc(32, 32, 31, (x, y, nx, ny) => {
    const d = Math.hypot(nx, ny);
    if (d > 0.94) return withAlpha(P.outline, 200);
    if (d > 0.86) return withAlpha(ny < 0 ? P.stone[4]! : P.stone[2]!, 170);
    return withAlpha(P.black, 70 + Math.round(d * 40));
  });
  const arrow = (cx: number, cy: number, dx: number, dy: number) => {
    for (let k = 0; k < 4; k++)
      for (let w = -k; w <= k; w++) base.set(cx + dx * (3 - k) + (dy !== 0 ? w : 0), cy + dy * (3 - k) + (dx !== 0 ? w : 0), withAlpha(P.white, 150));
  };
  arrow(32, 9, 0, -1);
  arrow(32, 54, 0, 1);
  arrow(9, 32, -1, 0);
  arrow(54, 32, 1, 0);
  out.push({ name: 'joystick_base', canvas: base });
  const knob = new PixelCanvas(28, 28);
  knob.disc(14, 14, 13.5, (x, y, nx, ny) => {
    const d = Math.hypot(nx, ny);
    if (d > 0.9) return P.outline;
    const l = -(nx * 0.6 + ny * 0.8);
    return withAlpha(l > 0.4 ? P.stone[5]! : l > -0.1 ? P.stone[4]! : P.stone[3]!, 235);
  });
  knob.disc(10, 9, 2.5, withAlpha(P.white, 200));
  out.push({ name: 'joystick_knob', canvas: knob });
}
joystick();

/** Paisagem 320x180 da tela título: céu ao entardecer, montanhas, templo na colina, floresta e campo. */
function titleScene() {
  const W = 320;
  const H = 180;
  const c = new PixelCanvas(W, H);
  const sky = [rgbMix(P.purple[2]!, P.blue[2]!, 0.3), P.purple[3]!, P.pink[3]!, P.fire[3]!, P.fire[4]!, P.gold[5]!];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = (y / 110) * (sky.length - 1);
      const i = Math.floor(v);
      const f = v - i;
      const col = sky[Math.min(sky.length - 1, i + (f > bayer(x, y) ? 1 : 0))]!;
      c.set(x, y, col);
    }
  // sol
  c.disc(228, 96, 18, (x, y, nx, ny) => (Math.hypot(nx, ny) > 0.85 ? P.gold[4]! : P.gold[5]!));
  // nuvens
  const rnd = mulberry32(4);
  for (let k = 0; k < 7; k++) {
    const cx = rnd() * W;
    const cy = 18 + rnd() * 50;
    for (let j = 0; j < 5; j++) c.ellipse(cx + j * 7 - 14, cy + (j % 2) * 2, 9 - Math.abs(j - 2) * 2, 4, (x, y, nx, ny) => (ny < -0.2 ? P.pink[3]! : mix(P.pink[2]!, P.purple[3]!, 0.5)));
  }
  // montanhas distantes
  const ridge = (base: number, amp: number, seed: number, col: Color, colHi: Color) => {
    for (let x = 0; x < W; x++) {
      const h = base - amp * (periodicNoise(x, 0, W, 40, seed) * 0.7 + periodicNoise(x, 0, W, 13, seed + 1) * 0.3);
      for (let y = Math.floor(h); y < H; y++) c.set(x, y, y < h + 2 ? colHi : col);
    }
  };
  ridge(120, 60, 7, mix(P.purple[1]!, P.pink[1]!, 0.3), mix(P.purple[2]!, P.pink[2]!, 0.4));
  ridge(135, 40, 9, P.purple[1]!, P.purple[2]!);
  // colina com templo
  c.ellipse(80, 168, 90, 40, P.forest[1]!);
  const tx = 62;
  const ty = 104;
  c.rect(tx, ty + 14, 38, 20, P.marble[2]!);
  for (let i = 0; i < 5; i++) c.rect(tx + 3 + i * 7, ty + 16, 3, 18, P.marble[3]!);
  for (let y = 0; y < 12; y++) c.hline(tx - 2 + y, tx + 40 - y, ty + 13 - y, y % 3 === 0 ? P.roofBlue[3]! : P.roofBlue[2]!);
  c.rect(tx + 17, ty - 8, 4, 8, P.gold[3]!);
  c.rect(tx + 15, ty - 6, 8, 2, P.gold[3]!);
  c.rect(tx + 16, ty + 24, 6, 10, P.black);
  c.set(tx + 19, ty - 10, P.gold[5]!);
  // floresta
  for (let x = -6; x < W + 6; x += 7) {
    const h = 20 + periodicNoise(x, 1, W, 20, 3) * 22;
    const base = 160 - (x > 140 ? 0 : 10);
    for (let y = 0; y < h; y++) {
      const half = ((h - y) / h) * 5.5;
      for (let dx = -half; dx <= half; dx++) c.set(Math.round(x + dx), base - y, dx < -1 ? P.forest[2]! : P.forest[1]!);
    }
  }
  // campo em primeiro plano com flores
  for (let y = 158; y < H; y++)
    for (let x = 0; x < W; x++) {
      let col = y < 162 ? P.grass[2]! : P.grass[3]!;
      if (hash2(x, y, 1) < 0.05) col = P.grass[4]!;
      if (hash2(x, y, 2) < 0.012) col = [P.white, P.gold[4]!, P.pink[3]!][Math.floor(hash2(x, y, 3) * 3)]!;
      c.set(x, y, col);
    }
  // caminho
  for (let y = 160; y < H; y++) {
    const cx = 160 + (y - 160) * 1.6;
    const half = 3 + (y - 160) * 0.9;
    for (let x = Math.floor(cx - half); x < cx + half; x++) c.set(x, y, hash2(x, y, 4) < 0.1 ? P.dirt[2]! : P.dirt[3]!);
  }
  out.push({ name: 'title_bg', canvas: c });
}
function rgbMix(a: Color, b: Color, t: number) {
  return mix(a, b, t);
}
titleScene();

export function buildUi(): UiImage[] {
  return out;
}
