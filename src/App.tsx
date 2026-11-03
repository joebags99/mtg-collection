import { useCallback, useEffect, useState } from 'react';
import { apiAuthGet, apiAuthPost, apiGet, apiPost } from './lib/api';
import { clearAuth, loadAuthToken, loadAuthUser, loadCollection, loadDecks, saveCollection, saveDecks, saveFavorites, loadFavorites } from './lib/storage';
import type { AuthUser, CollectionSummary, CommanderDetail, Deck, UserData } from './types/api';
import type { Tab } from './types/nav';
import { Button, type CardCommander } from './components/ui';
import { AuthModal } from './features/auth/AuthModal';
import { CollectionUpload } from './features/collection/CollectionUpload';
import { CollectionStats } from './features/collection/CollectionStats';
import { Recommendations } from './features/commanders/Recommendations';
import { CommanderSearch } from './features/commanders/CommanderSearch';
import { CommanderDetail as CommanderDetailView } from './features/commanders/CommanderDetail';
import { CompareView } from './features/commanders/CompareView';
import { DeckBuilder } from './features/deckbuilder/DeckBuilder';
import { MyDecks } from './features/decks/MyDecks';
import { FavoritesTab } from './features/favorites/FavoritesTab';
import { AboutPage } from './pages/AboutPage';
import { GuidesPage } from './pages/GuidesPage';

type SyncStatus = '' | 'syncing' | 'synced' | 'error';

