import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { apiGet } from '../../lib/api';
import type { CardCommander } from '../../components/ui';
import type { Commander } from '../../types/api';

interface Resolved {
  name: string;
  commander: CardCommander | null;
  loading: boolean;
  error: string;
}

/** The commander for the current /commander/:name URL: from navigation state when present, else looked up by name. */
export function useCommander(): Resolved {
  const { name = '' } = useParams<{ name: string }>();
  const location = useLocation();
  const fromState = (location.state as { commander?: CardCommander } | null)?.commander;
  const [commander, setCommander] = useState<CardCommander | null>(fromState && fromState.name === name ? fromState : null);
  const [loading, setLoading] = useState(!commander);
  const [error, setError] = useState('');

  useEffect(() => {
    if (fromState && fromState.name === name) { setCommander(fromState); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError('');
    apiGet<Commander>('/api/commanders/lookup', { name })
      .then((c) => { if (!cancelled) setCommander(c); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [name, fromState]);

  return { name, commander, loading, error };
}
