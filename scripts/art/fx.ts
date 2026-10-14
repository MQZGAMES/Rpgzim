// Efeitos visuais animados: golpes, impactos elementais, projéteis, cura, buffs, nível e marcadores.
// Cada efeito vira uma sequência de quadros "<nome>_<i>" no atlas fx.
import { PixelCanvas, mix, withAlpha, type Color } from './lib/canvas.ts';
import { P, type Ramp } from './lib/palette.ts';
import { hash2, mulberry32 } from './lib/rng.ts';
import type { AtlasEntry } from './lib/atlas.ts';

const out: AtlasEntry[] = [];
const add = (name: string, c: PixelCanvas) => out.push({ name, canvas: c });

function seq(name: string, n: number, w: number, h: number, draw: (c: PixelCanvas, t: number, i: number) => void) {
  for (let i = 0; i < n; i++) {
    const c = new PixelCanvas(w, h);
    draw(c, n === 1 ? 0 : i / (n - 1), i);
    add(`${name}_${i}`, c);
  }
}

const rampAt = (r: Ramp, v: number): Color => r[Math.max(0, Math.min(r.length - 1, Math.round(v * (r.length - 1))))]!;

// ---------------------------------------------------------------- golpe físico (arco de corte)
seq('slash', 4, 32, 32, (c, t) => {
  // crescente espesso: núcleo branco, borda de aço e rastro que se dissipa
  const sweep = Math.min(1, 0.35 + t * 0.9);
  const a0 = -2.6;
  const a1 = a0 + 2.4 * sweep;
  for (let k = 0; k <= 60; k++) {
    const a = a0 + ((a1 - a0) * k) / 60;
    const along = k / 60;
    const thick = Math.sin(along * Math.PI) * 4 + 1;
    for (let r = 13 - thick; r <= 13; r += 0.5) {
      const x = Math.round(16 + Math.cos(a) * r);
      const y = Math.round(17 + Math.sin(a) * r * 0.85);
      const edge = (13 - r) / thick;
      let col: Color = edge < 0.3 ? P.white : edge < 0.7 ? P.steel[5]! : P.steel[3]!;
      if (along < t * 0.8) col = withAlpha(col, 110);
      if (t > 0.9 && hash2(k, Math.round(r * 2), 3) < 0.5) continue;
      c.set(x, y, col);
    }
  }
});

// faísca de impacto físico
seq('hit', 3, 16, 16, (c, t) => {
  const r = 2 + t * 5;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    for (let k = Math.floor(r * 0.4); k <= r; k++) c.set(Math.round(8 + Math.cos(a) * k), Math.round(8 + Math.sin(a) * k), k === Math.floor(r) ? P.blood[3]! : P.white);
  }
  if (t < 0.5) c.disc(8, 8, 2, P.white);
});

// sangue/respingo ao receber dano
seq('blood', 3, 16, 16, (c, t) => {
  const rnd = mulberry32(5);
  for (let i = 0; i < 7; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 2 + t * (3 + rnd() * 4);
    c.set(Math.round(8 + Math.cos(a) * d), Math.round(8 + Math.sin(a) * d + t * 2), i % 2 ? P.blood[2]! : P.blood[3]!);
  }
});

