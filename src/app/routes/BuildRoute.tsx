import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LoadingOverlay } from '../../components/ui';
import { DeckBuilder } from '../../features/deckbuilder/DeckBuilder';
import { apiGet } from '../../lib/api';
import type { CommanderDetail } from '../../types/api';
import { useAppState } from '../AppContext';
import { commanderPath } from '../paths';
import { useCommander } from './useCommander';

/** The Build surface for one commander. Uses the detail payload handed over by the detail page, or fetches a fresh one on a direct load. */
export function BuildRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const { commander, loading: commanderLoading, error: commanderError, name } = useCommander();
  const { favorites, toggleFavorite, excludeInDecks } = useAppState();

  const fromState = (location.state as { data?: CommanderDetail } | null)?.data;
  const [data, setData] = useState<CommanderDetail | null>(fromState ?? null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (fromState || !commander) return;
    let cancelled = false;
    apiGet<CommanderDetail>(`/api/commander/${encodeURIComponent(commander.name)}`, { exclude_in_decks: excludeInDecks })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [fromState, commander, excludeInDecks]);

  if (commanderError) {
    return (
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold">Commander not found</h2>
        <p className="text-ink-muted">No commander named “{name}”.</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold">Could not load deck data</h2>
        <p className="text-danger">{error}</p>
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
