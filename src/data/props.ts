// Objetos do cenário: quadro(s) no atlas "objects", pegada de colisão, bloqueio de visão, luz e sombra.
// A posição de um objeto é o tile da base (canto inferior esquerdo da pegada).
export interface PropDef {
  id: string;
  frames: readonly string[];
  frameMs?: number;
  /** Largura da pegada em tiles (centraliza o sprite). */
  width: number;
  /** Células bloqueadas relativas ao tile base [dx, dy] (dy negativo = acima). */
  blocks: readonly (readonly [number, number])[];
  /** Bloqueia projéteis e magias (linha de visão). */
  blocksSight?: boolean;
  /** Desenhado no chão, abaixo de personagens. */
  flat?: boolean;
  /** Ajuste vertical do sprite em pixels. */
  offsetY?: number;
  light?: { radius: number; color: 'warm' | 'cool' };
  shadow?: 's' | 'm' | 'l';
}

const one = [[0, 0]] as const;
const two = [
  [0, 0],
  [1, 0],
] as const;
const p = (id: string, def: Omit<PropDef, 'id' | 'frames'> & { frames?: readonly string[] }): PropDef => ({ id, frames: def.frames ?? [id], ...def });

const list: PropDef[] = [
  p('tree_oak', { width: 1, blocks: one, blocksSight: true, offsetY: 2 }),
  p('tree_oak_b', { width: 1, blocks: one, blocksSight: true, offsetY: 2 }),
  p('tree_forest', { width: 1, blocks: one, blocksSight: true, offsetY: 2 }),
  p('tree_apple', { width: 1, blocks: one, blocksSight: true, offsetY: 2 }),
  p('tree_pine', { width: 1, blocks: one, blocksSight: true, offsetY: 2 }),
  p('tree_pine_b', { width: 1, blocks: one, blocksSight: true, offsetY: 2 }),
  p('bush', { width: 1, blocks: one, offsetY: 1 }),
  p('bush_berry', { width: 1, blocks: one, offsetY: 1 }),
  p('bush_flower', { width: 1, blocks: one, offsetY: 1 }),
  p('bush_dark', { width: 1, blocks: one, offsetY: 1 }),
  p('rock_small', { width: 1, blocks: one, offsetY: 0 }),
  p('rock_medium', { width: 1, blocks: one, offsetY: 1 }),
  p('rock_large', { width: 2, blocks: two, blocksSight: true, offsetY: 2 }),
  p('rock_large_b', { width: 2, blocks: two, blocksSight: true, offsetY: 2 }),
  p('stump', { width: 1, blocks: one }),
  p('log', { width: 2, blocks: two }),
  p('fence_h', { width: 1, blocks: one }),
  p('fence_post', { width: 1, blocks: one }),
  p('fence_v', { width: 1, blocks: one }),
  p('lamp_post', { width: 1, blocks: one, frames: ['lamp_post_lit'], light: { radius: 3, color: 'warm' } }),
  p('sign', { width: 1, blocks: one }),
  p('well', { width: 2, blocks: two, offsetY: 1 }),
  p('fountain', { width: 3, blocks: [[0, 0], [1, 0], [2, 0], [0, -1], [1, -1], [2, -1]], frames: ['fountain_0', 'fountain_1', 'fountain_2'], frameMs: 220, offsetY: 2 }),
  p('barrel', { width: 1, blocks: one }),
  p('crate', { width: 1, blocks: one }),
  p('sack', { width: 1, blocks: one }),
  p('pot', { width: 1, blocks: one }),
  p('hay', { width: 1, blocks: one }),
  p('stall_fruit', { width: 2, blocks: two, offsetY: 1 }),
  p('stall_cloth', { width: 2, blocks: two, offsetY: 1 }),
  p('bench', { width: 2, blocks: two }),
  p('planter', { width: 1, blocks: one }),
  p('pillar', { width: 1, blocks: one, blocksSight: true, offsetY: 1 }),
  p('statue', { width: 1, blocks: one, blocksSight: true, offsetY: 1 }),
  p('brazier', { width: 1, blocks: one, frames: ['brazier_0', 'brazier_1', 'brazier_2'], frameMs: 140, light: { radius: 3, color: 'warm' } }),
  p('altar', { width: 2, blocks: two }),
  p('pew', { width: 2, blocks: two }),
  p('banner', { width: 1, blocks: [] }),
  p('bed', { width: 1, blocks: [[0, 0], [0, -1]] }),
  p('table', { width: 2, blocks: two }),
  p('table_small', { width: 1, blocks: one }),
  p('chair', { width: 1, blocks: one }),
  p('bookshelf', { width: 1, blocks: one }),
  p('fireplace', { width: 2, blocks: two, frames: ['fireplace_0', 'fireplace_1', 'fireplace_2'], frameMs: 150, light: { radius: 3, color: 'warm' } }),
  p('counter', { width: 3, blocks: [[0, 0], [1, 0], [2, 0]] }),
  p('potion_shelf', { width: 2, blocks: two }),
  p('weapon_rack', { width: 2, blocks: two }),
  p('armor_stand', { width: 1, blocks: one }),
  p('anvil', { width: 1, blocks: one }),
  p('cauldron', { width: 1, blocks: one, frames: ['cauldron_0', 'cauldron_1'], frameMs: 400, light: { radius: 2, color: 'cool' } }),
  p('chest', { width: 1, blocks: one }),
  p('plant', { width: 1, blocks: one }),
  p('candle', { width: 1, blocks: one, frames: ['candle_0', 'candle_1'], frameMs: 300, light: { radius: 2, color: 'warm' } }),
  p('wardrobe', { width: 1, blocks: one }),
  p('tent', { width: 2, blocks: [[0, 0], [1, 0], [0, -1], [1, -1]], blocksSight: true }),
  p('campfire', { width: 1, blocks: one, frames: ['campfire_0', 'campfire_1', 'campfire_2'], frameMs: 130, light: { radius: 3, color: 'warm' } }),
  p('bones', { width: 1, blocks: [], flat: true }),
  p('totem', { width: 1, blocks: one }),
  p('palisade', { width: 1, blocks: one, blocksSight: true }),
];

export const PROPS: Readonly<Record<string, PropDef>> = Object.fromEntries(list.map((d) => [d.id, d]));
