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

function CommanderCard({ commander, onClick }) {
  const hasMatch = commander.match_percentage !== undefined;
  return (
    <div
      onClick={() => onClick?.(commander)}
      className="bg-gray-800 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
    >
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

function Recommendations({ collectionCount, onSelectCommander }) {
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
            <CommanderCard key={cmd.name} commander={cmd} onClick={onSelectCommander} />
          ))}
        </div>
      )}

      {!loading && fetched && results.length === 0 && (
        <p className="text-gray-500 text-center py-8">No commanders found with {minOwned}+ owned cards.</p>
      )}
    </div>
  );
}

function CommanderSearch({ collectionCount, onSelectCommander }) {
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
          <CommanderCard key={cmd.name} commander={cmd} onClick={onSelectCommander} />
        ))}
      </div>
    </div>
  );
}

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

function CommanderDetail({ commander, collectionCount, onBack }) {
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
      <div className="text-center py-12">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-gray-400">Fetching average deck from EDHREC...</p>
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

      {/* Filters + Export */}
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
      {data.recommendations && data.recommendations.length > 0 && (() => {
        let recs = [...data.recommendations];
        if (recFilter === 'owned') recs = recs.filter(c => c.owned);
        else if (recFilter === 'not_owned') recs = recs.filter(c => !c.owned);
        if (recSort === 'synergy_desc') recs.sort((a, b) => (b.synergy || 0) - (a.synergy || 0));
        else if (recSort === 'synergy_asc') recs.sort((a, b) => (a.synergy || 0) - (b.synergy || 0));
        else if (recSort === 'inclusion_desc') recs.sort((a, b) => (b.inclusion || 0) - (a.inclusion || 0));
        return (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-purple-400">
              Possible Recommendations ({recs.length})
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
            </div>
            <div className="bg-gray-800 rounded-lg divide-y divide-gray-700">
              {recs.map(card => (
                <div key={card.name} className="px-3 py-2 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    {card.owned ? (
                      <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" title="In collection" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-gray-600 flex-shrink-0" title="Not in collection" />
                    )}
                    <CardName name={card.name} className="text-sm" />
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
              {recs.length === 0 && (
                <p className="px-3 py-4 text-gray-500 text-sm">No recommendations match the current filter.</p>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// --- Main App ---

function App() {
  const [tab, setTab] = useState('upload');
  const [collectionCount, setCollectionCount] = useState(0);
  const [selectedCommander, setSelectedCommander] = useState(null);

  // Restore collection from localStorage on startup
  useEffect(() => {
    const saved = loadCollection();
    if (saved && saved.length > 0) {
      apiPost('/api/collection/restore', { cards: saved }).then(data => {
        setCollectionCount(data.count || 0);
        if (data.count > 0) setTab('recommend');
      }).catch(() => {
        // Fallback: check if backend already has a collection
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
        <div className="max-w-7xl mx-auto flex gap-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id || (tab === 'detail' && t.id === 'recommend')
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
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
          />
        </div>

        <div style={{ display: tab === 'search' ? 'block' : 'none' }}>
          <CommanderSearch
            collectionCount={collectionCount}
            onSelectCommander={handleSelectCommander}
          />
        </div>

        {tab === 'detail' && selectedCommander && (
          <CommanderDetail
            commander={selectedCommander}
            collectionCount={collectionCount}
            onBack={() => setTab('recommend')}
          />
        )}
      </main>
    </div>
  );
}

export default App;
