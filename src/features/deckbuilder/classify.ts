import type { FunctionalCategory } from '../../types/api';
import {
  CARD_TYPE_ORDER, DRAW_NAMES, RAMP_NAMES, REMOVAL_NAMES, UNLIMITED_CARDS, UTILITY_NAMES,
  type BuilderCard, type SuggestionMode,
} from './constants';

export function canHaveMultiple(name: string): boolean {
  return UNLIMITED_CARDS.has(name.toLowerCase());
}

/** Backend category when specific; otherwise type and name heuristics. */
export function classifyFunctionalCategory(card: BuilderCard): FunctionalCategory {
  if (card.functional_category && card.functional_category !== 'utility' && card.functional_category !== 'synergy') {
    return card.functional_category;
  }
  const ct = (card.card_type || '').toLowerCase();
  if (ct === 'land') return 'lands';

  const name = (card.name || '').toLowerCase();
  if (RAMP_NAMES.has(name) || name.includes('signet') || name.includes('talisman')) return 'ramp';
  if (DRAW_NAMES.has(name)) return 'cardDraw';
  if (REMOVAL_NAMES.has(name)) return 'removal';
  if (UTILITY_NAMES.has(name)) return 'utility';

  // Trust a backend synergy/utility verdict when present.
  if (card.functional_category) return card.functional_category;

  // Avg deck cards that aren't common staples are synergy picks for this commander.
  if (!card.isRecommendation && !card.isBasicLand) return 'synergy';
  return 'utility';
}

export interface TypeGroup {
  type: string;
  cards: BuilderCard[];
}

export function groupByType(cards: BuilderCard[]): TypeGroup[] {
  const groups: Record<string, BuilderCard[]> = {};
  for (const card of cards) {
    const type = card.card_type || 'Other';
    (groups[type] ??= []).push(card);
  }
  return CARD_TYPE_ORDER.filter((t) => groups[t]?.length > 0).map((t) => ({ type: t, cards: groups[t] }));
}

/** Cut order: basic lands, then unowned, then most expensive, then lowest synergy. */
export function compareForRemoval(a: BuilderCard, b: BuilderCard): number {
  if (a.isBasicLand && !b.isBasicLand) return -1;
  if (!a.isBasicLand && b.isBasicLand) return 1;
  if (!a.owned && b.owned) return -1;
  if (a.owned && !b.owned) return 1;
  const pa = a.price || 0, pb = b.price || 0;
  if (pa !== pb) return pb - pa;
  return (a.synergy || 0) - (b.synergy || 0);
}

/** Add order for a suggestion mode. */
export function makeAddComparator(mode: SuggestionMode): (a: BuilderCard, b: BuilderCard) => number {
  return (a, b) => {
    if (mode === 'collection') {
      if (a.owned && !b.owned) return -1;
      if (!a.owned && b.owned) return 1;
      const pa = a.price || 0, pb = b.price || 0;
      if (pa !== pb) return pa - pb;
      return (b.synergy || 0) - (a.synergy || 0);
    }
    if (mode === 'cheapest') {
      const pa = a.price || 0, pb = b.price || 0;
      if (pa !== pb) return pa - pb;
      return (b.synergy || 0) - (a.synergy || 0);
    }
    return (b.synergy || 0) - (a.synergy || 0);
  };
}
