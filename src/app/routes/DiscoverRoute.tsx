import { Outlet, useNavigate } from 'react-router-dom';
import { Recommendations } from '../../features/commanders/Recommendations';
import { CommanderSearch } from '../../features/commanders/CommanderSearch';
import { FavoritesTab } from '../../features/favorites/FavoritesTab';
import type { CardCommander } from '../../components/ui';
import type { CommanderDetail } from '../../types/api';
import { useAppState } from '../AppContext';
import { buildPath, commanderPath, paths } from '../paths';
import { SegmentedNav } from '../SegmentedNav';

/** The Discover surface: recommendations, search, and favorites as nested routes. */
export function DiscoverRoute() {
  const { favorites } = useAppState();
  return (
    <div>
      <SegmentedNav segments={[
        { to: paths.discover, label: 'Recommendations', end: true },
        { to: paths.search, label: 'Search' },
        { to: paths.favorites, label: 'Find My Commander', badge: favorites.size > 0 ? `${favorites.size}★` : undefined },
      ]} />
      <Outlet />
    </div>
  );
}

function useOpeners() {
  const navigate = useNavigate();
  return {
    openCommander: (cmd: CardCommander) => navigate(commanderPath(cmd.name), { state: { commander: cmd } }),
    openBuilder: (data: CommanderDetail, cmd?: CardCommander) =>
      navigate(buildPath(cmd?.name ?? data.commander), { state: { data, commander: cmd } }),
  };
}

export function RecommendationsPanel() {
  const { collectionCount, compareList, toggleCompare, excludeInDecks, toggleExcludeInDecks, deckCount } = useAppState();
  const { openCommander } = useOpeners();
  return (
    <Recommendations
      collectionCount={collectionCount}
      onSelectCommander={openCommander}
      compareList={compareList}
      onToggleCompare={toggleCompare}
      excludeInDecks={excludeInDecks}
      onToggleExclude={toggleExcludeInDecks}
      deckCount={deckCount}
    />
  );
}

export function SearchPanel() {
  const { collectionCount, compareList, toggleCompare } = useAppState();
  const { openCommander } = useOpeners();
  return (
    <CommanderSearch
      collectionCount={collectionCount}
      onSelectCommander={openCommander}
      compareList={compareList}
      onToggleCompare={toggleCompare}
    />
  );
}

export function FavoritesPanel() {
  const { favorites, toggleFavorite, clearFavorites } = useAppState();
  const { openCommander, openBuilder } = useOpeners();
  return (
    <FavoritesTab
      favorites={favorites}
      onToggleFavorite={toggleFavorite}
      onClearFavorites={clearFavorites}
      onSelectCommander={openCommander}
      onOpenDeckBuilder={openBuilder}
    />
  );
}
