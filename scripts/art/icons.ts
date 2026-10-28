// Ícones 16x16 de itens, magias e interface. Formas desenhadas por primitivas com contorno automático.
import { PixelCanvas, mix, rgb, type Color } from './lib/canvas.ts';
import { P, type Ramp } from './lib/palette.ts';
import type { AtlasEntry } from './lib/atlas.ts';
import { gearIcons } from './icons.gear.ts';

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
    c.ellipse(cx + 1, cy, big ? 4 : 3, big ? 5 : 4, (x, y, nx) =>
      x < cx - 1 ? 0 : nx < -0.1 ? head[4]! : nx < 0.4 ? head[3]! : head[2]!,
    );
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
      c.ellipse(11, 4.5, 3.6, 3.6, (x, y, nx, ny) =>
        nx + ny < -0.4 ? P.wood[4]! : nx + ny < 0.5 ? P.wood[3]! : P.wood[2]!,
      );
      c.set(10, 3, P.wood[1]!);
      c.set(12, 6, P.wood[1]!);
    } else {
      c.disc(11, 4.5, 3.2, (x, y, nx, ny) =>
        nx + ny < -0.4 ? head[4]! : nx + ny < 0.5 ? head[3]! : head[2]!,
      );
      for (const [x, y] of [
        [11, 0],
        [15, 4],
        [11, 8],
        [7, 4],
        [14, 1],
        [8, 1],
        [14, 7],
      ] as const)
        c.set(x, y, head[4]!);
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
    for (const [x, y] of [
      [13, 1],
      [13, 12],
      [5, 1],
    ] as const)
      c.set(x, y, P.gold[4]!);
    c.disc(9.5, 6.5, 2.2, P.gold[3]!);
    c.set(9, 6, P.arcane[3]!);
    c.set(10, 7, P.arcane[2]!);
  };
}

// ---------------------------------------------------------------- rampas e formas dos equipamentos avançados
const rampOf = (...hex: string[]): Ramp => hex.map((h) => rgb(h));
const R = {
  runic: rampOf('#1c2240', '#2f3f74', '#4f6cb0', '#7fa4e0', '#bcd8ff', '#f0f8ff'),
  dragon: rampOf('#3a0d10', '#6e1a14', '#a8321c', '#dc5a2a', '#f69a4a', '#ffd88a'),
  royal: rampOf('#4a2e14', '#8a5a18', '#c48c22', '#ecbc3e', '#ffe27a', '#fff8cc'),
  voidc: rampOf('#0c0818', '#22143e', '#3e2470', '#6a3cb0', '#a070e8', '#e0c8ff'),
  emerald: rampOf('#0c2a1c', '#145032', '#1f7a48', '#33a862', '#6ad48a', '#c8f8d4'),
  night: rampOf('#14122a', '#232046', '#363270', '#504a9e', '#7a72cc', '#b8b0f0'),
  silk: rampOf('#4a4058', '#7a6e8e', '#a89cbc', '#d4cce0', '#f4f0fa'),
  forestc: rampOf('#16261c', '#24402a', '#365e38', '#4e7e44', '#74a45a'),
};

function axeDouble(head: Ramp) {
  return (c: PixelCanvas) => {
    diag(c, 2, 14, 11, P.wood[3]!);
    diag(c, 3, 14, 10, P.wood[2]!);
    const cx = 10;
    const cy = 5;
    c.ellipse(cx + 3, cy - 1, 3, 4, (x, y, nx) => (nx < -0.2 ? head[4]! : nx < 0.4 ? head[3]! : head[2]!));
    c.ellipse(cx - 1, cy + 3, 3, 3, (x, y, nx, ny) => (nx + ny < 0 ? head[4]! : head[2]!));
    c.set(cx + 1, cy + 1, head[1]!);
  };
}

