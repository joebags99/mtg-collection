export { groupByType, type TypeGroup } from '../../lib/cards';
import type { FunctionalCategory } from '../../types/api';
import {
  DRAW_NAMES, RAMP_NAMES, REMOVAL_NAMES, UNLIMITED_CARDS, UTILITY_NAMES,
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

export interface PlannedRemoval { name: string; qty: number; category: string }
export interface PlannedAdd {
  name: string;
  qty: number;
  category: string;
  owned: boolean;
  synergy?: number;
  /** True when this adds copies to an already-included unlimited card (basic lands). */
  increase: boolean;
}

export interface CompositionPlan {
  removals: PlannedRemoval[];
  /** In display order: excluded cards to add, then increases, category by category. */
  adds: PlannedAdd[];
}

/**
 * Work out which cards to cut and add to move actual category counts toward `targets`.
 * Used both for the live preview and for applying the targets.
 */
export function planComposition(
  targets: Record<FunctionalCategory, number>,
  counts: Record<FunctionalCategory, number>,
  included: BuilderCard[],
  excluded: BuilderCard[],
  mode: SuggestionMode,
  meta: { key: FunctionalCategory; label: string }[],
): CompositionPlan {
  const compareForAdd = makeAddComparator(mode);
  const removals: PlannedRemoval[] = [];
  const adds: PlannedAdd[] = [];

  for (const { key, label } of meta) {
    const diff = counts[key] - targets[key];
    if (diff > 0) {
      const candidates = included.filter((c) => classifyFunctionalCategory(c) === key).sort(compareForRemoval);
      let remaining = diff;
      for (const c of candidates) {
        if (remaining <= 0) break;
        const take = Math.min(c.qty, remaining);
        removals.push({ name: c.name, qty: take, category: label });
        remaining -= take;
      }
    } else if (diff < 0) {
      let remaining = Math.abs(diff);
      const candidates = excluded.filter((c) => classifyFunctionalCategory(c) === key).sort(compareForAdd);
      for (const c of candidates) {
        if (remaining <= 0) break;
        adds.push({ name: c.name, qty: 1, category: label, owned: c.owned, synergy: c.synergy, increase: false });
        remaining -= 1;
      }
      if (remaining > 0) {
        const unlimited = included
          .filter((c) => classifyFunctionalCategory(c) === key && canHaveMultiple(c.name))
          .sort(compareForAdd);
        for (const c of unlimited) {
          if (remaining <= 0) break;
          adds.push({ name: c.name, qty: remaining, category: label, owned: c.owned, synergy: c.synergy, increase: true });
          remaining = 0;
        }
      }
    }
  }
  return { removals, adds };
}
