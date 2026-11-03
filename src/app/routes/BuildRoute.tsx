import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { LoadingOverlay } from '../../components/ui';
import { DeckBuilder } from '../../features/deckbuilder/DeckBuilder';
import { commanderDetailQuery } from '../../lib/queries';
import type { CommanderDetail } from '../../types/api';
import { useAppState } from '../AppContext';
import { commanderPath } from '../paths';
import { useCommander } from './useCommander';

/** The Build surface for one commander. Uses the detail payload handed over by the detail page, or fetches one on a direct load. */
export function BuildRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const { commander, loading: commanderLoading, error: commanderError, name } = useCommander();
  const { favorites, toggleFavorite, excludeInDecks } = useAppState();

  const fromState = (location.state as { data?: CommanderDetail } | null)?.data ?? null;
  const detail = useQuery({
    ...commanderDetailQuery(commander?.name ?? name, { exclude_in_decks: excludeInDecks || null }),
    enabled: !fromState && !!commander,
  });
  const data = fromState ?? detail.data ?? null;

  if (commanderError) {
    return (
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold">Commander not found</h2>
        <p className="text-ink-muted">No commander named “{name}”.</p>
      </div>
    );
  }
  if (detail.error) {
    return (
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold">Could not load deck data</h2>
        <p className="text-danger">{(detail.error as Error).message}</p>
        <button onClick={() => navigate(commanderPath(name))} className="text-accent hover:underline">← Back to commander</button>
      </div>
    );
  }
  if (commanderLoading || !commander || !data) {
    return <LoadingOverlay message="Preparing the deck builder…" submessage="Loading the average deck and your collection." />;
  }

  return (
    <DeckBuilder
      key={commander.name}
      data={data}
      commander={commander}
      onBack={() => navigate(commanderPath(commander.name), { state: { commander } })}
      favorites={favorites}
      onToggleFavorite={toggleFavorite}
    />
  );
}
