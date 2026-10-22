// Equipamentos e consumíveis do nível 24 ao 100, gerados por fórmula a partir das faixas de gearTiers.ts.
// A calibração (tests/tools/calibrate.test.ts) mantém a margem de luta parecida em todas as faixas.
import type { ItemDef, StatBonuses } from '../domain/entities/definitions';
import type { Element } from '../domain/value-objects/element';
import { GEAR_TIERS } from './gearTiers';

const MAGES = ['sorcerer', 'druid'] as const;
const FIGHTERS = ['knight', 'paladin'] as const;
const WAND_ELEMENT: Element[] = ['fire', 'energy', 'fire', 'energy', 'fire', 'energy', 'fire', 'energy', 'fire', 'energy', 'energy'];
const ROD_ELEMENT: Element[] = ['earth', 'ice', 'earth', 'ice', 'earth', 'ice', 'earth', 'ice', 'earth', 'ice', 'ice'];
const PROJECTILE: Record<string, string> = { fire: 'proj_fire', energy: 'proj_energy', earth: 'proj_earth', ice: 'proj_ice' };

/** Crescimento por faixa: ataque, armadura, vida/mana e preço. */
export const GROW = { atk: 1.15, arm: 1.12, bonus: 1.2, value: 1.8 } as const;
const ATK_SKILLS = ['sword', 'axe', 'club', 'distance'] as const;