// ---------------------------------------------------------------- explosões elementais (por tile)
function burst(name: string, ramp: Ramp, n: number, style: 'fire' | 'energy' | 'ice' | 'holy' | 'heal') {
  seq(name, n, 32, 32, (c, t, i) => {
    const rnd = mulberry32(17 + i);
    const R = 4 + t * 11;
    if (style === 'ice') {
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + 0.4;
        const len = R * (0.6 + rnd() * 0.5);
        for (let d = 0; d < len; d++) {
          const x = 16 + Math.cos(a) * d;
          const y = 16 + Math.sin(a) * d;
          const v = 1 - d / len;
          if (t > 0.75 && hash2(k, d, i) < t - 0.4) continue;
          c.set(Math.round(x), Math.round(y), rampAt(ramp, 0.4 + v * 0.6));
          if (d < len * 0.5) c.set(Math.round(x + 1), Math.round(y), rampAt(ramp, 0.3 + v * 0.5));
        }
      }
      c.disc(16, 16, Math.max(1, 4 - t * 4), P.white);
      return;
    }
    c.disc(16, 16, R, (x, y, nx, ny) => {
      const d = Math.hypot(nx, ny);
      const noise = hash2(x, y, i * 7 + 1);
      const ring = style === 'energy' || style === 'holy';
      let v: number;
      if (ring) v = 1 - Math.abs(d - (0.55 + t * 0.35)) * 3;
      else v = 1 - d * (0.6 + t * 0.6) + (noise - 0.5) * 0.5;
      v -= t * 0.55;
      if (v <= 0.05) return 0;
      if (t > 0.6 && noise < (t - 0.6) * 2) return 0;
      return rampAt(ramp, Math.min(1, v + 0.15));
    });
    // fagulhas
    for (let k = 0; k < 6; k++) {
      const a = rnd() * Math.PI * 2;
      const d = R * (0.8 + rnd() * 0.5);
      c.set(Math.round(16 + Math.cos(a) * d), Math.round(16 + Math.sin(a) * d - (style === 'fire' ? t * 4 : 0)), rampAt(ramp, 0.9));
    }
  });
}
burst('fx_fire', P.fire, 6, 'fire');
burst('fx_energy', P.arcane, 5, 'energy');
burst('fx_ice', P.ice, 5, 'ice');
burst('fx_holy', P.holy, 5, 'holy');

// espinhos de terra saindo do chão
seq('fx_earth', 6, 32, 32, (c, t) => {
  const grow = t < 0.5 ? t * 2 : 1 - (t - 0.5) * 1.6;
  for (const [x, hMax, w] of [[10, 12, 3], [16, 17, 4], [22, 11, 3], [13, 8, 2], [20, 7, 2]] as const) {
    const h = Math.round(hMax * Math.max(0, grow));
    for (let k = 0; k < h; k++) {
      const half = Math.round(((h - k) / h) * w);
      for (let dx = -half; dx <= half; dx++) c.set(x + dx, 26 - k, dx < 0 ? P.nature[3]! : dx === 0 ? P.nature[2]! : P.dirt[2]!);
    }
    if (h > 0) c.set(x, 26 - h, P.nature[4]!);
  }
  for (let x = 5; x < 28; x++) if (hash2(x, 1, 2) < 0.6) c.set(x, 27, P.dirt[2]!);
  if (t > 0.1) for (let k = 0; k < 5; k++) c.set(6 + k * 5, Math.round(24 - t * 10 + k % 2), P.dirt[3]!);
});

// redemoinho de aço (área ao redor do cavaleiro)
seq('fx_whirl', 6, 48, 48, (c, t) => {
  for (let k = 0; k < 120; k++) {
    const a = k * 0.12 + t * 7;
    const r = 8 + (k / 120) * 14;
    if (hash2(k, 3, Math.floor(t * 6)) < 0.25) continue;
    const col = k > 90 ? P.white : k > 50 ? P.steel[5]! : P.steel[3]!;
    c.set(Math.round(24 + Math.cos(a) * r), Math.round(24 + Math.sin(a) * r * 0.75), t > 0.75 ? withAlpha(col, 150) : col);
  }
});

// golpe brutal: corte em X vermelho
seq('fx_brutal', 5, 32, 32, (c, t) => {
  const len = Math.min(1, t * 2.2) * 22;
  for (let k = 0; k < len; k++) {
    const fade = t > 0.6;
    const col = k > len - 3 ? P.white : P.red[4]!;
    for (const [sx, sy, dx, dy] of [[5, 5, 1, 1], [27, 5, -1, 1]] as const) {
      c.set(sx + dx * k, sy + dy * k, fade ? withAlpha(col, 150) : col);
      c.set(sx + dx * k + 1, sy + dy * k, fade ? withAlpha(P.red[3]!, 150) : P.red[3]!);
    }
  }
});

