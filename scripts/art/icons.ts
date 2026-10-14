// Ícones 16x16 de itens, magias e interface. Formas desenhadas por primitivas com contorno automático.
import { PixelCanvas, mix, type Color } from './lib/canvas.ts';
import { P, type Ramp } from './lib/palette.ts';
import type { AtlasEntry } from './lib/atlas.ts';

const out: AtlasEntry[] = [];
const S = 16;
const ol = () => P.outline;

function icon(name: string, draw: (c: PixelCanvas) => void, outline = true) {
  const c = new PixelCanvas(S, S);
  draw(c);
  if (outline) c.outline(ol);
  out.push({ name, canvas: c });
}

// ---------------------------------------------------------------- formas reutilizáveis
function diag(c: PixelCanvas, x0: number, y0: number, len: number, col: Color, dx = 1, dy = -1) {
  for (let i = 0; i < len; i++) c.set(x0 + i * dx, y0 + i * dy, col);
}

function sword(blade: Ramp, hilt: Ramp, len = 10) {
  return (c: PixelCanvas) => {
    const bx = 4;
    const by = 11;
    for (let i = 0; i < len; i++) {
      c.set(bx + i, by - i, blade[4]!);
      c.set(bx + i + 1, by - i, blade[2]!);
      c.set(bx + i + 1, by - i + 1, blade[1]!);
    }
    c.set(bx + len, by - len, blade[5] ?? blade[4]!);
    diag(c, 2, 9, 5, hilt[3]!, 1, 1);
    c.set(3, 10, hilt[4]!);
    c.set(3, 12, P.leather[2]!);
    c.set(2, 13, P.leather[1]!);
    c.set(1, 14, hilt[3]!);
  };
}

function axe(head: Ramp, big = false) {
  return (c: PixelCanvas) => {
    diag(c, 2, 14, 11, P.wood[3]!);
    diag(c, 3, 14, 10, P.wood[2]!);
    const cx = 11;
    const cy = 4;
    c.ellipse(cx + 1, cy, big ? 4 : 3, big ? 5 : 4, (x, y, nx) => (x < cx - 1 ? 0 : nx < -0.1 ? head[4]! : nx < 0.4 ? head[3]! : head[2]!));
    c.set(cx - 2, cy - 1, head[2]!);
    c.set(cx - 2, cy, head[2]!);
    c.set(cx + (big ? 4 : 3), cy, head[5] ?? head[4]!);
  };
}

function mace(head: Ramp, wooden = false) {
  return (c: PixelCanvas) => {
    diag(c, 2, 14, 9, wooden ? P.wood[3]! : P.leather[3]!);
    diag(c, 3, 14, 8, wooden ? P.wood[2]! : P.leather[2]!);
    if (wooden) {
      c.ellipse(11, 4.5, 3.6, 3.6, (x, y, nx, ny) => (nx + ny < -0.4 ? P.wood[4]! : nx + ny < 0.5 ? P.wood[3]! : P.wood[2]!));
      c.set(10, 3, P.wood[1]!);
      c.set(12, 6, P.wood[1]!);
    } else {
      c.disc(11, 4.5, 3.2, (x, y, nx, ny) => (nx + ny < -0.4 ? head[4]! : nx + ny < 0.5 ? head[3]! : head[2]!));
      for (const [x, y] of [[11, 0], [15, 4], [11, 8], [7, 4], [14, 1], [8, 1], [14, 7]] as const) c.set(x, y, head[4]!);
    }
  };
}

function bow(wood: Ramp) {
  return (c: PixelCanvas) => {
    for (let y = 1; y <= 14; y++) {
      const t = (y - 1) / 13;
      const x = 4 + Math.round(Math.sin(t * Math.PI) * 6);
      c.set(x, y, t < 0.5 ? wood[4]! : wood[3]!);
      c.set(x + 1, y, wood[2]!);
    }
    c.vline(4, 2, 13, P.cloth[4]!);
    c.set(4, 1, wood[1]!);
    c.set(4, 14, wood[1]!);
    c.set(9, 7, P.leather[2]!);
    c.set(9, 8, P.leather[2]!);
  };
}

