// Troféus das criaturas das faixas tardias (nível 44+). Dados puros (sem imports): usados pelos itens e pelo gerador de
// ícones. O valor é calculado em monsters.late.ts a partir do ouro da faixa.
export type TrophyShape =
  'fang' | 'claw' | 'scale' | 'dust' | 'eye' | 'heart' | 'gem' | 'hide' | 'horn' | 'shard' | 'ember' | 'rune';

export interface Trophy {
  id: string;
  name: string;
  description: string;
  shape: TrophyShape;
  /** Rampa de cor do ícone (escuro → claro). */
  ramp: readonly string[];
}

export const TROPHIES: readonly Trophy[] = [
  {
    id: 'dire_fang',
    name: 'Presa Atroz',
    description: 'Dente de um lobo gigante, manchado de vermelho.',
    shape: 'fang',
    ramp: ['#2a0c10', '#521420', '#8a2030', '#c04050', '#e88090', '#ffd0d8'],
  },
  {
    id: 'ogre_horn',
    name: 'Chifre de Ogro',
    description: 'Maciço e rachado; ferreiros pagam bem.',
    shape: 'horn',
    ramp: ['#241a10', '#46321c', '#6e5230', '#a07c48', '#d0aa70', '#f4e0b0'],
  },
  {
    id: 'elder_claw',
    name: 'Garra Ancestral',
    description: 'Garra de urso milenar, branca como osso.',
    shape: 'claw',
    ramp: ['#3a4048', '#68727c', '#98a4ae', '#c4ced6', '#e8eff4', '#ffffff'],
  },
  {
    id: 'knight_rune',
    name: 'Runa Esquelética',
    description: 'Runa de comando gravada em osso.',
    shape: 'rune',
    ramp: ['#2a2230', '#4a3c58', '#74628a', '#a898c0', '#d4c8e4', '#f4f0fa'],
  },
  {
    id: 'scorpion_gland',
    name: 'Glândula Rubra',
    description: 'Veneno concentrado; alquimistas disputam.',
    shape: 'heart',
    ramp: ['#3a0a0c', '#701418', '#a82028', '#dc4048', '#f88080', '#ffc8c8'],
  },
  {
    id: 'warlord_banner',
    name: 'Estandarte de Guerra',
    description: 'Trapo de comando de um senhor da guerra orc.',
    shape: 'hide',
    ramp: ['#2c1410', '#50281c', '#7e4430', '#b06848', '#d89870', '#f4cca8'],
  },
  {
    id: 'ice_scale',
    name: 'Escama de Gelo',
    description: 'Nunca derrete. Brilha como cristal.',
    shape: 'scale',
    ramp: ['#102a4a', '#1e4c80', '#3a7cc0', '#78b4e8', '#b4dcff', '#f0faff'],
  },
  {
    id: 'wraith_dust',
    name: 'Essência Espectral',
    description: 'Poeira fria que sussurra.',
    shape: 'dust',
    ramp: ['#0c2a30', '#18505a', '#2c8090', '#58b4c0', '#98e0e8', '#e0fcff'],
  },
  {
    id: 'behemoth_hide',
    name: 'Couro de Behemoth',
    description: 'Grosso como muralha.',
    shape: 'hide',
    ramp: ['#241c24', '#463a46', '#6c5c6c', '#9a8a9a', '#c4b4c4', '#eadcea'],
  },
  {
    id: 'death_emblem',
    name: 'Emblema da Morte',
    description: 'Insígnia dos cavaleiros da cripta.',
    shape: 'gem',
    ramp: ['#1a1022', '#34204a', '#5a3a80', '#8a60b8', '#bc94e0', '#e8d4fa'],
  },
  {
    id: 'drake_ember',
    name: 'Brasa de Draco',
    description: 'Ainda queima ao toque.',
    shape: 'ember',
    ramp: ['#4a1408', '#8a2a10', '#d85a1c', '#f89030', '#ffc860', '#fff0b0'],
  },
  {
    id: 'golem_core',
    name: 'Núcleo de Golem',
    description: 'Pedra viva que pulsa devagar.',
    shape: 'shard',
    ramp: ['#242830', '#444a58', '#68707e', '#9098a8', '#bcc4d4', '#e8eef8'],
  },
  {
    id: 'demon_eye',
    name: 'Olho Infernal',
    description: 'Pisca quando ninguém olha.',
    shape: 'eye',
    ramp: ['#3a0808', '#7a1010', '#c01818', '#f04030', '#ff9060', '#ffe0a0'],
  },
  {
    id: 'archlich_phylactery',
    name: 'Filactério',
    description: 'Guarda a alma de um arquilich.',
    shape: 'gem',
    ramp: ['#1a0c2c', '#3a1c5c', '#6a34a0', '#9c5ccc', '#cc90f0', '#f4d8ff'],
  },
  {
    id: 'elder_dragon_scale',
    name: 'Escama Ancestral',
    description: 'Escama de um dragão de eras esquecidas.',
    shape: 'scale',
    ramp: ['#1c0c2c', '#3c1c58', '#6c34a0', '#a05ad0', '#d090f4', '#f6dcff'],
  },
  {
    id: 'void_shard',
    name: 'Fragmento do Vazio',
    description: 'Fenda minúscula para o nada.',
    shape: 'shard',
    ramp: ['#04040c', '#101028', '#241c54', '#4a3a94', '#8070d0', '#c8c0fa'],
  },
];

