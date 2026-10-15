import type { GameData } from '../domain/entities/gameData';
import { BALANCE } from './balance';
import { ITEMS } from './items';
import { MONSTERS } from './monsters';
import { NPCS, SHOPS } from './npcs';
import { SPELLS } from './spells';
import { VOCATIONS } from './vocations';
import { HEROES } from './heroes';

export const GAME_DATA: GameData = {
  items: ITEMS,
  spells: SPELLS,
  vocations: VOCATIONS,
  monsters: MONSTERS,
  npcs: NPCS,
  shops: SHOPS,
  heroes: HEROES,
  balance: BALANCE,
};
