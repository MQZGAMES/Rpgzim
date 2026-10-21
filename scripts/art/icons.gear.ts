// Ícones dos equipamentos do nível 24 ao 100 (uma rampa de cor por material), da munição e poções avançadas e dos
// troféus das criaturas tardias. Os dados vêm de src/data/gearTiers.ts e src/data/trophies.ts.
import type { PixelCanvas} from './lib/canvas.ts';
import { rgb } from './lib/canvas.ts';
import { P, type Ramp } from './lib/palette.ts';
import { GEAR_TIERS, ARROW_TIERS } from '../../src/data/gearTiers.ts';
import { TROPHIES, type TrophyShape } from '../../src/data/trophies.ts';

type Draw = (c: PixelCanvas) => void;
const rampOf = (hex: readonly string[]): Ramp => hex.map((h) => rgb(h));

/** Formas de troféu 16x16, todas desenhadas com a rampa do item (escuro → claro). */
const TROPHY_SHAPES: Record<TrophyShape, (r: Ramp) => Draw> = {
  fang: (r) => (c) => {
    for (let i = 0; i < 10; i++) {
      const t = i / 9;
      const x = 3 + Math.round(t * 9);
      const y = 13 - Math.round(Math.sin(t * Math.PI * 0.8) * 9);
      c.set(x, y, r[4]!);
      c.set(x, y + 1, i > 7 ? r[4]! : r[3]!);
      if (i < 5) c.set(x + 1, y + 1, r[2]!);
    }
    c.set(12, 4, r[5]!);
  },
  claw: (r) => (c) => {
    for (const x of [4, 8, 12]) {
      c.line(x, 13, x + 2, 4, r[4]!);
      c.set(x + 2, 3, r[3]!);
    }
    c.rect(2, 12, 13, 3, r[1]!);
    c.hline(2, 14, 12, r[2]!);
  },
  scale: (r) => (c) => {
    for (let y = 2; y < 15; y++) {
      const w = Math.round(Math.sin(((y - 2) / 12) * Math.PI) * 6);
      c.hline(8 - w, 8 + w, y, y % 3 === 0 ? r[3]! : y % 3 === 1 ? r[2]! : r[4]!);
    }
    c.set(6, 6, r[5]!);
  },
  dust: (r) => (c) => {
    c.rect(5, 3, 6, 2, r[1]!);
    c.ellipse(8, 10, 5, 5, (x, y, nx, ny) => (ny < -0.4 ? r[5]! : (x + y) % 3 ? r[3]! : r[4]!));
    c.set(3, 5, r[5]!);
    c.set(13, 7, r[5]!);
  },
  eye: (r) => (c) => {
    c.ellipse(8, 8, 6.5, 5, (x, y, nx, ny) => (Math.hypot(nx, ny) < 0.45 ? r[2]! : Math.hypot(nx, ny) < 0.65 ? r[4]! : P.bone[4]!));
    c.disc(8, 8, 1.4, P.black);
    c.set(6, 6, P.white);
  },
  heart: (r) => (c) => {
    c.ellipse(8, 9, 5.5, 5, (x, y, nx, ny) => (nx + ny < -0.4 ? r[4]! : nx + ny < 0.5 ? r[3]! : r[2]!));
    c.rect(7, 2, 2, 3, r[1]!);
    c.set(6, 7, r[5]!);
    c.set(10, 12, r[1]!);
  },
  gem: (r) => (c) => {
    c.disc(8, 8, 6, (x, y, nx, ny) => (Math.hypot(nx, ny) > 0.75 ? r[3]! : ny < -0.1 ? r[2]! : r[1]!));
    c.disc(8, 8, 2.5, r[4]!);
    c.set(6, 6, r[5]!);
  },
  hide: (r) => (c) => {
    c.ellipse(8, 8, 6.5, 5.5, (x, y) => ((x * 3 + y) % 5 === 0 ? r[2]! : r[3]!));
    for (const [x, y] of [[1, 3], [14, 3], [2, 13], [13, 13]] as const) c.set(x, y, r[3]!);
    c.line(4, 6, 12, 6, r[4]!);
    c.line(5, 10, 11, 10, r[1]!);
  },
  horn: (r) => (c) => {
    for (let i = 0; i < 11; i++) {
      const t = i / 10;
      const x = 3 + Math.round(t * 9);
      const y = 13 - Math.round(Math.sin(t * Math.PI * 0.55) * 10);
      const w = Math.max(0, 3 - Math.floor(i / 3));
      c.hline(x - w, x, y, i % 2 ? r[3]! : r[4]!);
    }
    c.set(11, 3, r[5]!);
    c.rect(2, 12, 5, 3, r[1]!);
  },
  shard: (r) => (c) => {
    for (let y = 1; y < 15; y++) {
      const w = y < 5 ? y : y > 10 ? 15 - y : 4;
      c.hline(8 - Math.ceil(w / 2), 8 + Math.floor(w / 2), y, y % 2 ? r[3]! : r[4]!);
    }
    c.vline(7, 3, 10, r[5]!);
    c.vline(9, 6, 12, r[2]!);
  },
  ember: (r) => (c) => {
    c.ellipse(8, 10, 4.5, 5, (x, y, nx, ny) => (ny < -0.2 ? r[4]! : nx + ny < 0.2 ? r[3]! : r[2]!));
    c.ellipse(8, 5, 2, 3.5, r[4]!);
    c.set(8, 2, r[5]!);
    c.disc(8, 11, 2, r[5]!);
  },
  rune: (r) => (c) => {
    c.rect(3, 2, 10, 12, r[2]!);
    c.rect(4, 3, 8, 10, r[3]!);
    c.vline(8, 4, 11, r[5]!);
    c.line(5, 6, 11, 6, r[5]!);
    c.line(5, 10, 11, 9, r[5]!);
    c.set(4, 3, r[4]!);
  },
};

