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
    const c = createCharacter(data, {
      id: hero.slotId,
      name: hero.name,
      vocation: hero.vocation,
      now: Date.now(),
      position: buildWorld().playerStart,
    });
    await saves.save(c).catch(() => undefined);
  }
}

/**
 * Todos os outros personagens salvos, separados em quem entra logado (jogando com a IA) e quem fica fora do jogo.
 * Os heróis entram por padrão; os criados pelo jogador só se ele os deixou logados (preferência no aparelho).
 */
export async function loadRosterFor(
  saves: SaveService,
  data: GameData,
  playingId: string,
  prefs: Record<string, boolean>,
): Promise<{ online: CharacterState[]; offline: CharacterState[] }> {
  const online: CharacterState[] = [];
  const offline: CharacterState[] = [];
  // os heróis na ordem do jogo (Boladex, Maguim...) e depois os personagens criados
  const order = Object.values(data.heroes).map((h) => h.slotId);
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
  const slots = (await saves.list().catch(() => [])).sort((a, b) => rank(a.slotId) - rank(b.slotId));
  for (const s of slots) {
    if (s.slotId === playingId) continue;
    const c = await saves.load(s.slotId).catch(() => null);
    if (!c) continue;
    const on = prefs[c.id] ?? isHeroSlot(data, c.id);
    (on ? online : offline).push(c);
  }
  return { online, offline };
}

export function isHeroSlot(data: GameData, slotId: string): boolean {
  return Object.values(data.heroes).some((h) => h.slotId === slotId);
}
