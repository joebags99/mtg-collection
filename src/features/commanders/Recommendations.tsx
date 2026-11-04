import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiPost, type Params } from '../../lib/api';
import { keys } from '../../lib/queries';
import { useDiscoverState } from '../../app/DiscoverState';
import { ALL_COLORS, COLOR_MAP } from '../../lib/colors';
import type { Color, ScoredCommander } from '../../types/api';
import { ColorCountSelect, CommanderCard, LoadingOverlay, PageHero, type CardCommander } from '../../components/ui';
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
  const { recs, setRecs } = useDiscoverState();
  const { minOwned, minColors, colorFilter, search, tag, sortBy, applied } = recs;
  const setMinOwned = (v: number) => setRecs({ minOwned: v });
  const setMinColors = (v: number) => setRecs({ minColors: v });
  const setTag = (v: string) => setRecs({ tag: v });
  const setSearch = (v: string) => setRecs({ search: v });
  const setSortBy = (v: SortKey) => setRecs({ sortBy: v });
  const setColorFilter = (v: Color[] | ((prev: Color[]) => Color[])) =>
    setRecs({ colorFilter: typeof v === 'function' ? v(colorFilter) : v });
  const [localError, setLocalError] = useState('');

  const params: Params | null = applied ? { ...applied, exclude_in_decks: excludeInDecks || null, limit: 100 } : null;
  const query = useQuery({
    queryKey: keys.recommendations(params ?? {}),
    queryFn: async () => (await apiPost<{ results: ScoredCommander[] }>('/api/recommendations', {}, params ?? {})).results ?? [],
    enabled: params !== null && collectionCount > 0,
  });
  const results = query.data ?? [];
  const loading = query.isFetching;
  const error = localError || (query.error ? (query.error as Error).message : '');
  const fetched = params !== null && query.isSuccess;

  const fetchRecommendations = () => {
    if (collectionCount === 0) { setLocalError('Upload your collection first.'); return; }
    setLocalError('');
    const next = {
      min_owned: minOwned,
      min_colors: minColors,
      color: colorFilter.length > 0 ? colorFilter.join('') : null,
      search: search || null,
      tag: tag || null,
    };
    if (applied && JSON.stringify(applied) === JSON.stringify(next)) query.refetch();
    else setRecs({ applied: next });
  };

  const toggleColor = (c: Color) => {
    setColorFilter((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const sortedResults = sortResults(results, sortBy);

  // Archetypes seen across the current results, most common first, so the filter offers real choices.
  const archetypes = (() => {
    const seen = new Map<string, { name: string; count: number }>();
    for (const r of results) for (const t of r.tags ?? []) {
      const e = seen.get(t.slug) ?? { name: t.name, count: 0 };
      e.count += 1;
      seen.set(t.slug, e);
    }
    if (tag && !seen.has(tag)) seen.set(tag, { name: tag, count: 0 });
    return [...seen.entries()].sort((a, b) => b[1].count - a[1].count).map(([slug, e]) => ({ slug, ...e }));
  })();
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
            <label className="block text-xs text-ink-muted mb-1">Colors</label>
            <ColorCountSelect value={minColors} onChange={setMinColors} />
          </div>
          <div>
            <label className="block text-xs text-ink-muted mb-1">Archetype</label>
            <select
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              className="bg-surface-1 border border-line rounded px-2 py-1.5 text-sm max-w-[200px] focus:outline-none focus:border-accent/70"
              title={archetypes.length === 0 ? 'Run once to see the archetypes among your matches' : undefined}
            >
              <option value="">Any archetype</option>
              {archetypes.map((a) => (
                <option key={a.slug} value={a.slug}>{a.name}{a.count ? ` (${a.count})` : ''}</option>
              ))}
            </select>
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