/** Entradas de ícone (nome sem o prefixo "item_") de tudo que foi gerado por fórmula. `fns` traz os desenhadores do icons.ts. */
export function gearIcons(fns: {
  sword: (blade: Ramp, hilt: Ramp, len?: number) => Draw;
  axeDouble: (head: Ramp) => Draw;
  bow: (wood: Ramp) => Draw;
  wand: (gem: Ramp, staff?: boolean) => Draw;
  kiteShield: (face: Ramp, emblem: Ramp) => Draw;
  book: (cover: Ramp) => Draw;
  shape: (rows: string[], main: Ramp, accent: Ramp) => Draw;
  rows: { TORSO: string[]; ROBE: string[]; HELMET: string[]; HAT: string[]; LEGS: string[]; BOOTS: string[] };
  ring: (gem: Ramp) => Draw;
  amulet: (gem: Ramp) => Draw;
  potion: (liquid: Ramp, big?: boolean) => Draw;
  arrowOf: (head: Ramp, fletch: Ramp) => Draw;
}): [string, Draw][] {
  const out: [string, Draw][] = [];
  const { rows } = fns;
  for (const t of GEAR_TIERS) {
    const m = rampOf(t.ramp);
    out.push(
      [`sword_${t.id}`, fns.sword(m, P.leather, 11)],
      [`axe_${t.id}`, fns.axeDouble(m)],
      [`bow_${t.id}`, fns.bow(m)],
      [`wand_${t.id}`, fns.wand(m)],
      [`rod_${t.id}`, fns.wand(m, true)],
      [`shield_${t.id}`, fns.kiteShield(m, P.gold)],
      [`spellbook_${t.id}`, fns.book(m)],
      [`helmet_${t.id}`, fns.shape(rows.HELMET, m, P.gold)],
      [`armor_${t.id}`, fns.shape(rows.TORSO, m, P.gold)],
      [`armor_ranger_${t.id}`, fns.shape(rows.TORSO, m, P.leather)],
      [`robe_${t.id}`, fns.shape(rows.ROBE, m, P.gold)],
      [`hat_${t.id}`, fns.shape(rows.HAT, m, P.gold)],
      [`legs_${t.id}`, fns.shape(rows.LEGS, m, P.iron)],
      [`legs_mage_${t.id}`, fns.shape(rows.LEGS, m, P.purple)],
      [`boots_${t.id}`, fns.shape(rows.BOOTS, m, P.iron)],
      [`ring_power_${t.id}`, fns.ring(m)],
      [`ring_wisdom_${t.id}`, fns.ring(rampOf([...t.ramp].reverse()))],
      [`amulet_guard_${t.id}`, fns.amulet(m)],
      [`amulet_mage_${t.id}`, fns.amulet(rampOf([...t.ramp].reverse()))],
    );
  }
  const tier = (id: string) => rampOf(GEAR_TIERS.find((t) => t.id === id)!.ramp);
  for (const a of ARROW_TIERS) out.push([a.id, fns.arrowOf(tier(a.ramp), tier(a.ramp))]);
  out.push(
    ['potion_health_spirit', fns.potion(tier('ruby'), true)],
    ['potion_health_divine', fns.potion(tier('celestial'), true)],
    ['potion_mana_spirit', fns.potion(tier('crystal'), true)],
    ['potion_mana_divine', fns.potion(tier('primordial'), true)],
  );
  for (const t of TROPHIES) out.push([t.id, TROPHY_SHAPES[t.shape](rampOf(t.ramp))]);
  return out;
}
