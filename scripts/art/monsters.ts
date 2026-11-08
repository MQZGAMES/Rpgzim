// Criaturas não humanoides desenhadas proceduralmente (os humanoides — goblins, orcs, esqueletos... — usam o sistema de
// personagens em characters.ts).
//
// Regras de desenho (as mesmas do resto do jogo, ver docs/ART_BIBLE.md):
// - luz vinda de cima à esquerda: cada volume é sombreado pela própria normal, com 4–5 tons da rampa da paleta;
// - contorno seletivo (sel-out): a borda pega a cor do vizinho escurecida, nunca um preto chapado;
// - silhueta legível no tamanho real (24–44 px): anatomia simples, partes que se separam pelo valor (perna de trás mais
//   escura que a da frente, barriga mais clara, olho com brilho);
// - cada espécie tem o seu traço próprio — as variantes das faixas tardias e do sul não são só troca de cor (a hiena tem
//   manchas e crina, o lobo da tempestade tem raios, o escorpião de cristal tem facetas, o basilisco é um lagarto...).
//
// Formatos esperados pelo jogo (manifesto gerado em index.ts):
// - "blob" (sem direção): 5 quadros — 0..3 animação parada/andando (sequência 0,1,0,2,3,2) e 4 = morto;
// - "quad" (de perfil, olhando para a direita; o jogo espelha): 4 quadros — 0 parado, 1 e 2 passos, 3 = morto.
import { PixelCanvas, mix, type Color } from './lib/canvas.ts';
import { P } from './lib/palette.ts';
import { hash2 } from './lib/rng.ts';

type Ramp = readonly Color[];
type Shade = (x: number, y: number, nx: number, ny: number) => Color;

const sel = (n: Color) => mix(n, P.outline, 0.8);
const pick = (r: Ramp, t: number): Color => r[Math.max(0, Math.min(r.length - 1, Math.round(t * (r.length - 1))))]!;
const mixRamp = (a: Ramp, b: Ramp | Color, t: number): Color[] =>
  a.map((c, i) => mix(c, typeof b === 'number' ? b : b[Math.min(i, b.length - 1)]!, t));

/**
 * Sombreamento de um volume: luz de cima à esquerda. `base` é o brilho médio (0 escuro, 1 claro) e `spread` o quanto a
 * normal muda o tom. `grain` > 0 dá textura (pelo, escama) sem virar ruído.
 */
function vol(r: Ramp, base = 0.55, spread = 0.5, grain = 0, seed = 1): Shade {
  return (x, y, nx, ny) => {
    let t = base - (nx * 0.35 + ny * 0.8) * spread;
    if (grain) t += (hash2(x, y, seed) - 0.5) * grain;
    return pick(r, t);
  };
}

/** Polígono preenchido (regra par-ímpar), para asas, crinas e espinhos. */
function poly(c: PixelCanvas, pts: readonly (readonly [number, number])[], col: Color | ((x: number, y: number) => Color)): void {
  const ys = pts.map((p) => p[1]);
  const y0 = Math.floor(Math.min(...ys));
  const y1 = Math.ceil(Math.max(...ys));
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i]!;
      const [bx, by] = pts[(i + 1) % pts.length]!;
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let x = Math.round(xs[k]!); x < Math.round(xs[k + 1]!); x++) c.set(x, y, typeof col === 'function' ? col(x, y) : col);
  }
}

/** Linha grossa (2 px) com um tom na frente e outro atrás — pernas, ossos de asa. */
function limb(c: PixelCanvas, x0: number, y0: number, x1: number, y1: number, front: Color, back: Color): void {
  c.line(x0 + 1, y0, x1 + 1, y1, back);
  c.line(x0, y0, x1, y1, front);
}

/** Olho com brilho: pupila escura e um ponto de luz (lê bem em 1–2 px). */
function eye(c: PixelCanvas, x: number, y: number, iris: Color, big = false): void {
  if (big) {
    c.set(x, y, iris);
    c.set(x + 1, y, iris);
    c.set(x, y + 1, P.outline);
    c.set(x + 1, y + 1, iris);
    c.set(x, y, P.white);
  } else {
    c.set(x, y, iris);
    c.set(x, y - 1, mix(iris, P.white, 0.5));
  }
}

/** Quadro "morto" dos quadrúpedes: de lado, virado, mais escuro e um pouco mais baixo. */
function deadQuad(c: PixelCanvas, drop: number, dark = 0.22): PixelCanvas {
  const out = new PixelCanvas(c.w, c.h);
  out.blit(c, 0, drop, { flipY: true });
  out.map((col) => (col ? mix(col, P.black, dark) : 0));
  return out;
}

/** Passada dos quadrúpedes: deslocamento (x do pé) de cada perna [trás longe, trás perto, frente longe, frente perto]. */
const GAIT: Record<number, readonly number[]> = { 0: [0, 0, 0, 0], 1: [2, -2, -2, 2], 2: [-2, 2, 2, -2] };

// ================================================================== SLIMES (24x24, blob)
export const SLIME_W = 24;
export const SLIME_H = 24;

interface SlimeLook {
  body: Ramp;
  /** Detalhe no topo/dentro: musgo, bolhas e graveto do brejo, crosta e brasas do magma. */
  kind: 'moss' | 'bog' | 'magma';
}

