// Objetos do mundo (ordenados por profundidade no jogo): vegetação, rochas, mobiliário urbano,
// templo, interiores, acampamento goblin, portas e sombras. Todos com contorno e luz do topo-esquerdo.
import { PixelCanvas, mix, withAlpha, type Color } from './lib/canvas.ts';
import { P, type Ramp } from './lib/palette.ts';
import { hash2, mulberry32 } from './lib/rng.ts';
import type { AtlasEntry } from './lib/atlas.ts';

const out: AtlasEntry[] = [];
const add = (name: string, canvas: PixelCanvas) => out.push({ name, canvas });
const darkOutline = () => P.outline;

/** Sombreamento padrão por normal (luz vindo do topo-esquerdo). */
function lit(ramp: Ramp, nx: number, ny: number, bias = 0): Color {
  const l = -(nx * 0.55 + ny * 0.85) + bias;
  const n = ramp.length;
  if (l > 0.65) return ramp[Math.min(n - 1, 4)]!;
  if (l > 0.2) return ramp[Math.min(n - 1, 3)]!;
  if (l > -0.3) return ramp[2]!;
  return ramp[1]!;
}

// ---------------------------------------------------------------- árvores
interface Blob {
  x: number;
  y: number;
  r: number;
}

function canopy(c: PixelCanvas, blobs: Blob[], ramp: Ramp, seed: number, fruit?: Color) {
  const minY = Math.min(...blobs.map((b) => b.y - b.r));
  const maxY = Math.max(...blobs.map((b) => b.y + b.r));
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      let best: Blob | null = null;
      let bestD = 2;
      for (const b of blobs) {
        const d = Math.hypot(x + 0.5 - b.x, y + 0.5 - b.y) / b.r;
        // borda "folhosa": ruído na fronteira do círculo
        const edge = 1 + (hash2(x, y, seed) - 0.5) * 0.18;
        if (d <= edge && (best === null || b.y > best.y || (b.y === best.y && d < bestD))) {
          best = b;
          bestD = d;
        }
      }
      if (!best) continue;
      const nx = (x + 0.5 - best.x) / best.r;
      const ny = (y + 0.5 - best.y) / best.r;
      const global = ((y - minY) / (maxY - minY)) * 0.5;
      let col = lit(ramp, nx, ny, 0.15 - global);
      // aglomerados de folhas
      const h = hash2(Math.floor(x / 2), Math.floor(y / 2), seed + 1);
      if (h > 0.86) col = mix(col, ramp[Math.min(ramp.length - 1, 4)]!, 0.5);
      if (h < 0.1) col = mix(col, ramp[1]!, 0.6);
      c.set(x, y, col);
    }
  if (fruit) {
    const rnd = mulberry32(seed + 7);
    for (let i = 0; i < 7; i++) {
      const b = blobs[Math.floor(rnd() * blobs.length)]!;
      const a = rnd() * Math.PI * 2;
      const r = rnd() * b.r * 0.7;
      const fx = Math.round(b.x + Math.cos(a) * r);
      const fy = Math.round(b.y + Math.sin(a) * r);
      if (c.isOpaque(fx, fy) && c.isOpaque(fx + 1, fy + 1)) {
        c.set(fx, fy, fruit);
        c.set(fx + 1, fy, mix(fruit, P.black, 0.3));
        c.set(fx, fy - 1 + 0, mix(fruit, P.white, 0.4));
      }
    }
  }
}

function trunk(c: PixelCanvas, cx: number, top: number, bottom: number, w: number) {
  for (let y = top; y <= bottom; y++) {
    const flare = y > bottom - 3 ? bottom - 3 - y + 0 : 0;
    const half = w / 2 - flare * 0.8;
    for (let x = Math.floor(cx - half); x < Math.ceil(cx + half); x++) {
      const t = (x - (cx - half)) / (2 * half);
      let col = t < 0.25 ? P.wood[4]! : t < 0.6 ? P.wood[3]! : P.wood[2]!;
      if (hash2(x, y, 3) < 0.15) col = P.wood[1]!;
      if (y < top + 3) col = mix(col, P.black, 0.35);
      c.set(x, y, col);
    }
  }
}

function oak(name: string, ramp: Ramp, seed: number, fruit?: Color) {
  const c = new PixelCanvas(36, 46);
  trunk(c, 18, 28, 43, 6);
  canopy(
    c,
    [
      { x: 18, y: 15, r: 12 },
      { x: 9.5, y: 20, r: 7.5 },
      { x: 26.5, y: 20, r: 7.5 },
      { x: 18, y: 23, r: 9.5 },
      { x: 12, y: 10, r: 7 },
      { x: 24, y: 10, r: 7 },
      { x: 18, y: 6, r: 6 },
    ],
    ramp,
    seed,
    fruit,
  );
  c.outline(darkOutline);
  add(name, c);
}

function pine(name: string, seed: number) {
  const c = new PixelCanvas(26, 48);
  trunk(c, 13, 38, 45, 4);
  const tiers = [
    { y: 36, w: 12, h: 11 },
    { y: 28, w: 10, h: 11 },
    { y: 20, w: 8, h: 10 },
    { y: 12, w: 5.5, h: 9 },
  ];
  for (const t of tiers) {
    for (let dy = 0; dy < t.h; dy++) {
      const y = t.y - dy;
      const half = (t.w * (t.h - dy)) / t.h + (hash2(dy, t.y, seed) - 0.5) * 1.2;
      for (let x = Math.floor(13 - half); x <= Math.ceil(13 + half); x++) {
        const nx = (x - 13) / (half + 0.01);
        let col = nx < -0.35 ? P.forest[4]! : nx < 0.25 ? P.forest[3]! : P.forest[2]!;
        if (dy < 2) col = P.forest[1]!;
        if (hash2(x, y, seed) > 0.9) col = P.forest[4]!;
        c.set(x, y, col);
      }
    }
  }
  c.set(13, 2, P.forest[4]!);
  c.outline(darkOutline);
  add(name, c);
}