function build(): ItemDef[] {
  const out: ItemDef[] = [];
  GEAR_TIERS.forEach((t, k) => {
    const A = GROW.atk ** k;
    const R = GROW.arm ** k;
    const H = GROW.bonus ** k;
    const V = GROW.value ** k;
    const r = (n: number) => Math.round(n);
    const wand = WAND_ELEMENT[k]!;
    const rod = ROD_ELEMENT[k]!;
    const atkSkills = (n: number): StatBonuses['skills'] => Object.fromEntries(ATK_SKILLS.map((s) => [s, n]));
    const add = (def: Omit<ItemDef, 'minLevel'>) => out.push({ ...def, minLevel: t.level });
    const manaCost = 5 + Math.floor(k / 2);
    // ---- armas
    add({ id: `sword_${t.id}`, name: `Espada de ${t.name}`, description: 'Lâmina feita para a linha de frente.', type: 'weapon', icon: `item_sword_${t.id}`, value: r(5400 * V), slot: 'mainHand', vocations: ['knight'], weapon: { kind: 'melee', skill: 'sword', attack: r(34 * A), range: 1, element: 'physical' } });
    add({ id: `axe_${t.id}`, name: `Machado de ${t.name}`, description: 'Duas mãos: golpes lentos e devastadores.', type: 'weapon', icon: `item_axe_${t.id}`, value: r(5700 * V), slot: 'mainHand', twoHanded: true, vocations: ['knight'], weapon: { kind: 'melee', skill: 'axe', attack: r(43 * A), range: 1, element: 'physical', attackIntervalMs: 1700 } });
    add({ id: `bow_${t.id}`, name: `Arco de ${t.name}`, description: 'Arco de longo alcance.', type: 'weapon', icon: `item_bow_${t.id}`, value: r(5400 * V), slot: 'mainHand', twoHanded: true, vocations: ['paladin'], weapon: { kind: 'distance', skill: 'distance', attack: r(33 * A), range: 7, element: 'physical', projectile: 'proj_arrow' } });
    add({ id: `wand_${t.id}`, name: `Varinha de ${t.name}`, description: `Dispara ${wand === 'fire' ? 'fogo' : 'energia'} concentrada. Consome ${manaCost} de mana por disparo.`, type: 'weapon', icon: `item_wand_${t.id}`, value: r(5400 * V), slot: 'mainHand', vocations: ['sorcerer'], weapon: { kind: 'wand', skill: 'magic', attack: 0, range: 4, element: wand, damage: [r(42 * A), r(60 * A)], manaCost, projectile: PROJECTILE[wand] } });
    add({ id: `rod_${t.id}`, name: `Cajado de ${t.name}`, description: `Canaliza ${rod === 'earth' ? 'a terra' : 'o gelo'}. Consome ${manaCost} de mana por disparo.`, type: 'weapon', icon: `item_rod_${t.id}`, value: r(5400 * V), slot: 'mainHand', vocations: ['druid'], weapon: { kind: 'wand', skill: 'magic', attack: 0, range: 4, element: rod, damage: [r(42 * A), r(60 * A)], manaCost, projectile: PROJECTILE[rod] } });
    // ---- mão secundária
    add({ id: `shield_${t.id}`, name: `Escudo de ${t.name}`, description: 'Bloqueia golpes com folga.', type: 'shield', icon: `item_shield_${t.id}`, value: r(4200 * V), slot: 'offHand', defense: r(27 * R), armor: 1, vocations: ['knight'] });
    add({ id: `spellbook_${t.id}`, name: `Grimório de ${t.name}`, description: 'Fórmulas de poder crescente.', type: 'spellbook', icon: `item_spellbook_${t.id}`, value: r(4800 * V), slot: 'offHand', defense: r(15 * R), vocations: MAGES, bonuses: { maxMana: r(130 * H), maxHealth: r(40 * H), magicLevel: 2 + Math.floor(k / 3) } });
    // ---- armaduras
    add({ id: `helmet_${t.id}`, name: `Elmo de ${t.name}`, description: 'Proteção para a cabeça.', type: 'helmet', icon: `item_helmet_${t.id}`, value: r(2700 * V), slot: 'head', armor: r(8 * R), vocations: FIGHTERS });
    add({ id: `armor_${t.id}`, name: `Armadura de ${t.name}`, description: 'Placas pesadas que aumentam a vida.', type: 'armor', icon: `item_armor_${t.id}`, value: r(10000 * V), slot: 'body', armor: r(16 * R), vocations: ['knight'], bonuses: { maxHealth: r(50 * H) } });
    add({ id: `armor_ranger_${t.id}`, name: `Gibão de ${t.name}`, description: 'Leve, não atrapalha a mira.', type: 'armor', icon: `item_armor_ranger_${t.id}`, value: r(5700 * V), slot: 'body', armor: r(12 * R), vocations: ['paladin'], bonuses: { maxHealth: r(30 * H), skills: { distance: 3 + Math.floor(k / 2) } } });
    add({ id: `robe_${t.id}`, name: `Manto de ${t.name}`, description: 'Tecido encantado que amplia a mana.', type: 'armor', icon: `item_robe_${t.id}`, value: r(5400 * V), slot: 'body', armor: r(6 * R), vocations: MAGES, bonuses: { maxMana: r(110 * H), maxHealth: r(70 * H), magicLevel: 1 + Math.floor(k / 3) } });
    add({ id: `hat_${t.id}`, name: `Capuz de ${t.name}`, description: 'Foco arcano para a testa.', type: 'helmet', icon: `item_hat_${t.id}`, value: r(2400 * V), slot: 'head', armor: r(3 * R), vocations: MAGES, bonuses: { maxMana: r(50 * H), maxHealth: r(35 * H) } });
    add({ id: `legs_${t.id}`, name: `Calças de ${t.name}`, description: 'Proteção para as pernas.', type: 'legs', icon: `item_legs_${t.id}`, value: r(3000 * V), slot: 'legs', armor: r(8 * R), vocations: FIGHTERS });
    add({ id: `legs_mage_${t.id}`, name: `Calças Encantadas de ${t.name}`, description: 'Leves e carregadas de mana.', type: 'legs', icon: `item_legs_mage_${t.id}`, value: r(2700 * V), slot: 'legs', armor: r(3 * R), vocations: MAGES, bonuses: { maxMana: r(30 * H), maxHealth: r(35 * H) } });
    add({ id: `boots_${t.id}`, name: `Botas de ${t.name}`, description: 'Firmes e confortáveis.', type: 'boots', icon: `item_boots_${t.id}`, value: r(2100 * V), slot: 'feet', armor: r(4 * R), bonuses: { speed: 0.1 } });
    // ---- acessórios
    add({ id: `ring_power_${t.id}`, name: `Anel da Força (${t.name})`, description: 'Aumenta a perícia com armas.', type: 'ring', icon: `item_ring_power_${t.id}`, value: r(4200 * V), slot: 'ring', vocations: FIGHTERS, bonuses: { skills: atkSkills(3 + Math.floor(k / 2)) } });
    add({ id: `ring_wisdom_${t.id}`, name: `Anel da Sabedoria (${t.name})`, description: 'Clareia a mente do conjurador.', type: 'ring', icon: `item_ring_wisdom_${t.id}`, value: r(4200 * V), slot: 'ring', vocations: MAGES, bonuses: { magicLevel: 3 + Math.floor(k / 2) } });
    add({ id: `amulet_guard_${t.id}`, name: `Amuleto Guardião (${t.name})`, description: 'Proteção abençoada.', type: 'amulet', icon: `item_amulet_guard_${t.id}`, value: r(3600 * V), slot: 'amulet', armor: r(3 * R), bonuses: { maxHealth: r(80 * H) } });
    add({ id: `amulet_mage_${t.id}`, name: `Amuleto Arcano (${t.name})`, description: 'Pulsa com energia arcana.', type: 'amulet', icon: `item_amulet_mage_${t.id}`, value: r(4200 * V), slot: 'amulet', vocations: MAGES, bonuses: { maxMana: r(150 * H), magicLevel: 2 + Math.floor(k / 3) } });
  });
  // ---- poções de alto nível
  out.push(
    { id: 'potion_health_spirit', name: 'Poção de Vida Espiritual', description: 'Restaura 560 pontos de vida.', type: 'potion', icon: 'item_potion_health_spirit', value: 520, stackable: true, maxStack: 50, use: { heal: 560, cooldownMs: 1000 } },
    { id: 'potion_health_divine', name: 'Poção de Vida Divina', description: 'Restaura 1100 pontos de vida.', type: 'potion', icon: 'item_potion_health_divine', value: 1100, stackable: true, maxStack: 50, use: { heal: 1100, cooldownMs: 1000 } },
    { id: 'potion_mana_spirit', name: 'Poção de Mana Espiritual', description: 'Restaura 480 pontos de mana.', type: 'potion', icon: 'item_potion_mana_spirit', value: 540, stackable: true, maxStack: 50, use: { mana: 480, cooldownMs: 1000 } },
    { id: 'potion_mana_divine', name: 'Poção de Mana Divina', description: 'Restaura 900 pontos de mana.', type: 'potion', icon: 'item_potion_mana_divine', value: 1100, stackable: true, maxStack: 50, use: { mana: 900, cooldownMs: 1000 } },
  );
  return out;
}

export const GEAR_ITEMS: readonly ItemDef[] = build();
