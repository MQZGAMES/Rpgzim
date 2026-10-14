// NPCs, diálogos e lojas.
import type { NpcDef, ShopDef } from '../domain/entities/definitions';

const close = { label: 'Até logo', action: 'close' } as const;

const list: NpcDef[] = [
  {
    id: 'priest',
    name: 'Sacerdote Oriel',
    title: 'Guardião do Templo',
    sprite: 'npc_priest',
    wanderRadius: 0,
    greeting: 'Bem-vindo, viajante!',
    dialog: [
      {
        id: 'start',
        text: 'Que a Aurora o guie! Você despertou no Templo de Pedraluz. Aqui ninguém pode atacá-lo. Posso ensinar o básico?',
        options: [
          { label: 'Como me movo?', action: 'next', goto: 'move' },
          { label: 'Como lutar?', action: 'next', goto: 'combat' },
          { label: 'Magias e evolução', action: 'next', goto: 'progress' },
          { label: 'Peço uma bênção', action: 'heal' },
          close,
        ],
      },
      {
        id: 'move',
        text: 'No celular, arraste o polegar no lado esquerdo da tela (joystick) ou toque no chão para caminhar até lá. No computador, use WASD ou as setas. Portas abrem sozinhas quando você se aproxima.',
        options: [{ label: 'E o combate?', action: 'next', goto: 'combat' }, close],
      },
      {
        id: 'combat',
        text: 'Toque em um monstro (ou use o botão de alvo / Tab) para selecioná-lo. Você atacará automaticamente enquanto ele estiver ao alcance da sua arma. A área de caça fica a leste, passando o portão da vila.',
        options: [{ label: 'E as magias?', action: 'next', goto: 'progress' }, close],
      },
      {
        id: 'progress',
        text: 'Magias gastam mana e têm recarga; use a barra de magias ou as teclas 1 a 4. Lutar evolui suas skills, conjurar evolui seu Magic Level e derrotar monstros dá experiência. Venda o loot na vila e compre equipamentos melhores!',
        options: [{ label: 'Peço uma bênção', action: 'heal' }, close],
      },
    ],
  },
  {
    id: 'smith',
    name: 'Mestre Ferraz',
    title: 'Ferreiro',
    sprite: 'npc_smith',
    shopId: 'equipment',
    wanderRadius: 0,
    greeting: 'Aço bom, preço justo!',
    dialog: [
      {
        id: 'start',
        text: 'O martelo não para! Armas, escudos e armaduras para qualquer vocação. Também compro equipamentos usados.',
        options: [{ label: 'Ver mercadorias', action: 'openShop' }, close],
      },
    ],
  },
  {
    id: 'alchemist',
    name: 'Alquimista Selene',
    title: 'Poções e artefatos',
    sprite: 'npc_alchemist',
    shopId: 'potions',
    wanderRadius: 0,
    greeting: 'Cuidado com o caldeirão!',
    dialog: [
      {
        id: 'start',
        text: 'Poções de vida e mana, varinhas, cajados e acessórios encantados. Gosma de musgo também me interessa.',
        options: [{ label: 'Ver mercadorias', action: 'openShop' }, close],
      },
    ],
  },
  {
    id: 'merchant',
    name: 'Mercador Ilário',
    title: 'Mercador',
    sprite: 'npc_merchant',
    shopId: 'general',
    wanderRadius: 0,
    greeting: 'Compro tudo que você caçar!',
    dialog: [
      {
        id: 'start',
        text: 'Presas, couros, orelhas de goblin... compro todo tipo de despojo. E vendo flechas e mantimentos.',
        options: [{ label: 'Negociar', action: 'openShop' }, close],
      },
    ],
  },
  {
    id: 'guard',
    name: 'Guarda Tomé',
    title: 'Sentinela do portão leste',
    sprite: 'npc_guard',
    wanderRadius: 0,
    greeting: 'Alto lá! Ah, é você.',
    dialog: [
      {
        id: 'start',
        text: 'Depois deste portão começa o Bosque Selvagem: slimes perto da trilha, javalis ao norte e um acampamento goblin ao sul, com seu chefe. Mais ao sul ficam as Colinas dos Lobos e as Ruínas Antigas. Pelo portão sul da vila chega-se ao Pântano Sombrio. A vila é segura: os monstros não passam das cercas.',
        options: [close],
      },
    ],
  },
  {
    id: 'farmer',
    name: 'Seu Joaquim',
    title: 'Fazendeiro',
    sprite: 'npc_farmer',
    wanderRadius: 3,
    greeting: 'Bom dia!',
    dialog: [
      {
        id: 'start',
        text: 'Os javalis andam arrancando minhas cercas. Se trouxer carne de javali, o mercador da praça paga bem!',
        options: [close],
      },
    ],
  },
  {
    id: 'villager',
    name: 'Dona Rosa',
    title: 'Moradora',
    sprite: 'npc_villager',
    wanderRadius: 2,
    greeting: 'Entre, a casa é sua!',
    dialog: [
      {
        id: 'start',
        text: 'Pode explorar as casas da vila à vontade. Dica: quando estiver com pouca vida, volte ao templo e peça uma bênção ao Sacerdote Oriel.',
        options: [close],
      },
    ],
  },
];