oak('tree_oak', P.grass, 11);
oak('tree_oak_b', P.grass, 12);
oak('tree_forest', P.forest, 13);
oak('tree_apple', P.grass, 14, P.red[3]!);
pine('tree_pine', 15);
pine('tree_pine_b', 16);

// arbustos
function bush(name: string, seed: number, accent?: Color, ramp: Ramp = P.grass) {
  const c = new PixelCanvas(18, 16);
  canopy(c, [{ x: 9, y: 9, r: 6.5 }, { x: 5, y: 10.5, r: 4.5 }, { x: 13, y: 10.5, r: 4.5 }, { x: 9, y: 6, r: 4.5 }], ramp, seed, accent);
  c.outline(darkOutline);
  add(name, c);
}
bush('bush', 21);
bush('bush_berry', 22, P.red[4]!);
bush('bush_flower', 23, P.pink[3]!);
bush('bush_dark', 24, undefined, P.forest);

// ---------------------------------------------------------------- rochas e madeira
function rock(name: string, w: number, h: number, blobs: Blob[], seed: number, moss = false) {
  const c = new PixelCanvas(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let best: Blob | null = null;
      for (const b of blobs) if (Math.hypot((x + 0.5 - b.x) / 1, (y + 0.5 - b.y) * 1.25) <= b.r) best = best && best.y > b.y ? best : b;
      if (!best) continue;
      const nx = (x + 0.5 - best.x) / best.r;
      const ny = ((y + 0.5 - best.y) * 1.25) / best.r;
      let col = lit(P.stone, nx, ny, 0.1);
      if (hash2(x, y, seed) < 0.06) col = P.stone[1]!;
      if (moss && ny < -0.35 && hash2(x, y, seed + 1) < 0.75) col = ny < -0.6 ? P.grass[4]! : P.grass[3]!;
      c.set(x, y, col);
    }
  // rachaduras
  const rnd = mulberry32(seed);
  for (let i = 0; i < 2; i++) {
    let x = Math.floor(w * 0.3 + rnd() * w * 0.4);
    let y = Math.floor(h * 0.35 + rnd() * h * 0.2);
    for (let k = 0; k < 4; k++) {
      c.paint(x, y, P.stone[1]!);
      x += rnd() < 0.5 ? 1 : 0;
      y += 1;
    }
  }
  c.outline(darkOutline);
  add(name, c);
}
rock('rock_small', 14, 11, [{ x: 7, y: 6.5, r: 6 }], 31);
rock('rock_medium', 20, 15, [{ x: 9, y: 9, r: 8 }, { x: 13.5, y: 10, r: 5.5 }], 32, true);
rock('rock_large', 32, 24, [{ x: 13, y: 13, r: 11 }, { x: 22, y: 15, r: 8 }, { x: 8, y: 17, r: 6 }], 33, true);
rock('rock_large_b', 30, 22, [{ x: 15, y: 12, r: 11 }, { x: 8, y: 15, r: 6 }, { x: 23, y: 16, r: 5.5 }], 34);

function stump() {
  const c = new PixelCanvas(16, 13);
  c.rect(3, 4, 10, 7, P.wood[3]!);
  c.vline(3, 4, 10, P.wood[4]!);
  c.vline(11, 4, 10, P.wood[2]!);
  c.vline(12, 4, 10, P.wood[1]!);
  c.ellipse(8, 4, 5, 2.4, P.woodLight[2]!);
  c.ellipse(8, 4, 3, 1.4, P.woodLight[1]!);
  c.set(8, 4, P.woodLight[3]!);
  c.rect(1, 10, 3, 2, P.wood[2]!);
  c.rect(12, 10, 3, 2, P.wood[2]!);
  c.outline(darkOutline);
  add('stump', c);
}
stump();

function log() {
  const c = new PixelCanvas(28, 11);
  for (let y = 2; y < 9; y++)
    for (let x = 4; x < 25; x++) {
      const t = (y - 2) / 7;
      let col = t < 0.25 ? P.wood[4]! : t < 0.7 ? P.wood[3]! : P.wood[2]!;
      if (hash2(x, y, 9) < 0.12) col = P.wood[1]!;
      c.set(x, y, col);
    }
  c.ellipse(25, 5.5, 2.6, 3.6, P.woodLight[2]!);
  c.ellipse(25, 5.5, 1.4, 2, P.woodLight[1]!);
  c.set(10, 1, P.grass[4]!);
  c.set(11, 1, P.grass[3]!);
  c.set(18, 2, P.grass[4]!);
  c.outline(darkOutline);
  add('log', c);
}
log();

// ---------------------------------------------------------------- vila
function woodBox(c: PixelCanvas, x: number, y: number, w: number, h: number, ramp: Ramp = P.wood) {
  c.rect(x, y, w, h, ramp[3]!);
  c.hline(x, x + w - 1, y, ramp[4]!);
  c.vline(x, y, y + h - 1, ramp[4]!);
  c.hline(x, x + w - 1, y + h - 1, ramp[1]!);
  c.vline(x + w - 1, y, y + h - 1, ramp[2]!);
}

function fence() {
  const post = (c: PixelCanvas, x: number) => {
    c.rect(x, 3, 3, 12, P.wood[3]!);
    c.vline(x, 3, 14, P.wood[4]!);
    c.vline(x + 2, 3, 14, P.wood[2]!);
    c.hline(x, x + 2, 2, P.woodLight[2]!);
  };
  const h = new PixelCanvas(16, 16);
  for (const ry of [5, 10]) {
    h.hline(0, 15, ry, P.wood[4]!);
    h.hline(0, 15, ry + 1, P.wood[2]!);
  }
  post(h, 0);
  h.outline(darkOutline);
  add('fence_h', h);
  const p = new PixelCanvas(16, 16);
  post(p, 0);
  p.outline(darkOutline);
  add('fence_post', p);
  const v = new PixelCanvas(16, 16);
  v.rect(7, 0, 2, 14, P.wood[3]!);
  v.vline(7, 0, 13, P.wood[4]!);
  post(v, 6);
  v.outline(darkOutline);
  add('fence_v', v);
}
fence();

