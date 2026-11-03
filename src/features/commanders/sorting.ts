import type { ScoredCommander } from '../../types/api';

export type SortKey = 'match_desc' | 'match_asc' | 'price_asc' | 'price_desc' | 'edhrec' | 'owned_desc';

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'match_desc', label: 'Most Complete' },
  { value: 'match_asc', label: 'Least Complete' },
  { value: 'price_asc', label: 'Cheapest to Complete' },
  { value: 'price_desc', label: 'Most Expensive to Complete' },
  { value: 'edhrec', label: 'EDHREC Popularity' },
  { value: 'owned_desc', label: 'Most Cards Owned' },
];

export function sortResults(results: ScoredCommander[], sortBy: SortKey): ScoredCommander[] {
  const sorted = [...results];
  switch (sortBy) {
    case 'match_desc': return sorted.sort((a, b) => b.match_percentage - a.match_percentage);
    case 'match_asc': return sorted.sort((a, b) => a.match_percentage - b.match_percentage);
    case 'price_asc': return sorted.sort((a, b) => (a.missing_price || 9999) - (b.missing_price || 9999));
    case 'price_desc': return sorted.sort((a, b) => (b.missing_price || 0) - (a.missing_price || 0));
    case 'edhrec': return sorted.sort((a, b) => (a.edhrec_rank || 9999) - (b.edhrec_rank || 9999));
    case 'owned_desc': return sorted.sort((a, b) => b.owned_count - a.owned_count);
    default: return sorted;
  }
}
