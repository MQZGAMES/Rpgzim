// Heróis existem desde o primeiro acesso: se ainda não há save do herói, ele é criado (nível 1, no templo).
import type { CharacterState } from '../domain/entities/character';
import type { GameData } from '../domain/entities/gameData';
import { createCharacter } from '../domain/rules/character';
import type { SaveService } from '../game/persistence/SaveService';
import { buildWorld } from '../data/maps/world';

export async function ensureHeroSaves(saves: SaveService, data: GameData): Promise<void> {
  const existing = new Set((await saves.list().catch(() => [])).map((s) => s.slotId));
  for (const hero of Object.values(data.heroes)) {
    if (existing.has(hero.slotId)) continue;
    const c = createCharacter(data, { id: hero.slotId, name: hero.name, vocation: hero.vocation, now: Date.now(), position: buildWorld().playerStart });
    await saves.save(c).catch(() => undefined);
  }
}

/** Heróis que vivem sozinhos nesta partida: todos menos o personagem escolhido. */
export async function loadHeroesFor(saves: SaveService, data: GameData, playingId: string): Promise<CharacterState[]> {
  const out: CharacterState[] = [];
  for (const hero of Object.values(data.heroes)) {
    if (hero.slotId === playingId) continue;
    const c = await saves.load(hero.slotId).catch(() => null);
    if (c) out.push(c);
  }
  return out;
}

export function isHeroSlot(data: GameData, slotId: string): boolean {
  return Object.values(data.heroes).some((h) => h.slotId === slotId);
}