function slimeFrame(rx: number, ry: number, eyeDy: number, look: SlimeLook, dead = false): PixelCanvas {
  const c = new PixelCanvas(SLIME_W, SLIME_H);
  const n = look.body;
  const cx = 12;
  const bottom = 21;
  if (dead) {
    c.ellipse(12, 19.5, 8.5, 2.6, (x, y, nx, ny) => (ny < -0.3 ? n[3]! : ny > 0.4 ? n[1]! : n[2]!));
    c.ellipse(17, 20.5, 2, 1, n[1]!); // poça escorrendo
    c.set(8, 18, n[4]!);
    c.set(10, 19, P.outline);
    c.set(13, 19, P.outline);
    c.outline(sel);
    return c;
  }
  const cy = bottom - ry;
  // corpo gelatinoso: borda inferior mais escura (o chão), miolo translúcido mais claro, topo iluminado
  c.ellipse(cx, cy, rx, ry, (x, y, nx, ny) => {
    if (ny > 0.62) return n[1]!;
    const core = nx * nx + (ny - 0.15) * (ny - 0.15) < 0.25;
    const t = 0.6 - (nx * 0.35 + ny * 0.7) * 0.5 + (core ? 0.12 : 0);
    return pick(n, t);
  });
  // reflexo da superfície e brilho especular
  const hx = Math.round(cx - rx * 0.45);
  const hy = Math.round(cy - ry * 0.55);
  c.set(hx, hy, P.white);
  c.set(hx + 1, hy, n[n.length - 1]!);
  c.set(hx, hy + 1, n[n.length - 1]!);
  c.set(Math.round(cx + rx * 0.55), Math.round(cy + ry * 0.1), n[n.length - 2]!);
  const topY = Math.round(cy - ry);
  if (look.kind === 'moss') {
    for (let i = -3; i <= 3; i++) {
      if (hash2(i, 3, 5) < 0.6) c.set(cx + i, topY + (Math.abs(i) > 2 ? 1 : 0), P.forest[3]!);
      if (hash2(i, 4, 5) < 0.35) c.set(cx + i, topY - 1 + (Math.abs(i) > 2 ? 1 : 0), P.forest[4]!);
    }
    c.set(cx + 1, topY - 1, P.pink[3]!); // florzinha
    c.set(cx + 1, topY - 2, P.pink[2]!);
  } else if (look.kind === 'bog') {
    // bolhas dentro do lodo e um graveto preso no topo
    for (const [bx, by] of [[cx + 3, cy + 1], [cx - 4, cy + 3], [cx + 1, cy + 4]] as const) c.set(bx, by, n[n.length - 1]!);
    c.line(cx - 2, topY, cx + 2, topY - 2, P.wood[2]!);
    c.set(cx + 2, topY - 3, P.forest[3]!);
  } else {
    // crosta escura com rachaduras incandescentes e brasas saltando
    c.ellipse(cx, cy - ry * 0.45, rx * 0.8, ry * 0.45, (x, y) => (hash2(Math.floor(x / 2), Math.floor(y / 2), 31) > 0.45 ? mix(n[1]!, P.black, 0.35) : 0));
    for (const [x0, y0, x1, y1] of [[cx - 4, cy - 2, cx - 1, cy], [cx + 1, cy - 3, cx + 4, cy - 1], [cx - 1, cy + 1, cx + 2, cy + 2]] as const)
      c.line(x0, y0, x1, y1, P.fire[4]!);
    c.set(cx - 2, topY - 2, P.fire[4]!);
    c.set(cx + 3, topY - 3, P.fire[3]!);
  }
  // olhos grandes com brilho e boquinha
  const ey = Math.round(cy - ry * 0.05) + eyeDy;
  for (const ex of [cx - 4, cx + 2]) {
    c.rect(ex, ey, 2, 3, P.outline);
    c.set(ex, ey, P.white);
    c.set(ex + 1, ey + 2, mix(P.outline, P.white, 0.25));
  }
  c.hline(cx - 1, cx, ey + 4, n[0]!);
  c.outline(sel);
  return c;
}

const slimeSet = (look: SlimeLook): PixelCanvas[] => [
  slimeFrame(7.2, 5.6, 0, look),
  slimeFrame(7.9, 5, 1, look),
  slimeFrame(6.8, 6.3, 0, look),
  slimeFrame(6.2, 7.1, -1, look),
  slimeFrame(0, 0, 0, look, true),
];
export function buildSlimeFrames(): PixelCanvas[] {
  return slimeSet({ body: P.nature, kind: 'moss' });
}
/** Slime do Brejo: lodo roxo-acastanhado, bolhas e um graveto preso. */
export function buildBogSlimeFrames(): PixelCanvas[] {
  return slimeSet({ body: mixRamp(P.purple, P.dirt, 0.45), kind: 'bog' });
}
/** Slime de Magma: crosta de rocha com rachaduras em brasa. */
export function buildMagmaSlimeFrames(): PixelCanvas[] {
  return slimeSet({ body: P.fire, kind: 'magma' });
}

// ================================================================== SAPOS (24x24, blob)
function toadFrame(sq: number, g: Ramp, warts: boolean, dead = false): PixelCanvas {
  const c = new PixelCanvas(24, 24);
  const cx = 12;
  if (dead) {
    c.ellipse(12, 19, 8.5, 3, (x, y, nx, ny) => (ny < -0.2 ? g[3]! : g[1]!));
    c.ellipse(12, 20, 5, 1.5, P.sand[1]!);
    for (const s of [-1, 1]) c.line(cx + s * 7, 19, cx + s * 10, 17, g[2]!);
    c.set(8, 18, P.outline);
    c.set(15, 18, P.outline);
    c.outline(sel);
    return c;
  }
  const rx = 7.6 + sq * 0.6;
  const ry = 5.3 - sq * 0.5;
  const cy = 20 - ry;
  // pernas traseiras dobradas e mãos da frente
  for (const s of [-1, 1]) {
    c.ellipse(cx + s * 6.5, 18.5, 3.2, 2.2, vol(g, 0.4, 0.4));
    c.hline(cx + s * 3 - 1, cx + s * 3 + 1, 20, g[2]!);
  }
  c.ellipse(cx, cy, rx, ry, (x, y, nx, ny) => {
    if (ny > 0.3 && Math.abs(nx) < 0.75) return mix(P.sand[2]!, g[3]!, 0.25); // papo claro
    return vol(g, 0.55, 0.55)(x, y, nx, ny);
  });
  if (warts)
    for (let i = 0; i < 7; i++) {
      const wx = Math.round(cx - rx * 0.7 + hash2(i, 1, 9) * rx * 1.4);
      const wy = Math.round(cy - ry * 0.6 + hash2(i, 2, 9) * ry * 0.6);
      c.set(wx, wy, g[g.length - 1]!);
      c.set(wx + 1, wy + 1, g[1]!);
    }
  // boca larga
  c.hline(cx - 4, cx + 4, cy + 1, g[0]!);
  c.set(cx - 5, cy, g[0]!);
  c.set(cx + 5, cy, g[0]!);
  // olhos saltados com pupila horizontal
  for (const ex of [cx - 4, cx + 4]) {
    c.disc(ex, cy - ry + 1.2, 2.3, vol(g, 0.6, 0.4));
    c.hline(ex - 1, ex + 1, Math.round(cy - ry + 1), P.gold[3]!);
    c.set(ex, Math.round(cy - ry + 1), P.outline);
    c.set(ex - 1, Math.round(cy - ry), P.white);
  }
  c.outline(sel);
  return c;
}
const toadSet = (g: Ramp, warts: boolean): PixelCanvas[] => [
  toadFrame(0, g, warts),
  toadFrame(1, g, warts),
  toadFrame(-0.5, g, warts),
  toadFrame(-1, g, warts),
  toadFrame(0, g, warts, true),
];
export function buildToadFrames(): PixelCanvas[] {
  return toadSet(P.forest, false);
}
/** Sapo-Boi do Brejo: pele marrom-oliva cheia de verrugas. */
export function buildMarshToadFrames(): PixelCanvas[] {
  return toadSet(mixRamp(P.leather, P.green, 0.45), true);
}