function spear() {
  return (c: PixelCanvas) => {
    diag(c, 1, 14, 11, P.wood[3]!);
    diag(c, 2, 14, 10, P.wood[2]!);
    c.set(12, 3, P.steel[4]!);
    c.set(13, 2, P.steel[5]!);
    c.set(14, 1, P.steel[5]!);
    c.set(12, 2, P.steel[3]!);
    c.set(13, 3, P.steel[2]!);
    c.set(11, 2, P.steel[3]!);
    c.set(13, 4, P.steel[2]!);
    c.set(10, 5, P.red[3]!);
  };
}

function wand(gem: Ramp, staff = false) {
  return (c: PixelCanvas) => {
    const len = staff ? 11 : 8;
    diag(c, 2, 13, len, staff ? P.wood[3]! : P.wood[1]!);
    diag(c, 3, 13, len - 1, staff ? P.wood[2]! : P.wood[0]!);
    c.set(4, 11, P.gold[3]!);
    c.set(5, 11, P.gold[2]!);
    const gx = 2 + len;
    const gy = 13 - len;
    c.disc(gx + 0.5, gy + 0.5, 2.2, gem[2]!);
    c.set(gx, gy, gem[4]!);
    c.set(gx - 1, gy, gem[3]!);
    c.set(gx + 1, gy + 1, gem[1]!);
    c.set(gx + 3, gy - 2, P.white);
    if (staff) {
      c.set(gx - 2, gy - 1, P.green[4]!);
      c.set(gx - 3, gy, P.green[3]!);
      c.set(gx + 2, gy + 2, P.green[3]!);
    }
  };
}

function roundShield(face: Ramp, rim: Ramp) {
  return (c: PixelCanvas) => {
    c.disc(8, 8, 6.6, (x, y, nx, ny) => {
      const d = Math.hypot(nx, ny);
      if (d > 0.82) return nx + ny < 0 ? rim[4]! : rim[2]!;
      const plank = Math.floor((x - 1) / 3) % 2;
      return nx + ny < -0.6 ? face[4]! : plank ? face[3]! : face[2]!;
    });
    c.disc(8, 8, 1.6, rim[3]!);
    c.set(7, 7, rim[4]!);
  };
}

function kiteShield(face: Ramp, emblem: Ramp) {
  return (c: PixelCanvas) => {
    for (let y = 1; y < 15; y++) {
      const half = y < 9 ? 6 : 6 - (y - 8) * 1;
      for (let x = Math.round(8 - half); x < Math.round(8 + half); x++) {
        const edge = x === Math.round(8 - half) || x === Math.round(8 + half) - 1 || y === 1;
        c.set(x, y, edge ? face[4]! : x < 8 ? face[3]! : face[2]!);
      }
    }
    c.rect(7, 3, 2, 9, emblem[3]!);
    c.rect(4, 5, 8, 2, emblem[3]!);
    c.set(7, 3, emblem[4]!);
  };
}

function book(cover: Ramp) {
  return (c: PixelCanvas) => {
    c.rect(3, 1, 11, 14, cover[2]!);
    c.vline(3, 1, 14, cover[1]!);
    c.vline(4, 1, 14, cover[3]!);
    c.rect(5, 13, 9, 2, P.bone[3]!);
    c.hline(5, 13, 14, P.bone[2]!);
    for (const [x, y] of [[13, 1], [13, 12], [5, 1]] as const) c.set(x, y, P.gold[4]!);
    c.disc(9.5, 6.5, 2.2, P.gold[3]!);
    c.set(9, 6, P.arcane[3]!);
    c.set(10, 7, P.arcane[2]!);
  };
}

