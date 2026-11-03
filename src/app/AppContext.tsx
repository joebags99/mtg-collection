/** App-wide state: the loaded collection, auth and sync, favorites, compare selection, and deck count. */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiAuthGet, apiAuthPost, apiGet, apiPost } from '../lib/api';
import { clearAuth, loadAuthToken, loadAuthUser, loadCollection, loadDecks, loadFavorites, saveCollection, saveDecks, saveFavorites } from '../lib/storage';
import type { AuthUser, CollectionSummary, Deck, UserData } from '../types/api';
import type { CardCommander } from '../components/ui';

export type SyncStatus = '' | 'syncing' | 'synced' | 'error';

export interface AppState {
  collectionCount: number;
  /** True once the collection restore on startup has settled and it found cards. */
  collectionRestored: boolean;
  decksReady: boolean;
  deckCount: number;
  excludeInDecks: boolean;
  favorites: Set<string>;
  compareList: CardCommander[];
  user: AuthUser | null;
  syncStatus: SyncStatus;
  showAuthModal: boolean;

  handleUploaded: (data: { count: number; cards?: Record<string, number> }) => void;
  handleDecksChanged: () => void;
  toggleExcludeInDecks: () => void;
  toggleFavorite: (name: string) => void;
  clearFavorites: () => void;
  toggleCompare: (cmd: CardCommander) => void;
  clearCompare: () => void;
  setShowAuthModal: (open: boolean) => void;
  handleLogin: (user: AuthUser, token: string) => Promise<void>;
  handleLogout: () => void;
  syncToServer: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function useAppState(): AppState {
  const value = useContext(Ctx);
  if (!value) throw new Error('useAppState must be used inside AppProvider');
  return value;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [collectionCount, setCollectionCount] = useState(0);
  const [collectionRestored, setCollectionRestored] = useState(false);
  const [compareList, setCompareList] = useState<CardCommander[]>([]);
  const [excludeInDecks, setExcludeInDecks] = useState(false);
  const [deckCount, setDeckCount] = useState(0);
  const [decksReady, setDecksReady] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(() => loadFavorites());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('');

  const toggleFavorite = useCallback((cardName: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      const key = cardName.toLowerCase();
      if (next.has(key)) next.delete(key); else next.add(key);
      saveFavorites(next);
      return next;
    });
  }, []);

  const clearFavorites = useCallback(() => {
    const empty = new Set<string>();
    setFavorites(empty);
    saveFavorites(empty);
  }, []);

  useEffect(() => {
    if (loadAuthUser() && loadAuthToken()) {
      apiAuthGet<{ user: AuthUser }>('/api/auth/me')
        .then((data) => setUser(data.user))
        .catch(() => { clearAuth(); setUser(null); });
    }
  }, []);

  const syncToServer = useCallback(async () => {
    if (!user) return;
    setSyncStatus('syncing');
    try {
      await Promise.all([
        apiAuthPost('/api/user/collection/save', { cards: loadCollection() || {} }),
        apiAuthPost('/api/user/decks/save', { decks: loadDecks() || {} }),
      ]);
      setSyncStatus('synced');
      setTimeout(() => setSyncStatus(''), 2000);
    } catch (err) {
      console.error('Sync failed:', err);
      setSyncStatus('error');
      setTimeout(() => setSyncStatus(''), 3000);
    }
  }, [user]);

  // On login, prefer server data; if the server is empty, push local data up.
  const handleLogin = async (loggedInUser: AuthUser) => {
    setUser(loggedInUser);
    try {
      const data = await apiAuthGet<UserData>('/api/user/data');
      if (data.collection.count > 0 || data.decks.count > 0) {
        if (data.collection.count > 0) {
          saveCollection(data.collection.cards);
          await apiPost('/api/collection/restore', { cards: data.collection.cards });
          setCollectionCount(data.collection.count);
        }
        if (data.decks.count > 0) {
          saveDecks(data.decks.decks);
          await apiPost('/api/decks/restore', { decks: data.decks.decks });
          setDeckCount(data.decks.count);
        }
      } else {
        await syncToServer();
      }
    } catch (err) {
      console.error('Failed to load user data:', err);
    }
  };

  const handleLogout = () => {
    clearAuth();
    setUser(null);
    setSyncStatus('');
  };

  // Restore collection and decks from localStorage on startup
  useEffect(() => {
    const saved = loadCollection();
    const readCount = () => apiGet<CollectionSummary>('/api/collection')
      .then((data) => setCollectionCount(data.count || 0))
      .catch(() => {});
    if (saved) {
      apiPost<CollectionSummary>('/api/collection/restore', { cards: saved }).then((data) => {
        setCollectionCount(data.count || 0);
        if (data.count > 0) setCollectionRestored(true);
      }).catch(readCount);
    } else {
      readCount();
    }

    const savedDecks = loadDecks();
    if (savedDecks && Object.keys(savedDecks).length > 0) {
      apiPost<{ count: number }>('/api/decks/restore', { decks: savedDecks })
        .then((data) => setDeckCount(data.count || 0))
        .catch(() => {})
        .finally(() => setDecksReady(true));
    } else {
      setDecksReady(true);
    }
  }, []);

  const handleUploaded = (data: { count: number; cards?: Record<string, number> }) => {
    setCollectionCount(data.count);
    if (data.cards) {
      saveCollection(data.cards);
      if (user) syncToServer();
    }
  };

  const toggleCompare = (cmd: CardCommander) => {
    setCompareList((prev) => {
      if (prev.some((c) => c.name === cmd.name)) return prev.filter((c) => c.name !== cmd.name);
      if (prev.length >= 3) return prev;
      return [...prev, cmd];
    });
  };

  const handleDecksChanged = () => {
    apiGet<{ decks: Deck[] }>('/api/decks').then((data) => {
      setDeckCount((data.decks || []).length);
      if (user) syncToServer();
    }).catch(() => {});
  };

  const value: AppState = {
    collectionCount, collectionRestored, decksReady, deckCount, excludeInDecks, favorites, compareList,
    user, syncStatus, showAuthModal,
    handleUploaded, handleDecksChanged,
    toggleExcludeInDecks: () => setExcludeInDecks((prev) => !prev),
    toggleFavorite, clearFavorites, toggleCompare,
    clearCompare: () => setCompareList([]),
    setShowAuthModal, handleLogin, handleLogout, syncToServer,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