// ================================================================== ARANHAS (28x24, blob)
interface SpiderLook {
  body: Ramp;
  mark: Ramp;
  /** Desenho nas costas: cruz (aranha comum), ampulheta (viúva), pintas de cristal (caverna) ou runas (vazio). */
  pattern: 'cross' | 'hourglass' | 'crystal' | 'runes';
  glowEyes?: boolean;
}

function spiderFrame(step: number, look: SpiderLook, dead = false): PixelCanvas {
  const c = new PixelCanvas(28, 24);
  const b = look.body;
  const m = look.mark;
  const cx = 14;
  if (dead) {
    c.ellipse(cx, 18.5, 7, 3, vol(b, 0.35, 0.4));
    for (const s of [-1, 1])
      for (let i = 0; i < 4; i++) {
        c.line(cx + s * 4, 17, cx + s * (7 + i), 12 + i, b[1]!);
        c.line(cx + s * (7 + i), 12 + i, cx + s * (9 + i), 14 + i, b[0]!);
      }
    c.outline(sel);
    return c;
  }
  // pernas articuladas: coxa sobe até o joelho, canela desce até o chão (as de trás, mais escuras)
  for (let i = 3; i >= 0; i--) {
    const wob = (i + step) % 2 === 0 ? 1 : -1;
    for (const s of [-1, 1]) {
      const x0 = cx + s * 2.5;
      const y0 = 11.5 + i * 1.3;
      const kx = cx + s * (7 + i * 0.7);
      const ky = 7 + i * 2.2 + wob * 0.8;
      const fx = cx + s * (10.5 + (i % 2) * 1.5);
      const fy = 13 + i * 2.2 - wob;
      const far = i % 2 === 1;
      c.line(x0, y0, kx, ky, far ? b[1]! : b[2]!);
      c.line(kx, ky, fx, fy, far ? b[0]! : b[1]!);
      c.set(Math.round(kx), Math.round(ky), b[3]!); // joelho iluminado
    }
  }
  // abdômen grande e brilhante, cefalotórax menor à frente
  c.ellipse(cx, 15.5, 6.6, 5.4, vol(b, 0.55, 0.6, 0.12, 4));
  c.set(cx - 3, 12, b[b.length - 1]!);
  c.set(cx - 2, 12, b[b.length - 2]!);
  c.ellipse(cx, 9, 4.2, 3.2, vol(b, 0.5, 0.5));
  // desenho nas costas
  if (look.pattern === 'cross') {
    c.vline(cx, 13, 18, m[3]!);
    c.hline(cx - 2, cx + 2, 15, m[3]!);
    c.set(cx, 13, m[4]!);
  } else if (look.pattern === 'hourglass') {
    poly(c, [[cx - 2, 13], [cx + 3, 13], [cx + 0.5, 15.5]], m[3]!);
    poly(c, [[cx - 2, 18.5], [cx + 3, 18.5], [cx + 0.5, 16]], m[3]!);
    c.set(cx, 13, m[4]!);
  } else if (look.pattern === 'crystal') {
    for (const [x, y] of [[cx - 3, 14], [cx + 2, 13], [cx + 1, 17], [cx - 1, 16]] as const) {
      c.set(x, y, m[4]!);
      c.set(x, y + 1, m[2]!);
    }
  } else {
    // runas que brilham no corpo negro
    c.line(cx - 3, 13, cx - 1, 17, m[3]!);
    c.line(cx + 3, 13, cx + 1, 17, m[3]!);
    c.hline(cx - 1, cx + 1, 15, m[4]!);
    c.set(cx, 19, m[4]!);
  }
  // oito olhos (duas fileiras) e quelíceras
  const eyeC = look.glowEyes ? m[4]! : m[3]!;
  for (const ex of [cx - 2, cx - 1, cx + 1, cx + 2]) c.set(ex, 8, eyeC);
  c.set(cx - 1, 7, look.glowEyes ? P.white : m[4]!);
  c.set(cx + 1, 7, eyeC);
  c.set(cx - 1, 11, P.bone[3]!);
  c.set(cx + 1, 11, P.bone[3]!);
  c.set(cx - 1, 12, P.bone[1]!);
  c.set(cx + 1, 12, P.bone[1]!);
  c.outline(sel);
  return c;
}
const spiderSet = (look: SpiderLook): PixelCanvas[] => [
  spiderFrame(0, look),
  spiderFrame(1, look),
  spiderFrame(0, look),
  spiderFrame(1, look),
  spiderFrame(0, look, true),
];
export function buildSpiderFrames(): PixelCanvas[] {
  return spiderSet({ body: P.purple, mark: P.red, pattern: 'cross' });
}
/** Aranha das Cavernas: carapaça cinza-azulada, pintas de cristal e olhos verde-água acesos. */
export function buildCaveSpiderFrames(): PixelCanvas[] {
  return spiderSet({ body: P.stone, mark: P.teal, pattern: 'crystal', glowEyes: true });
}
/** Viúva-Negra: preta e lustrosa, com a ampulheta vermelha. */
export function buildWidowSpiderFrames(): PixelCanvas[] {
  return spiderSet({ body: mixRamp(P.stone, P.black, 0.62), mark: P.red, pattern: 'hourglass' });
}
/** Horror do Vazio: corpo negro-violeta com runas e olhos azuis que brilham. */
export function buildVoidHorrorFrames(): PixelCanvas[] {
  return spiderSet({ body: mixRamp(P.purple, P.black, 0.62), mark: P.ice, pattern: 'runes', glowEyes: true });
}

// ================================================================== CANÍDEOS (32x24, quad)
interface CanineLook {
  fur: Ramp;
  belly: Color;
  eye: Color;
  /** Crina no pescoço (lobo atroz, hiena), manchas (hiena), raios (tempestade), gelo nas costas (lobo de gelo). */
  mane?: Ramp;
  spots?: Color;
  bolts?: Color;
  frost?: boolean;
  /** Hiena: costas caindo para trás, orelhas redondas e cauda curta. */
  hyena?: boolean;
}