// ---------------------------------------------------------------- projéteis (desenhados apontando para a direita)
seq('proj_arrow', 1, 16, 5, (c) => {
  c.hline(2, 12, 2, P.wood[4]!);
  c.set(13, 2, P.steel[5]!);
  c.set(12, 1, P.steel[3]!);
  c.set(12, 3, P.steel[3]!);
  c.set(14, 2, P.steel[4]!);
  c.set(1, 1, P.white);
  c.set(1, 3, P.white);
  c.set(2, 1, P.red[3]!);
  c.set(2, 3, P.red[3]!);
});
seq('proj_spear', 1, 20, 5, (c) => {
  c.hline(1, 15, 2, P.wood[3]!);
  c.set(16, 2, P.steel[5]!);
  c.set(17, 2, P.steel[5]!);
  c.set(18, 2, P.steel[4]!);
  c.set(16, 1, P.steel[3]!);
  c.set(16, 3, P.steel[3]!);
});
function orb(name: string, ramp: Ramp, tail = true) {
  seq(name, 2, 16, 12, (c, t) => {
    if (tail) for (let x = 0; x < 9; x++) if (hash2(x, Math.floor(t * 2), 5) < 0.7 - x * 0.05) c.set(x, 5 + ((x + Math.floor(t * 2)) % 2), rampAt(ramp, 0.3 + x * 0.05));
    c.disc(11, 6, 3.6, (x, y, nx, ny) => rampAt(ramp, 1 - Math.hypot(nx, ny) * 0.7));
    c.set(10, 5, P.white);
  });
}
orb('proj_energy', P.arcane);
orb('proj_fire', P.fire);
orb('proj_holy', P.holy);
orb('proj_earth', P.nature);
seq('proj_ice', 2, 16, 8, (c, t) => {
  for (let x = 3; x < 14; x++) {
    const h = Math.round(((x - 3) / 10) * 2.5);
    for (let y = 4 - h; y <= 4 + h; y++) c.set(x, y, y < 4 ? P.ice[4]! : P.ice[2]!);
  }
  c.set(14, 4, P.white);
  if (t > 0) c.set(1, 3, P.ice[3]!);
});

// ---------------------------------------------------------------- cura, buffs e evolução
seq('fx_heal', 7, 24, 32, (c, t) => {
  const rnd = mulberry32(31);
  for (let k = 0; k < 10; k++) {
    const x0 = 3 + rnd() * 18;
    const speed = 0.6 + rnd() * 0.6;
    const y = 30 - ((t * 32 * speed + rnd() * 10) % 30);
    const big = k % 3 === 0;
    const col = k % 2 ? P.heal[3]! : P.heal[4]!;
    const x = Math.round(x0);
    const yy = Math.round(y);
    if (big) {
      c.set(x, yy, P.white);
      c.set(x - 1, yy, col);
      c.set(x + 1, yy, col);
      c.set(x, yy - 1, col);
      c.set(x, yy + 1, col);
    } else c.set(x, yy, col);
  }
});

function aura(name: string, ramp: Ramp) {
  seq(name, 6, 24, 32, (c, t, i) => {
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2 + t * Math.PI;
      const rx = 10;
      const ry = 3.5;
      const x = 12 + Math.cos(a) * rx;
      const y = 27 + Math.sin(a) * ry - (k % 4) * t * 4;
      if (hash2(k, i, 9) < 0.35) continue;
      c.set(Math.round(x), Math.round(y), k % 3 === 0 ? ramp[4]! : ramp[3]!);
    }
    for (let k = 0; k < 4; k++) {
      const x = 4 + ((k * 5 + i * 3) % 17);
      const y = 26 - ((i * 4 + k * 7) % 22);
      c.set(x, y, P.white);
    }
  });
}
aura('fx_buff_iron', P.steel);
aura('fx_buff_focus', P.teal);
aura('fx_haste', P.ice);

