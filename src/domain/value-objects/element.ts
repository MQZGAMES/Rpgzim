export const ELEMENTS = ['physical', 'fire', 'ice', 'earth', 'energy', 'holy'] as const;
export type Element = (typeof ELEMENTS)[number];

export const ELEMENT_LABEL: Record<Element, string> = {
  physical: 'Físico',
  fire: 'Fogo',
  ice: 'Gelo',
  earth: 'Terra',
  energy: 'Energia',
  holy: 'Sagrado',
};