function canineFrame(step: number, L: CanineLook, dead = false): PixelCanvas {
  const c = new PixelCanvas(32, 24);
  const f = L.fur;
  const bob = step === 0 ? 0 : 1;
  const g = GAIT[dead ? 0 : step]!;
  const hy = L.hyena ? 1 : 0;
  // pernas do lado de longe (mais escuras)
  const leg = (hipX: number, hipY: number, footDx: number, near: boolean, back: boolean) => {
    const fx = hipX + footDx;
    const kneeX = back ? hipX - 1 + footDx * 0.3 : hipX + footDx * 0.5;
    const kneeY = hipY + 3;
    const front = near ? f[2]! : f[1]!;
    const shade = near ? f[1]! : f[0]!;
    limb(c, hipX, hipY, kneeX, kneeY, front, shade);
    limb(c, kneeX, kneeY, fx, 19, front, shade);
    c.hline(Math.round(fx), Math.round(fx) + 2, 20, near ? P.outline : mix(P.outline, f[0]!, 0.3));
  };
  if (!dead) {
    leg(8, 13 + bob - hy, g[0]!, false, true);
    leg(20, 13 + bob, g[2]!, false, false);
  }
  // cauda (lobo: cheia e levantada; hiena: curta)
  if (L.hyena) {
    c.line(4, 11 + bob, 2, 14 + bob, f[2]!);
    c.set(2, 15 + bob, f[0]!);
  } else {
    for (let i = 0; i < 7; i++) {
      const tx = 5 - i * 0.6;
      const ty = 10 + bob - Math.sin(i / 3) * 2 + i * 0.7;
      c.disc(tx, ty, 1.6 - i * 0.12, i > 4 ? (L.mane ?? f)[3]! : f[2]!);
    }
  }
  // corpo: peito fundo na frente, cintura fina atrás
  c.ellipse(11, 11 + bob + hy * 0.5, 6, 3.6, vol(f, 0.55, 0.55, 0.15, 7));
  c.ellipse(17.5, 10.5 + bob, 5.6, 4.4, vol(f, 0.55, 0.55, 0.15, 7));
  // barriga e peito claros
  for (let x = 10; x <= 20; x++) c.paint(x, 14 + bob - (x < 14 ? 1 : 0), L.belly);
  c.ellipse(20.5, 13 + bob, 2, 1.6, L.belly);
  // pescoço e cabeça
  c.ellipse(21.5, 8 + bob, 3, 3.5, vol(f, 0.55, 0.5));
  c.ellipse(24, 6.5 + bob, 3.6, 3, vol(f, 0.6, 0.5));
  // focinho comprido com nariz
  poly(c, [[25, 5.5 + bob], [30, 7 + bob], [30, 9 + bob], [25, 9 + bob]], (x, y) => (y < 7.5 + bob ? f[3]! : L.belly));
  c.set(30, 7 + bob, P.outline);
  c.hline(26, 29, 9 + bob, f[0]!); // boca
  // orelhas
  if (L.hyena) {
    c.disc(22, 3.5 + bob, 1.4, f[2]!);
    c.set(22, 3 + bob, f[0]!);
  } else {
    poly(c, [[21, 4.5 + bob], [22.5, 0.5 + bob], [24, 4 + bob]], f[2]!);
    c.set(22, 3 + bob, f[0]!);
    poly(c, [[23.5, 4 + bob], [25, 1 + bob], [26, 4 + bob]], f[3]!);
  }
  eye(c, 25, 5 + bob, L.eye);
  // crina, manchas, raios e gelo
  if (L.mane) for (let x = 15; x <= 22; x++) for (let k = 0; k < 2 + (x % 2); k++) c.set(x, 5 + bob + Math.round((x - 15) * -0.2) + k - (x > 19 ? 1 : 0), L.mane[(x + k) % 2 ? 2 : 3]!);
  if (L.spots) for (let i = 0; i < 9; i++) c.set(7 + Math.round(hash2(i, 1, 3) * 13), 9 + bob + Math.round(hash2(i, 2, 3) * 4), L.spots);
  if (L.bolts) {
    c.line(9, 9 + bob, 11, 11 + bob, L.bolts);
    c.line(11, 11 + bob, 13, 10 + bob, L.bolts);
    c.line(16, 8 + bob, 18, 11 + bob, L.bolts);
    c.set(18, 12 + bob, P.white);
  }
  if (L.frost) for (let x = 8; x <= 20; x += 2) c.set(x, 7 + bob + (x > 15 ? -1 : 0), P.white);
  // pernas do lado de perto
  if (!dead) {
    leg(10, 13 + bob - hy, g[1]!, true, true);
    leg(21, 13 + bob, g[3]!, true, false);
  }
  c.outline(sel);
  return dead ? deadQuad(c, 5) : c;
}
const canineSet = (L: CanineLook): PixelCanvas[] => [canineFrame(0, L), canineFrame(1, L), canineFrame(2, L), canineFrame(0, L, true)];

export function buildWolfFrames(): PixelCanvas[] {
  return canineSet({ fur: P.cloth, belly: P.cloth[4]!, eye: P.gold[4]! });
}
/** Lobo de Gelo: pelagem gelada com geada nas costas e olho azul. */
export function buildIceWolfFrames(): PixelCanvas[] {
  return canineSet({ fur: P.ice, belly: P.ice[4]!, eye: P.blue[4]!, frost: true });
}
/** Lobo Atroz: pelagem vinho, crina negra e olho incandescente. */
export function buildDireWolfFrames(): PixelCanvas[] {
  const fur = mixRamp(P.red, P.black, 0.35);
  return canineSet({ fur, belly: fur[3]!, eye: P.gold[5]!, mane: mixRamp(P.stone, P.black, 0.5) });
}
/** Hiena Risonha: pelagem de areia com manchas escuras, crina curta e costas caídas. */
export function buildHyenaFrames(): PixelCanvas[] {
  const fur = mixRamp(P.dirt, P.sand, 0.55);
  return canineSet({ fur, belly: P.sand[3]!, eye: P.gold[4]!, spots: P.dirt[1]!, mane: P.dirt, hyena: true });
}
/** Lobo da Tempestade: azul elétrico riscado de raios. */
export function buildStormWolfFrames(): PixelCanvas[] {
  const fur = mixRamp(P.blue, P.arcane, 0.3);
  return canineSet({ fur, belly: fur[4]!, eye: P.ice[4]!, bolts: P.holy[3]! });
}

// ================================================================== JAVALIS (32x24, quad)
export const BOAR_W = 32;
export const BOAR_H = 24;

interface BoarLook {
  hide: Ramp;
  bristle: Ramp;
  /** Placas de pedra (javali couraçado, behemoth) e chifre no focinho. */
  plates?: boolean;
  horn?: boolean;
  /** Chifres curvos de carneiro (behemoth). */
  horns?: boolean;
}

