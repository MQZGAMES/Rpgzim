// Gerador pseudoaleatório injetável (determinístico com semente) para tornar combate e loot testáveis.
export interface Rng {
  /** Número em [0, 1). */
  next(): number;
  /** Inteiro em [min, max] (inclusivo). */
  int(min: number, max: number): number;
  chance(probability: number): boolean;
}

export function createRng(seed: number = Date.now()): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
  };
}

/** RNG fixo para testes: devolve sempre o mesmo valor. */
export function fixedRng(value: number): Rng {
  return { next: () => value, int: (min, max) => min + Math.floor(value * (max - min + 1)), chance: (p) => value < p };
}