const TORSO = [
  '................',
  '....aa....aa....',
  '..aaaaabbbaaaa..',
  '.aaaabbbbbbaaaa.',
  '.aaabbbbbbbbaac.',
  '.aaabbbbbbbbacc.',
  '..aabbbbbbbbcc..',
  '...abbbbbbbbc...',
  '...abbbbbbbbc...',
  '...abbbbbbbbc...',
  '...gggggggggg...',
  '...abbbbbbbbc...',
  '...abbbbbbbcc...',
  '....bbbbbbbc....',
  '................',
  '................',
];
const ROBE = [
  '................',
  '.....aa..aa.....',
  '...aaabggbaaa...',
  '..aaaabggbbaac..',
  '..aaabbggbbbac..',
  '..aa.bbggbbb.c..',
  '..a..bbggbbb.c..',
  '.....gggggggg...',
  '.....abggbbbc...',
  '....aabggbbbcc..',
  '....abbggbbbbc..',
  '...aabbggbbbbcc.',
  '...abbbggbbbbbc.',
  '...gggggggggggg.',
  '................',
  '................',
];
const LEGS = [
  '................',
  '....gggggggg....',
  '....abbbbbbc....',
  '....abbbbbbc....',
  '....abbccbbc....',
  '....abbc.abc....',
  '....abbc.abc....',
  '....abbc.abc....',
  '....abbc.abc....',
  '....abbc.abc....',
  '....abbc.abc....',
  '....abbc.abcc...',
  '...aabcc.abbc...',
  '................',
  '................',
  '................',
];
const BOOTS = [
  '................',
  '................',
  '.....abbc.......',
  '.....abbc.......',
  '.....abbc.abbc..',
  '.....abbc.abbc..',
  '.....gggg.abbc..',
  '.....abbc.gggg..',
  '...aabbbc.abbc..',
  '..aabbbbc.abbc..',
  '..cccccc.aabbc..',
  '........aabbbc..',
  '........cccccc..',
  '................',
  '................',
  '................',
];
const HELMET = [
  '................',
  '................',
  '.....aaaaaa.....',
  '....aaabbbbc....',
  '...aaabbbbbbc...',
  '...aabbbbbbbc...',
  '..aabbbbbbbbcc..',
  '..aabbbbbbbbcc..',
  '..gggggggggggg..',
  '..ab.......bbc..',
  '..ab.......bbc..',
  '..aa.......ccc..',
  '................',
  '................',
  '................',
  '................',
];
const HAT = [
  '..........ab....',
  '.........abc....',
  '........aabc....',
  '.......aabbc....',
  '.......abbbc....',
  '......aabbbcc...',
  '......abbbbcc...',
  '.....aabbbbbc...',
  '.....gggggggg...',
  '..aaabbbbbbbbcc.',
  '.aabbbbbbbbbbbcc',
  '..cccccccccccc..',
  '................',
  '................',
  '................',
  '................',
];

function shape(rows: string[], main: Ramp, accent: Ramp) {
  return (c: PixelCanvas) => c.ascii(rows, { a: main[4] ?? main[3]!, b: main[3]!, c: main[2]!, g: accent[3]! });
}

function ring(gem: Ramp) {
  return (c: PixelCanvas) => {
    c.ellipse(8, 10, 5, 4, (x, y, nx, ny) => (Math.hypot(nx, ny) < 0.55 ? 0 : ny < 0 ? P.gold[4]! : P.gold[2]!));
    c.disc(8, 5, 2.4, gem[2]!);
    c.set(7, 4, gem[4]!);
    c.set(8, 5, gem[3]!);
  };
}

function amulet(gem: Ramp) {
  return (c: PixelCanvas) => {
    for (let i = 0; i < 6; i++) {
      c.set(3 + i, 1 + i, i % 2 ? P.gold[2]! : P.gold[4]!);
      c.set(12 - i, 1 + i, i % 2 ? P.gold[2]! : P.gold[4]!);
    }
    c.disc(8, 10, 3.6, P.gold[3]!);
    c.disc(8, 10, 2.4, gem[2]!);
    c.set(7, 9, gem[4]!);
    c.set(9, 11, gem[1]!);
  };
}

function arrow() {
  return (c: PixelCanvas) => {
    diag(c, 3, 12, 9, P.wood[4]!);
    c.set(12, 3, P.steel[5]!);
    c.set(13, 2, P.steel[4]!);
    c.set(12, 2, P.steel[3]!);
    c.set(13, 3, P.steel[3]!);
    c.set(14, 1, P.steel[5]!);
    c.set(2, 12, P.white);
    c.set(3, 13, P.white);
    c.set(1, 13, P.red[3]!);
    c.set(2, 14, P.red[3]!);
    c.set(1, 12, P.white);
    c.set(2, 13, P.red[4]!);
    // feixe de 3 flechas
    diag(c, 6, 13, 7, P.wood[3]!);
    c.set(13, 6, P.steel[4]!);
  };
}

