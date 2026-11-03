import { useLocation, useNavigate } from 'react-router-dom';
import { Recommendations } from '../../features/commanders/Recommendations';
import { CommanderSearch } from '../../features/commanders/CommanderSearch';
import { FavoritesTab } from '../../features/favorites/FavoritesTab';
import type { CardCommander } from '../../components/ui';
import type { CommanderDetail } from '../../types/api';
import { useAppState } from '../AppContext';
import { buildPath, commanderPath, paths } from '../paths';
import { SegmentedNav } from '../SegmentedNav';

/**
 * The Discover surface: recommendations, search, and favorites.
 * All three panels stay mounted so their fetched results survive switching;
 * only the one matching the URL is shown.
 */
export function DiscoverRoute() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { collectionCount, compareList, toggleCompare, excludeInDecks, toggleExcludeInDecks, deckCount, favorites, toggleFavorite, clearFavorites } = useAppState();

  const openCommander = (cmd: CardCommander) => navigate(commanderPath(cmd.name), { state: { commander: cmd } });
  const openBuilder = (data: CommanderDetail, cmd?: CardCommander) =>
    navigate(buildPath(cmd?.name ?? data.commander), { state: { data, commander: cmd } });

  const panel = pathname.startsWith(paths.search) ? 'search' : pathname.startsWith(paths.favorites) ? 'favorites' : 'recommend';
  const show = (id: string) => ({ display: panel === id ? 'block' : 'none' });

  return (
    <div>
      <SegmentedNav segments={[
        { to: paths.discover, label: 'Recommendations', end: true },
        { to: paths.search, label: 'Search' },
        { to: paths.favorites, label: 'Find My Commander', badge: favorites.size > 0 ? `${favorites.size}★` : undefined },
      ]} />
      <div style={show('recommend')}>
        <Recommendations
          collectionCount={collectionCount}
          onSelectCommander={openCommander}
          compareList={compareList}
          onToggleCompare={toggleCompare}
          excludeInDecks={excludeInDecks}
          onToggleExclude={toggleExcludeInDecks}
          deckCount={deckCount}
        />
      </div>
      <div style={show('search')}>
        <CommanderSearch
          collectionCount={collectionCount}
          onSelectCommander={openCommander}
          compareList={compareList}
          onToggleCompare={toggleCompare}
        />
      </div>
      <div style={show('favorites')}>
        <FavoritesTab
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          onClearFavorites={clearFavorites}
          onSelectCommander={openCommander}
          onOpenDeckBuilder={openBuilder}
        />
      </div>
    </div>
  );
}
