/** Shapes returned by the backend. Field names mirror the JSON exactly. */

export type Color = 'W' | 'U' | 'B' | 'R' | 'G';

export type PartnerType =
  | ''
  | 'partner'
  | 'partner_with'
  | 'partner_variant'
  | 'choose_a_background'
  | 'background'
  | 'friends_forever'
  | 'doctors_companion'
  | 'doctor';

/** A commander from the Scryfall catalog. */
export interface Commander {
  name: string;
  name_normalized?: string;
  color_identity: Color[];
  image_uri: string;
  art_crop?: string;
  edhrec_rank: number;
  partner_type?: PartnerType;
  partner_with?: string;
  partner_variant_label?: string;
  type_line?: string;
}

/** A commander scored against the collection. */
export interface ScoredCommander extends Commander {
  num_decks: number;
  total_cards: number;
  owned_count: number;
  missing_count: number;
  match_percentage: number;
  missing_price: number;
}

/** A commander scored against a list of favorite cards. */
export interface FavoriteMatch extends Commander {
  num_decks: number;
  match_count: number;
  total_favorites: number;
  match_percentage: number;
  matched_cards: string[];
  preview_cards: PreviewCard[];
}

export interface PreviewCard {
  name: string;
  category: string;
  is_favorite: boolean;
  inclusion: number;
}

export type FunctionalCategory = 'lands' | 'ramp' | 'cardDraw' | 'removal' | 'synergy' | 'utility';

export interface DeckUsage {
  id: string;
  name: string;
}

/** A card in a commander's average deck, annotated against the collection. */
export interface DeckCard {
  name: string;
  name_normalized: string;
  category?: string;
  inclusion?: number;
  synergy?: number;
  card_type: string;
  cmc: number;
  mana_cost: string;
  owned: boolean;
  qty_owned: number;
  qty_in_decks: number;
  in_decks: DeckUsage[];
  price?: number | null;
  functional_category: FunctionalCategory;
}

/** An EDHREC suggestion that is not in the average deck. */
export interface RecommendedCard {
  name: string;
  name_normalized: string;
  synergy: number;
  inclusion: number;
  source: string;
  owned: boolean;
  card_type: string;
  cmc: number;
  mana_cost: string;
  functional_category: FunctionalCategory;
}

export interface Theme {
  name: string;
  slug: string;
  count: number;
}

export interface CommanderDetail {
  commander: string;
  num_decks: number;
  themes: Theme[];
  total_cards: number;
  owned_count: number;
  missing_count: number;
  match_percentage: number;
  total_missing_price: number;
  owned_cards: DeckCard[];
  missing_cards: DeckCard[];
  recommendations: RecommendedCard[];
  error?: string | null;
}

export interface PartnersResponse {
  partner_type: PartnerType;
  partner_with?: string;
  partners: Commander[];
}

export interface CollectionSummary {
  count: number;
  total_cards: number;
  cards: Record<string, number>;
}

export interface CardAvailability {
  owned: number;
  in_decks: number;
  available: number;
  decks: DeckUsage[];
}

export interface CollectionStats {
  error?: string;
  total_unique: number;
  total_cards: number;
  total_value: number;
  total_in_decks: number;
  type_counts: Record<string, number>;
  color_counts: Record<string, number>;
  cmc_distribution: Record<string, number>;
  top_valuable: { name: string; qty: number; card_type: string; cmc: number; mana_cost: string; price: number | null }[];
}

/** A saved deck as returned by the API, with commander art attached. */
export interface Deck {
  id: string;
  name: string;
  commander: string;
  partner?: string;
  cards: Record<string, number>;
  card_count: number;
  color_identity: Color[];
  image_uri: string;
  art_crop: string;
  partner_type: PartnerType;
  partner_image_uri?: string;
  partner_color_identity?: Color[];
}

/** The deck shape kept in localStorage and synced to the server. */
export interface StoredDeck {
  id: string;
  name: string;
  commander: string;
  partner?: string;
  cards: Record<string, number>;
}

export interface CompareEntry {
  name: string;
  num_decks: number;
  total_cards: number;
  owned_count: number;
  missing_count: number;
  match_percentage: number;
  missing_price: number;
  owned_cards: string[];
  missing_cards: string[];
  unique_cards: string[];
  shared_cards: string[];
}

export interface CompareResponse {
  commanders: CompareEntry[];
  shared_count: number;
}

export interface AuthUser {
  id: number;
  username: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface UserData {
  collection: { cards: Record<string, number>; count: number };
  decks: { decks: Record<string, StoredDeck>; count: number };
  favorites: { cards: string[]; count: number };
}

export interface ValidateCardsResponse {
  valid: string[];
  invalid: string[];
}

export interface FavoritesRecommendationResponse {
  results: FavoriteMatch[];
  detected_colors: Color[];
  total_commanders_checked: number;
}
