import type { Color, DeckUsage, FunctionalCategory } from '../../types/api';

/** A card as the builder works with it: an average-deck card or recommendation plus builder flags. */
export interface BuilderCard {
  name: string;
  name_normalized?: string;
  card_type: string;
  functional_category: FunctionalCategory;
  owned: boolean;
  qty_owned?: number;
  qty_in_decks?: number;
  in_decks?: DeckUsage[];
  price?: number | null;
  synergy?: number;
  cmc: number;
  mana_cost: string;
  included: boolean;
  qty: number;
  isCommander?: boolean;
  isRecommendation?: boolean;
  isBasicLand?: boolean;
}

export type Composition = Record<FunctionalCategory, number>;

export type SuggestionMode = 'collection' | 'cheapest' | 'best';
export type ViewMode = 'list' | 'gallery' | 'stacks';

export const DEFAULT_COMPOSITION: Composition = {
  lands: 38,
  ramp: 10,
  cardDraw: 10,
  removal: 8,
  synergy: 20,
  utility: 13,
};

export interface CategoryMeta {
  key: FunctionalCategory;
  label: string;
  color: string;
}

export const CATEGORY_META: CategoryMeta[] = [
  { key: 'lands', label: 'Lands', color: 'bg-amber-500' },
  { key: 'ramp', label: 'Ramp', color: 'bg-green-500' },
  { key: 'cardDraw', label: 'Draw', color: 'bg-blue-500' },
  { key: 'removal', label: 'Removal', color: 'bg-red-500' },
  { key: 'synergy', label: 'Synergy', color: 'bg-purple-500' },
  { key: 'utility', label: 'Utility', color: 'bg-gray-400' },
];

export { CARD_TYPE_ORDER } from '../../lib/cards';

/** Basic land for each color. */
export const COLOR_TO_BASICS: Record<Color, string> = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' };

/** Cards that can have any number of copies. */
export const UNLIMITED_CARDS = new Set([
  'nazgul', 'persistent petitioners', 'rat colony', 'relentless rats',
  'shadowborn apostle', 'slime against humanity', 'dragon\'s approach',
  'seven dwarves', 'plains', 'island', 'swamp', 'mountain', 'forest',
  'snow-covered plains', 'snow-covered island', 'snow-covered swamp',
  'snow-covered mountain', 'snow-covered forest', 'wastes',
]);
