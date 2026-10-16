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

// ------------------------------------------------------------------ Sapo do Pântano (quadros 24x24, "blob")
function toadFrame(sq: number, dead = false): PixelCanvas {
  const c = new PixelCanvas(24, 24);
  const g = P.forest;
  const cx = 12;
  if (dead) {
    c.ellipse(12, 19, 8, 2.8, (x, y, nx, ny) => (ny < -0.2 ? g[3]! : g[1]!));
    c.set(8, 18, P.gold[3]!);
    c.set(15, 18, P.gold[3]!);
    c.outline(sel);
    return c;
  }
  const rx = 7.5 + sq * 0.6;
  const ry = 5.2 - sq * 0.5;
  const cy = 20 - ry;
  // patas traseiras
  for (const s of [-1, 1]) c.ellipse(cx + s * 6.5, 19, 3, 1.8, g[2]!);
  c.ellipse(cx, cy, rx, ry, (x, y, nx, ny) => {
    const shade = nx * 0.4 + ny * 0.8;
    if (ny > 0.35) return mix(P.sand[2]!, g[3]!, 0.3);
    if (hash2(x, y, 41) > 0.9) return g[1]!;
    return shade < -0.4 ? g[4]! : shade < 0.2 ? g[3]! : g[2]!;
  });
  // olhos saltados
  for (const ex of [cx - 4, cx + 4]) {
    c.disc(ex, cy - ry + 1, 2.2, P.gold[3]!);
    c.set(ex, cy - ry + 1, P.outline);
    c.set(ex - 1, cy - ry, P.white);
  }
  c.hline(cx - 4, cx + 4, cy + 1, g[0]!);
  c.outline(sel);
  return c;
}
export function buildToadFrames(): PixelCanvas[] {
  return [toadFrame(0), toadFrame(1), toadFrame(-0.5), toadFrame(-1), toadFrame(0, true)];
}

// ------------------------------------------------------------------ Aranha das Ruínas (quadros 28x24, "blob" com pernas animadas)
function spiderFrame(step: number, dead = false): PixelCanvas {
  const c = new PixelCanvas(28, 24);
  const b = P.purple;
  const cx = 14;
  const legs = (phase: number) => {
    for (let i = 0; i < 4; i++) {
      const wob = ((i + phase) % 2 === 0 ? 1 : -1) * (dead ? 0 : 1);
      for (const s of [-1, 1]) {
        const x0 = cx + s * 3;
        const y0 = 13 + i;
        const kx = cx + s * (7 + i * 0.6);
        const ky = 9 + i * 2 + wob;
        const fx = cx + s * (11 + (i % 2));
        const fy = 16 + i * 1.6 - wob;
        c.line(x0, y0, kx, ky, b[0]!);
        c.line(kx, ky, fx, fy, b[1]!);
      }
    }
  };
  if (dead) {
    c.ellipse(cx, 18, 7, 3, b[1]!);
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) c.line(cx + s * 4, 17, cx + s * (8 + i), 12 + i, b[0]!);
    c.outline(sel);
    return c;
  }
  legs(step);
  c.ellipse(cx, 15, 6.5, 5, (x, y, nx, ny) => (nx + ny < -0.6 ? b[3]! : nx + ny < 0.4 ? b[2]! : b[1]!));
  c.ellipse(cx, 9.5, 4, 3.2, (x, y, nx, ny) => (nx + ny < -0.4 ? b[2]! : b[1]!));
  // marca vermelha nas costas e olhos
  c.set(cx, 14, P.red[3]!);
  c.set(cx - 1, 15, P.red[3]!);
  c.set(cx + 1, 15, P.red[3]!);
  c.set(cx, 16, P.red[2]!);
  for (const ex of [cx - 2, cx - 1, cx + 1, cx + 2]) c.set(ex, 9, P.red[4]!);
  c.set(cx - 1, 11, P.bone[3]!);
  c.set(cx + 1, 11, P.bone[3]!);
  c.outline(sel);
  return c;
}
export function buildSpiderFrames(): PixelCanvas[] {
  return [spiderFrame(0), spiderFrame(1), spiderFrame(0), spiderFrame(1), spiderFrame(0, true)];
}

