// Troféus das criaturas das faixas tardias (nível 44+). Dados puros (sem imports): usados pelos itens e pelo gerador de
// ícones. O valor é calculado em monsters.late.ts a partir do ouro da faixa.
export type TrophyShape = 'fang' | 'claw' | 'scale' | 'dust' | 'eye' | 'heart' | 'gem' | 'hide' | 'horn' | 'shard' | 'ember' | 'rune';

export interface Trophy {
  id: string;
  name: string;
  description: string;
  shape: TrophyShape;
  /** Rampa de cor do ícone (escuro → claro). */
  ramp: readonly string[];
}

export const TROPHIES: readonly Trophy[] = [
  { id: 'dire_fang', name: 'Presa Atroz', description: 'Dente de um lobo gigante, manchado de vermelho.', shape: 'fang', ramp: ['#2a0c10', '#521420', '#8a2030', '#c04050', '#e88090', '#ffd0d8'] },
  { id: 'ogre_horn', name: 'Chifre de Ogro', description: 'Maciço e rachado; ferreiros pagam bem.', shape: 'horn', ramp: ['#241a10', '#46321c', '#6e5230', '#a07c48', '#d0aa70', '#f4e0b0'] },
  { id: 'elder_claw', name: 'Garra Ancestral', description: 'Garra de urso milenar, branca como osso.', shape: 'claw', ramp: ['#3a4048', '#68727c', '#98a4ae', '#c4ced6', '#e8eff4', '#ffffff'] },
  { id: 'knight_rune', name: 'Runa Esquelética', description: 'Runa de comando gravada em osso.', shape: 'rune', ramp: ['#2a2230', '#4a3c58', '#74628a', '#a898c0', '#d4c8e4', '#f4f0fa'] },
  { id: 'scorpion_gland', name: 'Glândula Rubra', description: 'Veneno concentrado; alquimistas disputam.', shape: 'heart', ramp: ['#3a0a0c', '#701418', '#a82028', '#dc4048', '#f88080', '#ffc8c8'] },
  { id: 'warlord_banner', name: 'Estandarte de Guerra', description: 'Trapo de comando de um senhor da guerra orc.', shape: 'hide', ramp: ['#2c1410', '#50281c', '#7e4430', '#b06848', '#d89870', '#f4cca8'] },
  { id: 'ice_scale', name: 'Escama de Gelo', description: 'Nunca derrete. Brilha como cristal.', shape: 'scale', ramp: ['#102a4a', '#1e4c80', '#3a7cc0', '#78b4e8', '#b4dcff', '#f0faff'] },
  { id: 'wraith_dust', name: 'Essência Espectral', description: 'Poeira fria que sussurra.', shape: 'dust', ramp: ['#0c2a30', '#18505a', '#2c8090', '#58b4c0', '#98e0e8', '#e0fcff'] },
  { id: 'behemoth_hide', name: 'Couro de Behemoth', description: 'Grosso como muralha.', shape: 'hide', ramp: ['#241c24', '#463a46', '#6c5c6c', '#9a8a9a', '#c4b4c4', '#eadcea'] },
  { id: 'death_emblem', name: 'Emblema da Morte', description: 'Insígnia dos cavaleiros da cripta.', shape: 'gem', ramp: ['#1a1022', '#34204a', '#5a3a80', '#8a60b8', '#bc94e0', '#e8d4fa'] },
  { id: 'drake_ember', name: 'Brasa de Draco', description: 'Ainda queima ao toque.', shape: 'ember', ramp: ['#4a1408', '#8a2a10', '#d85a1c', '#f89030', '#ffc860', '#fff0b0'] },
  { id: 'golem_core', name: 'Núcleo de Golem', description: 'Pedra viva que pulsa devagar.', shape: 'shard', ramp: ['#242830', '#444a58', '#68707e', '#9098a8', '#bcc4d4', '#e8eef8'] },
  { id: 'demon_eye', name: 'Olho Infernal', description: 'Pisca quando ninguém olha.', shape: 'eye', ramp: ['#3a0808', '#7a1010', '#c01818', '#f04030', '#ff9060', '#ffe0a0'] },
  { id: 'archlich_phylactery', name: 'Filactério', description: 'Guarda a alma de um arquilich.', shape: 'gem', ramp: ['#1a0c2c', '#3a1c5c', '#6a34a0', '#9c5ccc', '#cc90f0', '#f4d8ff'] },
  { id: 'elder_dragon_scale', name: 'Escama Ancestral', description: 'Escama de um dragão de eras esquecidas.', shape: 'scale', ramp: ['#1c0c2c', '#3c1c58', '#6c34a0', '#a05ad0', '#d090f4', '#f6dcff'] },
  { id: 'void_shard', name: 'Fragmento do Vazio', description: 'Fenda minúscula para o nada.', shape: 'shard', ramp: ['#04040c', '#101028', '#241c54', '#4a3a94', '#8070d0', '#c8c0fa'] },
];