function lampPost() {
  for (const lit_ of [false, true]) {
    const c = new PixelCanvas(12, 32);
    c.rect(5, 9, 2, 21, P.iron[2]!);
    c.vline(5, 9, 29, P.iron[3]!);
    c.rect(3, 29, 6, 2, P.iron[1]!);
    c.hline(3, 8, 29, P.iron[2]!);
    // lanterna
    c.rect(3, 3, 6, 6, P.iron[1]!);
    c.rect(4, 4, 4, 4, lit_ ? P.fire[4]! : P.gold[3]!);
    c.set(4, 4, P.fire[5]!);
    c.hline(2, 9, 2, P.iron[2]!);
    c.hline(4, 7, 1, P.iron[2]!);
    c.set(5, 0, P.iron[3]!);
    c.outline(darkOutline);
    add(lit_ ? 'lamp_post_lit' : 'lamp_post', c);
  }
}
lampPost();

function sign() {
  const c = new PixelCanvas(16, 18);
  c.rect(7, 8, 2, 9, P.wood[2]!);
  woodBox(c, 1, 2, 14, 8);
  c.hline(3, 12, 4, P.wood[1]!);
  c.hline(3, 10, 6, P.wood[1]!);
  c.outline(darkOutline);
  add('sign', c);
}
sign();

function well() {
  const c = new PixelCanvas(26, 32);
  // postes e telhadinho
  c.rect(3, 6, 2, 16, P.wood[2]!);
  c.rect(21, 6, 2, 16, P.wood[2]!);
  for (let y = 0; y < 7; y++) c.hline(1 + y, 24 - y, 6 - y, y % 2 ? P.roofRed[2]! : P.roofRed[3]!);
  c.hline(1, 24, 7, P.wood[1]!);
  c.hline(5, 20, 10, P.wood[3]!);
  c.vline(13, 10, 15, P.leather[3]!);
  c.rect(12, 15, 3, 3, P.wood[3]!);
  // anel de pedra
  c.ellipse(13, 24, 11, 6.5, (x, y, nx, ny) => {
    const ring = Math.hypot(nx, ny);
    if (ring < 0.62) return ny < 0 ? P.water[1]! : P.water[0]!;
    const blk = (Math.floor(Math.atan2(ny, nx) * 4) + (ring > 0.82 ? 1 : 0)) % 2;
    return ny < -0.2 ? (blk ? P.stone[4]! : P.stone[3]!) : blk ? P.stone[3]! : P.stone[2]!;
  });
  c.set(11, 23, P.water[3]!);
  c.outline(darkOutline);
  add('well', c);
}
well();

function fountain() {
  for (let f = 0; f < 3; f++) {
    const c = new PixelCanvas(48, 40);
    c.ellipse(24, 26, 22, 12, (x, y, nx, ny) => {
      const ring = Math.hypot(nx, ny);
      if (ring < 0.8) {
        const wave = (Math.floor((ring * 10 + f * 0.7) * 1.2) % 3 === 0) && hash2(x, y, f) > 0.4;
        return wave ? P.water[4]! : ny < 0 ? P.water[3]! : P.water[2]!;
      }
      const seg = Math.floor((Math.atan2(ny, nx) + Math.PI) * 5) % 2;
      return ny < -0.3 ? (seg ? P.stone[5]! : P.stone[4]!) : ny < 0.4 ? (seg ? P.stone[4]! : P.stone[3]!) : P.stone[2]!;
    });
    // pilar central
    c.rect(21, 10, 6, 16, P.stone[3]!);
    c.vline(21, 10, 25, P.stone[4]!);
    c.vline(26, 10, 25, P.stone[2]!);
    c.ellipse(24, 10, 6, 2.5, P.stone[4]!);
    c.ellipse(24, 9.5, 3.5, 1.4, P.water[4]!);
    // jatos de água
    for (let i = 0; i < 8; i++) {
      const side = i % 2 ? 1 : -1;
      const t = ((i / 2 + f / 3) % 4) / 4;
      const px = 24 + side * (2 + t * 13);
      const py = 8 - Math.sin(t * Math.PI) * 6 + t * 12;
      c.set(Math.round(px), Math.round(py), t < 0.5 ? P.water[6]! : P.water[5]!);
    }
    c.set(24, 5 - (f % 2), P.water[6]!);
    c.set(24, 6, P.water[5]!);
    c.outline(darkOutline);
    add(`fountain_${f}`, c);
  }
}
fountain();

function barrel() {
  const c = new PixelCanvas(14, 16);
  c.ellipse(7, 8.5, 6, 7, (x, y, nx) => (nx < -0.4 ? P.wood[4]! : nx < 0.3 ? P.wood[3]! : P.wood[2]!));
  for (const y of [4, 12]) c.hline(1, 12, y, P.iron[2]!);
  c.ellipse(7, 2.6, 5, 1.8, P.woodLight[2]!);
  c.hline(4, 9, 2, P.woodLight[1]!);
  c.outline(darkOutline);
  add('barrel', c);
}
barrel();

function crate() {
  const c = new PixelCanvas(16, 16);
  woodBox(c, 1, 3, 14, 12);
  c.rect(1, 1, 14, 3, P.woodLight[2]!);
  c.hline(1, 14, 1, P.woodLight[3]!);
  c.line(2, 4, 13, 13, P.wood[2]!);
  c.line(2, 13, 13, 4, P.wood[2]!);
  c.outline(darkOutline);
  add('crate', c);
}
crate();