function potion(liquid: Ramp, big = false) {
  return (c: PixelCanvas) => {
    const r = big ? 5.4 : 4.6;
    const cy = big ? 9.5 : 10;
    c.disc(8, cy, r, (x, y, nx, ny) => {
      if (ny < -0.35) return mix(P.ice[3]!, P.white, 0.3);
      return nx + ny < -0.4 ? liquid[4]! : nx + ny < 0.6 ? liquid[3]! : liquid[2]!;
    });
    c.rect(6, big ? 2 : 3, 4, 3, P.ice[3]!);
    c.rect(6, big ? 1 : 2, 4, 2, P.wood[3]!);
    c.set(6, big ? 1 : 2, P.wood[4]!);
    c.set(5, Math.round(cy) - 1, P.white);
    c.set(5, Math.round(cy), mix(P.white, liquid[4]!, 0.3));
  };
}

const ICONS_ITEMS: [string, (c: PixelCanvas) => void][] = [
  ['sword_short', sword(P.steel, P.leather, 8)],
  ['sword_iron', sword(P.steel, P.gold, 10)],
  ['dagger', sword(P.iron, P.leather, 6)],
  ['axe_hand', axe(P.iron)],
  ['axe_battle', axe(P.steel, true)],
  ['club_wood', mace(P.wood, true)],
  ['mace_iron', mace(P.iron)],
  ['bow_hunting', bow(P.wood)],
  ['bow_composite', bow(P.roofRed)],
  ['spear_throwing', spear()],
  ['wand_ember', wand(P.fire)],
  ['wand_storm', wand(P.arcane)],
  ['rod_sprout', wand(P.nature, true)],
  ['rod_frost', wand(P.ice, true)],
  ['shield_wood', roundShield(P.wood, P.iron)],
  ['shield_iron', kiteShield(P.steel, P.red)],
  ['spellbook', book(P.purple)],
  ['armor_leather', shape(TORSO, P.leather, P.gold)],
  ['armor_chain', shape(TORSO, P.steel, P.iron)],
  ['robe_apprentice', shape(ROBE, P.purple, P.gold)],
  ['robe_druid', shape(ROBE, P.green, P.leather)],
  ['helmet_leather', shape(HELMET, P.leather, P.leather)],
  ['helmet_iron', shape(HELMET, P.steel, P.gold)],
  ['hat_mage', shape(HAT, P.purple, P.gold)],
  ['legs_leather', shape(LEGS, P.leather, P.wood)],
  ['legs_chain', shape(LEGS, P.steel, P.iron)],
  ['boots_leather', shape(BOOTS, P.leather, P.wood)],
  ['boots_swift', shape(BOOTS, P.teal, P.gold)],
  ['ring_vigor', ring(P.red)],
  ['amulet_mana', amulet(P.blue)],
  ['arrow', arrow()],
  ['potion_health', potion(P.red)],
  ['potion_mana', potion(P.blue)],
  ['potion_health_great', potion(P.red, true)],
  ['potion_mana_great', potion(P.purple, true)],
  [
    'slime_gel',
    (c) => {
      c.ellipse(8, 10, 5.5, 4.2, (x, y, nx, ny) => (nx + ny < -0.5 ? P.nature[4]! : nx + ny < 0.5 ? P.nature[3]! : P.nature[2]!));
      c.ellipse(8, 6, 2.5, 2.5, P.nature[3]!);
      c.set(7, 5, P.white);
      c.set(5, 9, P.nature[4]!);
    },
  ],
  [
    'boar_tusk',
    (c) => {
      for (let i = 0; i < 10; i++) {
        const t = i / 9;
        const x = 3 + Math.round(t * 9);
        const y = 13 - Math.round(Math.sin(t * Math.PI * 0.8) * 9);
        c.set(x, y, P.bone[3]!);
        c.set(x, y + 1, i > 7 ? P.bone[3]! : P.bone[2]!);
        if (i < 5) c.set(x + 1, y + 1, P.bone[1]!);
      }
      c.set(12, 4, P.white);
    },
  ],
  [
    'boar_hide',
    (c) => {
      c.ellipse(8, 8, 6.5, 5.5, (x, y) => ((x + y) % 4 === 0 ? P.leather[2]! : P.leather[3]!));
      for (const [x, y] of [[1, 3], [14, 3], [2, 13], [13, 13]] as const) c.set(x, y, P.leather[3]!);
      c.line(5, 5, 11, 5, P.leather[1]!);
      c.line(4, 8, 12, 8, P.leather[4]!);
    },
  ],
  [
    'goblin_ear',
    (c) => {
      for (let y = 2; y < 14; y++) {
        const w = Math.max(1, Math.round((y - 2) * 0.55));
        for (let x = 11 - w; x <= 11; x++) c.set(x, y, x === 11 - w ? P.goblin[4]! : P.goblin[3]!);
      }
      c.line(9, 6, 9, 12, P.goblin[1]!);
      c.set(11, 13, P.blood[2]!);
      c.set(10, 13, P.blood[1]!);
    },
  ],
  [
    'goblin_charm',
    (c) => {
      c.line(3, 1, 8, 6, P.leather[2]!);
      c.line(13, 1, 8, 6, P.leather[2]!);
      c.ellipse(8, 10, 4, 4.5, P.bone[3]!);
      c.set(6, 9, P.black);
      c.set(10, 9, P.black);
      c.hline(6, 10, 12, P.bone[1]!);
      c.set(8, 6, P.red[3]!);
    },
  ],
  [
    'meat',
    (c) => {
      c.ellipse(9, 7, 5, 4.5, (x, y, nx, ny) => (nx + ny < -0.4 ? P.red[4]! : nx + ny < 0.4 ? P.red[3]! : P.red[2]!));
      c.ellipse(9, 7, 2.5, 2, P.dirt[4]!);
      c.line(5, 10, 2, 13, P.bone[3]!);
      c.set(1, 13, P.bone[3]!);
      c.set(2, 14, P.bone[3]!);
      c.set(1, 14, P.bone[2]!);
    },
  ],
  [
    'gold',
    (c) => {
      for (const [x, y] of [[5, 11], [10, 11], [7.5, 8], [5, 6]] as const) {
        c.ellipse(x + 0.5, y + 0.5, 3.4, 2.2, P.gold[3]!);
        c.ellipse(x + 0.5, y, 2.6, 1.4, P.gold[4]!);
        c.set(Math.floor(x), Math.floor(y), P.gold[5]!);
      }
    },
  ],
];
for (const [name, draw] of ICONS_ITEMS) icon(`item_${name}`, draw);

