/** App-wide state: who is logged in, favorites, the compare selection, and counts derived from server data. */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiGet } from '../lib/api';
import { resetOwnerData, useCollection, useDecks, useFavorites, useSetFavorites } from '../lib/queries';
import { resetSession } from '../lib/session';
import { clearAuth, clearLegacyStorage, loadAuthToken, loadAuthUser } from '../lib/storage';
import type { AuthUser } from '../types/api';
import type { CardCommander } from '../components/ui';

export interface AppState {
  collectionCount: number;
  collectionLoaded: boolean;
  deckCount: number;
  excludeInDecks: boolean;
  favorites: Set<string>;
  compareList: CardCommander[];
  user: AuthUser | null;
  showAuthModal: boolean;

  toggleExcludeInDecks: () => void;
  toggleFavorite: (name: string) => void;
  clearFavorites: () => void;
  toggleCompare: (cmd: CardCommander) => void;
  clearCompare: () => void;
  setShowAuthModal: (open: boolean) => void;
  handleLogin: (user: AuthUser) => void;
  handleLogout: () => void;
}

const Ctx = createContext<AppState | null>(null);

export function useAppState(): AppState {
  const value = useContext(Ctx);
  if (!value) throw new Error('useAppState must be used inside AppProvider');
  return value;
}

const EMPTY = new Set<string>();

export function AppProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const collection = useCollection();
  const decks = useDecks();
  const favoritesQuery = useFavorites();
  const setFavorites = useSetFavorites();

  const [compareList, setCompareList] = useState<CardCommander[]>([]);
  const [excludeInDecks, setExcludeInDecks] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Drop data an earlier version kept in the browser; the server owns it now.
  useEffect(() => { clearLegacyStorage(); }, []);

  // Confirm a stored token still works.
  useEffect(() => {
    if (loadAuthUser() && loadAuthToken()) {
      apiGet<{ user: AuthUser }>('/api/auth/me')
        .then((data) => setUser(data.user))
        .catch(() => { clearAuth(); setUser(null); });
    }
  }, []);

  const favorites = favoritesQuery.data ?? EMPTY;

  const toggleFavorite = useCallback((cardName: string) => {
    const next = new Set(favorites);
    const key = cardName.toLowerCase();
    if (next.has(key)) next.delete(key); else next.add(key);
    setFavorites.mutate(next);
  }, [favorites, setFavorites]);

  const clearFavorites = useCallback(() => setFavorites.mutate(new Set()), [setFavorites]);

  const toggleCompare = (cmd: CardCommander) => {
    setCompareList((prev) => {
      if (prev.some((c) => c.name === cmd.name)) return prev.filter((c) => c.name !== cmd.name);
      if (prev.length >= 3) return prev;
      return [...prev, cmd];
    });
  };

  // The token is already stored by the auth form. The server folded any anonymous data into the account.
  const handleLogin = (loggedInUser: AuthUser) => {
    setUser(loggedInUser);
    resetOwnerData(queryClient);
  };

  // A fresh anonymous session, so the next visitor on this browser does not see the account's data.
  const handleLogout = () => {
    clearAuth();
    resetSession();
    setUser(null);
    setCompareList([]);
    resetOwnerData(queryClient);
  };

  const value: AppState = {
    collectionCount: collection.data?.count ?? 0,
    collectionLoaded: collection.isSuccess,
    deckCount: decks.data?.length ?? 0,
    excludeInDecks, favorites, compareList, user, showAuthModal,
    toggleExcludeInDecks: () => setExcludeInDecks((prev) => !prev),
    toggleFavorite, clearFavorites, toggleCompare,
    clearCompare: () => setCompareList([]),
    setShowAuthModal, handleLogin, handleLogout,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