export default function App() {
  const [tab, setTab] = useState<Tab>('upload');
  const [collectionCount, setCollectionCount] = useState(0);
  const [selectedCommander, setSelectedCommander] = useState<CardCommander | null>(null);
  const [compareList, setCompareList] = useState<CardCommander[]>([]);
  const [deckBuilderData, setDeckBuilderData] = useState<CommanderDetail | null>(null);
  const [excludeInDecks, setExcludeInDecks] = useState(false);
  const [deckCount, setDeckCount] = useState(0);
  const [decksReady, setDecksReady] = useState(false);

  // Favorites
  const [favorites, setFavorites] = useState<Set<string>>(() => loadFavorites());

  const handleToggleFavorite = useCallback((cardName: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      const key = cardName.toLowerCase();
      if (next.has(key)) next.delete(key); else next.add(key);
      saveFavorites(next);
      return next;
    });
  }, []);

  const handleClearFavorites = useCallback(() => {
    const empty = new Set<string>();
    setFavorites(empty);
    saveFavorites(empty);
  }, []);

  // Auth
  const [user, setUser] = useState<AuthUser | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('');

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
        if (data.collection.count > 0) setTab('recommend');
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
        if (data.count > 0) setTab('recommend');
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

  const handleSelectCommander = (cmd: CardCommander) => {
    setSelectedCommander(cmd);
    setTab('detail');
  };

  const handleToggleCompare = (cmd: CardCommander) => {
    setCompareList((prev) => {
      if (prev.some((c) => c.name === cmd.name)) return prev.filter((c) => c.name !== cmd.name);
      if (prev.length >= 3) return prev;
      return [...prev, cmd];
    });
  };

  const handleOpenDeckBuilder = (data: CommanderDetail, cmd?: CardCommander) => {
    if (cmd) setSelectedCommander(cmd);
    setDeckBuilderData(data);
    setTab('deckbuilder');
  };

  const handleDecksChanged = () => {
    apiGet<{ decks: Deck[] }>('/api/decks').then((data) => {
      setDeckCount((data.decks || []).length);
      if (user) syncToServer();
    }).catch(() => {});
  };

  const tabs: { id: Tab; label: string; badge?: string }[] = [
    { id: 'upload', label: 'Collection' },
    { id: 'recommend', label: 'Recommendations' },
    { id: 'search', label: 'Search' },
    { id: 'favorites', label: 'Find My Commander', badge: favorites.size > 0 ? `${favorites.size}★` : undefined },
    { id: 'mydecks', label: 'My Decks', badge: deckCount ? String(deckCount) : undefined },
    { id: 'stats', label: 'Stats' },
  ];
  const secondary: { id: Tab; label: string }[] = [
    { id: 'guides', label: 'Guides' },
    { id: 'about', label: 'About' },
  ];
  const isActive = (id: Tab) => tab === id || ((tab === 'detail' || tab === 'deckbuilder') && id === 'recommend');

  const navButton = (t: { id: Tab; label: string; badge?: string }, muted = false) => (
    <button
      key={t.id}
      onClick={() => setTab(t.id)}
      className={`w-auto md:w-full flex-shrink-0 whitespace-nowrap flex items-center justify-between gap-2 px-3 py-1.5 rounded text-left text-sm transition-colors duration-1 ${
        isActive(t.id)
          ? 'bg-surface-3 text-ink'
          : muted ? 'text-ink-faint hover:text-ink-muted hover:bg-surface-2' : 'text-ink-muted hover:text-ink hover:bg-surface-2'
      }`}
    >
      <span className="flex items-center gap-2">
        <span className={`w-1 h-1 rounded-full ${isActive(t.id) ? 'bg-accent' : 'bg-transparent'}`} />
        {t.label}
      </span>
      {t.badge && <span className="text-[10px] num text-accent">{t.badge}</span>}
    </button>
  );

  return (
    <div className="min-h-screen md:flex">
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} onLogin={handleLogin} />

      {/* Rail */}
      <aside className="md:w-60 md:flex-shrink-0 md:h-screen md:sticky md:top-0 bg-surface-1 border-b md:border-b-0 md:border-r border-line flex flex-col">
        <div className="px-5 pt-4 md:pt-5 pb-3 md:pb-4 flex items-center justify-between">
          <button onClick={() => setTab('upload')} className="text-left">
            <div className="font-display text-xl font-semibold leading-tight text-ink"><span className="md:hidden">Commander Recommender</span><span className="hidden md:inline">Commander<br />Recommender</span></div>
            <div className="hidden md:block text-[10px] uppercase tracking-[0.18em] text-ink-faint mt-1.5">From your collection</div>
          </button>
          <div className="md:hidden">
            {user ? (
              <span className="text-xs text-ink-muted">{user.username}</span>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setShowAuthModal(true)}>Log in</Button>
            )}
          </div>
        </div>

        <nav className="px-2 md:space-y-0.5 flex md:block gap-1 md:gap-0 overflow-x-auto md:overflow-visible pb-3 md:pb-0">
          {tabs.map((t) => navButton(t))}
          <span className="md:hidden contents">{secondary.map((t) => navButton(t, true))}</span>
        </nav>

        {compareList.length > 0 && (
          <div className="px-4 pt-4">
            {compareList.length >= 2 ? (
              <button
                onClick={() => setTab('compare')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded text-sm transition-colors duration-1 border ${
                  tab === 'compare' ? 'bg-secondary text-surface-0 border-secondary' : 'text-secondary border-secondary/40 hover:bg-secondary/10'
                }`}
              >
                <span>Compare</span>
                <span className="num text-xs">{compareList.length}</span>
              </button>
            ) : (
              <p className="text-xs text-ink-faint px-1">Pick {2 - compareList.length} more to compare</p>
            )}
            <button onClick={() => setCompareList([])} className="mt-1 px-1 text-[11px] text-ink-faint hover:text-danger">Clear selection</button>
          </div>
        )}

        <div className="hidden md:block mt-auto px-2 pb-4 pt-6 space-y-4">
          <div className="space-y-0.5">{secondary.map((t) => navButton(t, true))}</div>

          <div className="mx-2 border-t border-line pt-4 space-y-2">
            {collectionCount > 0 && (
              <p className="text-xs text-ink-muted px-1">
                <span className="num text-ink">{collectionCount.toLocaleString()}</span> cards loaded
              </p>
            )}
            {user ? (
              <div className="px-1 space-y-1.5">
                <p className="text-sm text-ink flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${syncStatus === 'error' ? 'bg-danger' : 'bg-ok'}`} />
                  {user.username}
                </p>
                <div className="flex items-center gap-3 text-xs">
                  <button onClick={syncToServer} className="text-accent hover:text-accent-hi" title="Sync to cloud">
                    {syncStatus === 'syncing' ? 'Syncing…' : syncStatus === 'synced' ? 'Saved' : syncStatus === 'error' ? 'Sync failed' : 'Sync'}
                  </button>
                  <button onClick={handleLogout} className="text-ink-faint hover:text-danger">Log out</button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="w-full" onClick={() => setShowAuthModal(true)}>
                Log in / Sign up
              </Button>
            )}
          </div>
        </div>
      </aside>

      {/* Content: list tabs stay mounted to keep their state */}
      <main className="flex-1 min-w-0 px-5 md:px-10 py-8 max-w-[1400px]">
        <div style={{ display: tab === 'upload' ? 'block' : 'none' }}>
          <CollectionUpload onUploaded={handleUploaded} collectionCount={collectionCount} />
        </div>
        <div style={{ display: tab === 'recommend' ? 'block' : 'none' }}>
          <Recommendations
            collectionCount={collectionCount}
            onSelectCommander={handleSelectCommander}
            compareList={compareList}
            onToggleCompare={handleToggleCompare}
            excludeInDecks={excludeInDecks}
            onToggleExclude={() => setExcludeInDecks((prev) => !prev)}
            deckCount={deckCount}
          />
        </div>
        <div style={{ display: tab === 'search' ? 'block' : 'none' }}>
          <CommanderSearch
            collectionCount={collectionCount}
            onSelectCommander={handleSelectCommander}
            compareList={compareList}
            onToggleCompare={handleToggleCompare}
          />
        </div>
        <div style={{ display: tab === 'favorites' ? 'block' : 'none' }}>
          <FavoritesTab
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            onClearFavorites={handleClearFavorites}
            onSelectCommander={handleSelectCommander}
            onOpenDeckBuilder={handleOpenDeckBuilder}
          />
        </div>
        <div style={{ display: tab === 'mydecks' ? 'block' : 'none' }}>
          <MyDecks onDecksChanged={handleDecksChanged} decksReady={decksReady} />
        </div>

        {tab === 'stats' && (
          <div className="page-fade-in"><CollectionStats collectionCount={collectionCount} /></div>
        )}
        {tab === 'detail' && selectedCommander && (
          <div className="page-fade-in">
            <CommanderDetailView
              commander={selectedCommander}
              collectionCount={collectionCount}
              onBack={() => setTab('recommend')}
              onOpenDeckBuilder={handleOpenDeckBuilder}
              excludeInDecks={excludeInDecks}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
            />
          </div>
        )}
        {tab === 'deckbuilder' && selectedCommander && deckBuilderData && (
          <div className="page-fade-in">
            <DeckBuilder
              data={deckBuilderData}
              commander={selectedCommander}
              onBack={() => setTab('detail')}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
            />
          </div>
        )}
        {tab === 'compare' && compareList.length >= 2 && (
          <div className="page-fade-in">
            <CompareView commanders={compareList} onBack={() => setTab('recommend')} onSelectCommander={handleSelectCommander} />
          </div>
        )}
        {tab === 'about' && <div className="page-fade-in"><AboutPage /></div>}
        {tab === 'guides' && <div className="page-fade-in"><GuidesPage onNavigate={setTab} /></div>}
      </main>
    </div>
  );
}
