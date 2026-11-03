/** Server data, cached and shared through TanStack Query. Keys live here so invalidation has one vocabulary. */
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CollectionSummary, Commander, CommanderDetail, Deck, PartnersResponse } from '../types/api';
import { apiGet, apiPut, type Params } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, retry: 1, refetchOnWindowFocus: false },
  },
});

export const keys = {
  collection: ['collection'] as const,
  decks: ['decks'] as const,
  favorites: ['favorites'] as const,
  popular: ['commanders', 'popular'] as const,
  commanderSearch: (q: string, color: string | null) => ['commanders', 'search', q, color] as const,
  commander: (name: string) => ['commander', name] as const,
  partners: (name: string) => ['commander', name, 'partners'] as const,
  detail: (name: string, params: Params) => ['commander', name, 'detail', params] as const,
  recommendations: (params: Params) => ['recommendations', params] as const,
  favoriteMatches: (cards: string[]) => ['recommendations', 'favorites', cards] as const,
  compare: (names: string[]) => ['compare', names] as const,
};

/** Data that belongs to the current owner. Reset when the identity changes (login, logout). */
export function resetOwnerData(client: QueryClient): Promise<void> {
  return client.resetQueries();
}

export function useCollection() {
  return useQuery({ queryKey: keys.collection, queryFn: () => apiGet<CollectionSummary>('/api/collection') });
}

export function useDecks() {
  return useQuery({
    queryKey: keys.decks,
    queryFn: async () => (await apiGet<{ decks: Deck[] }>('/api/decks')).decks ?? [],
  });
}

export function useFavorites() {
  return useQuery({
    queryKey: keys.favorites,
    queryFn: async () => new Set((await apiGet<{ cards: string[] }>('/api/favorites')).cards),
  });
}

/** Replace the favorites list, updating the cache before the server answers. */
export function useSetFavorites() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (next: Set<string>) => new Set((await apiPut<{ cards: string[] }>('/api/favorites', { cards: [...next] })).cards),
    onMutate: async (next) => {
      await client.cancelQueries({ queryKey: keys.favorites });
      const previous = client.getQueryData<Set<string>>(keys.favorites);
      client.setQueryData(keys.favorites, next);
      return { previous };
    },
    onError: (_err, _next, ctx) => { if (ctx?.previous) client.setQueryData(keys.favorites, ctx.previous); },
    onSuccess: (saved) => client.setQueryData(keys.favorites, saved),
  });
}

export const commanderLookupQuery = (name: string) => ({
  queryKey: keys.commander(name),
  queryFn: () => apiGet<Commander>('/api/commanders/lookup', { name }),
});

export const partnersQuery = (name: string) => ({
  queryKey: keys.partners(name),
  queryFn: () => apiGet<PartnersResponse>(`/api/commander/${encodeURIComponent(name)}/partners`),
});

export const commanderDetailQuery = (name: string, params: Params = {}) => ({
  queryKey: keys.detail(name, params),
  queryFn: () => apiGet<CommanderDetail>(`/api/commander/${encodeURIComponent(name)}`, params),
});

export const popularQuery = {
  queryKey: keys.popular,
  queryFn: async () => (await apiGet<{ commanders: Commander[] }>('/api/commanders/popular')).commanders ?? [],
};