function boarFrame(step: number, L: BoarLook, dead = false): PixelCanvas {
  const c = new PixelCanvas(BOAR_W, BOAR_H);
  const f = L.hide;
  const bob = step === 0 ? 0 : 1;
  const g = GAIT[dead ? 0 : step]!;
  const leg = (x: number, dx: number, near: boolean) => {
    const top = 14 + bob;
    const fx = Math.round(x + dx * 0.5);
    limb(c, x, top, fx, 19, near ? f[2]! : f[1]!, near ? f[1]! : f[0]!);
    c.hline(fx, fx + 1, 20, P.iron[1]!); // casco
    c.set(fx, 20, P.outline);
  };
  if (!dead) {
    leg(8, g[0]!, false);
    leg(19, g[2]!, false);
  }
  // rabinho enrolado
  c.set(3, 9 + bob, f[2]!);
  c.set(2, 8 + bob, f[2]!);
  c.set(2, 7 + bob, f[3]!);
  // corpo em barril, cabeça baixa e pesada
  c.ellipse(13, 11 + bob, 9.6, 5.6, vol(f, 0.55, 0.55, 0.14, 11));
  c.ellipse(22.5, 12.5 + bob, 4.8, 4.2, vol(f, 0.55, 0.5));
  // barriga
  for (let x = 7; x <= 18; x++) c.paint(x, 15 + bob, f[3]!);
  // focinho de disco
  c.ellipse(27, 13.5 + bob, 1.8, 2, (x, y, nx) => (nx > 0.3 ? P.pink[2]! : P.pink[1]!));
  c.set(28, 13 + bob, P.outline);
  c.set(28, 15 + bob, P.outline);
  // presas curvas
  c.set(25, 16 + bob, P.bone[3]!);
  c.set(25, 15 + bob, P.bone[2]!);
  c.set(24, 16 + bob, P.bone[2]!);
  c.set(26, 14 + bob, P.bone[3]!);
  // olho pequeno e bravo, orelha caída
  c.set(22, 10 + bob, P.outline);
  c.set(23, 10 + bob, P.red[3]!);
  c.set(21, 9 + bob, f[0]!); // sobrancelha
  poly(c, [[19, 9 + bob], [20, 6 + bob], [22, 8.5 + bob]], f[2]!);
  // crina de cerdas pelo dorso (tufos escuros com pontas claras)
  for (let x = 6; x <= 21; x++) {
    const top = 11 + bob - Math.round(Math.sqrt(Math.max(0, 1 - ((x - 13) / 9.6) ** 2)) * 5.6);
    const h = x % 3 === 0 ? 3 : 2;
    for (let k = 0; k < h; k++) c.set(x, top - k, k === h - 1 ? L.bristle[3]! : L.bristle[1]!);
  }
  if (L.plates)
    for (const [px, py] of [[8, 9], [12, 8], [16, 9], [10, 12], [14, 12]] as const) {
      c.hline(px, px + 1, py + bob, f[4] ?? f[3]!);
      c.set(px + 2, py + 1 + bob, f[1]!);
    }
  if (L.horn) poly(c, [[25, 11 + bob], [28.5, 7 + bob], [27, 11.5 + bob]], P.bone[3]!);
  if (L.horns) {
    // chifre de carneiro: sobe para trás e enrola para a frente (o de longe, mais escuro)
    const arc = (ox: number, far: boolean) => {
      for (let i = 0; i <= 7; i++) {
        const a = Math.PI * (0.15 + i * 0.17);
        const x = ox - Math.cos(a) * 2.8;
        const y = 8 + bob - Math.sin(a) * 3.2 - i * 0.15;
        c.disc(x, y, i < 3 ? 1.3 : 0.9, far ? P.bone[1]! : i < 4 ? P.bone[2]! : P.bone[3]!);
      }
    };
    arc(20, true);
    arc(22.5, false);
  }
  if (!dead) {
    leg(10, g[1]!, true);
    leg(21, g[3]!, true);
  }
  c.outline(sel);
  if (dead) {
    const out = deadQuad(c, 3, 0.2);
    for (const x of [8, 12, 18, 22]) {
      out.vline(x, 8, 9, f[1]!);
      out.set(x, 7, P.iron[1]!);
    }
    return out;
  }
  return c;
}
const boarSet = (L: BoarLook): PixelCanvas[] => [boarFrame(0, L), boarFrame(1, L), boarFrame(2, L), boarFrame(0, L, true)];

export function buildBoarFrames(): PixelCanvas[] {
  return boarSet({ hide: P.leather, bristle: P.wood });
}
/** Javali Couraçado: couro de pedra em placas e um chifre no focinho. */
export function buildRhinoBoarFrames(): PixelCanvas[] {
  return boarSet({ hide: P.stone, bristle: P.iron, plates: true, horn: true });
}
/** Behemoth: colosso de couro cinza-arroxeado, placas e chifres curvos. */
export function buildBehemothFrames(): PixelCanvas[] {
  return boarSet({ hide: mixRamp(P.stone, P.purple, 0.4), bristle: mixRamp(P.purple, P.black, 0.3), plates: true, horns: true });
}

// ================================================================== URSOS (36x28, quad)
interface BearLook {
  fur: Ramp;
  muzzle: Color;
  /** Pontas de gelo na pelagem (ancestral) e cicatrizes. */
  frost?: boolean;
  scar?: boolean;
}

