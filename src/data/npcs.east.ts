// As duas vilas da expansão leste: Forte Esperança (equipamento do nível 24 ao 56) e Cidadela Celeste (64 ao 100).
// Cada vila tem sacerdote (bênção), ferreiro, arcanista, alquimista e banqueiro; o depósito é o mesmo de Pedraluz.
import type { NpcDef, ShopDef } from '../domain/entities/definitions';
import { GEAR_ITEMS } from './items.gear';
import { GEAR_TIERS, ARROW_TIERS } from './gearTiers';
import { ITEMS } from './items';

const close = { label: 'Até logo', action: 'close' } as const;
const sellPct = (price: number) => Math.max(1, Math.round(price * 0.35));

interface Town {
  id: string;
  name: string;
  /** Faixas de equipamento (índices em GEAR_TIERS) vendidas aqui. */
  tiers: readonly number[];
  arrows: readonly string[];
  potions: readonly [string, number][];
  smith: string;
  arcana: string;
  alchemist: string;
  banker: string;
  priest: string;
}

const FIGHTER_KINDS = ['sword', 'axe', 'bow', 'shield', 'helmet', 'armor', 'armor_ranger', 'legs', 'boots', 'ring_power', 'amulet_guard'];
const MAGE_KINDS = ['wand', 'rod', 'spellbook', 'robe', 'hat', 'legs_mage', 'boots', 'ring_wisdom', 'amulet_mage'];

const TOWNS: Town[] = [
  {
    id: 'e',
    name: 'Forte Esperança',
    tiers: [0, 1, 2, 3, 4],
    arrows: ['arrow_crystal'],
    potions: [['potion_health_great', 110], ['potion_health_supreme', 260], ['potion_health_spirit', 520], ['potion_mana_great', 120], ['potion_mana_supreme', 270], ['potion_mana_spirit', 540]],
    smith: 'Capitão Brasa',
    arcana: 'Arcanista Lúmen',
    alchemist: 'Alquimista Vero',
    banker: 'Banqueiro Dória',
    priest: 'Irmã Alvorada',
  },
  {
    id: 'f',
    name: 'Cidadela Celeste',
    tiers: [5, 6, 7, 8, 9, 10],
    arrows: ['arrow_abyssal', 'arrow_celestial'],
    potions: [['potion_health_spirit', 520], ['potion_health_divine', 1100], ['potion_mana_spirit', 540], ['potion_mana_divine', 1100]],
    smith: 'Mestre Aurum',
    arcana: 'Sábia Celestina',
    alchemist: 'Alquimista Nox',
    banker: 'Banqueira Cinza',
    priest: 'Sumo Sacerdote Elion',
  },
];

function npcsOf(t: Town): NpcDef[] {
  const base = (id: string, name: string, title: string, sprite: string, extra: Partial<NpcDef>, text: string, options: NpcDef['dialog'][number]['options']): NpcDef => ({
    id: `${t.id}_${id}`,
    name,
    title,
    sprite,
    wanderRadius: 0,
    greeting: 'Seja bem-vindo!',
    ...extra,
    dialog: [{ id: 'start', text, options }],
  });
  return [
    base('priest', t.priest, `Santuário de ${t.name}`, 'npc_priest', {}, `Que a Aurora o proteja em ${t.name}! Posso curar suas feridas.`, [{ label: 'Peço uma bênção', action: 'heal' }, close]),
    base('smith', t.smith, 'Armas e armaduras', 'npc_smith', { shopId: `${t.id}_smith` }, 'Aço de lugares onde poucos chegam. Também compro equipamento usado.', [{ label: 'Ver mercadorias', action: 'openShop' }, close]),
    base('arcana', t.arcana, 'Varinhas, cajados e mantos', 'npc_alchemist', { shopId: `${t.id}_arcana` }, 'Artefatos para quem domina a magia.', [{ label: 'Ver mercadorias', action: 'openShop' }, close]),
    base('alchemist', t.alchemist, 'Poções e troféus', 'npc_merchant', { shopId: `${t.id}_alchemy` }, 'Poções fortes e todo tipo de troféu das criaturas da região.', [{ label: 'Negociar', action: 'openShop' }, close]),
    base('banker', t.banker, `Banco de ${t.name}`, 'npc_banker', {}, 'Seu depósito é o mesmo de Pedraluz: o que guardar aqui, retira em qualquer banco.', [{ label: 'Abrir depósito', action: 'openDepot' }, close]),
  ];
}

