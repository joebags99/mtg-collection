import { useQuery } from '@tanstack/react-query';
import { useLocation, useParams } from 'react-router-dom';
import { commanderLookupQuery } from '../../lib/queries';
import type { CardCommander } from '../../components/ui';

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
  const stateMatches = !!fromState && fromState.name === name;
  const lookup = useQuery({ ...commanderLookupQuery(name), enabled: !stateMatches && name.length > 0 });

  if (stateMatches) return { name, commander: fromState, loading: false, error: '' };
  return {
    name,
    commander: lookup.data ?? null,
    loading: lookup.isPending,
    error: lookup.error ? (lookup.error as Error).message : '',
  };
}