function hammer(head: Ramp) {
  return (c: PixelCanvas) => {
    diag(c, 2, 14, 9, P.leather[3]!);
    diag(c, 3, 14, 8, P.leather[2]!);
    for (let i = 0; i < 5; i++) {
      c.set(8 + i, 1 + i, head[4]!);
      c.set(9 + i, 1 + i, head[3]!);
      c.set(8 + i, 2 + i, head[3]!);
      c.set(9 + i, 2 + i, head[2]!);
      c.set(7 + i, 3 + i, head[2]!);
      c.set(10 + i, 1 + i, head[2]!);
    }
    c.set(12, 3, head[5] ?? head[4]!);
  };
}

function spearOf(tip: Ramp, shaft: Ramp, tassel: Ramp) {
  return (c: PixelCanvas) => {
    diag(c, 1, 14, 11, shaft[3]!);
    diag(c, 2, 14, 10, shaft[2]!);
    c.set(12, 3, tip[4]!);
    c.set(13, 2, tip[5] ?? tip[4]!);
    c.set(14, 1, tip[5] ?? tip[4]!);
    c.set(12, 2, tip[3]!);
    c.set(13, 3, tip[2]!);
    c.set(11, 2, tip[3]!);
    c.set(13, 4, tip[2]!);
    c.set(10, 5, tassel[3]!);
    c.set(9, 5, tassel[2]!);
  };
}

