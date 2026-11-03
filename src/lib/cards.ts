/** Grouping cards by their coarse type, in display order. */
export const CARD_TYPE_ORDER = ['Creature', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Planeswalker', 'Land', 'Other'];

export interface TypeGroup<T> {
  type: string;
  cards: T[];
}

export function groupByType<T extends { card_type?: string }>(cards: T[]): TypeGroup<T>[] {
  const groups: Record<string, T[]> = {};
  for (const card of cards) {
    const type = card.card_type || 'Other';
    (groups[type] ??= []).push(card);
  }
  return CARD_TYPE_ORDER.filter((t) => (groups[t]?.length ?? 0) > 0).map((t) => ({ type: t, cards: groups[t] }));
}
