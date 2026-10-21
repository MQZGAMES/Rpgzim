// Faixas de equipamento do nível 24 ao 100. Dados puros (sem imports): usados pelos itens do jogo e pelo gerador de
// ícones (scripts/art). Cada faixa é um material; o poder cresce por fórmula (ver items.gear.ts).
export interface GearTier {
  /** Sufixo estável dos ids: sword_obsidian, armor_obsidian... */
  id: string;
  /** Nome do material ("Espada de Obsidiana"). */
  name: string;
  /** Nível mínimo dos itens da faixa. */
  level: number;
  /** Rampa de cor do ícone, do escuro ao claro. */
  ramp: readonly string[];
}

export const GEAR_TIERS: readonly GearTier[] = [
  { id: 'obsidian', name: 'Obsidiana', level: 24, ramp: ['#14101c', '#2a2038', '#463a5e', '#6a5a8a', '#968ab8', '#c8c0e0'] },
  { id: 'mithril', name: 'Mitral', level: 32, ramp: ['#1a3038', '#2f5560', '#4a8590', '#78bcc4', '#a8e0e4', '#e0fafa'] },
  { id: 'adamant', name: 'Adamante', level: 40, ramp: ['#0e2a22', '#1a4a3c', '#2a7860', '#46a888', '#78d4b0', '#c0f4dc'] },
  { id: 'orichalcum', name: 'Orichalco', level: 48, ramp: ['#3a1c0c', '#6a3414', '#a85a20', '#d88a38', '#f4b860', '#fde4a8'] },
  { id: 'crystal', name: 'Cristal', level: 56, ramp: ['#1c2c58', '#34549a', '#5a88d8', '#94bef4', '#c8e2ff', '#f4faff'] },
  { id: 'ebony', name: 'Ébano', level: 64, ramp: ['#0c0c10', '#1c1c26', '#34344a', '#54546e', '#7c7c9c', '#aeaed0'] },
  { id: 'ruby', name: 'Rubi', level: 72, ramp: ['#3a0810', '#6e1020', '#a81c34', '#dc3a50', '#f87488', '#ffc0cc'] },
  { id: 'stellar', name: 'Estrela Cadente', level: 80, ramp: ['#1c1c40', '#34347a', '#5a5ab8', '#9494f0', '#d0d0ff', '#ffffff'] },
  { id: 'abyssal', name: 'Abismo', level: 88, ramp: ['#04101c', '#082038', '#103a5e', '#1c5c8c', '#2e86bc', '#5cbce8'] },
  { id: 'celestial', name: 'Luz Celeste', level: 96, ramp: ['#5a4a1a', '#a08828', '#e0c444', '#fff088', '#fffbc8', '#ffffff'] },
  { id: 'primordial', name: 'Primórdio', level: 100, ramp: ['#2a0a3a', '#5a1a7a', '#a02ab0', '#e048c8', '#ff88e0', '#ffd0f4'] },
];

/** Tipos de peça de cada faixa e como o ícone é desenhado (ver scripts/art/icons.ts). */
export const GEAR_KINDS = ['sword', 'axe', 'bow', 'wand', 'rod', 'shield', 'spellbook', 'helmet', 'armor', 'armor_ranger', 'robe', 'hat', 'legs', 'legs_mage', 'boots', 'ring_power', 'ring_wisdom', 'amulet_guard', 'amulet_mage'] as const;
export type GearKind = (typeof GEAR_KINDS)[number];

/** Munição avançada (ícone de flecha com a rampa indicada). */
export const ARROW_TIERS = [
  { id: 'arrow_crystal', name: 'Flecha de Cristal', attack: 4, value: 14, ramp: 'crystal' },
  { id: 'arrow_abyssal', name: 'Flecha do Abismo', attack: 7, value: 40, ramp: 'abyssal' },
  { id: 'arrow_celestial', name: 'Flecha Celeste', attack: 11, value: 110, ramp: 'celestial' },
] as const;
