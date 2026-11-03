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

// Client-side functional category heuristics by name.
export const RAMP_NAMES = new Set([
  'sol ring', 'mana crypt', 'mana vault', 'arcane signet', 'mind stone', 'thought vessel',
  'fellwar stone', 'commander\'s sphere', 'chromatic lantern', 'gilded lotus',
  'thran dynamo', 'worn powerstone', 'hedron archive', 'dreamstone hedron',
  'cultivate', 'kodama\'s reach', 'farseek', 'rampant growth', 'nature\'s lore',
  'three visits', 'skyshroud claim', 'explosive vegetation', 'migration path',
  'sakura-tribe elder', 'birds of paradise', 'llanowar elves', 'elvish mystic',
  'fyndhorn elves', 'avacyn\'s pilgrim', 'bloom tender', 'priest of titania',
  'dark ritual', 'cabal ritual', 'dockside extortionist',
]);

export const DRAW_NAMES = new Set([
  'rhystic study', 'mystic remora', 'phyrexian arena', 'sylvan library', 'necropotence',
  'harmonize', 'read the bones', 'night\'s whisper', 'sign in blood', 'painful truths',
  'brainstorm', 'ponder', 'preordain', 'windfall', 'wheel of fortune', 'treasure cruise',
  'dig through time', 'fact or fiction', 'blue sun\'s zenith', 'pull from tomorrow',
  'consecrated sphinx', 'esper sentinel', 'archivist of oghma', 'beast whisperer',
  'guardian project', 'the great henge', 'skullclamp', 'mask of memory',
]);

export const REMOVAL_NAMES = new Set([
  'swords to plowshares', 'path to exile', 'beast within', 'chaos warp', 'generous gift',
  'assassin\'s trophy', 'anguished unmaking', 'vindicate', 'mortify', 'putrefy',
  'counterspell', 'swan song', 'negate', 'dovin\'s veto', 'mana drain', 'force of will',
  'force of negation', 'fierce guardianship', 'pact of negation', 'arcane denial',
  'cyclonic rift', 'toxic deluge', 'wrath of god', 'damnation', 'blasphemous act',
  'farewell', 'vandalblast', 'return to dust', 'krosan grip', 'nature\'s claim',
  'go for the throat', 'terminate', 'reality shift', 'rapid hybridization', 'pongify',
  'despark', 'abrupt decay',
]);

export const UTILITY_NAMES = new Set([
  // Tutors
  'demonic tutor', 'vampiric tutor', 'enlightened tutor', 'mystical tutor', 'worldly tutor',
  'gamble', 'diabolic tutor', 'diabolic intent', 'final parting', 'scheming symmetry',
  'fabricate', 'whir of invention', 'tribute mage', 'trophy mage', 'trinket mage',
  'imperial seal', 'grim tutor', 'wishclaw talisman', 'profane tutor',
  // Protection / interaction
  'lightning greaves', 'swiftfoot boots', 'whispersilk cloak', 'darksteel plate',
  'teferi\'s protection', 'grand abolisher', 'drannith magistrate', 'defense grid',
  'deflecting swat', 'flawless maneuver', 'tibalt\'s trickery', 'red elemental blast',
  'pyroblast', 'veil of summer', 'silence', 'autumn\'s veil',
  // Recursion
  'eternal witness', 'regrowth', 'noxious revival', 'sun titan', 'reanimate',
  'animate dead', 'necromancy', 'living death', 'victimize', 'karmic guide',
  'phyrexian reclamation', 'muldrotha, the gravetide', 'underworld breach',
  'sevinne\'s reclamation', 'brought back', 'hall of heliod\'s generosity',
  // General value / staples
  'smothering tithe', 'land tax', 'trouble in pairs', 'black market connections',
  'propaganda', 'ghostly prison', 'sphere of safety', 'crawlspace',
  'panharmonicon', 'conjurer\'s closet', 'helm of the host', 'strionic resonator',
  'sensei\'s divining top', 'scroll rack', 'rings of brighthearth',
  'illusionist\'s bracers', 'lithoform engine', 'heroic intervention',
]);
