import React, { useState, useCallback, useEffect, useRef } from 'react';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// --- Color Identity Helpers ---
const COLOR_MAP = {
  W: { label: 'White', bg: '#f9faf4', text: '#333', symbol: '☀' },
  U: { label: 'Blue', bg: '#0e68ab', text: '#fff', symbol: '💧' },
  B: { label: 'Black', bg: '#2b2b2b', text: '#ccc', symbol: '💀' },
  R: { label: 'Red', bg: '#d32029', text: '#fff', symbol: '🔥' },
  G: { label: 'Green', bg: '#00733e', text: '#fff', symbol: '🌲' },
};

const ALL_COLORS = ['W', 'U', 'B', 'R', 'G'];

function ColorBadge({ colors }) {
  if (!colors || colors.length === 0) {
    return <span className="text-xs bg-gray-600 px-1.5 py-0.5 rounded">C</span>;
  }
  return (
    <span className="inline-flex gap-0.5">
      {colors.map(c => (
        <span
          key={c}
          className="text-xs px-1.5 py-0.5 rounded font-bold"
          style={{ backgroundColor: COLOR_MAP[c]?.bg, color: COLOR_MAP[c]?.text }}
        >
          {c}
        </span>
      ))}
    </span>
  );
}

function CardName({ name, className = '' }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef(null);
  const imgSrc = `https://api.scryfall.com/cards/named?format=image&version=normal&exact=${encodeURIComponent(name)}`;

  const handleMouseEnter = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    let x = rect.right + 8;
    let y = rect.top;
    if (x + 250 > viewportW) x = rect.left - 258;
    if (y + 350 > viewportH) y = viewportH - 360;
    if (y < 8) y = 8;
    setPos({ x, y });
    setShow(true);
  };

  return (
    <span
      ref={ref}
      className={`cursor-pointer hover:text-blue-400 transition-colors ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShow(false)}
    >
      {name}
      {show && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{ left: pos.x, top: pos.y }}
        >
          <img
            src={imgSrc}
            alt={name}
            className="w-[250px] rounded-lg shadow-2xl border border-gray-700"
          />
        </div>
      )}
    </span>
  );
}

function MatchBar({ percentage, size = 'sm' }) {
  const color =
    percentage >= 60 ? 'bg-green-500' :
    percentage >= 40 ? 'bg-yellow-500' :
    percentage >= 20 ? 'bg-orange-500' :
    'bg-red-500';
  const h = size === 'sm' ? 'h-1.5' : 'h-2.5';
  return (
    <div className={`w-full bg-gray-700 rounded-full ${h}`}>
      <div
        className={`${color} ${h} rounded-full transition-all duration-500`}
        style={{ width: `${Math.min(percentage, 100)}%` }}
      />
    </div>
  );
}

// --- localStorage helpers ---
const STORAGE_KEY = 'mtg_collection';

function saveCollection(cards) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  } catch (e) {
    console.error('Failed to save collection to localStorage:', e);
  }
}

function loadCollection() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error('Failed to load collection from localStorage:', e);
  }
  return null;
}

// --- API helpers ---
async function apiGet(path, params = {}) {
  const url = new URL(API + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') url.searchParams.set(k, v);
  });
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'API error');
  }
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'API error');
  }
  return res.json();
}

async function apiUpload(path, file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(API + path, { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'API error');
  }
  return res.json();
}

// --- Components ---

function CollectionUpload({ onUploaded, collectionCount }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiUpload('/api/collection/upload', file);
      setResult(data);
      saveCollection(data.cards);
      onUploaded(data);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleText = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiPost('/api/collection/text', { text });
      setResult(data);
      saveCollection(data.cards);
      onUploaded(data);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleClear = () => {
    localStorage.removeItem(STORAGE_KEY);
    setResult(null);
    onUploaded({ count: 0, cards: [] });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold">Upload Collection</h2>
      <p className="text-gray-400">
        Upload a CSV export from <strong>Archidekt</strong> or <strong>Moxfield</strong>,
        or paste a card list. Your collection is saved locally in your browser.
      </p>

      {collectionCount > 0 && (
        <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 flex items-center justify-between">
          <p className="text-blue-300">
            Collection loaded: <strong>{collectionCount}</strong> unique cards
            {loadCollection() && <span className="text-blue-400/70 text-sm ml-2">(saved in browser)</span>}
          </p>
          <button
            onClick={handleClear}
            className="text-red-400 hover:text-red-300 text-sm"
          >
            Clear Collection
          </button>
        </div>
      )}

      {/* CSV Upload */}
      <div className="bg-gray-800 rounded-lg p-6 space-y-3">
        <h3 className="font-semibold text-lg">CSV File Upload</h3>
        <input
          type="file"
          accept=".csv,.txt"
          onChange={handleFile}
          className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-blue-600 file:text-white file:cursor-pointer hover:file:bg-blue-500"
        />
      </div>

      {/* Text Paste */}
      <div className="bg-gray-800 rounded-lg p-6 space-y-3">
        <h3 className="font-semibold text-lg">Paste Card List</h3>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={"1 Sol Ring\n1 Rhystic Study\n1 Swords to Plowshares\n..."}
          rows={8}
          className="w-full bg-gray-900 border border-gray-700 rounded p-3 text-sm font-mono focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={handleText}
          disabled={loading || !text.trim()}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 px-4 py-2 rounded font-medium"
        >
          {loading ? 'Processing...' : 'Upload'}
        </button>
      </div>

      {error && <div className="bg-red-900/50 border border-red-700 rounded p-3 text-red-300">{error}</div>}

      {result && (
        <div className="bg-green-900/50 border border-green-700 rounded p-4">
          <p className="text-green-300 font-medium">
            Loaded {result.count} unique cards into your collection.
          </p>
        </div>
      )}
    </div>
  );
}

function CommanderCard({ commander, onClick, selectable, selected, onToggleCompare }) {
  const hasMatch = commander.match_percentage !== undefined;
  return (
    <div
      className={`bg-gray-800 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all relative ${selected ? 'ring-2 ring-purple-500' : ''}`}
    >
      {selectable && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleCompare?.(commander); }}
          className={`absolute top-2 right-2 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${
            selected ? 'bg-purple-500 border-purple-500 text-white' : 'bg-gray-900/70 border-gray-400 text-gray-400 hover:border-purple-400'
          }`}
          title={selected ? 'Remove from comparison' : 'Add to comparison'}
        >
          {selected ? '✓' : '+'}
        </button>
      )}
      <div onClick={() => onClick?.(commander)}>
        {commander.image_uri && (
          <div className="relative">
            <img
              src={commander.image_uri}
              alt={commander.name}
              className="w-full aspect-[5/7] object-cover"
              loading="lazy"
            />
            {hasMatch && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent px-2 pb-2 pt-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-300">
                    {commander.owned_count}/{commander.total_cards}
                  </span>
                  <span className={`text-sm font-bold ${
                    commander.match_percentage >= 60 ? 'text-green-400' :
                    commander.match_percentage >= 40 ? 'text-yellow-400' :
                    'text-gray-400'
                  }`}>
                    {commander.match_percentage}%
                  </span>
                </div>
                <MatchBar percentage={commander.match_percentage} />
              </div>
            )}
          </div>
        )}
        <div className="p-3 space-y-1.5">
          <h3 className="font-bold text-sm leading-tight">{commander.name}</h3>
          <div className="flex items-center justify-between">
            <ColorBadge colors={commander.color_identity} />
            {commander.missing_price > 0 && (
              <span className="text-xs text-yellow-400">${commander.missing_price.toFixed(0)}</span>
            )}
          </div>
          {commander.num_decks > 0 && (
            <p className="text-xs text-gray-500">{commander.num_decks.toLocaleString()} decks</p>
          )}
        </div>
      </div>
    </div>
  );
}

const SORT_OPTIONS = [
  { value: 'match_desc', label: 'Most Complete' },
  { value: 'match_asc', label: 'Least Complete' },
  { value: 'price_asc', label: 'Cheapest to Complete' },
  { value: 'price_desc', label: 'Most Expensive to Complete' },
  { value: 'edhrec', label: 'EDHREC Popularity' },
  { value: 'owned_desc', label: 'Most Cards Owned' },
];

function sortResults(results, sortBy) {
  const sorted = [...results];
  switch (sortBy) {
    case 'match_desc': return sorted.sort((a, b) => b.match_percentage - a.match_percentage);
    case 'match_asc': return sorted.sort((a, b) => a.match_percentage - b.match_percentage);
    case 'price_asc': return sorted.sort((a, b) => (a.missing_price || 9999) - (b.missing_price || 9999));
    case 'price_desc': return sorted.sort((a, b) => (b.missing_price || 0) - (a.missing_price || 0));
    case 'edhrec': return sorted.sort((a, b) => (a.edhrec_rank || 9999) - (b.edhrec_rank || 9999));
    case 'owned_desc': return sorted.sort((a, b) => b.owned_count - a.owned_count);
    default: return sorted;
  }
}

function Recommendations({ collectionCount, onSelectCommander, compareList, onToggleCompare }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [colorFilter, setColorFilter] = useState([]);
  const [minOwned, setMinOwned] = useState(20);
  const [fetched, setFetched] = useState(false);
  const [sortBy, setSortBy] = useState('match_desc');

  const fetchRecommendations = useCallback(async () => {
    if (collectionCount === 0) {
      setError('Upload your collection first.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const color = colorFilter.length > 0 ? colorFilter.join('') : null;
      const data = await apiPost(
        `/api/recommendations?min_owned=${minOwned}&limit=100${color ? '&color=' + color : ''}${search ? '&search=' + encodeURIComponent(search) : ''}`,
        {}
      );
      setResults(data.results || []);
      setFetched(true);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [collectionCount, colorFilter, minOwned, search]);

  const toggleColor = (c) => {
    setColorFilter(prev =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
    );
  };

  const sortedResults = sortResults(results, sortBy);
  const compareNames = new Set(compareList.map(c => c.name));

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Commander Recommendations</h2>
      <p className="text-gray-400">
        Based on your collection of {collectionCount} cards, ranked by how many cards
        you already own in each commander's average EDHREC deck.
      </p>

      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Search</label>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Commander name..."
              className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Min owned cards</label>
            <input
              type="number"
              value={minOwned}
              onChange={e => setMinOwned(parseInt(e.target.value) || 0)}
              className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm w-20 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Color Identity</label>
            <div className="flex gap-1">
              {ALL_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => toggleColor(c)}
                  className={`w-8 h-8 rounded font-bold text-sm transition-all ${
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
                <button
                  onClick={() => setColorFilter([])}
                  className="text-xs text-gray-400 hover:text-white ml-2"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <button
            onClick={fetchRecommendations}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 px-5 py-1.5 rounded font-medium"
          >
            {loading ? 'Loading...' : fetched ? 'Refresh' : 'Get Recommendations'}
          </button>
        </div>

        {/* Sort */}
        {fetched && results.length > 0 && (
          <div className="flex items-center gap-3 pt-2 border-t border-gray-700">
            <label className="text-xs text-gray-400">Sort by:</label>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <span className="text-xs text-gray-500 ml-auto">
              {results.length} commanders found
            </span>
          </div>
        )}
      </div>

      {error && <div className="bg-red-900/50 border border-red-700 rounded p-3 text-red-300">{error}</div>}

      {loading && (
        <div className="text-center py-12 text-gray-400">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p>Fetching average decklists from EDHREC and comparing with your collection...</p>
          <p className="text-sm mt-1">This checks up to 200 commanders and fetches prices. May take a few minutes.</p>
        </div>
      )}

      {!loading && sortedResults.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {sortedResults.map(cmd => (
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
        <p className="text-gray-500 text-center py-8">No commanders found with {minOwned}+ owned cards.</p>
      )}
    </div>
  );
}

function CommanderSearch({ collectionCount, onSelectCommander, compareList, onToggleCompare }) {
  const [commanders, setCommanders] = useState([]);
  const [popular, setPopular] = useState([]);
  const [search, setSearch] = useState('');
  const [colorFilter, setColorFilter] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadedPopular, setLoadedPopular] = useState(false);

  // Load popular on mount
  useEffect(() => {
    if (!loadedPopular) {
      apiGet('/api/commanders/popular').then(data => {
        setPopular(data.commanders || []);
        setLoadedPopular(true);
      }).catch(() => {});
    }
  }, [loadedPopular]);

  const doSearch = useCallback(async () => {
    setLoading(true);
    try {
      const color = colorFilter.length > 0 ? colorFilter.join('') : null;
      const data = await apiGet('/api/commanders', { search, color });
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

  const toggleColor = (c) => {
    setColorFilter(prev =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
    );
  };

  const showPopular = search.length < 2 && colorFilter.length === 0;
  const displayList = showPopular ? popular : commanders;
  const compareNames = new Set(compareList.map(c => c.name));

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Search Commanders</h2>
      <p className="text-gray-400">
        Search any commander and see how close you are to their average EDHREC deck.
      </p>

      <div className="bg-gray-800 rounded-lg p-4 space-y-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Type a commander name (min 2 characters)..."
          className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        />
        <div className="flex gap-1 items-center">
          <span className="text-xs text-gray-400 mr-2">Filter:</span>
          {ALL_COLORS.map(c => (
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

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {displayList.map(cmd => (
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

// --- Card Type Grouping ---
const CARD_TYPE_ORDER = ['Creature', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Planeswalker', 'Land', 'Other'];

function groupByType(cards) {
  const groups = {};
  for (const card of cards) {
    const type = card.card_type || 'Other';
    if (!groups[type]) groups[type] = [];
    groups[type].push(card);
  }
  return CARD_TYPE_ORDER.filter(t => groups[t]?.length > 0).map(t => ({ type: t, cards: groups[t] }));
}

function CardListByType({ ownedCards, missingCards, showOwned, showMissing, totalMissingPrice }) {
  const ownedGroups = groupByType(ownedCards);
  const missingGroups = groupByType(missingCards);

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {showOwned && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-green-400">
            Owned Cards ({ownedCards.length})
          </h3>
          {ownedGroups.length === 0 && (
            <p className="text-gray-500 text-sm bg-gray-800 rounded-lg px-3 py-4">None</p>
          )}
          {ownedGroups.map(({ type, cards }) => (
            <div key={type}>
              <h4 className="text-sm font-medium text-gray-400 mb-1">{type} ({cards.length})</h4>
              <div className="bg-gray-800 rounded-lg divide-y divide-gray-700">
                {cards.map(card => (
                  <div key={card.name} className="px-3 py-2 flex justify-between items-center">
                    <CardName name={card.name} className="text-sm" />
                    <span className="text-xs text-gray-500">{card.category}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showMissing && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-red-400">
            Missing Cards ({missingCards.length})
            {totalMissingPrice > 0 && (
              <span className="text-sm font-normal text-yellow-400 ml-2">
                ~${totalMissingPrice.toFixed(2)}
              </span>
            )}
          </h3>
          {missingGroups.length === 0 && (
            <p className="text-gray-500 text-sm bg-gray-800 rounded-lg px-3 py-4">None</p>
          )}
          {missingGroups.map(({ type, cards }) => (
            <div key={type}>
              <h4 className="text-sm font-medium text-gray-400 mb-1">{type} ({cards.length})</h4>
              <div className="bg-gray-800 rounded-lg divide-y divide-gray-700">
                {cards.map(card => (
                  <div key={card.name} className="px-3 py-2 flex justify-between items-center">
                    <CardName name={card.name} className="text-sm" />
                    <span className="text-xs text-yellow-400/70">
                      {card.price ? `$${card.price.toFixed(2)}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Deck Builder ---

// Cards that can have any number of copies
const UNLIMITED_CARDS = new Set([
  'nazgul', 'persistent petitioners', 'rat colony', 'relentless rats',
  'shadowborn apostle', 'slime against humanity', 'dragon\'s approach',
  'seven dwarves', 'plains', 'island', 'swamp', 'mountain', 'forest',
  'snow-covered plains', 'snow-covered island', 'snow-covered swamp',
  'snow-covered mountain', 'snow-covered forest', 'wastes',
]);

function canHaveMultiple(name) {
  return UNLIMITED_CARDS.has(name.toLowerCase());
}

function DeckCardImage({ name, small }) {
  const src = `https://api.scryfall.com/cards/named?format=image&version=${small ? 'small' : 'normal'}&exact=${encodeURIComponent(name)}`;
  return <img src={src} alt={name} className="rounded-lg shadow-lg" loading="lazy" />;
}

function StackCard({ card, index, isLast, canMultiple, onToggle, onSetQty }) {
  const [hovered, setHovered] = useState(false);
  const [imgPos, setImgPos] = useState({ x: 0, y: 0 });
  const ref = useRef(null);
  const STRIP_HEIGHT = 32;
  const imgSrc = `https://api.scryfall.com/cards/named?format=image&version=normal&exact=${encodeURIComponent(card.name)}`;

  const handleMouseEnter = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    let x = rect.right + 8;
    let y = rect.top;
    if (x + 260 > viewportW) x = rect.left - 268;
    if (y + 370 > viewportH) y = viewportH - 380;
    if (y < 8) y = 8;
    setImgPos({ x, y });
    setHovered(true);
  };

  return (
    <div
      ref={ref}
      className="relative group"
      style={{
        height: isLast ? 'auto' : `${STRIP_HEIGHT}px`,
        overflow: isLast ? 'visible' : 'hidden',
        zIndex: hovered ? 100 : index,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setHovered(false)}
    >
      {/* The card strip: show quantity + name */}
      <div
        className={`flex items-center gap-1 px-1.5 cursor-pointer rounded-t border border-gray-700 ${
          hovered ? 'bg-gray-600 border-blue-500' : 'bg-gray-800'
        }`}
        style={{ height: `${STRIP_HEIGHT}px` }}
      >
        <span className="text-xs text-gray-500 w-4 text-center flex-shrink-0">{card.qty}</span>
        {card.owned ? (
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
        )}
        <span className="text-xs truncate flex-1">{card.name}</span>
        {canMultiple && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); onSetQty(card.name, card.qty - 1); }}
              className="w-4 h-4 rounded bg-gray-700 hover:bg-gray-500 text-[10px] flex items-center justify-center"
            >-</button>
            <button
              onClick={(e) => { e.stopPropagation(); onSetQty(card.name, card.qty + 1); }}
              className="w-4 h-4 rounded bg-gray-700 hover:bg-gray-500 text-[10px] flex items-center justify-center"
            >+</button>
          </div>
        )}
      </div>

      {/* Hover: show full card image as a floating overlay */}
      {hovered && (
        <div
          className="fixed z-[200] pointer-events-none"
          style={{ left: imgPos.x, top: imgPos.y }}
        >
          <img
            src={imgSrc}
            alt={card.name}
            className="w-[250px] rounded-lg shadow-2xl border border-gray-600"
          />
        </div>
      )}
    </div>
  );
}

function DeckBuilder({ data, commander, onBack }) {
  const [deck, setDeck] = useState([]);
  const [exportText, setExportText] = useState('');
  const [viewMode, setViewMode] = useState('list'); // list, gallery, stacks

  // Initialize with avg deck
  useEffect(() => {
    if (data) {
      const initial = [...data.owned_cards, ...data.missing_cards].map(c => ({
        ...c,
        included: true,
        qty: 1,
      }));
      const recCards = (data.recommendations || []).map(c => ({
        name: c.name,
        card_type: c.card_type || 'Other',
        owned: c.owned,
        synergy: c.synergy,
        included: false,
        isRecommendation: true,
        qty: 1,
      }));
      setDeck([...initial, ...recCards]);
    }
  }, [data]);

  const includedCards = deck.filter(c => c.included);
  const excludedCards = deck.filter(c => !c.included);
  const deckSize = includedCards.reduce((sum, c) => sum + c.qty, 0);

  const toggle = (name) => {
    setDeck(prev => prev.map(c =>
      c.name === name ? { ...c, included: !c.included, qty: c.included ? c.qty : 1 } : c
    ));
  };

  const setQty = (name, qty) => {
    const val = Math.max(0, qty);
    setDeck(prev => prev.map(c => {
      if (c.name !== name) return c;
      if (val === 0) return { ...c, included: false, qty: 1 };
      return { ...c, qty: val, included: true };
    }));
  };

  const handleExport = () => {
    const text = includedCards.map(c => `${c.qty} ${c.name}`).join('\n');
    setExportText(text);
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const includedGroups = groupByType(includedCards);

  // --- View renderers ---
  const renderListView = () => (
    <div className="grid md:grid-cols-3 gap-6">
      <div className="md:col-span-2 space-y-4">
        <h3 className="text-lg font-semibold text-green-400">In Deck ({deckSize})</h3>
        {includedGroups.map(({ type, cards }) => (
          <div key={type}>
            <h4 className="text-sm font-medium text-gray-400 mb-1">
              {type} ({cards.reduce((s, c) => s + c.qty, 0)})
            </h4>
            <div className="bg-gray-800 rounded-lg divide-y divide-gray-700">
              {cards.map(card => (
                <div key={card.name} className="px-3 py-1.5 flex justify-between items-center group">
                  <div className="flex items-center gap-2">
                    {card.owned ? (
                      <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" title="Owned" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="Missing" />
                    )}
                    <CardName name={card.name} className="text-sm" />
                    {card.isRecommendation && <span className="text-xs text-purple-400">rec</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {canHaveMultiple(card.name) ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setQty(card.name, card.qty - 1)}
                          className="w-5 h-5 rounded bg-gray-700 hover:bg-gray-600 text-xs flex items-center justify-center"
                        >-</button>
                        <span className="text-xs w-5 text-center">{card.qty}</span>
                        <button
                          onClick={() => setQty(card.name, card.qty + 1)}
                          className="w-5 h-5 rounded bg-gray-700 hover:bg-gray-600 text-xs flex items-center justify-center"
                        >+</button>
                      </div>
                    ) : (
                      card.qty > 1 && <span className="text-xs text-gray-500">x{card.qty}</span>
                    )}
                    <button
                      onClick={() => toggle(card.name)}
                      className="text-xs text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-400">Removed / Available ({excludedCards.length})</h3>
        <div className="bg-gray-800 rounded-lg divide-y divide-gray-700 max-h-[600px] overflow-y-auto">
          {excludedCards.map(card => (
            <div key={card.name} className="px-3 py-1.5 flex justify-between items-center group">
              <div className="flex items-center gap-2">
                {card.owned ? (
                  <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-gray-600 flex-shrink-0" />
                )}
                <CardName name={card.name} className="text-sm text-gray-400" />
              </div>
              <button
                onClick={() => toggle(card.name)}
                className="text-xs text-green-400 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                Add
              </button>
            </div>
          ))}
          {excludedCards.length === 0 && (
            <p className="px-3 py-4 text-gray-500 text-sm">No removed cards</p>
          )}
        </div>
      </div>
    </div>
  );

  const renderGalleryView = () => (
    <div className="space-y-6">
      {includedGroups.map(({ type, cards }) => (
        <div key={type}>
          <h4 className="text-sm font-medium text-gray-400 mb-2">
            {type} ({cards.reduce((s, c) => s + c.qty, 0)})
          </h4>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 gap-2">
            {cards.map(card => (
              <div key={card.name} className="relative group">
                <DeckCardImage name={card.name} small />
                {card.qty > 1 && (
                  <span className="absolute top-1 right-1 bg-black/80 text-white text-xs font-bold px-1.5 py-0.5 rounded">
                    x{card.qty}
                  </span>
                )}
                {card.owned && (
                  <span className="absolute top-1 left-1 w-2.5 h-2.5 rounded-full bg-green-500 border border-black" />
                )}
                <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 rounded-lg">
                  {canHaveMultiple(card.name) && (
                    <>
                      <button onClick={() => setQty(card.name, card.qty - 1)}
                        className="w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-xs flex items-center justify-center">-</button>
                      <span className="text-xs font-bold w-4 text-center">{card.qty}</span>
                      <button onClick={() => setQty(card.name, card.qty + 1)}
                        className="w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-xs flex items-center justify-center">+</button>
                    </>
                  )}
                  <button onClick={() => toggle(card.name)}
                    className="w-6 h-6 rounded bg-red-700 hover:bg-red-600 text-xs flex items-center justify-center ml-1">✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const renderStacksView = () => (
    <div className="flex gap-2 overflow-x-auto pb-4">
      {includedGroups.map(({ type, cards }) => (
        <div key={type} className="flex-shrink-0" style={{ width: '180px' }}>
          {/* Column header */}
          <div className="text-xs font-semibold text-gray-400 border-b border-gray-700 pb-1 mb-1 flex justify-between">
            <span>{type}</span>
            <span>Qty: {cards.reduce((s, c) => s + c.qty, 0)}</span>
          </div>
          {/* Stacked cards */}
          <div className="relative">
            {cards.map((card, idx) => (
              <StackCard
                key={card.name}
                card={card}
                index={idx}
                isLast={idx === cards.length - 1}
                canMultiple={canHaveMultiple(card.name)}
                onToggle={toggle}
                onSetQty={setQty}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-blue-400 hover:underline">← Back to Detail</button>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">Deck Builder: {commander.name}</h2>
          <p className={`text-sm mt-1 ${deckSize === 100 ? 'text-green-400' : deckSize > 100 ? 'text-red-400' : 'text-yellow-400'}`}>
            {deckSize}/100 cards (including commander)
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="flex bg-gray-800 rounded overflow-hidden">
            {[
              { id: 'list', label: 'List' },
              { id: 'gallery', label: 'Gallery' },
              { id: 'stacks', label: 'Stacks' },
            ].map(v => (
              <button
                key={v.id}
                onClick={() => setViewMode(v.id)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === v.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <button onClick={handleExport} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded text-sm font-medium">
            Export Deck
          </button>
        </div>
      </div>

      {exportText && (
        <div className="bg-gray-800 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-green-400">Copied to clipboard!</p>
            <button onClick={() => setExportText('')} className="text-xs text-gray-400 hover:text-white">Close</button>
          </div>
          <textarea
            readOnly
            value={exportText}
            rows={6}
            className="w-full bg-gray-900 border border-gray-700 rounded p-3 text-xs font-mono"
            onFocus={e => e.target.select()}
          />
        </div>
      )}

      {viewMode === 'list' && renderListView()}
      {viewMode === 'gallery' && renderGalleryView()}
      {viewMode === 'stacks' && renderStacksView()}
    </div>
  );
}

// --- Multi-Commander Comparison ---
function CompareView({ commanders, onBack, onSelectCommander }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    apiPost('/api/compare', { commanders: commanders.map(c => c.name) })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [commanders]);

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-gray-400">Comparing commanders...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <button onClick={onBack} className="text-blue-400 hover:underline mb-4">← Back</button>
        <div className="bg-red-900/50 border border-red-700 rounded p-3 text-red-300">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-blue-400 hover:underline">← Back</button>
      <h2 className="text-2xl font-bold">Commander Comparison</h2>

      {/* Summary cards */}
      <div className={`grid gap-4 ${data.commanders.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {data.commanders.map((cmd, i) => {
          const matchColor = cmd.match_percentage >= 60 ? 'text-green-400' :
            cmd.match_percentage >= 40 ? 'text-yellow-400' : 'text-red-400';
          const orig = commanders[i];
          return (
            <div key={cmd.name} className="bg-gray-800 rounded-lg p-4 space-y-3">
              {orig?.image_uri && (
                <img src={orig.image_uri} alt={cmd.name} className="w-32 rounded-lg mx-auto" />
              )}
              <h3
                className="font-bold text-center cursor-pointer hover:text-blue-400"
                onClick={() => onSelectCommander(orig || { name: cmd.name })}
              >
                {cmd.name}
              </h3>
              <div className="text-center">
                <span className={`text-3xl font-bold ${matchColor}`}>{cmd.match_percentage}%</span>
                <p className="text-xs text-gray-400 mt-1">{cmd.owned_count}/{cmd.total_cards} owned</p>
              </div>
              <MatchBar percentage={cmd.match_percentage} size="lg" />
              <div className="text-center text-sm">
                {cmd.missing_price > 0 && (
                  <span className="text-yellow-400">~${cmd.missing_price.toFixed(2)} to complete</span>
                )}
              </div>
              <div className="text-center text-xs text-gray-500 space-y-1">
                <p>{cmd.unique_cards.length} unique cards</p>
                {cmd.num_decks > 0 && <p>{cmd.num_decks.toLocaleString()} decks</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Shared cards */}
      <div className="bg-gray-800 rounded-lg p-4 space-y-3">
        <h3 className="font-semibold text-blue-400">
          Shared Across All ({data.shared_count} cards)
        </h3>
        <p className="text-xs text-gray-400">Cards that appear in every commander's average deck.</p>
        <div className="flex flex-wrap gap-2">
          {(data.commanders[0]?.shared_cards || []).map(name => (
            <span key={name} className="text-xs bg-gray-700 px-2 py-1 rounded">
              <CardName name={name} />
            </span>
          ))}
        </div>
      </div>

      {/* Unique cards per commander */}
      <div className={`grid gap-4 ${data.commanders.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {data.commanders.map(cmd => (
          <div key={cmd.name} className="bg-gray-800 rounded-lg p-4 space-y-2">
            <h4 className="font-semibold text-sm text-purple-400">
              Only in {cmd.name} ({cmd.unique_cards.length})
            </h4>
            <div className="divide-y divide-gray-700 max-h-72 overflow-y-auto">
              {cmd.unique_cards.map(name => (
                <div key={name} className="py-1 text-sm">
                  <CardName name={name} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Commander Detail with progressive loading ---
function CommanderDetail({ commander, collectionCount, onBack, onOpenDeckBuilder }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [budget, setBudget] = useState('');
  const [theme, setTheme] = useState('');
  const [showOwned, setShowOwned] = useState(true);
  const [showMissing, setShowMissing] = useState(true);
  const [exportText, setExportText] = useState('');
  const [recSort, setRecSort] = useState('synergy_desc');
  const [recFilter, setRecFilter] = useState('all');
  const [recTypeFilter, setRecTypeFilter] = useState('all');

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const d = await apiGet(`/api/commander/${encodeURIComponent(commander.name)}`, {
        budget: budget || null,
        theme: theme || null,
      });
      setData(d);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [commander.name, budget, theme]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const handleExport = (type) => {
    if (!data) return;
    const allCards = [...data.owned_cards, ...data.missing_cards];
    let text;
    if (type === 'full') {
      text = allCards.map(c => `1 ${c.name}`).join('\n');
    } else {
      text = data.missing_cards.map(c => `1 ${c.name}`).join('\n');
    }
    setExportText(text);
    navigator.clipboard.writeText(text).catch(() => {});
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <button onClick={onBack} className="text-blue-400 hover:underline">← Back</button>
        {/* Show header immediately with commander card info */}
        <div className="flex gap-6 items-start">
          {commander.image_uri && (
            <img src={commander.image_uri} alt={commander.name} className="w-48 rounded-lg shadow-lg flex-shrink-0" />
          )}
          <div className="space-y-3 flex-1">
            <h2 className="text-3xl font-bold">{commander.name}</h2>
            <ColorBadge colors={commander.color_identity} />
            <div className="space-y-3 mt-4">
              <div className="animate-pulse space-y-3">
                <div className="h-10 bg-gray-700 rounded w-32" />
                <div className="h-2.5 bg-gray-700 rounded w-full" />
                <div className="h-4 bg-gray-700 rounded w-48" />
              </div>
              <p className="text-gray-400 text-sm mt-4">Fetching average deck from EDHREC, classifying cards, and loading prices...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <button onClick={onBack} className="text-blue-400 hover:underline mb-4">← Back</button>
        <div className="bg-red-900/50 border border-red-700 rounded p-3 text-red-300">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const matchColor = data.match_percentage >= 60 ? 'text-green-400' :
    data.match_percentage >= 40 ? 'text-yellow-400' : 'text-red-400';

  // Compute available card types in recommendations for the type filter
  const allRecs = data.recommendations || [];
  const recTypes = [...new Set(allRecs.map(r => r.card_type || 'Other'))].sort();

  // Apply filters
  let filteredRecs = [...allRecs];
  if (recFilter === 'owned') filteredRecs = filteredRecs.filter(c => c.owned);
  else if (recFilter === 'not_owned') filteredRecs = filteredRecs.filter(c => !c.owned);
  if (recTypeFilter !== 'all') filteredRecs = filteredRecs.filter(c => (c.card_type || 'Other') === recTypeFilter);
  if (recSort === 'synergy_desc') filteredRecs.sort((a, b) => (b.synergy || 0) - (a.synergy || 0));
  else if (recSort === 'synergy_asc') filteredRecs.sort((a, b) => (a.synergy || 0) - (b.synergy || 0));
  else if (recSort === 'inclusion_desc') filteredRecs.sort((a, b) => (b.inclusion || 0) - (a.inclusion || 0));

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-blue-400 hover:underline">← Back</button>

      {/* Header */}
      <div className="flex gap-6 items-start">
        {commander.image_uri && (
          <img src={commander.image_uri} alt={commander.name} className="w-48 rounded-lg shadow-lg flex-shrink-0" />
        )}
        <div className="space-y-3 flex-1">
          <h2 className="text-3xl font-bold">{commander.name}</h2>
          <ColorBadge colors={commander.color_identity} />
          <div className="flex items-baseline gap-4">
            <span className={`text-4xl font-bold ${matchColor}`}>{data.match_percentage}%</span>
            <span className="text-gray-400">
              {data.owned_count}/{data.total_cards} cards owned
            </span>
          </div>
          <MatchBar percentage={data.match_percentage} size="lg" />
          <div className="flex gap-4 text-sm">
            {data.num_decks > 0 && (
              <span className="text-gray-500">{data.num_decks.toLocaleString()} decks on EDHREC</span>
            )}
            {data.total_missing_price > 0 && (
              <span className="text-yellow-400">
                ~${data.total_missing_price.toFixed(2)} to complete
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filters + Export + Deck Builder */}
      <div className="bg-gray-800 rounded-lg p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Budget</label>
          <div className="flex gap-1">
            {[
              { value: '', label: 'Any' },
              { value: 'budget', label: '$' },
              { value: 'expensive', label: '$$$' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setBudget(opt.value)}
                className={`px-3 py-1 rounded text-sm ${
                  budget === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {data.themes && data.themes.length > 0 && (
          <div>
            <label className="block text-xs text-gray-400 mb-1">Theme</label>
            <select
              value={theme}
              onChange={e => setTheme(e.target.value)}
              className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">All themes</option>
              {data.themes.map(t => (
                <option key={t.slug || t.name} value={t.slug || t.name}>
                  {t.name} {t.count ? `(${t.count.toLocaleString()})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="ml-auto flex gap-2">
          <button
            onClick={() => onOpenDeckBuilder(data)}
            className="bg-purple-700 hover:bg-purple-600 px-3 py-1.5 rounded text-sm font-medium"
          >
            Deck Builder
          </button>
          <button
            onClick={() => handleExport('full')}
            className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded text-sm"
          >
            Export Full Deck
          </button>
          <button
            onClick={() => handleExport('missing')}
            className="bg-yellow-700 hover:bg-yellow-600 px-3 py-1.5 rounded text-sm"
          >
            Export Missing Cards
          </button>
        </div>
      </div>

      {exportText && (
        <div className="bg-gray-800 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-green-400">Copied to clipboard! You can also copy from below:</p>
            <button onClick={() => setExportText('')} className="text-xs text-gray-400 hover:text-white">Close</button>
          </div>
          <textarea
            readOnly
            value={exportText}
            rows={6}
            className="w-full bg-gray-900 border border-gray-700 rounded p-3 text-xs font-mono"
            onFocus={e => e.target.select()}
          />
        </div>
      )}

      {data.error && (
        <div className="bg-yellow-900/50 border border-yellow-700 rounded p-3 text-yellow-300 text-sm">
          Note: {data.error}
        </div>
      )}

      {/* Card List Toggles */}
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={showOwned} onChange={e => setShowOwned(e.target.checked)} className="rounded" />
          <span className="text-green-400">Owned ({data.owned_count})</span>
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={showMissing} onChange={e => setShowMissing(e.target.checked)} className="rounded" />
          <span className="text-red-400">Missing ({data.missing_count})</span>
        </label>
      </div>

      {/* Card Lists Grouped by Type */}
      <CardListByType
        ownedCards={data.owned_cards}
        missingCards={data.missing_cards}
        showOwned={showOwned}
        showMissing={showMissing}
        totalMissingPrice={data.total_missing_price}
      />

      {/* Possible Recommendations */}
      {allRecs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-purple-400">
            Possible Recommendations ({filteredRecs.length})
          </h3>
          <p className="text-xs text-gray-400">
            Cards with high synergy for this commander that aren't in the average deck.
          </p>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400">Sort:</label>
              <select
                value={recSort}
                onChange={e => setRecSort(e.target.value)}
                className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
              >
                <option value="synergy_desc">Highest Synergy</option>
                <option value="synergy_asc">Lowest Synergy</option>
                <option value="inclusion_desc">Most Included</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400">Show:</label>
              <select
                value={recFilter}
                onChange={e => setRecFilter(e.target.value)}
                className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
              >
                <option value="all">All</option>
                <option value="owned">In Collection</option>
                <option value="not_owned">Not In Collection</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400">Type:</label>
              <select
                value={recTypeFilter}
                onChange={e => setRecTypeFilter(e.target.value)}
                className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
              >
                <option value="all">All Types</option>
                {recTypes.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg divide-y divide-gray-700">
            {filteredRecs.map(card => (
              <div key={card.name} className="px-3 py-2 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  {card.owned ? (
                    <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" title="In collection" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-gray-600 flex-shrink-0" title="Not in collection" />
                  )}
                  <CardName name={card.name} className="text-sm" />
                  {card.card_type && (
                    <span className="text-xs text-gray-600">{card.card_type}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs">
                  {card.synergy != null && (
                    <span className={`font-medium ${card.synergy > 0 ? 'text-green-400' : 'text-gray-400'}`}>
                      {card.synergy > 0 ? '+' : ''}{card.synergy}% synergy
                    </span>
                  )}
                  {card.inclusion != null && (
                    <span className="text-gray-500">{card.inclusion}% inclusion</span>
                  )}
                  {card.source && (
                    <span className="text-purple-400/70">{card.source}</span>
                  )}
                </div>
              </div>
            ))}
            {filteredRecs.length === 0 && (
              <p className="px-3 py-4 text-gray-500 text-sm">No recommendations match the current filters.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Main App ---

function App() {
  const [tab, setTab] = useState('upload');
  const [collectionCount, setCollectionCount] = useState(0);
  const [selectedCommander, setSelectedCommander] = useState(null);
  const [compareList, setCompareList] = useState([]);
  const [deckBuilderData, setDeckBuilderData] = useState(null);

  // Restore collection from localStorage on startup
  useEffect(() => {
    const saved = loadCollection();
    if (saved && saved.length > 0) {
      apiPost('/api/collection/restore', { cards: saved }).then(data => {
        setCollectionCount(data.count || 0);
        if (data.count > 0) setTab('recommend');
      }).catch(() => {
        apiGet('/api/collection').then(data => {
          setCollectionCount(data.count || 0);
        }).catch(() => {});
      });
    } else {
      apiGet('/api/collection').then(data => {
        setCollectionCount(data.count || 0);
      }).catch(() => {});
    }
  }, []);

  const handleUploaded = (data) => {
    setCollectionCount(data.count);
    if (data.cards) saveCollection(data.cards);
  };

  const handleSelectCommander = (cmd) => {
    setSelectedCommander(cmd);
    setTab('detail');
  };

  const handleToggleCompare = (cmd) => {
    setCompareList(prev => {
      const exists = prev.find(c => c.name === cmd.name);
      if (exists) return prev.filter(c => c.name !== cmd.name);
      if (prev.length >= 3) return prev; // Max 3
      return [...prev, cmd];
    });
  };

  const handleOpenDeckBuilder = (data) => {
    setDeckBuilderData(data);
    setTab('deckbuilder');
  };

  const tabs = [
    { id: 'upload', label: 'Upload Collection' },
    { id: 'recommend', label: 'Recommendations' },
    { id: 'search', label: 'Search Commanders' },
  ];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold">MTG Commander Recommender</h1>
          {collectionCount > 0 && (
            <span className="text-sm text-gray-400">
              Collection: {collectionCount} cards
            </span>
          )}
        </div>
      </header>

      {/* Nav */}
      <nav className="bg-gray-900/50 border-b border-gray-800 px-6">
        <div className="max-w-7xl mx-auto flex gap-1 items-center">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id || (tab === 'detail' && t.id === 'recommend') || (tab === 'deckbuilder' && t.id === 'recommend')
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}

          {/* Compare button */}
          {compareList.length >= 2 && (
            <button
              onClick={() => setTab('compare')}
              className={`ml-4 px-4 py-1.5 rounded text-sm font-medium transition-all ${
                tab === 'compare'
                  ? 'bg-purple-600 text-white'
                  : 'bg-purple-700/50 text-purple-300 hover:bg-purple-700'
              }`}
            >
              Compare ({compareList.length})
            </button>
          )}
          {compareList.length > 0 && compareList.length < 2 && (
            <span className="ml-4 text-xs text-gray-500">Select {2 - compareList.length} more to compare</span>
          )}
          {compareList.length > 0 && (
            <button
              onClick={() => setCompareList([])}
              className="ml-2 text-xs text-gray-500 hover:text-red-400"
            >
              Clear
            </button>
          )}
        </div>
      </nav>

      {/* Content - tabs stay mounted to preserve state */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div style={{ display: tab === 'upload' ? 'block' : 'none' }}>
          <CollectionUpload onUploaded={handleUploaded} collectionCount={collectionCount} />
        </div>

        <div style={{ display: tab === 'recommend' ? 'block' : 'none' }}>
          <Recommendations
            collectionCount={collectionCount}
            onSelectCommander={handleSelectCommander}
            compareList={compareList}
            onToggleCompare={handleToggleCompare}
          />
        </div>

        <div style={{ display: tab === 'search' ? 'block' : 'none' }}>
          <CommanderSearch
            collectionCount={collectionCount}
            onSelectCommander={handleSelectCommander}
            compareList={compareList}
            onToggleCompare={handleToggleCompare}
          />
        </div>

        {tab === 'detail' && selectedCommander && (
          <CommanderDetail
            commander={selectedCommander}
            collectionCount={collectionCount}
            onBack={() => setTab('recommend')}
            onOpenDeckBuilder={handleOpenDeckBuilder}
          />
        )}

        {tab === 'deckbuilder' && selectedCommander && deckBuilderData && (
          <DeckBuilder
            data={deckBuilderData}
            commander={selectedCommander}
            onBack={() => setTab('detail')}
          />
        )}

        {tab === 'compare' && compareList.length >= 2 && (
          <CompareView
            commanders={compareList}
            onBack={() => setTab('recommend')}
            onSelectCommander={handleSelectCommander}
          />
        )}
      </main>
    </div>
  );
}

export default App;