function bearFrame(step: number, L: BearLook, dead = false): PixelCanvas {
  const c = new PixelCanvas(36, 28);
  const f = L.fur;
  const bob = step === 0 ? 0 : 1;
  const g = GAIT[dead ? 0 : step]!;
  const leg = (x: number, dx: number, near: boolean) => {
    const fx = Math.round(x + dx * 0.4);
    const top = 17 + bob;
    for (let y = top; y <= 23; y++) {
      const t = (y - top) / (23 - top);
      const lx = Math.round(x + (fx - x) * t);
      c.set(lx, y, near ? f[2]! : f[1]!);
      c.set(lx + 1, y, near ? f[3]! : f[1]!);
      c.set(lx + 2, y, near ? f[1]! : f[0]!);
    }
    c.hline(fx, fx + 2, 24, P.outline);
    if (near) c.set(fx + 3, 24, P.bone[2]!); // garras
  };
  if (!dead) {
    leg(7, g[0]!, false);
    leg(21, g[2]!, false);
  }
  // corpo massudo, corcova no ombro, traseiro mais baixo
  c.ellipse(15, 14 + bob, 11.5, 6.8, vol(f, 0.55, 0.55, 0.22, 77));
  c.ellipse(21, 10 + bob, 6, 4.5, vol(f, 0.6, 0.55, 0.22, 77));
  for (let x = 8; x <= 22; x++) c.paint(x, 20 + bob, f[1]!);
  // cabeça baixa à frente, focinho claro, orelhas redondas
  c.ellipse(28, 13.5 + bob, 5.2, 4.6, vol(f, 0.55, 0.5, 0.12, 5));
  c.ellipse(32, 15 + bob, 2.6, 2, L.muzzle);
  c.set(34, 14 + bob, P.outline);
  c.hline(31, 33, 17 + bob, f[0]!);
  for (const ex of [25, 29]) {
    c.disc(ex, 9.5 + bob, 1.5, f[2]!);
    c.set(ex, 9.5 + bob, f[0]!);
  }
  eye(c, 29, 12 + bob, P.outline);
  c.set(29, 11 + bob, P.white);
  if (L.frost) for (let x = 10; x <= 24; x += 2) c.set(x, 8 + bob - (x > 17 ? 1 : 0) + (x % 4 === 0 ? 1 : 0), P.ice[4]!);
  if (L.scar) {
    c.line(26, 11 + bob, 28, 15 + bob, P.red[2]!);
    c.line(17, 11 + bob, 19, 14 + bob, f[0]!);
  }
  if (!dead) {
    leg(10, g[1]!, true);
    leg(24, g[3]!, true);
  }
  c.outline(sel);
  return dead ? deadQuad(c, 4) : c;
}
const bearSet = (L: BearLook): PixelCanvas[] => [bearFrame(0, L), bearFrame(1, L), bearFrame(2, L), bearFrame(0, L, true)];

export function buildBearFrames(): PixelCanvas[] {
  return bearSet({ fur: P.leather, muzzle: P.dirt[4]! });
}
/** Urso Ancestral: pelagem branca com geada e uma cicatriz antiga. */
export function buildElderBearFrames(): PixelCanvas[] {
  return bearSet({ fur: [...P.stone].map((x) => mix(x, P.white, 0.28)), muzzle: P.bone[2]!, frost: true, scar: true });
}
/** Urso das Cavernas: quase negro, focinho acinzentado. */
export function buildCaveBearFrames(): PixelCanvas[] {
  return bearSet({ fur: mixRamp(P.leather, P.black, 0.45), muzzle: P.stone[3]!, scar: true });
}

// ================================================================== ESCORPIÕES (32x26, blob — vistos de frente/cima)
interface ScorpionLook {
  shell: Ramp;
  sting: Ramp;
  /** Facetas de cristal (escorpião de cristal) e brasas (rubro). */
  crystal?: boolean;
  embers?: boolean;
}

function scorpionFrame(step: number, L: ScorpionLook, dead = false): PixelCanvas {
  const c = new PixelCanvas(32, 26);
  const b = L.shell;
  const cx = 16;
  const wob = (i: number) => ((i + step) % 2 === 0 ? 1 : -1) * (dead ? 0 : 1);
  // 4 pares de pernas finas e articuladas saindo dos lados do corpo
  for (let i = 0; i < 4; i++)
    for (const s of [-1, 1]) {
      const y0 = 11 + i * 2;
      const kx = cx + s * (8 + i * 0.4);
      const ky = 8 + i * 2.6 + wob(i);
      const far = i % 2 === 1;
      c.line(cx + s * 4, y0, kx, ky, far ? b[1]! : b[2]!);
      c.line(kx, ky, cx + s * (10.5 + (i % 2)), 13 + i * 2.6 - wob(i), far ? b[0]! : b[1]!);
    }
  // cauda: sai de trás do abdômen (em cima na tela), sobe em segmentos e curva por cima, ferrão apontando para frente
  if (!dead) {
    const lift = step % 2 === 0 ? 0 : 0.7;
    const seg: [number, number, number][] = [
      [cx, 7.5, 2.4],
      [cx + 0.5, 5, 2.2],
      [cx + 2, 2.8 - lift, 2],
      [cx + 4.5, 2 - lift, 1.9],
      [cx + 6.5, 3.3 - lift, 1.7],
    ];
    seg.forEach(([x, y, r], i) => c.disc(x, y, r, vol(b, i % 2 ? 0.45 : 0.62, 0.5)));
    const sy = Math.round(5.5 - lift);
    c.set(cx + 7, sy, L.sting[3]!);
    c.set(cx + 7, sy + 1, L.sting[4] ?? L.sting[3]!);
    c.set(cx + 6, sy + 2, L.sting[2]!);
    c.set(cx + 6, sy, L.sting[2]!);
  }
  // abdômen segmentado e a cabeça (cefalotórax) mais à frente
  c.ellipse(cx, 12, 5.8, 4.6, vol(b, 0.55, 0.55));
  for (const y of [10, 12.5, 15]) c.hline(cx - 4, cx + 4, Math.round(y), b[1]!);
  c.ellipse(cx, 17.5, 4.6, 3.2, vol(b, 0.62, 0.5));
  // olhos e boca
  c.set(cx - 2, 16, L.sting[3]!);
  c.set(cx + 2, 16, L.sting[3]!);
  c.set(cx - 1, 16, P.outline);
  c.set(cx + 1, 16, P.outline);
  c.hline(cx - 1, cx + 1, 19, b[0]!);
  // pinças: braço que desce para os lados e garra de dois dedos apontada para quem olha
  for (const s of [-1, 1]) {
    limb(c, cx + s * 3.5, 18, cx + s * 7.5, 21, b[2]!, b[1]!);
    c.ellipse(cx + s * 9, 21.5, 2.6, 2.1, vol(b, 0.62, 0.5));
    const open = step % 2 === 0 ? 1 : 0;
    c.line(cx + s * 8, 23, cx + s * (7.5 - open), 25, b[3]!);
    c.line(cx + s * 10, 23, cx + s * (10.5 + open), 25, b[2]!);
  }
  if (L.crystal)
    for (const [x, y] of [[cx - 3, 11], [cx + 2, 13], [cx - 1, 9], [cx + 3, 3], [cx - 8, 21], [cx + 9, 20]] as const) {
      c.set(x, y, P.white);
      c.set(x + 1, y + 1, b[1]!);
    }
  if (L.embers) for (const [x, y] of [[cx - 2, 13], [cx + 2, 11], [cx, 14]] as const) c.set(x, y, P.fire[4]!);
  c.outline(sel);
  if (dead) {
    // de barriga para cima: mais escuro
    const out = new PixelCanvas(32, 26);
    out.blit(c, 0, 4, { flipY: true });
    out.map((col) => (col ? mix(col, P.black, 0.3) : 0));
    return out;
  }
  return c;
}
const scorpionSet = (L: ScorpionLook): PixelCanvas[] => [
  scorpionFrame(0, L),
  scorpionFrame(1, L),
  scorpionFrame(0, L),
  scorpionFrame(1, L),
  scorpionFrame(0, L, true),
];
export function buildScorpionFrames(): PixelCanvas[] {
  return scorpionSet({ shell: P.dirt, sting: P.red });
}
/** Escorpião Rubro: carapaça em brasa. */
export function buildRedScorpionFrames(): PixelCanvas[] {
  return scorpionSet({ shell: P.red, sting: P.fire, embers: true });
}
/** Escorpião de Cristal: carapaça gelada com facetas que brilham. */
export function buildCrystalScorpionFrames(): PixelCanvas[] {
  return scorpionSet({ shell: P.ice, sting: P.arcane, crystal: true });
}

