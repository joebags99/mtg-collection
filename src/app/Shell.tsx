import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Button } from '../components/ui';
import { AuthModal } from '../features/auth/AuthModal';
import { useAppState } from './AppContext';
import { CompareDrawer } from './CompareDrawer';
import { paths } from './paths';

interface NavItem {
  to: string;
  label: string;
  badge?: string;
  muted?: boolean;
}

export function Shell() {
  const { collectionCount, deckCount, favorites, compareList, clearCompare, user, syncStatus, showAuthModal, setShowAuthModal, handleLogin, handleLogout, syncToServer } = useAppState();
  const [compareOpen, setCompareOpen] = useState(false);

  const surfaces: NavItem[] = [
    { to: paths.collection, label: 'Collection', badge: collectionCount ? collectionCount.toLocaleString() : undefined },
    { to: paths.discover, label: 'Discover', badge: favorites.size > 0 ? `${favorites.size}★` : undefined },
    { to: paths.decks, label: 'Decks', badge: deckCount ? String(deckCount) : undefined },
  ];
  const secondary: NavItem[] = [
    { to: paths.guides, label: 'Guides', muted: true },
    { to: paths.about, label: 'About', muted: true },
  ];

  const navLink = (item: NavItem) => (
    <NavLink
      key={item.to}
      to={item.to}
      className={({ isActive }) =>
        `w-auto md:w-full flex-shrink-0 whitespace-nowrap flex items-center justify-between gap-2 px-3 py-1.5 rounded text-left text-sm transition-colors duration-1 ${
          isActive
            ? 'bg-surface-3 text-ink'
            : item.muted ? 'text-ink-faint hover:text-ink-muted hover:bg-surface-2' : 'text-ink-muted hover:text-ink hover:bg-surface-2'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className="flex items-center gap-2">
            <span className={`w-1 h-1 rounded-full ${isActive ? 'bg-accent' : 'bg-transparent'}`} />
            {item.label}
          </span>
          {item.badge && <span className="text-[10px] num text-accent">{item.badge}</span>}
        </>
      )}
    </NavLink>
  );

  return (
    <div className="min-h-screen md:flex">
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} onLogin={handleLogin} />
      <CompareDrawer open={compareOpen} onClose={() => setCompareOpen(false)} />

      <aside className="md:w-60 md:flex-shrink-0 md:h-screen md:sticky md:top-0 bg-surface-1 border-b md:border-b-0 md:border-r border-line flex flex-col">
        <div className="px-5 pt-4 md:pt-5 pb-3 md:pb-4 flex items-center justify-between">
          <NavLink to={paths.collection} className="text-left">
            <div className="font-display text-xl font-semibold leading-tight text-ink">
              <span className="md:hidden">Commander Recommender</span>
              <span className="hidden md:inline">Commander<br />Recommender</span>
            </div>
            <div className="hidden md:block text-[10px] uppercase tracking-[0.18em] text-ink-faint mt-1.5">From your collection</div>
          </NavLink>
          <div className="md:hidden">
            {user ? (
              <span className="text-xs text-ink-muted">{user.username}</span>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setShowAuthModal(true)}>Log in</Button>
            )}
          </div>
        </div>

        <nav className="px-2 md:space-y-0.5 flex md:block gap-1 md:gap-0 overflow-x-auto md:overflow-visible pb-3 md:pb-0">
          {surfaces.map(navLink)}
          <span className="md:hidden contents">{secondary.map(navLink)}</span>
        </nav>

        {compareList.length > 0 && (
          <div className="px-4 pt-4">
            {compareList.length >= 2 ? (
              <button
                onClick={() => setCompareOpen(true)}
                className="w-full flex items-center justify-between px-3 py-2 rounded text-sm transition-colors duration-1 border text-secondary border-secondary/40 hover:bg-secondary/10"
              >
                <span>Compare</span>
                <span className="num text-xs">{compareList.length}</span>
              </button>
            ) : (
              <p className="text-xs text-ink-faint px-1">Pick {2 - compareList.length} more to compare</p>
            )}
            <button onClick={clearCompare} className="mt-1 px-1 text-[11px] text-ink-faint hover:text-danger">Clear selection</button>
          </div>
        )}

        <div className="hidden md:block mt-auto px-2 pb-4 pt-6 space-y-4">
          <div className="space-y-0.5">{secondary.map(navLink)}</div>

          <div className="mx-2 border-t border-line pt-4 space-y-2">
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

      <main className="flex-1 min-w-0 px-5 md:px-10 py-8 max-w-[1400px]">
        <Outlet />
      </main>
    </div>
  );
}
