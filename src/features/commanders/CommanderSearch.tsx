import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../lib/api';
import { keys, popularQuery } from '../../lib/queries';
import { useDebounced } from '../../lib/useDebounced';
import { useDiscoverState } from '../../app/DiscoverState';
import { ALL_COLORS, COLOR_MAP } from '../../lib/colors';
import type { Color, Commander } from '../../types/api';
import { ColorCountSelect, CommanderCard, type CardCommander } from '../../components/ui';

export interface CommanderSearchProps {
  collectionCount: number;
  onSelectCommander: (cmd: CardCommander) => void;
  compareList: CardCommander[];
  onToggleCompare: (cmd: CardCommander) => void;
}

export function CommanderSearch({ onSelectCommander, compareList, onToggleCompare }: CommanderSearchProps) {
  const { search: state, setSearch: setState } = useDiscoverState();
  const { query: search, colorFilter, minColors } = state;
  const setSearch = (v: string) => setState({ query: v });
  const setMinColors = (v: number) => setState({ minColors: v });
  const setColorFilter = (v: Color[] | ((prev: Color[]) => Color[])) =>
    setState({ colorFilter: typeof v === 'function' ? v(colorFilter) : v });
  const debounced = useDebounced(search, 300);
  const color = colorFilter.length > 0 ? colorFilter.join('') : null;

  const popularList = useQuery(popularQuery);
  const popular = popularList.data ?? [];
  const searchQuery = useQuery({
    queryKey: [...keys.commanderSearch(debounced, color), minColors],
    queryFn: async () => (await apiGet<{ count: number; commanders: Commander[] }>('/api/commanders', { search: debounced, color, min_colors: minColors || null })).commanders ?? [],
    enabled: debounced.length >= 2,
  });
  const commanders = debounced.length >= 2 ? (searchQuery.data ?? []) : [];
  const loading = searchQuery.isFetching;

  const toggleColor = (c: Color) => {
    setColorFilter((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const showPopular = search.length < 2 && colorFilter.length === 0 && minColors === 0;
  const displayList = showPopular ? popular : commanders;
  const compareNames = new Set(compareList.map((c) => c.name));

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Search Commanders</h2>
      <p className="text-ink-muted">
        Search any commander and see how close you are to their average EDHREC deck.
      </p>

      <div className="bg-surface-2 rounded-lg p-4 space-y-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Type a commander name (min 2 characters)..."
          className="w-full bg-surface-1 border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-accent/70"
        />
        <div className="flex gap-1 items-center">
          <span className="text-xs text-ink-muted mr-2">Filter:</span>
          {ALL_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => toggleColor(c)}
              className={`w-7 h-7 rounded font-bold text-xs transition-all ${
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
            <button onClick={() => setColorFilter([])} className="text-xs text-ink-muted hover:text-ink ml-2">
              Clear
            </button>
          )}
          <span className="text-xs text-ink-muted ml-4 mr-2">Colors:</span>
          <ColorCountSelect value={minColors} onChange={setMinColors} />
        </div>
      </div>

      {loading && <div className="text-center py-4 text-ink-muted">Searching...</div>}

      {showPopular && popular.length > 0 && (
        <h3 className="text-sm font-medium text-ink-muted">Popular Commanders</h3>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 grid-stagger">
        {displayList.map((cmd) => (
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
    </div>
  );
}
