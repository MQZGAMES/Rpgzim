// Temporadas: um recomeço geral do jogo. Todo save de uma temporada anterior volta ao nível 1 com o kit básico da
// vocação (50 poções de vida e 50 de mana), sem ouro, banco ou depósito — venha do aparelho ou da sincronização com o
// GitHub (o save antigo nunca ressuscita o progresso). Ficam o id, o nome, a vocação, a data de criação e as
// configurações do personagem. O mercado também recomeça vazio.
import type { CharacterState } from '../entities/character';
import type { GameData } from '../entities/gameData';
import { createCharacter } from './character';

/** Temporada atual (2: XP pela metade e todos de volta ao nível 1). */
export const SEASON = 2;

export function isOldSeason(c: { season?: number }): boolean {
  return (c.season ?? 1) < SEASON;
}

/** O personagem recomeçado: nível 1, kit básico, no ponto de partida. */
export function seasonReset(data: GameData, old: CharacterState, start: { x: number; y: number }, now: number): CharacterState {
  const c = createCharacter(data, { id: old.id, name: old.name, vocation: old.vocation, now, position: start });
  c.createdAt = old.createdAt;
  if (old.settings) c.settings = structuredClone(old.settings);
  return c;
}