// ------------------------------------------------------------------ Lobo Cinzento (quadros 32x24, quadrúpede de perfil)
function wolfFrame(step: number, dead = false, f: readonly Color[] = P.cloth, eye: Color = P.gold[4]!): PixelCanvas {
  const c = new PixelCanvas(32, 24);
  const fur = (x: number, y: number, nx: number, ny: number): Color => {
    const shade = nx * 0.2 + ny * 0.85;
    if (shade < -0.5) return f[4]!;
    if (shade < -0.05) return f[3]!;
    if (shade < 0.45) return f[2]!;
    return f[1]!;
  };
  const bob = step === 0 ? 0 : 1;
  if (!dead) {
    const off = step === 0 ? [0, 0, 0, 0] : step === 1 ? [2, -1, -1, 2] : [-1, 2, 2, -1];
    [7, 10, 18, 21].forEach((x, i) => {
      for (let y = 14; y <= 19; y++) {
        const dx = Math.round(((y - 14) / 5) * (off[i]! * 0.5));
        c.set(x + dx, y, i % 2 ? f[1]! : f[2]!);
        c.set(x + dx + 1, y, f[1]!);
      }
      c.set(x + Math.round(off[i]! * 0.5), 20, P.outline);
    });
  }
  // corpo esguio, cauda e cabeça
  c.ellipse(13, 11 + bob, 9, 4.5, fur);
  for (let i = 0; i < 6; i++) c.set(3 - Math.floor(i / 3), 8 + i + bob - (i > 3 ? 1 : 0), i < 3 ? f[3]! : f[2]!);
  c.ellipse(22.5, 8.5 + bob, 4, 3.6, fur);
  // focinho
  c.rect(25, 9 + bob, 4, 2, f[3]!);
  c.set(28, 9 + bob, P.outline);
  c.hline(25, 28, 11 + bob, f[1]!);
  // orelhas pontudas
  c.set(20, 4 + bob, f[2]!);
  c.set(20, 5 + bob, f[2]!);
  c.set(21, 5 + bob, f[3]!);
  c.set(23, 4 + bob, f[2]!);
  c.set(23, 5 + bob, f[3]!);
  // olho âmbar e peito claro
  c.set(23, 8 + bob, eye);
  for (let y = 10; y < 14; y++) c.paint(19 + (y - 10), y + bob, f[4] ?? f[3]!);
  c.outline(sel);
  if (dead) {
    const out = new PixelCanvas(32, 24);
    out.blit(c, 0, 5, { flipY: true });
    out.map((col) => (col ? mix(col, P.black, 0.2) : 0));
    return out;
  }
  return c;
}
export function buildWolfFrames(): PixelCanvas[] {
  return [wolfFrame(0), wolfFrame(1), wolfFrame(2), wolfFrame(0, true)];
}

// ------------------------------------------------------------------ Lobo de Gelo (mesmo corpo do lobo, pelagem gelada e olho azul)
export function buildIceWolfFrames(): PixelCanvas[] {
  const ice = [P.ice[0]!, P.ice[1]!, P.ice[2]!, P.ice[3]!, P.ice[4]!];
  return [wolfFrame(0, false, ice, P.blue[4]!), wolfFrame(1, false, ice, P.blue[4]!), wolfFrame(2, false, ice, P.blue[4]!), wolfFrame(0, true, ice, P.blue[4]!)];
}

// ------------------------------------------------------------------ Urso Pardo (quadros 36x28, quadrúpede robusto)
function bearFrame(step: number, dead = false): PixelCanvas {
  const c = new PixelCanvas(36, 28);
  const f = P.leather;
  const fur = (x: number, y: number, nx: number, ny: number): Color => {
    const shade = nx * 0.25 + ny * 0.8 + (hash2(x, y, 77) - 0.5) * 0.25;
    if (shade < -0.5) return f[4]!;
    if (shade < -0.05) return f[3]!;
    if (shade < 0.45) return f[2]!;
    return f[1]!;
  };
  const bob = step === 0 ? 0 : 1;
  if (!dead) {
    const off = step === 0 ? [0, 0, 0, 0] : step === 1 ? [1, 0, 0, 1] : [0, 1, 1, 0];
    [7, 11, 21, 25].forEach((x, i) => {
      for (let y = 17; y <= 23 - (off[i] ?? 0); y++) {
        c.set(x, y, f[1]!);
        c.set(x + 1, y, f[2]!);
        c.set(x + 2, y, f[1]!);
      }
      c.hline(x, x + 2, 24 - (off[i] ?? 0), P.outline);
    });
  }
  c.ellipse(16, 13 + bob, 12, 7, fur);
  // corcova e cabeça
  c.ellipse(11, 9 + bob, 5, 3.5, fur);
  c.ellipse(27, 12 + bob, 5.5, 4.8, fur);
  c.rect(30, 13 + bob, 4, 3, f[3]!);
  c.set(33, 13 + bob, P.outline);
  c.set(27, 11 + bob, P.outline);
  c.set(28, 11 + bob, P.white);
  for (const ex of [24, 28]) {
    c.disc(ex, 7.5 + bob, 1.6, f[2]!);
    c.set(ex, 7 + bob, f[1]!);
  }
  for (let x = 9; x <= 22; x++) c.paint(x, 19 + bob, f[1]!);
  c.outline(sel);
  if (dead) {
    const out = new PixelCanvas(36, 28);
    out.blit(c, 0, 4, { flipY: true });
    out.map((col) => (col ? mix(col, P.black, 0.2) : 0));
    return out;
  }
  return c;
}
export function buildBearFrames(): PixelCanvas[] {
  return [bearFrame(0), bearFrame(1), bearFrame(2), bearFrame(0, true)];
}