export const NPCS: Readonly<Record<string, NpcDef>> = Object.fromEntries(list.map((n) => [n.id, n]));

const sellPct = (price: number) => Math.max(1, Math.round(price * 0.35));
const equipmentSells: [string, number][] = [
  ['sword_short', 60],
  ['axe_hand', 95],
  ['club_wood', 25],
  ['mace_iron', 280],
  ['sword_iron', 340],
  ['axe_battle', 520],
  ['bow_hunting', 130],
  ['spear_throwing', 95],
  ['bow_composite', 560],
  ['shield_wood', 45],
  ['shield_iron', 320],
  ['helmet_leather', 35],
  ['helmet_iron', 190],
  ['armor_leather', 75],
  ['armor_chain', 320],
  ['legs_leather', 40],
  ['legs_chain', 240],
  ['boots_leather', 30],
  ['boots_swift', 650],
];
const potionSells: [string, number][] = [
  ['potion_health', 40],
  ['potion_mana', 45],
  ['potion_health_great', 110],
  ['potion_mana_great', 120],
  ['wand_ember', 150],
  ['rod_sprout', 150],
  ['wand_storm', 760],
  ['rod_frost', 760],
  ['spellbook', 220],
  ['hat_mage', 95],
  ['robe_apprentice', 130],
  ['robe_druid', 130],
  ['ring_vigor', 380],
  ['amulet_mana', 420],
];

const list2: ShopDef[] = [
  {
    id: 'equipment',
    name: 'Ferraria de Pedraluz',
    sells: equipmentSells.map(([itemId, price]) => ({ itemId, price })),
    buys: [...equipmentSells.map(([itemId, price]) => ({ itemId, price: sellPct(price) })), { itemId: 'dagger', price: 10 }],
  },
  {
    id: 'potions',
    name: 'Alquimia da Selene',
    sells: potionSells.map(([itemId, price]) => ({ itemId, price })),
    buys: [
      ...potionSells.filter(([id]) => !id.startsWith('potion')).map(([itemId, price]) => ({ itemId, price: sellPct(price) })),
      { itemId: 'slime_gel', price: 5 },
      { itemId: 'goblin_charm', price: 70 },
      { itemId: 'toad_venom', price: 14 },
      { itemId: 'spider_silk', price: 30 },
    ],
  },
  {
    id: 'general',
    name: 'Banca do Ilário',
    sells: [
      { itemId: 'arrow', price: 2 },
      { itemId: 'meat', price: 8 },
      { itemId: 'potion_health', price: 45 },
    ],
    buys: [
      { itemId: 'boar_tusk', price: 18 },
      { itemId: 'boar_hide', price: 12 },
      { itemId: 'goblin_ear', price: 20 },
      { itemId: 'goblin_charm', price: 65 },
      { itemId: 'slime_gel', price: 4 },
      { itemId: 'meat', price: 3 },
      { itemId: 'dagger', price: 9 },
      { itemId: 'wolf_pelt', price: 22 },
      { itemId: 'bone_fragment', price: 10 },
    ],
  },
];

export const SHOPS: Readonly<Record<string, ShopDef>> = Object.fromEntries(list2.map((s) => [s.id, s]));