/** Troféus das criaturas das Terras do Sul (monsters.south.ts). */
export const SOUTH_TROPHIES: readonly Trophy[] = [
  {
    id: 'bog_ooze',
    name: 'Lodo do Brejo',
    description: 'Gosma escura; alquimistas usam em unguentos.',
    shape: 'dust',
    ramp: ['#1e1430', '#3a2a40', '#5a4448', '#7e6650', '#a88c70', '#d4bea0'],
  },
  {
    id: 'toad_gland',
    name: 'Glândula de Sapo-Boi',
    description: 'Ainda pulsa; vale bem na Alquimia.',
    shape: 'heart',
    ramp: ['#1c2414', '#34401e', '#56602a', '#7e8438', '#aaac58', '#d8d890'],
  },
  {
    id: 'cave_silk',
    name: 'Seda das Cavernas',
    description: 'Fio grosso e resistente como corda.',
    shape: 'dust',
    ramp: ['#14242a', '#24404a', '#3a6068', '#5a8a8a', '#8ab8b0', '#c8e8e0'],
  },
  {
    id: 'widow_fang',
    name: 'Presa de Viúva-Negra',
    description: 'Gotejando veneno; manuseie com cuidado.',
    shape: 'fang',
    ramp: ['#160c12', '#2c1018', '#561420', '#8a2030', '#c04050', '#f09098'],
  },
  {
    id: 'hyena_pelt',
    name: 'Couro de Hiena',
    description: 'Malhado e áspero; o curtidor paga bem.',
    shape: 'hide',
    ramp: ['#2a1c10', '#4a3420', '#70522e', '#9a7844', '#c4a468', '#ecd4a0'],
  },
  {
    id: 'armored_plate',
    name: 'Placa Couraçada',
    description: 'Pedaço do couro do javali, duro como escudo.',
    shape: 'scale',
    ramp: ['#22222a', '#3a3c48', '#58607a', '#7e88a0', '#aab4c8', '#dae0ec'],
  },
  {
    id: 'cave_claw',
    name: 'Garra das Cavernas',
    description: 'Negra e afiada como obsidiana.',
    shape: 'claw',
    ramp: ['#100c10', '#221a1c', '#3a2c2a', '#5a4438', '#86684e', '#b8987a'],
  },
  {
    id: 'wyvern_scale',
    name: 'Escama de Serpe',
    description: 'Verde-esmeralda; brilha contra a luz.',
    shape: 'scale',
    ramp: ['#0c2014', '#16381e', '#22582a', '#3a8a3a', '#6cbc5a', '#b0eaa0'],
  },
  {
    id: 'basilisk_eye',
    name: 'Olho de Basilisco',
    description: 'Mesmo seco, ninguém consegue encará-lo por muito tempo.',
    shape: 'eye',
    ramp: ['#1a2010', '#2e3a14', '#4c5c1c', '#7a8a28', '#b4c040', '#eef088'],
  },
  {
    id: 'storm_fang',
    name: 'Presa Elétrica',
    description: 'Solta faíscas ao toque.',
    shape: 'fang',
    ramp: ['#10183a', '#1c2c66', '#2c4a9c', '#4a7ad0', '#8ab4f4', '#dceaff'],
  },
  {
    id: 'crystal_shard',
    name: 'Lasca de Cristal',
    description: 'Fria como gelo eterno; joalheiros disputam.',
    shape: 'shard',
    ramp: ['#14304e', '#285c8a', '#4a8ac0', '#7ab8e4', '#b4e0f8', '#f0faff'],
  },
  {
    id: 'magma_core',
    name: 'Núcleo de Magma',
    description: 'Ainda quente; serve de combustível eterno.',
    shape: 'ember',
    ramp: ['#3a0c08', '#7a1a0c', '#c03a14', '#ee6a24', '#ffa840', '#ffe090'],
  },
];