function sack() {
  const c = new PixelCanvas(14, 14);
  c.ellipse(7, 8.5, 5.5, 5, (x, y, nx, ny) => lit(P.sand, nx, ny));
  c.rect(5, 2, 4, 3, P.sand[2]!);
  c.hline(5, 8, 4, P.leather[2]!);
  c.outline(darkOutline);
  add('sack', c);
}
sack();

function pot() {
  const c = new PixelCanvas(12, 14);
  c.ellipse(6, 8.5, 5, 5, (x, y, nx, ny) => lit(P.dirt, nx, ny, 0.1));
  c.rect(4, 2, 4, 3, P.dirt[3]!);
  c.hline(3, 8, 2, P.dirt[4]!);
  c.hline(2, 9, 8, P.dirt[1]!);
  c.outline(darkOutline);
  add('pot', c);
}
pot();

function hay() {
  const c = new PixelCanvas(18, 14);
  c.rect(1, 3, 16, 10, P.gold[3]!);
  for (let x = 1; x < 17; x++) for (let y = 3; y < 13; y++) if (hash2(x, y, 4) < 0.3) c.set(x, y, hash2(x, y, 5) < 0.5 ? P.gold[4]! : P.gold[2]!);
  c.vline(6, 3, 12, P.leather[2]!);
  c.vline(12, 3, 12, P.leather[2]!);
  c.hline(1, 16, 3, P.gold[4]!);
  c.outline(darkOutline);
  add('hay', c);
}
hay();

function stall(name: string, awning: Ramp, goods: Color[]) {
  const c = new PixelCanvas(34, 34);
  c.rect(3, 8, 2, 24, P.wood[2]!);
  c.rect(29, 8, 2, 24, P.wood[2]!);
  // balcão
  woodBox(c, 1, 20, 32, 12);
  c.rect(1, 18, 32, 3, P.woodLight[2]!);
  c.hline(1, 32, 18, P.woodLight[3]!);
  const rnd = mulberry32(name.length);
  for (let i = 0; i < 10; i++) {
    const x = 4 + Math.floor(rnd() * 26);
    const col = goods[i % goods.length]!;
    c.set(x, 17, col);
    c.set(x + 1, 17, mix(col, P.black, 0.3));
    c.set(x, 16, mix(col, P.white, 0.35));
  }
  // toldo listrado
  for (let y = 0; y < 9; y++)
    for (let x = 0; x < 34; x++) {
      const stripe = Math.floor(x / 4) % 2;
      let col = stripe ? P.white : awning[3]!;
      if (y > 6) col = stripe ? P.cloth[3]! : awning[2]!;
      if (y === 8 && x % 4 === 2) continue;
      c.set(x, y + 1, col);
    }
  c.hline(0, 33, 1, awning[4]!);
  c.outline(darkOutline);
  add(name, c);
}
stall('stall_fruit', P.red, [P.red[3]!, P.fire[3]!, P.green[4]!, P.gold[4]!]);
stall('stall_cloth', P.blue, [P.purple[3]!, P.teal[3]!, P.pink[3]!, P.white]);

function bench() {
  const c = new PixelCanvas(26, 14);
  c.rect(1, 2, 24, 3, P.wood[3]!);
  c.hline(1, 24, 2, P.wood[4]!);
  c.rect(1, 7, 24, 3, P.wood[3]!);
  c.hline(1, 24, 7, P.wood[5]!);
  c.hline(1, 24, 9, P.wood[2]!);
  for (const x of [3, 21]) c.rect(x, 5, 2, 8, P.iron[2]!);
  c.outline(darkOutline);
  add('bench', c);
}
bench();

function planter() {
  const c = new PixelCanvas(16, 14);
  woodBox(c, 1, 7, 14, 6);
  const rnd = mulberry32(5);
  for (let i = 0; i < 12; i++) {
    const x = 2 + Math.floor(rnd() * 12);
    const y = 3 + Math.floor(rnd() * 4);
    c.set(x, y + 1, P.green[3]!);
    c.set(x, y, [P.pink[3]!, P.gold[4]!, P.red[4]!, P.white][i % 4]!);
  }
  c.hline(2, 13, 7, P.green[2]!);
  c.outline(darkOutline);
  add('planter', c);
}
planter();

// ---------------------------------------------------------------- templo
function pillar() {
  const c = new PixelCanvas(16, 42);
  for (let y = 6; y < 36; y++)
    for (let x = 3; x < 13; x++) {
      const t = (x - 3) / 10;
      let col = t < 0.2 ? P.marble[5]! : t < 0.45 ? P.marble[4]! : t < 0.75 ? P.marble[3]! : P.marble[2]!;
      if ((x - 3) % 3 === 2) col = mix(col, P.marble[1]!, 0.35);
      c.set(x, y, col);
    }
  c.rect(1, 2, 14, 4, P.marble[3]!);
  c.hline(1, 14, 2, P.marble[5]!);
  c.hline(1, 14, 5, P.gold[3]!);
  c.rect(2, 0, 12, 2, P.marble[4]!);
  c.rect(1, 36, 14, 5, P.marble[3]!);
  c.hline(1, 14, 36, P.gold[3]!);
  c.hline(1, 14, 37, P.marble[5]!);
  c.hline(1, 14, 40, P.marble[1]!);
  c.outline(darkOutline);
  add('pillar', c);
}
pillar();