// ------------------------------------------------------------------ Escorpião Gigante (quadros 32x26, "blob" com cauda e pinças)
function scorpionFrame(step: number, dead = false): PixelCanvas {
  const c = new PixelCanvas(32, 26);
  const b = P.dirt;
  const cx = 16;
  const legs = (phase: number) => {
    for (let i = 0; i < 3; i++) {
      const wob = ((i + phase) % 2 === 0 ? 1 : -1) * (dead ? 0 : 1);
      for (const s of [-1, 1]) {
        c.line(cx + s * 4, 17 + i, cx + s * (9 + i), 15 + i * 2 + wob, b[1]!);
        c.line(cx + s * (9 + i), 15 + i * 2 + wob, cx + s * (11 + i), 21 + i - wob, b[0]!);
      }
    }
  };
  legs(dead ? 0 : step);
  c.ellipse(cx, 18, 7, 4.2, (x, y, nx, ny) => (nx + ny < -0.5 ? b[4]! : nx + ny < 0.4 ? b[3]! : b[2]!));
  // pinças
  for (const s of [-1, 1]) {
    c.line(cx + s * 5, 16, cx + s * 9, 11, b[2]!);
    c.ellipse(cx + s * 10, 10, 2.6, 2, b[3]!);
    c.set(cx + s * 11, 8 + (step % 2), b[4]!);
  }
  // cauda curvada com ferrão
  if (!dead) {
    const pts: [number, number][] = [[cx, 14], [cx, 11], [cx + 1, 8], [cx + 3, 5], [cx + 5, 4], [cx + 7, 5]];
    pts.forEach(([x, y], i) => c.disc(x, y - (step % 2) * 0.5, i < 3 ? 1.8 : 1.4, i % 2 ? b[3]! : b[4]!));
    c.set(cx + 8, 7, P.red[4]!);
    c.set(cx + 8, 8, P.red[3]!);
  }
  for (const ex of [cx - 2, cx + 2]) c.set(ex, 15, P.outline);
  c.outline(sel);
  return c;
}
export function buildScorpionFrames(): PixelCanvas[] {
  return [scorpionFrame(0), scorpionFrame(1), scorpionFrame(0), scorpionFrame(1), scorpionFrame(0, true)];
}

// ------------------------------------------------------------------ Dragão Jovem (quadros 44x34, quadrúpede alado)
function dragonFrame(step: number, dead = false): PixelCanvas {
  const c = new PixelCanvas(44, 34);
  const r = P.red;
  const scale = (x: number, y: number, nx: number, ny: number): Color => {
    const shade = nx * 0.3 + ny * 0.8;
    if ((x + y) % 5 === 0 && shade > -0.3) return r[2]!;
    if (shade < -0.5) return r[4]!;
    if (shade < 0) return r[3]!;
    if (shade < 0.5) return r[2]!;
    return r[1]!;
  };
  const bob = step === 0 ? 0 : 1;
  const flap = step === 1 ? -3 : step === 2 ? 2 : 0;
  // asa de trás
  for (let i = 0; i < 9; i++) c.line(16 + i, 14 + bob, 12 + i * 1.6, 3 + flap + Math.abs(i - 4) * 0.6, i % 2 ? r[1]! : r[2]!);
  if (!dead) {
    const off = step === 0 ? [0, 0, 0, 0] : step === 1 ? [1, 0, 0, 1] : [0, 1, 1, 0];
    [11, 15, 24, 28].forEach((x, i) => {
      for (let y = 22; y <= 28 - (off[i] ?? 0); y++) {
        c.set(x, y, r[1]!);
        c.set(x + 1, y, r[2]!);
        c.set(x + 2, y, r[1]!);
      }
      c.hline(x - 1, x + 3, 29 - (off[i] ?? 0), P.bone[2]!);
    });
  }
  // cauda
  for (let i = 0; i < 9; i++) c.disc(9 - i, 19 + bob + Math.round(Math.sin(i / 2 + step) * 1.5), 2.2 - i * 0.18, r[2]!);
  c.set(1, 19 + bob, P.bone[3]!);
  // corpo, pescoço e cabeça
  c.ellipse(20, 18 + bob, 11, 6.5, scale);
  c.ellipse(31, 12 + bob, 3, 5, scale);
  c.ellipse(36, 8 + bob, 5, 3.6, scale);
  c.rect(39, 8 + bob, 4, 3, r[3]!);
  c.set(42, 8 + bob, P.outline);
  c.set(36, 7 + bob, P.gold[4]!);
  for (const [x, y] of [[33, 4], [35, 3]] as const) c.set(x, y + bob, P.bone[3]!);
  // barriga dourada
  for (let x = 12; x <= 28; x++) c.paint(x, 23 + bob, P.gold[2]!);
  // asa da frente
  for (let i = 0; i < 9; i++) c.line(19 + i, 15 + bob, 16 + i * 1.7, 4 + flap + Math.abs(i - 4) * 0.5, i % 2 ? r[3]! : r[4]!);
  c.outline(sel);
  if (dead) {
    const out = new PixelCanvas(44, 34);
    out.blit(c, 0, 4, { flipY: true });
    out.map((col) => (col ? mix(col, P.black, 0.25) : 0));
    return out;
  }
  return c;
}
export function buildDragonFrames(): PixelCanvas[] {
  return [dragonFrame(0), dragonFrame(1), dragonFrame(2), dragonFrame(0, true)];
}
