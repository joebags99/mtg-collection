import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';
import { ALL_COLORS, COLOR_MAP } from '../../lib/colors';
import type { Color, Commander } from '../../types/api';
import { CommanderCard, type CardCommander } from '../../components/ui';

export interface CommanderSearchProps {
  collectionCount: number;
  onSelectCommander: (cmd: CardCommander) => void;
  compareList: CardCommander[];
  onToggleCompare: (cmd: CardCommander) => void;
}

export function CommanderSearch({ onSelectCommander, compareList, onToggleCompare }: CommanderSearchProps) {
  const [commanders, setCommanders] = useState<Commander[]>([]);
  const [popular, setPopular] = useState<Commander[]>([]);
  const [search, setSearch] = useState('');
  const [colorFilter, setColorFilter] = useState<Color[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedPopular, setLoadedPopular] = useState(false);

  // Load popular on mount
  useEffect(() => {
    if (!loadedPopular) {
      apiGet<{ commanders: Commander[] }>('/api/commanders/popular').then((data) => {
        setPopular(data.commanders || []);
        setLoadedPopular(true);
      }).catch(() => {});
    }
  }, [loadedPopular]);

  const doSearch = useCallback(async () => {
    setLoading(true);
    try {
      const color = colorFilter.length > 0 ? colorFilter.join('') : null;
      const data = await apiGet<{ count: number; commanders: Commander[] }>('/api/commanders', { search, color });
      setCommanders(data.commanders || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [search, colorFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.length >= 2) doSearch();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, colorFilter, doSearch]);

  const toggleColor = (c: Color) => {
    setColorFilter((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const showPopular = search.length < 2 && colorFilter.length === 0;
  const displayList = showPopular ? popular : commanders;
  const compareNames = new Set(compareList.map((c) => c.name));

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Search Commanders</h2>
      <p className="text-gray-400">
        Search any commander and see how close you are to their average EDHREC deck.
      </p>

      <div className="bg-gray-800 rounded-lg p-4 space-y-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Type a commander name (min 2 characters)..."
          className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        />
        <div className="flex gap-1 items-center">
          <span className="text-xs text-gray-400 mr-2">Filter:</span>
          {ALL_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => toggleColor(c)}
              className={`w-7 h-7 rounded font-bold text-xs transition-all ${
                colorFilter.includes(c)
                  ? 'ring-2 ring-white scale-110'
                  : 'opacity-50 hover:opacity-75'
              }`}
              style={{ backgroundColor: COLOR_MAP[c].bg, color: COLOR_MAP[c].text }}
            >
              {c}
            </button>
          ))}
          {colorFilter.length > 0 && (
            <button onClick={() => setColorFilter([])} className="text-xs text-gray-400 hover:text-white ml-2">
              Clear
            </button>
          )}
        </div>
      </div>

      {loading && <div className="text-center py-4 text-gray-400">Searching...</div>}

      {showPopular && popular.length > 0 && (
        <h3 className="text-sm font-medium text-gray-400">Popular Commanders</h3>
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