// ================================================================== DRAGÕES (44x34, quad)
interface DragonLook {
  scale: Ramp;
  belly: Ramp;
  membrane: Ramp;
  horn: Ramp;
  eye: Color;
  /** Serpe: só as patas de trás (as asas são os braços). Ancião: mais chifres e espinhos. Gelo: cristais no dorso. */
  wyvern?: boolean;
  elder?: boolean;
  frost?: boolean;
  glow?: Color;
}

function dragonFrame(step: number, L: DragonLook, dead = false): PixelCanvas {
  const c = new PixelCanvas(44, 34);
  const r = L.scale;
  const bob = step === 0 ? 0 : 1;
  const flap = step === 1 ? -3 : step === 2 ? 2 : 0;
  const g = GAIT[dead ? 0 : step]!;
  const scales = (x: number, y: number, nx: number, ny: number): Color => {
    const t = 0.55 - (nx * 0.35 + ny * 0.8) * 0.55;
    // escamas: um tom abaixo num padrão de losangos
    const sc = (x + y * 2) % 4 === 0 && (y % 2 === 0) && t > 0.3 ? -0.18 : 0;
    return pick(r, t + sc);
  };
  // asa de morcego levantada sobre o dorso: braço do ombro ao pulso, três dedos abertos para trás e a membrana
  // inteira entre eles (borda de trás recortada entre os dedos); mais clara perto do braço, escura na borda
  const wing = (rootX: number, rootY: number, far: boolean) => {
    const dx = far ? -3 : 0;
    const dy = far ? -1 : 0;
    const wr: [number, number] = [rootX + 4 + dx, 1.5 + flap + dy];
    const tips: [number, number][] = [
      [rootX - 3 + dx, 0.5 + flap * 1.1 + dy],
      [rootX - 9 + dx, 3.5 + flap * 0.9 + dy],
      [rootX - 13 + dx, 9 + flap * 0.5 + dy],
    ];
    const back: [number, number] = [rootX - 8 + dx, rootY + 1];
    const toward = (a: [number, number], b: [number, number], t = 0.3): [number, number] => {
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      return [mx + (wr[0] - mx) * t, my + (wr[1] - my) * t];
    };
    const shape: [number, number][] = [
      [rootX, rootY],
      wr,
      tips[0]!,
      toward(tips[0]!, tips[1]!),
      tips[1]!,
      toward(tips[1]!, tips[2]!),
      tips[2]!,
      toward(tips[2]!, back, 0.15),
      back,
    ];
    const m = L.membrane;
    poly(c, shape, (x, y) => {
      const d = Math.hypot(x - wr[0], y - wr[1]) / 14;
      const t = (far ? 0.35 : 0.75) - d * 0.45 + ((x + y) % 3 === 0 ? -0.06 : 0);
      return pick(m, t);
    });
    const bone = far ? L.horn[1]! : L.horn[2]!;
    limb(c, rootX, rootY, wr[0], wr[1], far ? L.horn[1]! : L.horn[3]!, bone);
    for (const t of tips) c.line(wr[0], wr[1], t[0], t[1], bone);
    c.set(Math.round(wr[0]), Math.round(wr[1]) - 1, L.horn[3]!); // garra do pulso
  };
  if (!L.wyvern) wing(19, 15 + bob, true);
  // patas do lado de longe
  const leg = (x: number, dx: number, near: boolean, thick = 3) => {
    const fx = Math.round(x + dx * 0.5);
    for (let y = 22 + bob; y <= 28; y++) {
      const t = (y - 22 - bob) / (28 - 22 - bob);
      const lx = Math.round(x + (fx - x) * t);
      for (let k = 0; k < thick; k++) c.set(lx + k, y, near ? r[k === 0 ? 3 : 2]! : r[1]!);
    }
    c.hline(fx - 1, fx + thick, 29, near ? L.horn[2]! : L.horn[1]!); // garras
  };
  if (!dead) {
    leg(12, g[0]!, false);
    if (!L.wyvern) leg(26, g[2]!, false);
  }
  // cauda com ponta em lança
  for (let i = 0; i < 10; i++) c.disc(10 - i, 20 + bob + Math.round(Math.sin(i / 2.2 + step) * 1.5), 2.4 - i * 0.18, scales(10 - i, 20, 0, -0.2));
  const tailY = 20 + bob + Math.round(Math.sin(9 / 2.2 + step) * 1.5);
  poly(c, [[1.5, tailY - 2.5], [-0.5, tailY], [1.5, tailY + 2.5], [3, tailY]], L.horn[2]!);
  // corpo, barriga em placas, pescoço em S e cabeça com mandíbula e chifres
  c.ellipse(20, 18.5 + bob, 11, 6.6, scales);
  for (let x = 12; x <= 28; x++) c.paint(x, 23 + bob, x % 3 === 0 ? L.belly[1]! : L.belly[2]!);
  for (let x = 14; x <= 26; x += 3) c.set(x, 24 + bob, L.belly[1]!);
  c.ellipse(30.5, 13 + bob, 3.2, 5.4, scales);
  c.ellipse(35.5, 8.5 + bob, 4.8, 3.4, scales);
  poly(c, [[37, 7 + bob], [43, 9 + bob], [43, 11 + bob], [37, 11.5 + bob]], (x, y) => (y < 9.5 + bob ? r[3]! : L.belly[2]!)); // focinho
  c.hline(38, 42, 11 + bob, r[0]!); // boca
  c.set(42, 9 + bob, P.outline); // narina
  c.set(40, 12 + bob, P.white); // dente
  eye(c, 36, 7 + bob, L.eye);
  c.set(35, 6 + bob, r[0]!); // sobrancelha
  // chifres para trás
  c.line(33, 6 + bob, 29, 2 + bob, L.horn[2]!);
  c.line(34, 6 + bob, 31, 3 + bob, L.horn[3]!);
  if (L.elder) {
    c.line(35, 5 + bob, 34, 1 + bob, L.horn[3]!);
    c.line(32, 9 + bob, 28, 7 + bob, L.horn[2]!);
  }
  // espinhos pelo dorso e pescoço
  for (const [sx, sy] of [[12, 12], [16, 11.5], [20, 11.5], [24, 12], [28, 8.5], [30, 7]] as const) {
    poly(c, [[sx - 1.2, sy + 1 + bob], [sx, sy - 2 - (L.elder ? 1 : 0) + bob], [sx + 1.2, sy + 1 + bob]], L.frost ? P.ice[4]! : L.horn[2]!);
  }
  if (L.glow) for (const [x, y] of [[16, 21], [20, 20], [24, 21]] as const) c.set(x, y + bob, L.glow);
  if (!dead) {
    leg(15, g[1]!, true);
    if (!L.wyvern) leg(28, g[3]!, true);
  }
  // asa da frente (a serpe usa a asa como braço, com garra apoiada no chão)
  wing(21, 15 + bob, false);
  if (L.wyvern && !dead) {
    c.line(24, 20 + bob, 27 + g[3]! * 0.5, 28, r[2]!);
    c.hline(26 + Math.round(g[3]! * 0.5), 29 + Math.round(g[3]! * 0.5), 29, L.horn[2]!);
  }
  c.outline(sel);
  return dead ? deadQuad(c, 4, 0.25) : c;
}
const dragonSet = (L: DragonLook): PixelCanvas[] => [dragonFrame(0, L), dragonFrame(1, L), dragonFrame(2, L), dragonFrame(0, L, true)];