function statue() {
  const c = new PixelCanvas(22, 40);
  // pedestal
  c.rect(2, 30, 18, 9, P.marble[3]!);
  c.hline(2, 19, 30, P.marble[5]!);
  c.hline(2, 19, 33, P.gold[3]!);
  c.vline(19, 30, 38, P.marble[1]!);
  // figura encapuzada com espada de pedra
  c.ellipse(11, 21, 6, 9, (x, y, nx, ny) => lit(P.stone, nx, ny, 0.25));
  c.ellipse(11, 9, 4, 4.5, (x, y, nx, ny) => lit(P.stone, nx, ny, 0.3));
  c.rect(10, 13, 2, 14, P.stone[4]!);
  c.rect(7, 16, 8, 2, P.stone[3]!);
  c.set(10, 8, P.stone[1]!);
  c.set(12, 8, P.stone[1]!);
  c.outline(darkOutline);
  add('statue', c);
}
statue();

function brazier() {
  for (let f = 0; f < 3; f++) {
    const c = new PixelCanvas(14, 22);
    c.rect(5, 12, 4, 8, P.iron[2]!);
    c.vline(5, 12, 19, P.iron[3]!);
    c.rect(3, 19, 8, 2, P.iron[1]!);
    c.ellipse(7, 11, 6, 2.5, P.iron[2]!);
    c.hline(2, 11, 10, P.iron[3]!);
    // chama
    const flame = [
      [0, 0, 1, 1, 0],
      [0, 1, 2, 1, 0],
      [1, 2, 3, 2, 1],
      [1, 2, 3, 3, 1],
      [0, 1, 2, 2, 0],
    ];
    const ramp = [P.fire[2]!, P.fire[3]!, P.fire[4]!, P.fire[5]!];
    for (let y = 0; y < 9; y++)
      for (let x = 0; x < 8; x++) {
        const w = Math.sin((y + f * 2) * 1.3) * 0.8;
        const dx = x - 3.5 - w * (1 - y / 9);
        const h = 9 - y;
        const inside = Math.abs(dx) < (y / 9) * 3.6 + 0.4;
        if (!inside) continue;
        const core = Math.abs(dx) < (y / 9) * 1.6 && y > 3;
        const lvl = core ? (y > 6 ? 3 : 2) : y > 5 ? 1 : 0;
        if (hash2(x, y, f) < 0.1 && h > 6) continue;
        c.set(x + 3, y + 1, ramp[lvl]!);
      }
    void flame;
    c.outline(darkOutline);
    add(`brazier_${f}`, c);
  }
}
brazier();

function altar() {
  const c = new PixelCanvas(34, 24);
  c.rect(1, 6, 32, 16, P.marble[3]!);
  c.rect(1, 4, 32, 3, P.marble[4]!);
  c.hline(1, 32, 4, P.marble[5]!);
  c.hline(1, 32, 21, P.marble[1]!);
  // toalha dourada e roxa
  c.rect(10, 6, 14, 12, P.purple[2]!);
  c.vline(10, 6, 17, P.gold[3]!);
  c.vline(23, 6, 17, P.gold[3]!);
  c.hline(10, 23, 17, P.gold[3]!);
  c.rect(15, 9, 4, 5, P.gold[4]!);
  c.set(16, 10, P.white);
  // velas
  for (const x of [4, 29]) {
    c.rect(x, 0, 2, 4, P.bone[3]!);
    c.set(x, -1 + 1, P.fire[4]!);
  }
  c.outline(darkOutline);
  add('altar', c);
}
altar();

function pew() {
  const c = new PixelCanvas(34, 16);
  c.rect(1, 2, 32, 4, P.wood[2]!);
  c.hline(1, 32, 2, P.wood[3]!);
  c.rect(1, 8, 32, 4, P.wood[3]!);
  c.hline(1, 32, 8, P.wood[4]!);
  c.hline(1, 32, 11, P.wood[1]!);
  for (const x of [1, 31]) c.rect(x, 2, 2, 13, P.wood[2]!);
  c.outline(darkOutline);
  add('pew', c);
}
pew();

function banner() {
  const c = new PixelCanvas(14, 28);
  c.hline(0, 13, 0, P.gold[3]!);
  c.rect(2, 1, 10, 23, P.purple[2]!);
  c.vline(2, 1, 23, P.purple[3]!);
  c.vline(11, 1, 23, P.purple[1]!);
  for (let i = 0; i < 5; i++) {
    c.set(2 + i, 24 + i, P.purple[2]!);
    c.set(11 - i, 24 + i, P.purple[2]!);
  }
  // emblema: sol dourado
  c.disc(7, 10, 3, P.gold[3]!);
  c.set(6, 9, P.gold[5]!);
  for (const [dx, dy] of [[0, -5], [0, 5], [-5, 0], [5, 0]] as const) c.set(7 + dx, 10 + dy, P.gold[4]!);
  c.outline(darkOutline);
  add('banner', c);
}
banner();

// ---------------------------------------------------------------- interiores
function bed() {
  const c = new PixelCanvas(18, 30);
  woodBox(c, 1, 0, 16, 6);
  c.rect(2, 6, 14, 22, P.cloth[4]!);
  c.rect(3, 7, 12, 5, P.white);
  c.hline(3, 14, 11, P.cloth[3]!);
  // cobertor
  for (let y = 13; y < 27; y++)
    for (let x = 2; x < 16; x++) c.set(x, y, (x + y) % 6 < 3 ? P.blue[3]! : P.blue[2]!);
  c.hline(2, 15, 13, P.blue[4]!);
  c.rect(1, 27, 16, 2, P.wood[2]!);
  c.outline(darkOutline);
  add('bed', c);
}
bed();

