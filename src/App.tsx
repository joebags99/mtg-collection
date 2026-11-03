import { useCallback, useEffect, useState } from 'react';
import { apiAuthGet, apiAuthPost, apiGet, apiPost } from './lib/api';
import { clearAuth, loadAuthToken, loadAuthUser, loadCollection, loadDecks, saveCollection, saveDecks, saveFavorites, loadFavorites } from './lib/storage';
import type { AuthUser, CollectionSummary, CommanderDetail, Deck, UserData } from './types/api';
import type { Tab } from './types/nav';
import type { CardCommander } from './components/ui';
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

  const tabs: { id: Tab; label: string }[] = [
    { id: 'upload', label: 'Upload Collection' },
    { id: 'recommend', label: 'Recommendations' },
    { id: 'search', label: 'Search' },
    { id: 'favorites', label: `Find My Commander${favorites.size > 0 ? ` (${favorites.size}★)` : ''}` },
    { id: 'mydecks', label: `My Decks${deckCount ? ` (${deckCount})` : ''}` },
    { id: 'stats', label: 'Stats' },
  ];

  const headerLink = (id: Tab, label: string) => (
    <button
      onClick={() => setTab(id)}
      className={`text-sm font-medium transition-colors ${tab === id ? 'text-blue-400' : 'text-gray-400 hover:text-gray-200'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen">
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} onLogin={handleLogin} />

      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-8">
            <h1 className="text-xl font-bold">MTG Commander Recommender</h1>
            <nav className="flex items-center gap-6">
              {headerLink('guides', 'Guides')}
              {headerLink('about', 'About')}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            {collectionCount > 0 && <span className="text-sm text-gray-400">{collectionCount} cards</span>}
            {user && syncStatus && (
              <span className={`text-xs px-2 py-1 rounded ${
                syncStatus === 'syncing' ? 'bg-blue-900/50 text-blue-400' :
                syncStatus === 'synced' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
              }`}>
                {syncStatus === 'syncing' ? 'Syncing...' : syncStatus === 'synced' ? 'Saved!' : 'Sync failed'}
              </span>
            )}
            {user ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400"><span className="text-green-400">●</span> {user.username}</span>
                <button onClick={syncToServer} className="text-xs text-blue-400 hover:text-blue-300" title="Sync to cloud">Sync</button>
                <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-red-400">Logout</button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded text-sm font-medium transition-colors"
              >
                Login / Sign Up
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Nav */}
      <nav className="bg-gray-900/50 border-b border-gray-800 px-6">
        <div className="max-w-7xl mx-auto flex gap-1 items-center">
          {tabs.map((t) => {
            const active = tab === t.id || ((tab === 'detail' || tab === 'deckbuilder') && t.id === 'recommend');
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  active ? 'border-blue-500 text-blue-400'
                    : t.id === 'favorites' && favorites.size > 0 ? 'border-transparent text-yellow-400/80 hover:text-yellow-300'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                {t.label}
              </button>
            );
          })}

          {compareList.length >= 2 && (
            <button
              onClick={() => setTab('compare')}
              className={`ml-4 px-4 py-1.5 rounded text-sm font-medium transition-all ${
                tab === 'compare' ? 'bg-purple-600 text-white' : 'bg-purple-700/50 text-purple-300 hover:bg-purple-700'
              }`}
            >
              Compare ({compareList.length})
            </button>
          )}
          {compareList.length > 0 && compareList.length < 2 && (
            <span className="ml-4 text-xs text-gray-500">Select {2 - compareList.length} more to compare</span>
          )}
          {compareList.length > 0 && (
            <button onClick={() => setCompareList([])} className="ml-2 text-xs text-gray-500 hover:text-red-400">Clear</button>
          )}
        </div>
      </nav>

      {/* Content: list tabs stay mounted to keep their state */}
      <main className="max-w-7xl mx-auto px-6 py-8">
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
