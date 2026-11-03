import { useCallback, useEffect, useState } from 'react';
import { apiPost } from '../../lib/api';
import { ALL_COLORS, COLOR_MAP } from '../../lib/colors';
import type { Color, ScoredCommander } from '../../types/api';
import { CommanderCard, LoadingOverlay, PageHero, type CardCommander } from '../../components/ui';
import { SORT_OPTIONS, sortResults, type SortKey } from './sorting';

export interface RecommendationsProps {
  collectionCount: number;
  onSelectCommander: (cmd: CardCommander) => void;
  compareList: CardCommander[];
  onToggleCompare: (cmd: CardCommander) => void;
  excludeInDecks: boolean;
  onToggleExclude: () => void;
  deckCount: number;
}

export function Recommendations({ collectionCount, onSelectCommander, compareList, onToggleCompare, excludeInDecks, onToggleExclude, deckCount }: RecommendationsProps) {
  const [results, setResults] = useState<ScoredCommander[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [colorFilter, setColorFilter] = useState<Color[]>([]);
  const [minOwned, setMinOwned] = useState(20);
  const [fetched, setFetched] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('match_desc');

  const fetchRecommendations = useCallback(async () => {
    if (collectionCount === 0) {
      setError('Upload your collection first.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const color = colorFilter.length > 0 ? colorFilter.join('') : null;
      const data = await apiPost<{ results: ScoredCommander[] }>(
        `/api/recommendations?min_owned=${minOwned}&limit=100${color ? '&color=' + color : ''}${search ? '&search=' + encodeURIComponent(search) : ''}${excludeInDecks ? '&exclude_in_decks=true' : ''}`,
        {},
      );
      setResults(data.results || []);
      setFetched(true);
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  }, [collectionCount, colorFilter, minOwned, search, excludeInDecks]);

  // Auto-refetch when excludeInDecks toggle changes (if already fetched)
  useEffect(() => {
    if (fetched) {
      fetchRecommendations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excludeInDecks]);

  const toggleColor = (c: Color) => {
    setColorFilter((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const sortedResults = sortResults(results, sortBy);
  const compareNames = new Set(compareList.map((c) => c.name));

  // Get top 3 commanders for the hero display
  const topCommanders = sortedResults.slice(0, 3);
  const priced = results.map((r) => r.missing_price).filter((price): price is number => typeof price === 'number' && price > 0);

  return (
    <div className="space-y-6">
      <PageHero
        title="Commander Recommendations"
        subtitle={`Based on your collection of ${collectionCount.toLocaleString()} cards, ranked by how many cards you already own in each commander's average EDHREC deck.`}
        commanders={topCommanders}
        stats={fetched && results.length > 0 ? [
          { value: results.length, label: 'Commanders Found' },
          { value: `${Math.max(...results.map((r) => r.match_percentage || 0))}%`, label: 'Best Match' },
          ...(priced.length > 0 ? [{ value: `$${Math.min(...priced).toFixed(0)}`, label: 'Cheapest Build' }] : []),
        ] : []}
      />

      {/* Filters */}
      <div className="bg-surface-2/80 backdrop-blur rounded-xl p-4 space-y-4 border border-line">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-ink-muted mb-1">Search</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Commander name..."
              className="bg-surface-1 border border-line rounded px-3 py-1.5 text-sm focus:outline-none focus:border-accent/70"
            />
          </div>
          <div>
            <label className="block text-xs text-ink-muted mb-1">Min owned cards</label>
            <input
              type="number"
              value={minOwned}
              onChange={(e) => setMinOwned(parseInt(e.target.value) || 0)}
              className="bg-surface-1 border border-line rounded px-3 py-1.5 text-sm w-20 focus:outline-none focus:border-accent/70"
            />
          </div>
          <div>
            <label className="block text-xs text-ink-muted mb-1">Color Identity</label>
            <div className="flex gap-1">
              {ALL_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => toggleColor(c)}
                  className={`w-8 h-8 rounded font-bold text-sm transition-all ${
                    colorFilter.includes(c)
                      ? 'ring-2 ring-ink scale-110'
                      : 'opacity-50 hover:opacity-75'
                  }`}
                  style={{ backgroundColor: COLOR_MAP[c].bg, color: COLOR_MAP[c].text }}
                >
                  {c}
                </button>
              ))}
              {colorFilter.length > 0 && (
                <button
                  onClick={() => setColorFilter([])}
                  className="text-xs text-ink-muted hover:text-ink ml-2"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <button
            onClick={fetchRecommendations}
            disabled={loading}
            className="bg-accent text-accent-ink hover:bg-accent-hi disabled:bg-surface-3 disabled:text-ink-faint px-5 py-1.5 rounded font-medium"
          >
            {loading ? 'Loading...' : fetched ? 'Refresh' : 'Get Recommendations'}
          </button>
          {deckCount > 0 && (
            <label className="flex items-center gap-2 text-sm cursor-pointer ml-2">
              <input
                type="checkbox"
                checked={excludeInDecks}
                onChange={onToggleExclude}
                className="rounded"
              />
              <span className="text-ink-muted">Exclude cards in decks</span>
            </label>
          )}
        </div>

        {/* Sort */}
        {fetched && results.length > 0 && (
          <div className="flex items-center gap-3 pt-2 border-t border-line">
            <label className="text-xs text-ink-muted">Sort by:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="bg-surface-1 border border-line rounded px-2 py-1 text-sm focus:outline-none focus:border-accent/70"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <span className="text-xs text-ink-faint ml-auto">
              {results.length} commanders found
            </span>
          </div>
        )}
      </div>

      {error && <div className="bg-danger/10 border border-danger/40 rounded p-3 text-danger">{error}</div>}

      {loading && <LoadingOverlay message="Fetching recommendations from EDHREC..." submessage="Comparing up to 200 commanders with your collection. This may take a few minutes." />}

      {!loading && sortedResults.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 grid-stagger">
          {sortedResults.map((cmd) => (
            <CommanderCard
              key={cmd.name}
              commander={cmd}
              onClick={onSelectCommander}
              selectable={true}
              selected={compareNames.has(cmd.name)}
              onToggleCompare={onToggleCompare}
            />
          ))}
        </div>
      )}

      {!loading && fetched && results.length === 0 && (
        <p className="text-ink-faint text-center py-8">No commanders found with {minOwned}+ owned cards.</p>
      )}
    </div>
  );
}