function table(name: string, w: number) {
  const c = new PixelCanvas(w, 22);
  c.rect(1, 1, w - 2, 12, P.wood[4]!);
  for (let x = 1; x < w - 1; x++) for (let y = 1; y < 13; y++) if ((y + Math.floor(x / 9)) % 4 === 0) c.set(x, y, P.wood[3]!);
  c.hline(1, w - 2, 1, P.wood[5]!);
  c.rect(1, 13, w - 2, 3, P.wood[2]!);
  c.hline(1, w - 2, 15, P.wood[1]!);
  for (const x of [2, w - 5]) c.rect(x, 16, 3, 5, P.wood[2]!);
  if (w > 20) {
    // objetos sobre a mesa
    c.ellipse(9, 6, 3, 2, P.white);
    c.ellipse(9, 6, 1.5, 1, P.dirt[3]!);
    c.rect(w - 11, 3, 3, 5, P.blue[3]!);
    c.set(w - 11, 3, P.blue[4]!);
  }
  c.outline(darkOutline);
  add(name, c);
}
table('table', 32);
table('table_small', 18);

function chair() {
  const c = new PixelCanvas(12, 18);
  woodBox(c, 1, 0, 10, 9);
  c.rect(3, 2, 6, 5, P.wood[2]!);
  c.rect(1, 9, 10, 3, P.wood[4]!);
  c.rect(1, 12, 2, 5, P.wood[2]!);
  c.rect(9, 12, 2, 5, P.wood[2]!);
  c.outline(darkOutline);
  add('chair', c);
}
chair();

function bookshelf() {
  const c = new PixelCanvas(18, 32);
  woodBox(c, 1, 0, 16, 31);
  const books = [P.red[3]!, P.blue[3]!, P.green[3]!, P.gold[3]!, P.purple[3]!, P.teal[3]!];
  for (let shelf = 0; shelf < 4; shelf++) {
    const y0 = 2 + shelf * 7;
    c.rect(2, y0, 14, 6, P.wood[1]!);
    let x = 3;
    let i = shelf * 2;
    while (x < 15) {
      const bw = 1 + ((i * 7) % 3 === 0 ? 1 : 0);
      const bh = 4 + ((i * 3) % 2);
      const col = books[i % books.length]!;
      c.rect(x, y0 + 6 - bh, bw, bh, col);
      c.set(x, y0 + 6 - bh, mix(col, P.white, 0.3));
      x += bw + (i % 4 === 3 ? 1 : 0);
      i++;
    }
    c.hline(2, 15, y0 + 6, P.wood[4]!);
  }
  c.outline(darkOutline);
  add('bookshelf', c);
}
bookshelf();

function fireplace() {
  for (let f = 0; f < 3; f++) {
    const c = new PixelCanvas(34, 34);
    c.rect(1, 2, 32, 31, P.stone[3]!);
    for (let y = 2; y < 33; y++)
      for (let x = 1; x < 33; x++) if ((y % 5 === 0) || ((x + (Math.floor(y / 5) % 2) * 4) % 8 === 0)) c.set(x, y, P.stone[2]!);
    c.rect(0, 0, 34, 4, P.wood[3]!);
    c.hline(0, 33, 0, P.wood[4]!);
    c.rect(7, 14, 20, 19, P.black);
    c.rect(8, 15, 18, 18, mix(P.black, P.fire[0]!, 0.6));
    // fogo
    for (let y = 0; y < 12; y++)
      for (let x = 0; x < 14; x++) {
        const w = Math.sin((y + f * 3) * 0.9 + x) * 1.2;
        const dist = Math.abs(x - 7 + w * 0.5);
        if (dist > (y / 12) * 6.5) continue;
        const lvl = dist < (y / 12) * 2.5 ? (y > 8 ? 5 : 4) : y > 7 ? 3 : 2;
        c.set(10 + x, 19 + y, P.fire[lvl]!);
      }
    c.rect(10, 30, 14, 2, P.wood[1]!);
    c.outline(darkOutline);
    add(`fireplace_${f}`, c);
  }
}
fireplace();

function counter() {
  const c = new PixelCanvas(48, 24);
  c.rect(0, 0, 48, 6, P.woodLight[2]!);
  c.hline(0, 47, 0, P.woodLight[3]!);
  c.hline(0, 47, 5, P.wood[2]!);
  woodBox(c, 0, 6, 48, 17);
  for (let x = 6; x < 48; x += 8) c.vline(x, 8, 20, P.wood[2]!);
  c.outline(darkOutline);
  add('counter', c);
}
counter();

function potionShelf() {
  const c = new PixelCanvas(34, 32);
  woodBox(c, 1, 0, 32, 31);
  const cols = [P.red[3]!, P.blue[3]!, P.green[4]!, P.purple[3]!, P.gold[4]!];
  for (let shelf = 0; shelf < 3; shelf++) {
    const y0 = 3 + shelf * 9;
    c.rect(2, y0, 30, 8, P.wood[1]!);
    for (let i = 0; i < 6; i++) {
      const x = 4 + i * 5;
      const col = cols[(i + shelf) % cols.length]!;
      c.rect(x, y0 + 3, 3, 4, col);
      c.set(x, y0 + 3, mix(col, P.white, 0.5));
      c.set(x + 1, y0 + 2, P.cloth[3]!);
      c.set(x + 1, y0 + 1, P.wood[3]!);
    }
    c.hline(2, 31, y0 + 8, P.wood[4]!);
  }
  c.outline(darkOutline);
  add('potion_shelf', c);
}
potionShelf();

function weaponRack() {
  const c = new PixelCanvas(34, 28);
  c.rect(2, 2, 30, 3, P.wood[3]!);
  c.rect(2, 22, 30, 4, P.wood[3]!);
  c.vline(2, 2, 25, P.wood[2]!);
  c.vline(31, 2, 25, P.wood[2]!);
  // espadas, machado e lança
  for (const x of [7, 12]) {
    c.vline(x, 5, 18, P.steel[4]!);
    c.vline(x + 1, 6, 18, P.steel[2]!);
    c.hline(x - 1, x + 2, 19, P.gold[3]!);
    c.vline(x, 20, 22, P.leather[2]!);
  }
  c.vline(19, 3, 23, P.wood[3]!);
  c.rect(20, 5, 4, 6, P.steel[3]!);
  c.vline(23, 5, 10, P.steel[4]!);
  c.vline(27, 1, 23, P.wood[3]!);
  c.set(27, 0, P.steel[5]!);
  c.set(26, 2, P.steel[3]!);
  c.set(28, 2, P.steel[3]!);
  c.outline(darkOutline);
  add('weapon_rack', c);
}
weaponRack();

