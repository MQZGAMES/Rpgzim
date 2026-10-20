// Magias: exclusivas por vocação + cura e Corrida compartilhadas. Nomes e palavras são originais.
import type { SpellDef } from '../domain/entities/definitions';

const ALL = ['sorcerer', 'druid', 'paladin', 'knight'] as const;

const list: SpellDef[] = [
  {
    id: 'light_heal', name: 'Respiro Vital', words: 'vitae lumen', icon: 'spell_light_heal',
    description: 'Cura leve instantânea em si mesmo.', vocations: ALL, minLevel: 1, minMagicLevel: 0,
    manaCost: 20, cooldownMs: 2000, range: 0, target: 'self', effect: 'heal', element: 'holy',
    formula: { kind: 'magic', levelFactor: 0.6, powerFactor: 2, base: 22, min: 0.85, max: 1.15 },
    vfx: { impact: 'fx_heal', sfx: 'heal', color: '#4fd08a' },
  },
  {
    id: 'haste', name: 'Corrida', words: 'cursus', icon: 'spell_haste',
    description: 'Acelera seus passos por 8 segundos e desfaz qualquer lentidão em você.', vocations: ALL, minLevel: 3, minMagicLevel: 0,
    manaCost: 40, cooldownMs: 18000, range: 0, target: 'self', effect: 'buff', element: 'ice',
    buff: { kind: 'haste', value: 1.4, durationMs: 8000 }, cancelSlow: true,
    vfx: { impact: 'fx_haste', sfx: 'buff', color: '#a6dcfa' },
  },
  // ---------------------------------------------------------------- Sorcerer
  {
    id: 'arcane_bolt', name: 'Faísca Arcana', words: 'arca fulgor', icon: 'spell_arcane_bolt',
    description: 'Projétil de energia pura contra o alvo.', vocations: ['sorcerer'], minLevel: 1, minMagicLevel: 0,
    manaCost: 10, cooldownMs: 2000, range: 6, target: 'target', effect: 'damage', element: 'energy',
    formula: { kind: 'magic', levelFactor: 0.4, powerFactor: 1.8, base: 10, min: 0.8, max: 1.2 },
    vfx: { projectile: 'proj_energy', impact: 'fx_energy', sfx: 'energy', color: '#c08cff' },
  },
  {
    id: 'flame_lance', name: 'Lança de Chamas', words: 'ignis hasta', icon: 'spell_flame_lance',
    description: 'Dardo flamejante de alto dano em um único alvo.', vocations: ['sorcerer'], minLevel: 2, minMagicLevel: 1,
    manaCost: 25, cooldownMs: 4000, range: 5, target: 'target', effect: 'damage', element: 'fire',
    formula: { kind: 'magic', levelFactor: 0.5, powerFactor: 2.6, base: 20, min: 0.85, max: 1.2 },
    vfx: { projectile: 'proj_fire', impact: 'fx_fire', sfx: 'fire', color: '#f6953a' },
  },
  {
    id: 'fire_nova', name: 'Explosão Ígnea', words: 'ignis orbis', icon: 'spell_fire_nova',
    description: 'Onda de fogo que atinge todos os inimigos ao redor (raio 3).', vocations: ['sorcerer'], minLevel: 4, minMagicLevel: 2,
    manaCost: 45, cooldownMs: 8000, range: 0, radius: 3, target: 'areaSelf', effect: 'damage', element: 'fire',
    formula: { kind: 'magic', levelFactor: 0.5, powerFactor: 2.2, base: 15, min: 0.8, max: 1.2 },
    vfx: { impact: 'fx_fire', sfx: 'fire', color: '#f6953a' },
  },
  {
    id: 'mana_shield', name: 'Escudo de Mana', words: 'mana clipeus', icon: 'spell_mana_shield',
    description: 'Por 5 minutos, todo dano recebido é tirado da sua mana (enquanto houver). Um brilho azul envolve você.', vocations: ['sorcerer', 'druid'], minLevel: 6, minMagicLevel: 3,
    manaCost: 70, cooldownMs: 30000, range: 0, target: 'self', effect: 'buff', element: 'energy',
    buff: { kind: 'manaShield', value: 1, durationMs: 300000 },
    vfx: { impact: 'fx_mana_shield', sfx: 'buff', color: '#5aa8dd' },
  },
  // ---------------------------------------------------------------- Druid
  {
    id: 'earth_thorn', name: 'Espinho Telúrico', words: 'terra spina', icon: 'spell_earth_thorn',
    description: 'Espinhos de pedra irrompem sob o alvo.', vocations: ['druid'], minLevel: 1, minMagicLevel: 0,
    manaCost: 10, cooldownMs: 2000, range: 6, target: 'target', effect: 'damage', element: 'earth',
    formula: { kind: 'magic', levelFactor: 0.4, powerFactor: 1.8, base: 10, min: 0.8, max: 1.2 },
    vfx: { projectile: 'proj_earth', impact: 'fx_earth', sfx: 'earth', color: '#9ccc42' },
  },
  {
    id: 'frost_burst', name: 'Rajada Glacial', words: 'gelu ventus', icon: 'spell_frost_burst',
    description: 'Explosão de gelo no alvo e vizinhos (raio 1) que os deixa lentos.', vocations: ['druid'], minLevel: 2, minMagicLevel: 1,
    manaCost: 25, cooldownMs: 4500, range: 5, radius: 1, target: 'areaTarget', effect: 'damage', element: 'ice',
    formula: { kind: 'magic', levelFactor: 0.5, powerFactor: 2.4, base: 16, min: 0.85, max: 1.15 },
    slow: { factor: 0.5, durationMs: 3000 },
    vfx: { projectile: 'proj_ice', impact: 'fx_ice', sfx: 'ice', color: '#a6dcfa' },
  },
  {
    id: 'sap_blessing', name: 'Bênção da Seiva', words: 'silva vita', icon: 'spell_sap_blessing',
    description: 'Cura intensa e regeneração contínua por 10 segundos. Em grupo, cura também os membros a até 4 tiles.', vocations: ['druid'], minLevel: 4, minMagicLevel: 2, partyRadius: 4,
    manaCost: 40, cooldownMs: 6000, range: 0, target: 'self', effect: 'heal', element: 'earth',
    formula: { kind: 'magic', levelFactor: 0.8, powerFactor: 3.2, base: 40, min: 0.9, max: 1.1 },
    buff: { kind: 'regen', value: 6, durationMs: 10000 },
    vfx: { impact: 'fx_heal', sfx: 'heal', color: '#4fd08a' },
  },
  // ---------------------------------------------------------------- Paladin
  {
    id: 'holy_arrow', name: 'Flecha Sagrada', words: 'sanctus sagitta', icon: 'spell_holy_arrow',
    description: 'Projétil de luz que escala com Distance Fighting.', vocations: ['paladin'], minLevel: 1, minMagicLevel: 0,
    manaCost: 15, cooldownMs: 2000, range: 6, target: 'target', effect: 'damage', element: 'holy',
    formula: { kind: 'distance', levelFactor: 0.3, powerFactor: 0.65, base: 8, min: 0.85, max: 1.15 },
    vfx: { projectile: 'proj_holy', impact: 'fx_holy', sfx: 'holy', color: '#eec84a' },
  },
  {
    id: 'arrow_rain', name: 'Chuva de Flechas', words: 'imber sagittae', icon: 'spell_arrow_rain',
    description: 'Dispara uma saraivada sobre o alvo e vizinhos (raio 1). Gasta 3 flechas.', vocations: ['paladin'], minLevel: 2, minMagicLevel: 0,
    manaCost: 30, cooldownMs: 6000, range: 6, radius: 1, target: 'areaTarget', effect: 'damage', element: 'physical',
    formula: { kind: 'distance', levelFactor: 0.3, powerFactor: 0.6, base: 6, min: 0.8, max: 1.2 },
    ammoCost: 3, requiresWeapon: 'distance',
    vfx: { projectile: 'proj_arrow', impact: 'hit', sfx: 'bow', color: '#d4d9e2' },
  },
  {
    id: 'hunters_focus', name: 'Foco do Caçador', words: 'venator oculus', icon: 'spell_hunters_focus',
    description: 'Ataques 35% mais rápidos por 10 segundos.', vocations: ['paladin'], minLevel: 4, minMagicLevel: 1,
    manaCost: 40, cooldownMs: 20000, range: 0, target: 'self', effect: 'buff', element: 'holy',
    buff: { kind: 'attackSpeed', value: 0.35, durationMs: 10000 },
    vfx: { impact: 'fx_buff_focus', sfx: 'buff', color: '#5cbba8' },
  },
  {
    id: 'stunning_arrow', name: 'Flecha Atordoante', words: 'sagitta torpor', icon: 'spell_stunning_arrow',
    description: 'Disparo que atinge e deixa o alvo lento por 3,5 s: mantenha a distância. Gasta 1 flecha.', vocations: ['paladin'], minLevel: 4, minMagicLevel: 0,
    manaCost: 25, cooldownMs: 5000, range: 6, target: 'target', effect: 'damage', element: 'ice',
    ammoCost: 1, requiresWeapon: 'distance',
    formula: { kind: 'distance', levelFactor: 0.3, powerFactor: 0.6, base: 6, min: 0.85, max: 1.15 },
    slow: { factor: 0.4, durationMs: 3500 },
    vfx: { projectile: 'proj_arrow', impact: 'fx_ice', sfx: 'ice', color: '#a6dcfa' },
  },
  // ---------------------------------------------------------------- Knight
  {
    id: 'war_cry', name: 'Grito de Guerra', words: 'bellum clamor', icon: 'spell_war_cry',
    description: 'Berro que vira a atenção das criaturas em 5 tiles para você (dano leve). Ideal para proteger o grupo.', vocations: ['knight'], minLevel: 3, minMagicLevel: 0,
    manaCost: 25, cooldownMs: 2000, range: 0, radius: 5, target: 'areaSelf', effect: 'damage', element: 'physical',
    attract: true,
    formula: { kind: 'melee', levelFactor: 0.1, powerFactor: 0.3, base: 2, min: 0.8, max: 1.2 },
    vfx: { impact: 'fx_whirl', sfx: 'whirl', color: '#e0b03a' },
  },
  {
    id: 'brutal_strike', name: 'Golpe Brutal', words: 'fortis ictus', icon: 'spell_brutal_strike',
    description: 'Golpe corpo a corpo poderoso no alvo adjacente.', vocations: ['knight'], minLevel: 1, minMagicLevel: 0,
    manaCost: 15, cooldownMs: 3000, range: 1, target: 'target', effect: 'damage', element: 'physical',
    formula: { kind: 'melee', levelFactor: 0.35, powerFactor: 1.05, base: 8, min: 0.8, max: 1.2 },
    requiresWeapon: 'melee',
    vfx: { impact: 'fx_brutal', sfx: 'brutal', color: '#ea7454' },
  },
  {
    id: 'steel_whirlwind', name: 'Redemoinho de Aço', words: 'ferrum turbo', icon: 'spell_steel_whirlwind',
    description: 'Giro com a arma que atinge todos os inimigos adjacentes.', vocations: ['knight'], minLevel: 2, minMagicLevel: 0,
    manaCost: 30, cooldownMs: 2000, range: 0, radius: 1, target: 'areaSelf', effect: 'damage', element: 'physical',
    formula: { kind: 'melee', levelFactor: 0.25, powerFactor: 0.75, base: 4, min: 0.8, max: 1.2 },
    requiresWeapon: 'melee',
    vfx: { impact: 'fx_whirl', sfx: 'whirl', color: '#b8c2d3' },
  },
  {
    id: 'iron_roar', name: 'Brado de Ferro', words: 'ferrum clamor', icon: 'spell_iron_roar',
    description: 'Reduz em 35% todo dano recebido por 8 segundos.', vocations: ['knight'], minLevel: 4, minMagicLevel: 0,
    manaCost: 25, cooldownMs: 18000, range: 0, target: 'self', effect: 'buff', element: 'physical',
    buff: { kind: 'defense', value: 0.35, durationMs: 8000 },
    vfx: { impact: 'fx_buff_iron', sfx: 'buff', color: '#b8c2d3' },
  },
];

export const SPELLS: Readonly<Record<string, SpellDef>> = Object.fromEntries(list.map((s) => [s.id, s]));