// ---------------------------------------------------------------- ícones de magia (fundo de runa + símbolo)
function spellFrame(c: PixelCanvas, ramp: Ramp) {
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const corner = (x === 0 || x === S - 1) && (y === 0 || y === S - 1);
      if (corner) continue;
      const border = x === 0 || y === 0 || x === S - 1 || y === S - 1;
      const inner = x === 1 || y === 1 || x === S - 2 || y === S - 2;
      c.set(x, y, border ? ramp[3]! : inner ? ramp[1]! : mix(ramp[0]!, P.black, 0.35));
    }
}

const SPELLS: [string, Ramp, (c: PixelCanvas) => void][] = [
  [
    'arcane_bolt',
    P.arcane,
    (c) => {
      c.disc(8, 8, 3.5, P.arcane[2]!);
      c.disc(8, 8, 2, P.arcane[4]!);
      for (const [x, y] of [[8, 2], [8, 13], [2, 8], [13, 8], [4, 4], [12, 12], [12, 4], [4, 12]] as const) c.set(x, y, P.arcane[3]!);
      c.set(7, 7, P.white);
    },
  ],
  [
    'flame_lance',
    P.fire,
    (c) => {
      for (let i = 0; i < 9; i++) {
        c.set(3 + i, 12 - i, P.fire[4]!);
        c.set(4 + i, 12 - i, P.fire[3]!);
        c.set(3 + i, 13 - i, P.fire[2]!);
      }
      c.set(12, 3, P.fire[5]!);
      c.set(13, 2, P.white);
      c.set(4, 9, P.fire[3]!);
      c.set(6, 13, P.fire[3]!);
    },
  ],
  [
    'fire_nova',
    P.fire,
    (c) => {
      c.disc(8, 8, 6, (x, y, nx, ny) => {
        const d = Math.hypot(nx, ny);
        return d > 0.62 ? P.fire[3]! : d > 0.42 ? P.fire[4]! : d < 0.2 ? P.fire[5]! : 0;
      });
      for (const [x, y] of [[8, 1], [1, 8], [14, 8], [8, 14]] as const) c.set(x, y, P.fire[4]!);
    },
  ],
  [
    'earth_thorn',
    P.nature,
    (c) => {
      for (const [x, h] of [[4, 6], [8, 10], [12, 7]] as const) {
        for (let k = 0; k < h; k++) {
          const w = Math.round((h - k) / 4);
          for (let dx = -w; dx <= w; dx++) c.set(x + dx, 13 - k, dx < 0 ? P.nature[3]! : P.nature[2]!);
        }
        c.set(x, 13 - h, P.nature[4]!);
      }
      c.hline(2, 13, 13, P.dirt[2]!);
    },
  ],
  [
    'frost_burst',
    P.ice,
    (c) => {
      for (let i = -5; i <= 5; i++) {
        c.set(8 + i, 8, P.ice[3]!);
        c.set(8, 8 + i, P.ice[3]!);
        if (Math.abs(i) < 4) {
          c.set(8 + i, 8 + i, P.ice[2]!);
          c.set(8 + i, 8 - i, P.ice[2]!);
        }
      }
      for (const [x, y] of [[8, 3], [8, 13], [3, 8], [13, 8]] as const) c.set(x, y, P.white);
      c.set(8, 8, P.white);
    },
  ],
  [
    'sap_blessing',
    P.heal,
    (c) => {
      c.ellipse(8, 8, 3.2, 5.5, (x, y, nx) => (nx < 0 ? P.heal[3]! : P.heal[2]!));
      c.vline(8, 4, 13, P.heal[1]!);
      for (const [x, y] of [[3, 4], [12, 3], [13, 11], [3, 12]] as const) c.set(x, y, P.heal[4]!);
    },
  ],
  [
    'holy_arrow',
    P.holy,
    (c) => {
      for (let i = 0; i < 9; i++) c.set(3 + i, 12 - i, P.holy[3]!);
      c.set(12, 3, P.white);
      c.set(11, 3, P.holy[4]!);
      c.set(12, 4, P.holy[4]!);
      c.set(13, 2, P.holy[4]!);
      c.set(2, 12, P.holy[2]!);
      c.set(3, 13, P.holy[2]!);
      c.disc(8, 8, 1.5, P.holy[4]!);
    },
  ],
  [
    'arrow_rain',
    P.steel,
    (c) => {
      for (const x of [4, 8, 12]) {
        c.vline(x, 2 + (x % 3), 10 + (x % 3), P.wood[4]!);
        c.set(x - 1, 10 + (x % 3), P.steel[4]!);
        c.set(x + 1, 10 + (x % 3), P.steel[4]!);
        c.set(x, 11 + (x % 3), P.steel[5]!);
      }
    },
  ],
  [
    'hunters_focus',
    P.teal,
    (c) => {
      c.ellipse(8, 8, 6, 3.6, (x, y, nx, ny) => (Math.hypot(nx, ny) > 0.75 ? P.teal[4]! : P.white));
      c.disc(8, 8, 2.2, P.teal[2]!);
      c.disc(8, 8, 1, P.black);
      c.set(7, 7, P.white);
    },
  ],
  [
    'brutal_strike',
    P.red,
    (c) => {
      for (let i = 0; i < 11; i++) {
        const x = 2 + i;
        const y = 3 + Math.round(Math.sin((i / 10) * Math.PI) * -2) + i * 0.8;
        c.set(x, Math.round(y), P.red[4]!);
        c.set(x, Math.round(y) + 1, P.red[3]!);
      }
      c.set(13, 12, P.white);
      c.set(12, 11, P.white);
    },
  ],
  [
    'steel_whirlwind',
    P.steel,
    (c) => {
      for (let i = 0; i < 36; i++) {
        const a = i * 0.35;
        const r = 1 + i * 0.16;
        c.set(Math.round(8 + Math.cos(a) * r), Math.round(8 + Math.sin(a) * r), i > 24 ? P.steel[5]! : P.steel[4]!);
      }
    },
  ],
  [
    'iron_roar',
    P.iron,
    (c) => {
      kiteShield(P.steel, P.gold)(c);
    },
  ],
  [
    'light_heal',
    P.heal,
    (c) => {
      c.rect(6, 3, 4, 10, P.heal[3]!);
      c.rect(3, 6, 10, 4, P.heal[3]!);
      c.rect(7, 4, 2, 8, P.heal[4]!);
      c.rect(4, 7, 8, 2, P.heal[4]!);
    },
  ],
];
for (const [name, ramp, draw] of SPELLS)
  icon(
    `spell_${name}`,
    (c) => {
      spellFrame(c, ramp);
      const sym = new PixelCanvas(S, S);
      draw(sym);
      sym.outline((n) => mix(n, P.black, 0.75));
      c.blit(sym, 0, 0);
    },
    false,
  );

