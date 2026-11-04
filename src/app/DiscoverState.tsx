/** Filter and result selections for the Discover panels, kept above the router so they survive navigation. */
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Color } from '../types/api';
import type { SortKey } from '../features/commanders/sorting';

export interface AppliedRecommendationParams {
  min_owned: number;
  min_colors: number;
  color: string | null;
  search: string | null;
  tag: string | null;
}

export interface RecommendationsState {
  minOwned: number;
  /** 0 means any number of colors; N means at least N. */
  minColors: number;
  colorFilter: Color[];
  search: string;
  /** EDHREC archetype slug to narrow to, or '' for any. */
  tag: string;
  sortBy: SortKey;
  /** The filters the last run used; null until the user asks for recommendations. */
  applied: AppliedRecommendationParams | null;
}

export interface SearchState {
  query: string;
  colorFilter: Color[];
  minColors: number;
}

export interface FavoritesState {
  /** The favorites list the last Find used; null until the user runs it. */
  searched: string[] | null;
  expanded: string | null;
}

interface DiscoverState {
  recs: RecommendationsState;
  setRecs: (patch: Partial<RecommendationsState>) => void;
  search: SearchState;
  setSearch: (patch: Partial<SearchState>) => void;
  fav: FavoritesState;
  setFav: (patch: Partial<FavoritesState>) => void;
}

const Ctx = createContext<DiscoverState | null>(null);

export function useDiscoverState(): DiscoverState {
  const value = useContext(Ctx);
  if (!value) throw new Error('useDiscoverState must be used inside DiscoverProvider');
  return value;
}

export function DiscoverProvider({ children }: { children: ReactNode }) {
  const [recs, setRecsState] = useState<RecommendationsState>({ minOwned: 20, minColors: 0, colorFilter: [], search: '', tag: '', sortBy: 'match_desc', applied: null });
  const [search, setSearchState] = useState<SearchState>({ query: '', colorFilter: [], minColors: 0 });
  const [fav, setFavState] = useState<FavoritesState>({ searched: null, expanded: null });
  const value: DiscoverState = {
    recs, setRecs: (patch) => setRecsState((prev) => ({ ...prev, ...patch })),
    search, setSearch: (patch) => setSearchState((prev) => ({ ...prev, ...patch })),
    fav, setFav: (patch) => setFavState((prev) => ({ ...prev, ...patch })),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
