// Itens do jogo. IDs são estáveis: nunca renomeie um id existente (saves dependem dele).
import type { ItemDef } from '../domain/entities/definitions';

const MAGES = ['sorcerer', 'druid'] as const;
const FIGHTERS = ['knight', 'paladin'] as const;

const list: ItemDef[] = [
  // ---------------------------------------------------------------- armas corpo a corpo
  { id: 'sword_short', name: 'Espada Curta', description: 'Lâmina simples e equilibrada, ideal para iniciantes.', type: 'weapon', icon: 'item_sword_short', value: 60, slot: 'mainHand', weapon: { kind: 'melee', skill: 'sword', attack: 10, range: 1, element: 'physical' } },
  { id: 'sword_iron', name: 'Espada de Ferro', description: 'Forjada em Pedraluz. Corte firme e confiável.', type: 'weapon', icon: 'item_sword_iron', value: 340, slot: 'mainHand', minLevel: 4, vocations: FIGHTERS, weapon: { kind: 'melee', skill: 'sword', attack: 16, range: 1, element: 'physical' } },
  { id: 'dagger', name: 'Adaga Goblin', description: 'Lâmina curta e lascada, roubada de algum viajante.', type: 'weapon', icon: 'item_dagger', value: 25, slot: 'mainHand', weapon: { kind: 'melee', skill: 'sword', attack: 8, range: 1, element: 'physical', attackIntervalMs: 1200 } },
  { id: 'axe_hand', name: 'Machadinha', description: 'Leve o bastante para uma mão, pesada o bastante para doer.', type: 'weapon', icon: 'item_axe_hand', value: 95, slot: 'mainHand', weapon: { kind: 'melee', skill: 'axe', attack: 12, range: 1, element: 'physical' } },
  { id: 'axe_battle', name: 'Machado de Batalha', description: 'Arma de duas mãos com golpes devastadores.', type: 'weapon', icon: 'item_axe_battle', value: 520, slot: 'mainHand', twoHanded: true, minLevel: 5, vocations: ['knight'], weapon: { kind: 'melee', skill: 'axe', attack: 22, range: 1, element: 'physical', attackIntervalMs: 1700 } },
  { id: 'club_wood', name: 'Clava de Madeira', description: 'Um galho grosso e bem escolhido.', type: 'weapon', icon: 'item_club_wood', value: 25, slot: 'mainHand', weapon: { kind: 'melee', skill: 'club', attack: 8, range: 1, element: 'physical' } },
  { id: 'mace_iron', name: 'Maça de Ferro', description: 'Cabeça cravejada que esmaga armaduras.', type: 'weapon', icon: 'item_mace_iron', value: 280, slot: 'mainHand', minLevel: 3, vocations: FIGHTERS, weapon: { kind: 'melee', skill: 'club', attack: 15, range: 1, element: 'physical' } },
  // ---------------------------------------------------------------- armas de distância
  { id: 'bow_hunting', name: 'Arco de Caça', description: 'Arco de teixo. Requer flechas no slot de munição.', type: 'weapon', icon: 'item_bow_hunting', value: 130, slot: 'mainHand', twoHanded: true, vocations: ['paladin'], weapon: { kind: 'distance', skill: 'distance', attack: 12, range: 6, element: 'physical', ammo: 'arrow', projectile: 'proj_arrow' } },
  { id: 'bow_composite', name: 'Arco Composto', description: 'Camadas de chifre e madeira para disparos potentes.', type: 'weapon', icon: 'item_bow_composite', value: 560, slot: 'mainHand', twoHanded: true, minLevel: 5, vocations: ['paladin'], weapon: { kind: 'distance', skill: 'distance', attack: 18, range: 7, element: 'physical', ammo: 'arrow', projectile: 'proj_arrow' } },
  { id: 'spear_throwing', name: 'Lança de Arremesso', description: 'Arremessada e recuperada a cada ataque. Permite usar escudo.', type: 'weapon', icon: 'item_spear_throwing', value: 95, slot: 'mainHand', vocations: ['paladin'], weapon: { kind: 'distance', skill: 'distance', attack: 13, range: 4, element: 'physical', projectile: 'proj_spear' } },
  // ---------------------------------------------------------------- varinhas e cajados
  { id: 'wand_ember', name: 'Varinha de Brasa', description: 'Dispara faíscas de fogo. Consome 2 de mana por disparo.', type: 'weapon', icon: 'item_wand_ember', value: 150, slot: 'mainHand', vocations: ['sorcerer'], weapon: { kind: 'wand', skill: 'magic', attack: 0, range: 4, element: 'fire', damage: [8, 14], manaCost: 2, projectile: 'proj_fire' } },
  { id: 'wand_storm', name: 'Varinha da Tempestade', description: 'Canaliza raios arcanos. Consome 3 de mana por disparo.', type: 'weapon', icon: 'item_wand_storm', value: 760, slot: 'mainHand', minLevel: 6, vocations: ['sorcerer'], weapon: { kind: 'wand', skill: 'magic', attack: 0, range: 4, element: 'energy', damage: [16, 25], manaCost: 3, projectile: 'proj_energy' } },
  { id: 'rod_sprout', name: 'Cajado do Broto', description: 'Desperta espinhos da terra. Consome 2 de mana por disparo.', type: 'weapon', icon: 'item_rod_sprout', value: 150, slot: 'mainHand', vocations: ['druid'], weapon: { kind: 'wand', skill: 'magic', attack: 0, range: 4, element: 'earth', damage: [8, 14], manaCost: 2, projectile: 'proj_earth' } },
  { id: 'rod_frost', name: 'Cajado Gélido', description: 'Lança estilhaços de gelo. Consome 3 de mana por disparo.', type: 'weapon', icon: 'item_rod_frost', value: 760, slot: 'mainHand', minLevel: 6, vocations: ['druid'], weapon: { kind: 'wand', skill: 'magic', attack: 0, range: 4, element: 'ice', damage: [16, 25], manaCost: 3, projectile: 'proj_ice' } },
  // ---------------------------------------------------------------- mão secundária
  { id: 'shield_wood', name: 'Escudo de Madeira', description: 'Tábuas reforçadas com aro de ferro.', type: 'shield', icon: 'item_shield_wood', value: 45, slot: 'offHand', defense: 8 },
  { id: 'shield_iron', name: 'Escudo de Ferro', description: 'Escudo pipa com o brasão da guarda.', type: 'shield', icon: 'item_shield_iron', value: 320, slot: 'offHand', defense: 14, minLevel: 4, vocations: FIGHTERS },
  { id: 'spellbook', name: 'Grimório do Aprendiz', description: 'Anotações arcanas que ampliam a reserva de mana.', type: 'spellbook', icon: 'item_spellbook', value: 220, slot: 'offHand', vocations: MAGES, bonuses: { maxMana: 30 } },
  // ---------------------------------------------------------------- armaduras
  { id: 'armor_leather', name: 'Armadura de Couro', description: 'Couro curtido e costurado à mão.', type: 'armor', icon: 'item_armor_leather', value: 75, slot: 'body', armor: 3 },
  { id: 'armor_chain', name: 'Cota de Malha', description: 'Anéis de ferro entrelaçados.', type: 'armor', icon: 'item_armor_chain', value: 320, slot: 'body', armor: 6, minLevel: 3, vocations: FIGHTERS },
  { id: 'robe_apprentice', name: 'Manto do Aprendiz', description: 'Tecido encantado que amplia a mana.', type: 'armor', icon: 'item_robe_apprentice', value: 130, slot: 'body', armor: 2, vocations: MAGES, bonuses: { maxMana: 15 } },
  { id: 'robe_druid', name: 'Manto do Bosque', description: 'Fibras vivas que protegem e revigoram.', type: 'armor', icon: 'item_robe_druid', value: 130, slot: 'body', armor: 2, vocations: MAGES, bonuses: { maxMana: 10, maxHealth: 10 } },
  { id: 'helmet_leather', name: 'Elmo de Couro', description: 'Proteção leve para a cabeça.', type: 'helmet', icon: 'item_helmet_leather', value: 35, slot: 'head', armor: 1 },
  { id: 'helmet_iron', name: 'Elmo de Ferro', description: 'Elmo com faixa de latão.', type: 'helmet', icon: 'item_helmet_iron', value: 190, slot: 'head', armor: 3, vocations: FIGHTERS },
  { id: 'hat_mage', name: 'Chapéu de Mago', description: 'Pontudo, estiloso e levemente encantado.', type: 'helmet', icon: 'item_hat_mage', value: 95, slot: 'head', armor: 1, vocations: MAGES, bonuses: { maxMana: 10 } },
  { id: 'legs_leather', name: 'Calças de Couro', description: 'Confortáveis para longas caminhadas.', type: 'legs', icon: 'item_legs_leather', value: 40, slot: 'legs', armor: 1 },
  { id: 'legs_chain', name: 'Calças de Malha', description: 'Malha de ferro sobre forro acolchoado.', type: 'legs', icon: 'item_legs_chain', value: 240, slot: 'legs', armor: 3, minLevel: 3, vocations: FIGHTERS },
  { id: 'boots_leather', name: 'Botas de Couro', description: 'Solado firme para trilhas.', type: 'boots', icon: 'item_boots_leather', value: 30, slot: 'feet', armor: 1 },
  { id: 'boots_swift', name: 'Botas Ligeiras', description: 'Encantadas para passos rápidos (+velocidade).', type: 'boots', icon: 'item_boots_swift', value: 650, slot: 'feet', armor: 1, minLevel: 4, bonuses: { speed: 0.6 } },
  // ---------------------------------------------------------------- acessórios
  { id: 'ring_vigor', name: 'Anel do Vigor', description: 'Pulsa com força vital (+25 de vida máxima).', type: 'ring', icon: 'item_ring_vigor', value: 380, slot: 'ring', bonuses: { maxHealth: 25 } },
  { id: 'amulet_mana', name: 'Amuleto Arcano', description: 'Uma safira que guarda energia (+40 de mana máxima).', type: 'amulet', icon: 'item_amulet_mana', value: 420, slot: 'amulet', bonuses: { maxMana: 40 } },
  // ---------------------------------------------------------------- munição e consumíveis
  { id: 'arrow', name: 'Flecha', description: 'Munição para arcos. Equipe no slot de munição.', type: 'ammo', icon: 'item_arrow', value: 2, stackable: true, maxStack: 100, slot: 'ammo', ammoType: 'arrow' },
  { id: 'potion_health', name: 'Poção de Vida', description: 'Restaura 70 pontos de vida.', type: 'potion', icon: 'item_potion_health', value: 40, stackable: true, maxStack: 50, use: { heal: 70, cooldownMs: 1000 } },
  { id: 'potion_mana', name: 'Poção de Mana', description: 'Restaura 60 pontos de mana.', type: 'potion', icon: 'item_potion_mana', value: 45, stackable: true, maxStack: 50, use: { mana: 60, cooldownMs: 1000 } },
  { id: 'potion_health_great', name: 'Poção de Vida Forte', description: 'Restaura 160 pontos de vida.', type: 'potion', icon: 'item_potion_health_great', value: 110, stackable: true, maxStack: 50, use: { heal: 160, cooldownMs: 1000 } },
  { id: 'potion_mana_great', name: 'Poção de Mana Forte', description: 'Restaura 140 pontos de mana.', type: 'potion', icon: 'item_potion_mana_great', value: 120, stackable: true, maxStack: 50, use: { mana: 140, cooldownMs: 1000 } },
  { id: 'meat', name: 'Carne de Javali', description: 'Regenera vida e mana aos poucos por 30 segundos.', type: 'food', icon: 'item_meat', value: 8, stackable: true, maxStack: 50, use: { regen: { health: 4, mana: 2, durationMs: 30000 }, cooldownMs: 1000 } },
  // ---------------------------------------------------------------- loot
  { id: 'slime_gel', name: 'Gosma de Musgo', description: 'Pegajosa e levemente perfumada. Alquimistas compram.', type: 'loot', icon: 'item_slime_gel', value: 5, stackable: true, maxStack: 100 },
  { id: 'boar_tusk', name: 'Presa de Javali', description: 'Troféu de caça valorizado por mercadores.', type: 'loot', icon: 'item_boar_tusk', value: 18, stackable: true, maxStack: 100 },
  { id: 'boar_hide', name: 'Couro de Javali', description: 'Couro grosso, ótimo para armaduras.', type: 'loot', icon: 'item_boar_hide', value: 12, stackable: true, maxStack: 100 },
  { id: 'goblin_ear', name: 'Orelha de Goblin', description: 'Prova de bravura aceita pelos mercadores.', type: 'loot', icon: 'item_goblin_ear', value: 20, stackable: true, maxStack: 100 },
  { id: 'toad_venom', name: 'Veneno de Sapo', description: 'Frasco de veneno esverdeado. Alquimistas pagam bem.', type: 'loot', icon: 'item_toad_venom', value: 14, stackable: true, maxStack: 100 },
  { id: 'wolf_pelt', name: 'Pele de Lobo', description: 'Pelagem cinzenta e macia, muito procurada no inverno.', type: 'loot', icon: 'item_wolf_pelt', value: 22, stackable: true, maxStack: 100 },
  { id: 'spider_silk', name: 'Seda de Aranha', description: 'Fio resistente usado em mantos encantados.', type: 'loot', icon: 'item_spider_silk', value: 30, stackable: true, maxStack: 100 },
  { id: 'bone_fragment', name: 'Fragmento de Osso', description: 'Restos de um guerreiro esquecido nas ruínas.', type: 'loot', icon: 'item_bone_fragment', value: 10, stackable: true, maxStack: 100 },
  { id: 'goblin_charm', name: 'Amuleto Tosco', description: 'Talismã goblin de osso. Raro e cobiçado.', type: 'loot', icon: 'item_goblin_charm', value: 70, stackable: true, maxStack: 100 },
];

export const ITEMS: Readonly<Record<string, ItemDef>> = Object.fromEntries(list.map((i) => [i.id, i]));