// ---------------------------------------------------------------- interface
const UI: [string, (c: PixelCanvas) => void][] = [
  [
    'bag',
    (c) => {
      c.ellipse(8, 9.5, 6, 5, (x, y, nx, ny) => (nx + ny < -0.4 ? P.leather[4]! : nx + ny < 0.5 ? P.leather[3]! : P.leather[2]!));
      c.rect(5, 2, 6, 3, P.leather[3]!);
      c.hline(4, 11, 5, P.gold[3]!);
      c.rect(7, 7, 2, 2, P.gold[4]!);
    },
  ],
  [
    'char',
    (c) => {
      c.disc(8, 5, 3.4, P.skin[3]!);
      c.ellipse(8, 3.5, 3.6, 2.2, P.hairBrown[2]!);
      c.ellipse(8, 13, 5.5, 4, P.blue[3]!);
      c.set(7, 5, P.outline);
      c.set(9, 5, P.outline);
    },
  ],
  ['book', book(P.red)],
  [
    'gear',
    (c) => {
      c.disc(8, 8, 5, P.iron[3]!);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        c.rect(Math.round(8 + Math.cos(a) * 5.5) - 1, Math.round(8 + Math.sin(a) * 5.5) - 1, 2, 2, P.iron[3]!);
      }
      c.disc(8, 8, 2, P.iron[1]!);
      c.set(6, 6, P.iron[4] ?? P.white);
    },
  ],
  [
    'close',
    (c) => {
      for (let i = 0; i < 10; i++) {
        c.set(3 + i, 3 + i, P.red[3]!);
        c.set(4 + i, 3 + i, P.red[3]!);
        c.set(12 - i, 3 + i, P.red[3]!);
        c.set(13 - i, 3 + i, P.red[3]!);
      }
    },
  ],
  [
    'attack',
    (c) => {
      sword(P.steel, P.gold, 9)(c);
      const s2 = new PixelCanvas(S, S);
      sword(P.steel, P.gold, 9)(s2);
      c.blit(s2, 0, 0, { flipX: true });
    },
  ],
  [
    'target',
    (c) => {
      c.disc(8, 8, 6, (x, y, nx, ny) => (Math.hypot(nx, ny) > 0.72 ? P.red[3]! : 0));
      c.disc(8, 8, 3, (x, y, nx, ny) => (Math.hypot(nx, ny) > 0.5 ? P.red[4]! : 0));
      c.vline(8, 0, 4, P.red[4]!);
      c.vline(8, 12, 15, P.red[4]!);
      c.hline(0, 4, 8, P.red[4]!);
      c.hline(12, 15, 8, P.red[4]!);
      c.set(8, 8, P.white);
    },
  ],
  [
    'hand',
    (c) => {
      c.rect(4, 7, 8, 7, P.skin[3]!);
      for (const x of [4, 6, 8, 10]) c.rect(x, 3 + (x === 4 || x === 10 ? 1 : 0), 2, 5, P.skin[3]!);
      c.rect(1, 8, 3, 2, P.skin[3]!);
      for (const x of [5, 7, 9]) c.vline(x, 4, 8, P.skin[2]!);
    },
  ],
  [
    'heart',
    (c) => {
      c.disc(5.5, 6, 3.4, P.red[3]!);
      c.disc(10.5, 6, 3.4, P.red[3]!);
      for (let y = 6; y < 14; y++) c.hline(2 + (y - 6), 13 - (y - 6), y, P.red[3]!);
      c.set(4, 4, P.red[4]!);
      c.set(5, 4, P.white);
    },
  ],
  [
    'mana',
    (c) => {
      for (let y = 2; y < 14; y++) {
        const w = y < 8 ? (y - 2) * 0.7 : Math.sqrt(Math.max(0, 25 - (y - 9) ** 2));
        c.hline(Math.round(8 - w), Math.round(8 + w) - 1, y, P.blue[3]!);
      }
      c.set(6, 9, P.blue[4]!);
      c.set(6, 10, P.white);
    },
  ],
  ['coin', (c) => { c.disc(8, 8, 5.5, P.gold[3]!); c.disc(8, 8, 3.8, P.gold[4]!); c.vline(8, 5, 11, P.gold[2]!); c.set(6, 6, P.gold[5]!); }],
  [
    'star',
    (c) => {
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? 2.8 : 6.5;
        pts.push([8 + Math.cos(a) * r, 8.5 + Math.sin(a) * r]);
      }
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          let inside = false;
          for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const [xi, yi] = pts[i]!;
            const [xj, yj] = pts[j]!;
            if (yi > y + 0.5 !== yj > y + 0.5 && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) inside = !inside;
          }
          if (inside) c.set(x, y, y < 8 ? P.gold[4]! : P.gold[3]!);
        }
    },
  ],
  [
    'sound',
    (c) => {
      c.rect(2, 6, 3, 4, P.cloth[4]!);
      for (let i = 0; i < 4; i++) c.vline(5 + i, 6 - i, 9 + i, P.cloth[4]!);
      for (let y = 4; y < 12; y++) c.set(11 + (y > 5 && y < 10 ? 1 : 0), y, P.cloth[3]!);
      for (let y = 2; y < 14; y++) c.set(13 + (y > 4 && y < 11 ? 1 : 0), y, P.cloth[3]!);
    },
  ],
  [
    'mute',
    (c) => {
      c.rect(2, 6, 3, 4, P.cloth[4]!);
      for (let i = 0; i < 4; i++) c.vline(5 + i, 6 - i, 9 + i, P.cloth[4]!);
      for (let i = 0; i < 5; i++) {
        c.set(10 + i, 5 + i, P.red[3]!);
        c.set(14 - i, 5 + i, P.red[3]!);
      }
    },
  ],
  [
    'save',
    (c) => {
      c.rect(2, 2, 12, 12, P.blue[3]!);
      c.rect(4, 2, 7, 4, P.cloth[4]!);
      c.rect(8, 3, 2, 2, P.blue[2]!);
      c.rect(4, 9, 8, 5, P.white);
      c.hline(5, 10, 11, P.cloth[3]!);
    },
  ],
  ['shield', kiteShield(P.steel, P.blue)],
  [
    'exit',
    (c) => {
      c.rect(2, 2, 7, 12, P.wood[3]!);
      c.rect(3, 3, 5, 10, P.black);
      for (let i = 0; i < 5; i++) c.hline(7, 13, 8, P.gold[4]!);
      c.set(12, 7, P.gold[4]!);
      c.set(12, 9, P.gold[4]!);
      c.set(11, 6, P.gold[4]!);
      c.set(11, 10, P.gold[4]!);
    },
  ],
  [
    'chat',
    (c) => {
      c.rect(2, 3, 12, 8, P.cloth[4]!);
      c.set(4, 11, P.cloth[4]!);
      c.set(4, 12, P.cloth[4]!);
      c.set(5, 11, P.cloth[4]!);
      for (const x of [5, 8, 11]) c.set(x, 7, P.cloth[2]!);
    },
  ],
];
for (const [name, draw] of UI) icon(`ui_${name}`, draw);

export function buildIcons(): AtlasEntry[] {
  return out;
}