export function buildDragonFrames(): PixelCanvas[] {
  return dragonSet({ scale: P.red, belly: P.gold, membrane: mixRamp(P.red, P.purple, 0.35), horn: P.bone, eye: P.gold[4]! });
}
/** Dragão de Gelo: escamas claras, cristais de gelo no dorso e membrana azulada. */
export function buildIceDragonFrames(): PixelCanvas[] {
  return dragonSet({ scale: P.ice, belly: P.marble, membrane: P.water, horn: P.marble, eye: P.blue[4]!, frost: true });
}
/** Draco Flamejante: brasas acesas na barriga e membrana alaranjada. */
export function buildFireDrakeFrames(): PixelCanvas[] {
  return dragonSet({ scale: P.fire, belly: P.gold, membrane: mixRamp(P.fire, P.red, 0.5), horn: P.iron, eye: P.gold[5]!, glow: P.fire[5]! });
}
/** Dragão Ancião: escamas violeta-escuras, chifres dourados extras e espinhos maiores. */
export function buildElderDragonFrames(): PixelCanvas[] {
  const sc = mixRamp(P.purple, P.black, 0.32);
  return dragonSet({ scale: sc, belly: P.gold, membrane: mixRamp(P.purple, P.black, 0.5), horn: P.gold, eye: P.fire[4]!, elder: true });
}
/** Serpe Verde: só as patas de trás; as asas fazem de braços. */
export function buildWyvernFrames(): PixelCanvas[] {
  return dragonSet({ scale: P.green, belly: P.sand, membrane: mixRamp(P.green, P.forest, 0.5), horn: P.bone, eye: P.gold[4]!, wyvern: true });
}

// ================================================================== BASILISCO (40x26, quad) — lagarto de seis patas
function basiliskFrame(step: number, dead = false): PixelCanvas {
  const c = new PixelCanvas(40, 26);
  const s = mixRamp(P.nature, P.gold, 0.25);
  const bob = step === 0 ? 0 : 1;
  const g = GAIT[dead ? 0 : step]!;
  const legs = (near: boolean) => {
    const xs = near ? [12, 21, 28] : [9, 17, 25];
    xs.forEach((x, i) => {
      const dx = (i % 2 === 0 ? g[near ? 1 : 0]! : g[near ? 3 : 2]!) * 0.6;
      const knee = [x - 2, 16 + bob] as const;
      if (near) {
        limb(c, x, 14 + bob, knee[0], knee[1], s[2]!, s[1]!);
        limb(c, knee[0], knee[1], x + dx, 21, s[2]!, s[1]!);
      } else {
        c.line(x, 14 + bob, knee[0], knee[1], s[0]!);
        c.line(knee[0], knee[1], x + dx, 20, s[0]!);
      }
      c.hline(Math.round(x + dx) - 1, Math.round(x + dx) + (near ? 2 : 1), near ? 22 : 21, near ? P.bone[2]! : P.bone[1]!);
    });
  };
  if (!dead) legs(false);
  // cauda longa que serpenteia
  for (let i = 0; i < 12; i++) c.disc(8 - i * 0.7, 15 + bob + Math.sin(i / 2 + step * 1.5) * 1.6, 2.2 - i * 0.15, vol(s, 0.5, 0.5)(0, 0, 0, -0.1));
  // corpo baixo e comprido
  c.ellipse(19, 14 + bob, 11, 3.8, vol(s, 0.55, 0.55, 0.1, 21));
  for (let x = 10; x <= 28; x++) c.paint(x, 17 + bob, P.sand[2]!);
  // faixas escuras nas costas
  for (const x of [12, 16, 20, 24]) c.vline(x, 11 + bob, 13 + bob, s[1]!);
  // cabeça em cunha com crista e olhos que brilham
  c.ellipse(32, 12.5 + bob, 4.6, 3, vol(s, 0.6, 0.5));
  poly(c, [[34, 11 + bob], [39, 12.5 + bob], [34, 15 + bob]], s[3]!);
  c.hline(34, 38, 14 + bob, s[0]!);
  c.set(38, 13 + bob, P.outline);
  eye(c, 33, 11 + bob, P.gold[5]!);
  c.set(34, 11 + bob, P.gold[4]!);
  // crista de espinhos na cabeça e no dorso
  for (let x = 13; x <= 31; x += 3) poly(c, [[x - 1, 11 + bob], [x, 7.5 + bob + (x > 27 ? -1 : 0)], [x + 1, 11 + bob]], x > 27 ? P.red[3]! : s[1]!);
  if (!dead) legs(true);
  c.outline(sel);
  return dead ? deadQuad(c, 4) : c;
}
/** Basilisco: lagarto verde-dourado de seis patas, crista vermelha e olhar que petrifica. */
export function buildBasiliskFrames(): PixelCanvas[] {
  return [basiliskFrame(0), basiliskFrame(1), basiliskFrame(2), basiliskFrame(0, true)];
}