function armorStand() {
  const c = new PixelCanvas(18, 30);
  c.rect(8, 20, 2, 8, P.wood[2]!);
  c.rect(4, 27, 10, 2, P.wood[2]!);
  c.ellipse(9, 4, 3.5, 3.5, (x, y, nx, ny) => lit(P.steel, nx, ny));
  c.ellipse(9, 13, 6, 7, (x, y, nx, ny) => lit(P.steel, nx, ny));
  c.hline(4, 13, 15, P.gold[3]!);
  c.outline(darkOutline);
  add('armor_stand', c);
}
armorStand();

function anvil() {
  const c = new PixelCanvas(20, 14);
  c.rect(2, 1, 16, 4, P.iron[2]!);
  c.hline(2, 17, 1, P.iron[3]!);
  c.rect(0, 2, 3, 2, P.iron[2]!);
  c.rect(6, 5, 8, 4, P.iron[1]!);
  c.rect(4, 9, 12, 4, P.wood[2]!);
  c.outline(darkOutline);
  add('anvil', c);
}
anvil();

function cauldron() {
  for (let f = 0; f < 2; f++) {
    const c = new PixelCanvas(18, 18);
    c.ellipse(9, 11, 7.5, 6, (x, y, nx, ny) => lit(P.iron, nx, ny));
    c.ellipse(9, 6.5, 6.5, 2.3, P.nature[3]!);
    c.set(6 + f * 3, 6, P.nature[4]!);
    c.set(11 - f * 2, 7, P.nature[4]!);
    c.set(8, 3 - f, P.nature[3]!);
    c.set(11, 2 + f, P.nature[2]!);
    c.hline(2, 15, 5, P.iron[2]!);
    c.outline(darkOutline);
    add(`cauldron_${f}`, c);
  }
}
cauldron();

function chest() {
  const c = new PixelCanvas(18, 16);
  woodBox(c, 1, 5, 16, 10);
  c.rect(1, 1, 16, 5, P.wood[4]!);
  c.hline(1, 16, 1, P.wood[5]!);
  c.vline(4, 1, 14, P.gold[3]!);
  c.vline(13, 1, 14, P.gold[3]!);
  c.rect(7, 5, 4, 4, P.gold[3]!);
  c.set(8, 7, P.black);
  c.outline(darkOutline);
  add('chest', c);
}
chest();

function plant() {
  const c = new PixelCanvas(14, 20);
  c.rect(3, 13, 8, 6, P.dirt[2]!);
  c.hline(3, 10, 13, P.dirt[3]!);
  c.vline(10, 13, 18, P.dirt[1]!);
  canopy(c, [{ x: 7, y: 7, r: 5 }, { x: 4, y: 9, r: 3 }, { x: 10, y: 9, r: 3 }], P.green, 5);
  c.outline(darkOutline);
  add('plant', c);
}
plant();

function candle() {
  for (let f = 0; f < 2; f++) {
    const c = new PixelCanvas(10, 16);
    c.rect(3, 12, 4, 3, P.gold[2]!);
    c.vline(4, 6, 11, P.gold[3]!);
    c.rect(3, 4, 3, 3, P.bone[3]!);
    c.set(4, 3 - f, P.fire[4]!);
    c.set(4, 2, P.fire[5]!);
    c.set(4 + (f ? 1 : 0), 1, P.fire[3]!);
    c.outline(darkOutline);
    add(`candle_${f}`, c);
  }
}
candle();

function wardrobe() {
  const c = new PixelCanvas(18, 32);
  woodBox(c, 1, 1, 16, 30);
  c.vline(9, 3, 28, P.wood[1]!);
  c.set(7, 15, P.gold[3]!);
  c.set(11, 15, P.gold[3]!);
  c.rect(1, 0, 16, 2, P.wood[4]!);
  c.outline(darkOutline);
  add('wardrobe', c);
}
wardrobe();

// ---------------------------------------------------------------- acampamento goblin
function tent() {
  const c = new PixelCanvas(34, 30);
  for (let y = 0; y < 26; y++) {
    const half = 2 + y * 0.62;
    for (let x = Math.floor(17 - half); x <= Math.ceil(17 + half); x++) {
      const nx = (x - 17) / half;
      let col = nx < -0.3 ? P.leather[4]! : nx < 0.3 ? P.leather[3]! : P.leather[2]!;
      if ((y + Math.floor(x / 5)) % 7 === 0) col = P.leather[1]!;
      c.set(x, y + 2, col);
    }
  }
  for (let y = 10; y < 28; y++) {
    const half = (y - 10) * 0.32;
    for (let x = Math.floor(17 - half); x <= Math.ceil(17 + half); x++) c.set(x, y, P.black);
  }
  c.vline(17, 0, 3, P.wood[2]!);
  c.set(16, 0, P.bone[3]!);
  c.outline(darkOutline);
  add('tent', c);
}
tent();