function shopsOf(t: Town): ShopDef[] {
  const pick = (kinds: string[]) => GEAR_ITEMS.filter((i) => t.tiers.some((k) => kinds.some((kind) => i.id === `${kind}_${GEAR_TIERS[k]!.id}`)));
  const fighter = pick(FIGHTER_KINDS);
  const mage = pick(MAGE_KINDS);
  const arrows = t.arrows.map((id) => {
    const a = ARROW_TIERS.find((x) => x.id === id)!;
    return { itemId: a.id, price: a.value };
  });
  const gearShop = (id: string, name: string, items: typeof fighter, extraSells: { itemId: string; price: number }[] = []): ShopDef => ({
    id,
    name,
    sells: [...items.map((i) => ({ itemId: i.id, price: i.value })), ...extraSells, { itemId: 'amulet_loss', price: 10000 }],
    // compra qualquer equipamento (de qualquer faixa), para o herói não ficar com a mochila entupida de peças antigas
    buys: Object.values(ITEMS)
      .filter((i) => !!i.slot && !i.id.startsWith('training_') && i.value > 0)
      .map((i) => ({ itemId: i.id, price: sellPct(i.value) })),
  });
  return [
    gearShop(`${t.id}_smith`, `Ferraria de ${t.name}`, fighter, arrows),
    gearShop(`${t.id}_arcana`, `Arcana de ${t.name}`, mage),
    {
      id: `${t.id}_alchemy`,
      name: `Alquimia de ${t.name}`,
      sells: [...t.potions.map(([itemId, price]) => ({ itemId, price })), { itemId: 'amulet_loss', price: 10000 }],
      // compra todos os troféus pelo valor cheio (o loot é a renda principal nesses níveis)
      buys: Object.values(ITEMS)
        .filter((i) => i.type === 'loot')
        .map((i) => ({ itemId: i.id, price: i.value })),
    },
  ];
}

/** Portais: Pedraluz (p), Forte Esperança (e) e Cidadela Celeste (f). A ida para as vilas novas custa ouro e exige nível; a volta é de graça. */
const PORTAL_NAMES = { p: 'Portal de Pedraluz', e: 'Portal do Forte Esperança', f: 'Portal da Cidadela Celeste' } as const;
const DEST_LABEL = { p: 'Pedraluz', e: 'Forte Esperança', f: 'Cidadela Celeste' } as const;
const PORTAL_ROUTES: Record<'p' | 'e' | 'f', { to: 'p' | 'e' | 'f'; price: number; minLevel?: number }[]> = {
  p: [{ to: 'e', price: 300, minLevel: 24 }, { to: 'f', price: 1500, minLevel: 56 }],
  e: [{ to: 'p', price: 0 }, { to: 'f', price: 1000, minLevel: 56 }],
  f: [{ to: 'p', price: 0 }, { to: 'e', price: 0 }],
};
const PORTAL_NPCS: NpcDef[] = (['p', 'e', 'f'] as const).map((k) => ({
  id: `${k}_portal`,
  name: 'Guardião do Portal',
  title: PORTAL_NAMES[k],
  sprite: 'npc_guard',
  wanderRadius: 0,
  greeting: 'Para onde vai, viajante?',
  dialog: [
    {
      id: 'start',
      text: 'Estes portais antigos ligam as vilas. Os caminhos por terra atravessam territórios de criaturas terríveis; a travessia é muito mais segura.',
      options: [
        ...PORTAL_ROUTES[k].map((r) => ({
          label: `${DEST_LABEL[r.to]} — ${r.price ? `${r.price} de ouro` : 'grátis'}${r.minLevel ? ` (nível ${r.minLevel}+)` : ''}`,
          action: 'travel' as const,
          travelTo: `${r.to}_portal`,
          price: r.price,
          minLevel: r.minLevel,
        })),
        close,
      ],
    },
  ],
}));

export const EAST_NPCS: NpcDef[] = [...TOWNS.flatMap(npcsOf), ...PORTAL_NPCS];
export const EAST_SHOPS: ShopDef[] = TOWNS.flatMap(shopsOf);