function towerShield(face: Ramp, emblem: Ramp) {
  return (c: PixelCanvas) => {
    c.rect(3, 1, 10, 14, face[3]!);
    c.vline(3, 1, 14, face[4]!);
    c.hline(3, 12, 1, face[4]!);
    c.vline(12, 1, 14, face[2]!);
    c.hline(3, 12, 14, face[1]!);
    for (const [x, y] of [
      [4, 2],
      [11, 2],
      [4, 13],
      [11, 13],
    ] as const)
      c.set(x, y, emblem[4]!);
    c.rect(7, 3, 2, 10, emblem[3]!);
    c.rect(5, 6, 6, 2, emblem[3]!);
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
  return (c: PixelCanvas) =>
    c.ascii(rows, { a: main[4] ?? main[3]!, b: main[3]!, c: main[2]!, g: accent[3]! });
}

function ring(gem: Ramp) {
  return (c: PixelCanvas) => {
    c.ellipse(8, 10, 5, 4, (x, y, nx, ny) =>
      Math.hypot(nx, ny) < 0.55 ? 0 : ny < 0 ? P.gold[4]! : P.gold[2]!,
    );
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

/** Flecha: de pedra (ponta cinza e penas vermelhas) ou de metal (ponta de aço maior e penas azuis). */
function arrow(metal = false) {
  const head: Ramp = metal ? P.steel : P.stone;
  const fletch: Ramp = metal ? P.blue : P.red;
  return (c: PixelCanvas) => {
    diag(c, 3, 12, 9, metal ? P.iron[3]! : P.wood[4]!);
    c.set(12, 3, head[5] ?? head[4]!);
    c.set(13, 2, head[4]!);
    c.set(12, 2, head[3]!);
    c.set(13, 3, head[3]!);
    c.set(14, 1, head[5] ?? head[4]!);
    if (metal) {
      c.set(11, 4, head[4]!);
      c.set(13, 4, head[3]!);
      c.set(12, 1, head[4]!);
    }
    c.set(2, 12, P.white);
    c.set(3, 13, P.white);
    c.set(1, 13, fletch[3]!);
    c.set(2, 14, fletch[3]!);
    c.set(1, 12, P.white);
    c.set(2, 13, fletch[4]!);
    // feixe de 3 flechas
    diag(c, 6, 13, 7, metal ? P.iron[2]! : P.wood[3]!);
    c.set(13, 6, head[4]!);
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
  // armas de treino (madeira e couro)
  ['training_sword', sword(P.wood, P.leather, 8)],
  ['training_axe', axe(P.wood)],
  ['training_club', mace(P.leather)],
  ['training_spear', spearOf(P.wood, P.wood, P.cloth)],
  ['training_wand', wand(P.cloth)],
  // equipamentos avançados
  ['sword_steel', sword(P.steel, P.iron, 10)],
  ['sword_runic', sword(R.runic, P.gold, 11)],
  ['sword_dragon', sword(R.dragon, R.royal, 11)],
  ['axe_double', axeDouble(P.steel)],
  ['axe_executioner', axeDouble(R.dragon)],
  ['hammer_war', hammer(P.steel)],
  ['morningstar', mace(R.runic)],
  ['bow_elven', bow(R.silk)],
  ['bow_royal', bow(R.royal)],
  ['spear_royal', spearOf(R.royal, P.wood, P.blue)],
  ['wand_inferno', wand(R.dragon)],
  ['wand_void', wand(R.voidc)],
  ['rod_thorns', wand(R.emerald, true)],
  ['rod_glacier', wand(R.runic, true)],
  ['shield_steel', roundShield(P.steel, R.royal)],
  ['shield_tower', towerShield(P.steel, P.blue)],
  ['spellbook_adept', book(P.blue)],
  ['spellbook_master', book(R.dragon)],
  ['armor_scale', shape(TORSO, R.runic, P.iron)],
  ['armor_ranger', shape(TORSO, R.forestc, P.leather)],
  ['armor_plate', shape(TORSO, P.steel, R.royal)],
  ['armor_royal', shape(TORSO, R.royal, P.red)],
  ['robe_mystic', shape(ROBE, R.silk, P.purple)],
  ['robe_archmage', shape(ROBE, R.night, R.royal)],
  ['helmet_steel', shape(HELMET, P.steel, P.iron)],
  ['helmet_royal', shape(HELMET, R.royal, P.red)],
  ['hat_wizard', shape(HAT, R.night, R.silk)],
  ['legs_silk', shape(LEGS, R.silk, P.purple)],
  ['legs_plate', shape(LEGS, P.steel, R.royal)],
  ['legs_royal', shape(LEGS, R.royal, P.red)],
  ['boots_steel', shape(BOOTS, P.steel, P.iron)],
  ['boots_wind', shape(BOOTS, P.ice, R.silk)],
  ['ring_power', ring(P.red)],
  ['ring_wisdom', ring(P.purple)],
  ['ring_life', ring(R.emerald)],
  ['amulet_guard', amulet(R.royal)],
  ['amulet_archmage', amulet(R.dragon)],
  ['potion_health_supreme', potion(R.dragon, true)],
  ['potion_mana_supreme', potion(R.voidc, true)],
  ['arrow', arrow()],
  ['arrow_metal', arrow(true)],
  [
    'amulet_loss',
    (c) => {
      amulet(P.red)(c);
      // cruz branca no centro da gema: protege contra a perda
      for (const [x, y] of [
        [8, 9],
        [8, 11],
        [7, 10],
        [9, 10],
        [8, 10],
      ] as const)
        c.set(x, y, P.white);
    },
  ],
  ['potion_health', potion(P.red)],
  ['potion_mana', potion(P.blue)],
  ['potion_health_great', potion(P.red, true)],
  ['potion_mana_great', potion(P.purple, true)],
  [
    'slime_gel',
    (c) => {
      c.ellipse(8, 10, 5.5, 4.2, (x, y, nx, ny) =>
        nx + ny < -0.5 ? P.nature[4]! : nx + ny < 0.5 ? P.nature[3]! : P.nature[2]!,
      );
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
      for (const [x, y] of [
        [1, 3],
        [14, 3],
        [2, 13],
        [13, 13],
      ] as const)
        c.set(x, y, P.leather[3]!);
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
    'wolf_pelt',
    (c) => {
      c.ellipse(8, 8, 6.5, 5.5, (x, y) => ((x + y) % 4 === 0 ? P.cloth[2]! : P.cloth[3]!));
      for (const [x, y] of [
        [1, 3],
        [14, 3],
        [2, 13],
        [13, 13],
      ] as const)
        c.set(x, y, P.cloth[3]!);
      c.line(4, 6, 12, 6, P.cloth[4]!);
      c.line(5, 10, 11, 10, P.cloth[1]!);
    },
  ],
  [
    'spider_silk',
    (c) => {
      c.disc(8, 8, 5.5, (x, y, nx, ny) => (Math.floor(Math.hypot(nx, ny) * 5) % 2 ? P.cloth[4]! : P.white));
      c.line(12, 12, 15, 15, P.cloth[3]!);
      c.set(6, 6, P.white);
    },
  ],
  [
    'bone_fragment',
    (c) => {
      c.line(4, 12, 11, 5, P.bone[3]!);
      c.line(5, 12, 12, 5, P.bone[2]!);
      for (const [x, y] of [
        [3, 12],
        [4, 13],
        [12, 4],
        [11, 3],
      ] as const)
        c.disc(x, y, 1.5, P.bone[3]!);
    },
  ],
  [
    'toad_venom',
    (c) => {
      c.rect(6, 2, 4, 3, P.wood[3]!);
      c.ellipse(8, 10, 4, 4.5, (x, y, nx, ny) =>
        ny < -0.3 ? P.ice[3]! : nx + ny < 0 ? P.nature[4]! : P.nature[2]!,
      );
      c.set(6, 9, P.white);
      c.set(9, 12, P.forest[1]!);
    },
  ],
  // loot das criaturas das faixas 3 a 6
  [
    'bandit_mask',
    (c) => {
      c.rect(2, 6, 12, 4, P.cloth[1]!);
      c.rect(4, 7, 3, 2, P.black);
      c.rect(9, 7, 3, 2, P.black);
      c.line(14, 7, 15, 11, P.cloth[2]!);
      c.hline(2, 13, 6, P.cloth[3]!);
    },
  ],
  [
    'bear_claw',
    (c) => {
      for (const x of [4, 8, 12]) {
        c.line(x, 13, x + 2, 4, P.bone[3]!);
        c.set(x + 2, 3, P.bone[2]!);
      }
      c.rect(2, 12, 13, 3, P.leather[2]!);
    },
  ],
  [
    'orc_tooth',
    (c) => {
      c.ellipse(8, 8, 3, 6, (x, y, nx) => (nx < 0 ? P.bone[3]! : P.bone[2]!));
      c.set(7, 4, P.white);
      c.hline(6, 10, 13, P.leather[2]!);
    },
  ],
  [
    'scorpion_stinger',
    (c) => {
      c.line(3, 13, 9, 7, P.dirt[3]!);
      c.line(4, 13, 10, 7, P.dirt[2]!);
      c.disc(11, 5, 2.4, P.dirt[4]!);
      c.set(13, 3, P.red[4]!);
      c.set(14, 2, P.red[3]!);
    },
  ],
  [
    'shaman_totem',
    (c) => {
      c.rect(6, 3, 4, 11, P.wood[3]!);
      c.rect(5, 4, 6, 3, P.red[3]!);
      c.set(6, 5, P.black);
      c.set(9, 5, P.black);
      c.rect(5, 9, 6, 2, P.bone[3]!);
      c.set(4, 2, P.gold[4]!);
      c.set(11, 2, P.gold[4]!);
    },
  ],
  [
    'ice_fang',
    (c) => {
      for (let i = 0; i < 10; i++) {
        const w2 = Math.max(0, 3 - Math.floor(i / 3));
        c.hline(8 - w2, 8 + w2, 3 + i, i % 3 ? P.ice[3]! : P.ice[4]!);
      }
      c.set(7, 4, P.white);
    },
  ],
  [
    'dark_emblem',
    (c) => {
      c.disc(8, 8, 6, (x, y, nx, ny) => (Math.hypot(nx, ny) > 0.75 ? P.gold[3]! : P.purple[1]!));
      c.disc(8, 8, 2.5, P.red[3]!);
      c.set(7, 7, P.red[4]!);
    },
  ],
  [
    'troll_hide',
    (c) => {
      c.ellipse(8, 8, 6.5, 5.5, (x, y) => ((x * 3 + y) % 5 === 0 ? P.teal[1]! : P.teal[2]!));
      for (const [x, y] of [
        [1, 3],
        [14, 3],
        [2, 13],
        [13, 13],
      ] as const)
        c.set(x, y, P.teal[2]!);
      c.line(4, 6, 12, 6, P.teal[3]!);
    },
  ],
  [
    'lich_dust',
    (c) => {
      c.rect(5, 3, 6, 2, P.wood[3]!);
      c.ellipse(8, 10, 5, 5, (x, y, nx, ny) =>
        ny < -0.4 ? P.ice[3]! : (x + y) % 3 ? P.purple[3]! : P.purple[4]!,
      );
      c.set(6, 8, P.white);
    },
  ],
  [
    'dragon_scale',
    (c) => {
      for (let y = 2; y < 15; y++) {
        const w2 = Math.round(Math.sin(((y - 2) / 12) * Math.PI) * 6);
        c.hline(8 - w2, 8 + w2, y, y < 7 ? P.red[4]! : y < 11 ? P.red[3]! : P.red[2]!);
      }
      c.line(8, 3, 8, 13, P.red[1]!);
      c.set(6, 5, P.gold[4]!);
    },
  ],
  [
    'meat',
    (c) => {
      c.ellipse(9, 7, 5, 4.5, (x, y, nx, ny) =>
        nx + ny < -0.4 ? P.red[4]! : nx + ny < 0.4 ? P.red[3]! : P.red[2]!,
      );
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
      for (const [x, y] of [
        [5, 11],
        [10, 11],
        [7.5, 8],
        [5, 6],
      ] as const) {
        c.ellipse(x + 0.5, y + 0.5, 3.4, 2.2, P.gold[3]!);
        c.ellipse(x + 0.5, y, 2.6, 1.4, P.gold[4]!);
        c.set(Math.floor(x), Math.floor(y), P.gold[5]!);
      }
    },
  ],
];
ICONS_ITEMS.push(
  ...gearIcons({
    sword,
    axeDouble,
    bow,
    wand,
    kiteShield,
    book,
    shape,
    rows: { TORSO, ROBE, HELMET, HAT, LEGS, BOOTS },
    ring,
    amulet,
    potion,
  }),
);
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

// frasco de poção: corpo arredondado, gargalo e rolha, com um brilho (poções das magias de criação)
function flaskSym(liquid: Ramp, glow: Color) {
  return (c: PixelCanvas) => {
    c.rect(7, 2, 2, 2, P.leather[3]!);
    c.rect(7, 4, 2, 3, P.white);
    c.ellipse(8, 10, 5, 4, (x, y, nx, ny) => (ny < -0.45 ? P.white : ny < -0.1 ? liquid[4]! : liquid[3]!));
    c.ellipse(8, 11, 4, 3, (x, y, nx, ny) => (ny < 0 ? liquid[3]! : liquid[2]!));
    c.set(5, 9, glow);
    c.set(6, 8, P.white);
    for (const [x, y] of [
      [12, 3],
      [3, 4],
      [13, 8],
    ] as const)
      c.set(x, y, glow);
  };
}
const SPELLS: [string, Ramp, (c: PixelCanvas) => void][] = [
  ['conjure_mana', P.blue, flaskSym(P.blue, P.water[5] ?? P.white)],
  ['conjure_health', P.heal, flaskSym(P.red, P.heal[3]!)],
  [
    'arcane_bolt',
    P.arcane,
    (c) => {
      c.disc(8, 8, 3.5, P.arcane[2]!);
      c.disc(8, 8, 2, P.arcane[4]!);
      for (const [x, y] of [
        [8, 2],
        [8, 13],
        [2, 8],
        [13, 8],
        [4, 4],
        [12, 12],
        [12, 4],
        [4, 12],
      ] as const)
        c.set(x, y, P.arcane[3]!);
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
      for (const [x, y] of [
        [8, 1],
        [1, 8],
        [14, 8],
        [8, 14],
      ] as const)
        c.set(x, y, P.fire[4]!);
    },
  ],
  [
    'earth_thorn',
    P.nature,
    (c) => {
      for (const [x, h] of [
        [4, 6],
        [8, 10],
        [12, 7],
      ] as const) {
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
      for (const [x, y] of [
        [8, 3],
        [8, 13],
        [3, 8],
        [13, 8],
      ] as const)
        c.set(x, y, P.white);
      c.set(8, 8, P.white);
    },
  ],
  [
    'sap_blessing',
    P.heal,
    (c) => {
      c.ellipse(8, 8, 3.2, 5.5, (x, y, nx) => (nx < 0 ? P.heal[3]! : P.heal[2]!));
      c.vline(8, 4, 13, P.heal[1]!);
      for (const [x, y] of [
        [3, 4],
        [12, 3],
        [13, 11],
        [3, 12],
      ] as const)
        c.set(x, y, P.heal[4]!);
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
        c.set(
          Math.round(8 + Math.cos(a) * r),
          Math.round(8 + Math.sin(a) * r),
          i > 24 ? P.steel[5]! : P.steel[4]!,
        );
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
  [
    'haste',
    P.ice,
    (c) => {
      // dois chevrons ">>" com rastros de velocidade
      for (const x0 of [4, 8]) {
        for (let i = 0; i < 5; i++) {
          c.set(x0 + Math.min(i, 4 - i), 3 + i, P.white);
          c.set(x0 + Math.min(i, 4 - i) + 1, 3 + i, P.ice[4]!);
          c.set(x0 + Math.min(i, 4 - i), 12 - i, P.white);
        }
      }
      for (const [x, y, l] of [
        [1, 6, 3],
        [1, 9, 4],
        [2, 12, 3],
      ] as const)
        c.hline(x, x + l, y, P.ice[3]!);
    },
  ],
  [
    'mana_shield',
    P.blue,
    (c) => {
      // bolha de mana com uma gota dentro
      c.ellipse(8, 8, 6, 6, (x, y, nx, ny) =>
        Math.hypot(nx, ny) > 0.72 ? (nx + ny < -0.2 ? P.blue[4]! : P.blue[3]!) : 0,
      );
      c.ellipse(8, 8, 4, 4, P.blue[1]!);
      c.disc(8, 9, 2, P.water[4]!);
      c.set(8, 5, P.water[5] ?? P.white);
      c.set(8, 6, P.water[4]!);
      c.set(7, 8, P.white);
      c.set(4, 4, P.white);
    },
  ],
  [
    'war_cry',
    P.gold,
    (c) => {
      // corneta de guerra e ondas de som
      for (let x = 2; x <= 8; x++) {
        const h = Math.round(1 + (x - 2) * 0.7);
        for (let y = 8 - h; y <= 8 + h; y++) c.set(x, y, y < 8 ? P.gold[4]! : P.gold[2]!);
      }
      c.rect(2, 7, 2, 3, P.leather[3]!);
      for (const [x, r] of [
        [10, 3],
        [12, 5],
      ] as const)
        for (let y = 8 - r; y <= 8 + r; y++) if (Math.abs(y - 8) >= r - 1) c.set(x, y, P.white);
    },
  ],
  [
    'stunning_arrow',
    P.ice,
    (c) => {
      // flecha atravessando um cristal de gelo
      diag(c, 2, 13, 11, P.ice[4]!);
      c.set(13, 2, P.white);
      c.set(12, 2, P.ice[3]!);
      c.set(13, 3, P.ice[3]!);
      c.set(1, 13, P.red[3]!);
      c.set(2, 14, P.red[3]!);
      for (const [x, y] of [
        [9, 9],
        [10, 9],
        [9, 10],
        [4, 4],
        [5, 4],
        [4, 5],
        [11, 12],
        [12, 12],
      ] as const)
        c.set(x, y, P.ice[3]!);
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

// caveira de PK (cores do estilo Tibia: branca, amarela, vermelha) e escudo de grupo (líder amarelo, membro azul)
function skullIcon(light: Color, mid: Color) {
  return (c: PixelCanvas) => {
    c.disc(8, 7, 5.6, (x, y, nx, ny) => (ny < -0.3 ? light : mid));
    c.rect(5, 11, 6, 3, mid);
    c.rect(5, 6, 2, 3, P.black);
    c.rect(9, 6, 2, 3, P.black);
    c.set(8, 9, P.black);
    for (const x of [6, 8, 10]) c.set(x, 13, P.black);
    c.set(6, 3, P.white);
  };
}

function shieldIcon(r: Ramp, star: boolean) {
  return (c: PixelCanvas) => {
    for (let y = 1; y <= 14; y++) {
      const half = y < 9 ? 5 : Math.max(0, Math.round(5 - (y - 8) * 0.85));
      for (let x = 8 - half; x <= 7 + half; x++) c.set(x, y, x < 8 - half * 0.3 ? r[4]! : r[3]!);
    }
    c.hline(3, 12, 2, r[5] ?? r[4]!);
    if (star)
      for (const [x, y] of [
        [8, 5],
        [7, 6],
        [8, 6],
        [9, 6],
        [8, 7],
        [6, 6],
        [10, 6],
      ] as const)
        c.set(x, y, P.white);
    else
      for (const [x, y] of [
        [8, 5],
        [8, 6],
        [8, 7],
        [8, 8],
        [7, 6],
        [9, 6],
      ] as const)
        c.set(x, y, P.white);
  };
}

// ---------------------------------------------------------------- interface
const UI: [string, (c: PixelCanvas) => void][] = [
  [
    'bag',
    (c) => {
      c.ellipse(8, 9.5, 6, 5, (x, y, nx, ny) =>
        nx + ny < -0.4 ? P.leather[4]! : nx + ny < 0.5 ? P.leather[3]! : P.leather[2]!,
      );
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
        c.rect(
          Math.round(8 + Math.cos(a) * 5.5) - 1,
          Math.round(8 + Math.sin(a) * 5.5) - 1,
          2,
          2,
          P.iron[3]!,
        );
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
  [
    'coin',
    (c) => {
      c.disc(8, 8, 5.5, P.gold[3]!);
      c.disc(8, 8, 3.8, P.gold[4]!);
      c.vline(8, 5, 11, P.gold[2]!);
      c.set(6, 6, P.gold[5]!);
    },
  ],
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
            if (yi > y + 0.5 !== yj > y + 0.5 && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi)
              inside = !inside;
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
  [
    'skull',
    (c) => {
      c.disc(8, 7, 5.6, (x, y, nx, ny) => (ny < -0.3 ? P.bone[3]! : P.bone[2]!));
      c.rect(5, 11, 6, 3, P.bone[2]!);
      c.rect(5, 6, 2, 3, P.black);
      c.rect(9, 6, 2, 3, P.black);
      c.set(8, 9, P.black);
      for (const x of [6, 8, 10]) c.set(x, 13, P.black);
      c.set(6, 3, P.white);
    },
  ],
  [
    'follow',
    (c) => {
      // pegadas indo para a direita
      for (const [x, y] of [
        [2, 10],
        [6, 6],
        [10, 10],
        [13, 5],
      ] as const) {
        c.ellipse(x + 1, y + 1, 1.6, 2.2, P.cloth[4]!);
        c.set(x + 1, y - 2, P.cloth[3]!);
      }
      c.hline(9, 14, 2, P.gold[4]!);
      c.set(13, 1, P.gold[4]!);
      c.set(13, 3, P.gold[4]!);
    },
  ],
  [
    'stand',
    (c) => {
      // duas botas paradas lado a lado + linha do chão
      c.rect(3, 4, 4, 8, P.leather[3]!);
      c.rect(9, 4, 4, 8, P.leather[3]!);
      c.rect(1, 10, 6, 3, P.leather[2]!);
      c.rect(9, 10, 6, 3, P.leather[2]!);
      c.hline(0, 15, 14, P.gold[3]!);
      c.vline(4, 5, 9, P.leather[4]!);
      c.vline(10, 5, 9, P.leather[4]!);
    },
  ],
  [
    'party',
    (c) => {
      c.disc(5, 5, 2.6, P.skin[3]!);
      c.disc(11, 5, 2.6, P.skin[3]!);
      c.ellipse(5, 12, 4, 3.2, P.blue[3]!);
      c.ellipse(11, 12, 4, 3.2, P.green[3]!);
      c.set(4, 4, P.white);
      c.set(10, 4, P.white);
    },
  ],
  [
    'crown',
    (c) => {
      c.rect(2, 8, 12, 5, P.gold[3]!);
      for (const [x, h] of [
        [2, 4],
        [8, 6],
        [13, 4],
      ] as const)
        for (let i = 0; i < h; i++) c.set(x + (x === 13 ? 0 : 0), 8 - i, P.gold[4]!);
      c.hline(3, 13, 12, P.gold[2]!);
      c.set(5, 10, P.red[3]!);
      c.set(8, 10, P.blue[4]!);
      c.set(11, 10, P.red[3]!);
    },
  ],
  [
    'lock',
    (c) => {
      // cadeado dourado (item travado: não entra no "vender tudo")
      for (let y = 2; y < 8; y++) {
        c.set(4, y, P.steel[4]!);
        c.set(11, y, P.steel[3]!);
      }
      c.hline(5, 10, 1, P.steel[4]!);
      c.rect(2, 7, 12, 8, P.gold[3]!);
      c.hline(2, 13, 7, P.gold[4]!);
      c.rect(7, 9, 2, 4, P.black);
      c.set(7, 9, P.gold[1]!);
    },
  ],
  [
    'map',
    (c) => {
      // pergaminho de mapa dobrado com trilha e marcador
      c.rect(1, 3, 14, 11, P.sand[2]!);
      c.vline(5, 3, 13, P.sand[1]!);
      c.vline(10, 3, 13, P.sand[1]!);
      c.rect(1, 3, 4, 11, P.sand[3]!);
      c.rect(11, 3, 4, 11, P.sand[3]!);
      c.ellipse(4, 10, 2, 1.4, P.green[3]!);
      c.ellipse(12, 6, 1.6, 1.2, P.water[4]!);
      for (const [x, y] of [
        [3, 6],
        [5, 7],
        [7, 8],
        [9, 9],
        [11, 10],
      ] as const)
        c.set(x, y, P.dirt[1]!);
      c.disc(12, 10, 1.6, P.red[3]!);
      c.set(12, 12, P.red[2]!);
      c.hline(1, 14, 3, P.sand[1]!);
      c.hline(1, 14, 13, P.dirt[2]!);
    },
  ],
  [
    'players',
    (c) => {
      // três cabeças (lista de personagens) com um "ponto online" verde
      c.disc(8, 4, 2.6, P.skin[3]!);
      c.ellipse(8, 11, 4, 3.4, P.purple[3]!);
      c.disc(3, 6, 2, P.skin[2]!);
      c.ellipse(3, 12, 2.6, 2.6, P.blue[2]!);
      c.disc(13, 6, 2, P.skin[2]!);
      c.ellipse(13, 12, 2.6, 2.6, P.teal[3]!);
      c.disc(13, 2, 1.6, P.green[4]!);
      c.set(7, 3, P.white);
    },
  ],
  ['skull_white', skullIcon(P.white, P.bone[3]!)],
  ['skull_yellow', skullIcon(P.gold[5]!, P.gold[3]!)],
  ['skull_red', skullIcon(P.red[4]!, P.red[3]!)],
  ['shield_leader', shieldIcon(P.gold, true)],
  ['shield_member', shieldIcon(P.blue, false)],
];
for (const [name, draw] of UI) icon(`ui_${name}`, draw);

export function buildIcons(): AtlasEntry[] {
  return out;
}
