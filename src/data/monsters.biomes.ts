// Criaturas dos biomas (nov/2026): preenchem as faixas de nível em que um bioma ficava sem criatura própria.
// Estatísticas pela escada de força (faixa e passo, como as demais); o loot reaproveita o de uma espécie parecida da
// mesma faixa (troféu, poções e equipamento), para não criar itens novos só para elas.
//
//   Chacal da Savana       savana (leste, anel 2)        nível  9 — mesma faixa do Lobo Cinzento
//   Saqueador do Deserto   savana (leste, anel 2)        nível 15 — o bandido do deserto
//   Crocodilo do Brejo     selva alagada (sul, anel 3)   nível 23
//   Múmia                  ruínas do deserto (leste, 3)  nível 34
//   Yeti                   tundra (norte, anel 3)        nível 39
//   Colosso de Gelo        pico do inverno (norte, 5)    nível 92
import type { LootEntry } from '../domain/entities/definitions';
import type { Species } from './monsters';

type BiomeSpecies = Omit<Species, 'loot'> & { lootFrom: string };

const defs: BiomeSpecies[] = [
  {
    id: 'jackal',
    name: 'Chacal da Savana',
    description: 'Caça em matilha na grama alta; rápido, magro e covarde sozinho.',
    sprite: 'jackal',
    directions: 2,
    tier: 1,
    step: 1,
    speed: 3.6,
    attack: { kind: 'melee', range: 1, intervalMs: 1600, element: 'physical' },
    resistances: { fire: 1.1 },
    aggroRadius: 7,
    leash: 10,
    wanderRadius: 4,
    behavior: 'melee',
    respawnMs: 22000,
    shadow: 'm',
    lootFrom: 'wolf',
  },
  {
    id: 'nomad',
    name: 'Saqueador do Deserto',
    description: 'Assalta caravanas na savana: arremessa lanças de longe e foge do corpo a corpo.',
    sprite: 'nomad',
    directions: 4,
    tier: 2,
    step: 1,
    speed: 3.1,
    attack: { kind: 'ranged', range: 4, intervalMs: 2100, element: 'physical', projectile: 'proj_spear' },
    resistances: { fire: 0.9, holy: 1.1 },
    aggroRadius: 7,
    leash: 11,
    wanderRadius: 3,
    behavior: 'skirmisher',
    respawnMs: 26000,
    shadow: 'm',
    lootFrom: 'bandit',
  },
  {
    id: 'crocodile',
    name: 'Crocodilo do Brejo',
    description: 'Espreita na água parada da selva e morde com força; lento em terra firme.',
    sprite: 'crocodile',
    directions: 2,
    tier: 3,
    step: 1,
    speed: 2.6,
    attack: { kind: 'melee', range: 1, intervalMs: 2000, element: 'physical' },
    resistances: { earth: 0.8, ice: 1.2 },
    aggroRadius: 6,
    leash: 10,
    wanderRadius: 3,
    behavior: 'melee',
    respawnMs: 30000,
    shadow: 'l',
    lootFrom: 'rhino_boar',
  },
  {
    id: 'mummy',
    name: 'Múmia',
    description: 'Guardiã das ruínas do deserto, enrolada em ataduras antigas. Teme o fogo e a luz sagrada.',
    sprite: 'mummy',
    directions: 4,
    tier: 4,
    step: 2,
    speed: 2.4,
    attack: { kind: 'melee', range: 1, intervalMs: 2000, element: 'physical' },
    resistances: { fire: 1.4, holy: 1.4, earth: 0.8, ice: 0.9 },
    aggroRadius: 6,
    leash: 10,
    wanderRadius: 2,
    behavior: 'melee',
    respawnMs: 34000,
    shadow: 'm',
    lootFrom: 'dark_knight',
  },
  {
    id: 'yeti',
    name: 'Yeti',
    description: 'Gigante peludo das neves da tundra; um golpe dele derruba qualquer um que não esteja agasalhado.',
    sprite: 'yeti',
    directions: 4,
    tier: 5,
    step: 1,
    speed: 2.7,
    attack: { kind: 'melee', range: 1, intervalMs: 2200, element: 'physical' },
    resistances: { ice: 0.4, fire: 1.4 },
    aggroRadius: 7,
    leash: 11,
    wanderRadius: 3,
    behavior: 'melee',
    respawnMs: 40000,
    shadow: 'l',
    scale: 1.2,
    lootFrom: 'troll',
  },
  {
    id: 'frost_colossus',
    name: 'Colosso de Gelo',
    description: 'Uma montanha de gelo vivo que guarda o Pico do Inverno. Lento, mas cada passo racha o chão.',
    sprite: 'frost_colossus',
    directions: 4,
    tier: 12,
    step: 0,
    speed: 2.2,
    attack: { kind: 'melee', range: 1, intervalMs: 2400, element: 'ice' },
    resistances: { ice: 0.2, fire: 1.5, earth: 0.9 },
    aggroRadius: 7,
    leash: 11,
    wanderRadius: 2,
    behavior: 'melee',
    respawnMs: 55000,
    shadow: 'l',
    scale: 1.4,
    lootFrom: 'stone_golem',
  },
];

/** As espécies dos biomas, com o loot tirado das espécies de referência (`base`, já montadas). */
export function biomeSpecies(base: readonly Species[]): Species[] {
  const lootOf = (id: string): readonly LootEntry[] => {
    const s = base.find((x) => x.id === id);
    if (!s) throw new Error(`Espécie de referência inexistente: ${id}`);
    return s.loot;
  };
  return defs.map(({ lootFrom, ...rest }) => ({ ...rest, loot: lootOf(lootFrom) }));
}