seq('fx_levelup', 8, 32, 56, (c, t) => {
  const w = Math.sin(Math.min(1, t * 1.4) * Math.PI) * 9;
  for (let y = 0; y < 56; y++)
    for (let x = 0; x < 32; x++) {
      const dx = Math.abs(x + 0.5 - 16);
      if (dx > w) continue;
      const core = dx < w * 0.4;
      const v = (1 - y / 56) * 0.4 + (core ? 0.6 : 0.3);
      if (hash2(x, y, Math.floor(t * 8)) < 0.15 && !core) continue;
      c.set(x, y, withAlpha(rampAt(P.holy, v + 0.2), core ? 230 : 150));
    }
  const rnd = mulberry32(3);
  for (let k = 0; k < 12; k++) {
    const x = Math.round(16 + (rnd() - 0.5) * 30);
    const y = Math.round(54 - ((t * 60 + rnd() * 40) % 54));
    c.set(x, y, P.white);
    c.set(x, y + 1, P.holy[3]!);
  }
});

seq('fx_poof', 5, 24, 24, (c, t) => {
  const rnd = mulberry32(8);
  for (let k = 0; k < 6; k++) {
    const a = rnd() * Math.PI * 2;
    const d = 2 + t * 8;
    const r = 3.5 * (1 - t * 0.7);
    c.disc(12 + Math.cos(a) * d, 13 + Math.sin(a) * d * 0.6 - t * 3, r, (x, y, nx, ny) => (nx + ny < 0 ? P.cloth[4]! : P.cloth[3]!));
  }
});

seq('fx_fizzle', 4, 16, 16, (c, t) => {
  const rnd = mulberry32(12);
  for (let k = 0; k < 6; k++) {
    const x = Math.round(3 + rnd() * 10);
    const y = Math.round(12 - t * 8 - rnd() * 3);
    c.set(x, y, k % 2 ? P.cloth[3]! : P.cloth[2]!);
  }
});

// mira vermelha do alvo (2 quadros pulsantes) e marcador de destino
seq('target', 2, 20, 20, (c, t) => {
  const inset = t > 0 ? 1 : 0;
  const col = t > 0 ? P.red[4]! : P.red[3]!;
  const L = 5;
  for (const [cx, cy, dx, dy] of [[inset, inset, 1, 1], [19 - inset, inset, -1, 1], [inset, 19 - inset, 1, -1], [19 - inset, 19 - inset, -1, -1]] as const) {
    for (let k = 0; k < L; k++) {
      c.set(cx + dx * k, cy, col);
      c.set(cx, cy + dy * k, col);
      c.set(cx + dx * k, cy + dy, mix(col, P.black, 0.5));
      c.set(cx + dx, cy + dy * k, mix(col, P.black, 0.5));
    }
  }
});
seq('marker', 4, 12, 12, (c, t) => {
  const r = 2 + t * 3.5;
  c.disc(6, 6, r, (x, y, nx, ny) => (Math.hypot(nx, ny) > 0.7 ? withAlpha(P.white, Math.round(230 - t * 150)) : 0));
});
seq('sparkle', 4, 8, 8, (c, t) => {
  const r = t < 0.5 ? t * 6 : (1 - t) * 6;
  for (let k = 0; k <= r; k++) {
    c.set(4 + k, 4, P.gold[5]!);
    c.set(4 - k, 4, P.gold[5]!);
    c.set(4, 4 + k, P.gold[5]!);
    c.set(4, 4 - k, P.gold[5]!);
  }
  c.set(4, 4, P.white);
});

export function buildFx(): AtlasEntry[] {
  return out;
}