function campfire() {
  for (let f = 0; f < 3; f++) {
    const c = new PixelCanvas(18, 18);
    c.line(3, 15, 14, 12, P.wood[2]!);
    c.line(3, 12, 14, 15, P.wood[3]!);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      c.set(Math.round(9 + Math.cos(a) * 7), Math.round(14 + Math.sin(a) * 2.5), P.stone[3]!);
    }
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 10; x++) {
        const w = Math.sin((y + f * 2.3) * 1.1) * 1.1;
        const dist = Math.abs(x - 4.5 + w * (1 - y / 10));
        if (dist > (y / 10) * 4.2 + 0.3) continue;
        const lvl = dist < (y / 10) * 1.6 ? (y > 6 ? 5 : 4) : y > 5 ? 3 : 2;
        c.set(4 + x, 3 + y, P.fire[lvl]!);
      }
    c.outline(darkOutline);
    add(`campfire_${f}`, c);
  }
}
campfire();

function bones() {
  const c = new PixelCanvas(16, 10);
  c.line(2, 7, 9, 4, P.bone[3]!);
  c.set(1, 7, P.bone[2]!);
  c.set(10, 4, P.bone[2]!);
  c.ellipse(12, 5, 3, 2.6, P.bone[3]!);
  c.set(11, 5, P.black);
  c.set(13, 5, P.black);
  c.hline(11, 13, 7, P.bone[1]!);
  c.outline(darkOutline);
  add('bones', c);
}
bones();

function totem() {
  const c = new PixelCanvas(14, 32);
  c.rect(6, 8, 3, 23, P.wood[2]!);
  c.vline(6, 8, 30, P.wood[3]!);
  c.ellipse(7, 5, 4, 4, P.bone[3]!);
  c.set(5, 5, P.black);
  c.set(8, 5, P.black);
  c.hline(5, 9, 8, P.bone[1]!);
  c.hline(2, 12, 12, P.red[2]!);
  c.set(2, 13, P.red[2]!);
  c.set(12, 13, P.red[2]!);
  c.set(3, 14, P.white);
  c.outline(darkOutline);
  add('totem', c);
}
totem();

function palisade() {
  const c = new PixelCanvas(16, 24);
  for (const x of [0, 4, 8, 12]) {
    c.rect(x, 4, 4, 19, P.wood[3]!);
    c.vline(x, 4, 22, P.wood[4]!);
    c.vline(x + 3, 4, 22, P.wood[1]!);
    c.set(x + 1, 3, P.wood[3]!);
    c.set(x + 2, 3, P.wood[2]!);
    c.set(x + 1, 2, P.wood[4]!);
  }
  c.hline(0, 15, 10, P.leather[2]!);
  c.hline(0, 15, 17, P.leather[2]!);
  c.outline(darkOutline);
  add('palisade', c);
}
palisade();

// ---------------------------------------------------------------- portas, chaminé, saco de loot e sombras
function door(name: string, frame: Ramp, plank: Ramp) {
  const closed = new PixelCanvas(16, 32);
  closed.rect(3, 6, 10, 26, plank[3]!);
  for (let x = 3; x < 13; x++) for (let y = 6; y < 32; y++) if ((x - 3) % 3 === 2) closed.set(x, y, plank[2]!);
  closed.hline(3, 12, 6, plank[4]!);
  closed.hline(3, 12, 12, frame[1]!);
  closed.hline(3, 12, 24, frame[1]!);
  closed.set(11, 19, P.gold[4]!);
  closed.set(11, 20, P.gold[2]!);
  closed.rect(3, 4, 10, 2, frame[2]!);
  add(`${name}_closed`, closed);
  const open = new PixelCanvas(16, 32);
  open.rect(3, 6, 2, 26, plank[2]!);
  open.vline(4, 6, 31, plank[1]!);
  open.set(3, 19, P.gold[3]!);
  add(`${name}_open`, open);
}
door('door_wood', P.wood, P.wood);
door('door_temple', P.gold, P.roofRed);

function chimney() {
  const c = new PixelCanvas(12, 20);
  c.rect(1, 4, 10, 15, P.stone[3]!);
  for (let y = 4; y < 19; y++) for (let x = 1; x < 11; x++) if (y % 4 === 0 || (x + (Math.floor(y / 4) % 2) * 3) % 6 === 0) c.set(x, y, P.stone[2]!);
  c.rect(0, 2, 12, 3, P.stone[4]!);
  c.rect(3, 0, 6, 2, P.black);
  c.outline(darkOutline);
  add('chimney', c);
}
chimney();

function lootBag() {
  const c = new PixelCanvas(14, 14);
  c.ellipse(7, 8.5, 5.5, 4.5, (x, y, nx, ny) => lit(P.leather, nx, ny, 0.2));
  c.rect(5, 2, 4, 3, P.leather[3]!);
  c.hline(4, 9, 4, P.gold[3]!);
  c.set(6, 1, P.gold[4]!);
  c.set(8, 1, P.gold[3]!);
  c.set(7, 0, P.gold[5]!);
  c.outline(darkOutline);
  add('loot_bag', c);
}
lootBag();

function shadow(name: string, w: number, h: number) {
  const c = new PixelCanvas(w, h);
  c.ellipse(w / 2, h / 2, w / 2 - 0.2, h / 2 - 0.2, (x, y, nx, ny) => {
    const d = Math.hypot(nx, ny);
    return withAlpha(P.black, d < 0.6 ? 90 : 60);
  });
  add(name, c);
}
shadow('shadow_s', 12, 5);
shadow('shadow_m', 18, 6);
shadow('shadow_l', 26, 8);

// brilho suave (luz aditiva): círculo com degradê pontilhado
function glow(name: string, r: number, col: Color) {
  const size = r * 2;
  const c = new PixelCanvas(size, size);
  c.disc(r, r, r, (x, y, nx, ny) => {
    const d = Math.hypot(nx, ny);
    const a = Math.max(0, 1 - d) ** 1.6;
    return withAlpha(col, Math.round(a * 200));
  });
  add(name, c);
}
glow('glow_warm', 24, P.fire[4]!);
glow('glow_cool', 24, P.ice[3]!);

export function buildObjects(): AtlasEntry[] {
  return out;
}
