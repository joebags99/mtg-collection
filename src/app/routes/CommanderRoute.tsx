import { useNavigate } from 'react-router-dom';
import { LoadingOverlay, type CardCommander } from '../../components/ui';
import { CommanderDetail } from '../../features/commanders/CommanderDetail';
import type { CommanderDetail as CommanderDetailData } from '../../types/api';
import { useAppState } from '../AppContext';
import { buildPath, paths } from '../paths';
import { useCommander } from './useCommander';

export function CommanderRoute() {
  const navigate = useNavigate();
  const { commander, loading, error, name } = useCommander();
  const { collectionCount, excludeInDecks, favorites, toggleFavorite } = useAppState();

  if (loading) return <LoadingOverlay message="Finding commander…" />;
  if (error || !commander) {
    return (
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold">Commander not found</h2>
        <p className="text-ink-muted">No commander named “{name}”. {error}</p>
        <button onClick={() => navigate(-1)} className="text-accent hover:underline">← Back</button>
      </div>
    );
  }

  const openBuilder = (data: CommanderDetailData, cmd?: CardCommander) =>
    navigate(buildPath(commander.name), { state: { data, commander: cmd ?? commander } });

  return (
    <CommanderDetail
      key={commander.name}
      commander={commander}
      collectionCount={collectionCount}
      onBack={() => (window.history.length > 1 ? navigate(-1) : navigate(paths.discover))}
      onOpenDeckBuilder={openBuilder}
      excludeInDecks={excludeInDecks}
      favorites={favorites}
      onToggleFavorite={toggleFavorite}
    />
  );
}
