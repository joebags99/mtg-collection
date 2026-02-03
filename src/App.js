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

// --- Mana Symbol Component ---
// Uses individual SVG files from /assets/SVG/
// Handles: numbers (0-20, 100), colors (W,U,B,R,G,C), hybrids (WU, BR, etc.),
// phyrexian (WP, UP, etc.), 2-hybrids (2W, 2U, etc.), and special (X, T, Q, S)
function ManaSymbol({ symbol, size = 20 }) {
  if (!symbol) return null;

  // Normalize the symbol for filename lookup
  // Handle hybrid mana like "W/U" -> "WU", "2/W" -> "2W", "W/P" -> "WP"
  let filename = symbol.toUpperCase().replace(/\//g, '');

  return (
    <img
      src={`/assets/SVG/${filename}.svg`}
      alt={symbol}
      title={symbol}
      style={{ width: size, height: size }}
      className="inline-block"
      onError={(e) => {
        // Fallback: hide broken image and show text
        e.target.style.display = 'none';
      }}
    />
  );
}

// Parse mana cost string like "{2}{U}{U}" into array of symbols
function parseManaSymbols(manaCost) {
  if (!manaCost) return [];
  const matches = manaCost.match(/\{([^}]+)\}/g);
  if (!matches) return [];
  return matches.map(m => m.replace(/[{}]/g, ''));
}

function ManaCost({ cost, size = 18 }) {
  const symbols = parseManaSymbols(cost);
  if (symbols.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-0.5">
      {symbols.map((sym, i) => (
        <ManaSymbol key={i} symbol={sym} size={size} />
      ))}
    </span>
  );
}

function getColorGlow(colors) {
  if (!colors || colors.length === 0) return 'rgba(128,128,128,0.3)';
  const glowColors = {
    W: [249,250,244],
    U: [14,104,171],
    B: [100,80,120],
    R: [211,32,41],
    G: [0,115,62],
  };
  const fallback = [128,128,128];
  if (colors.length === 1) {
    const c = glowColors[colors[0]] || fallback;
    return `rgba(${c[0]},${c[1]},${c[2]},0.4)`;
  }
  // Multi-color: average the RGB values of all colors in identity
  const avg = [0,0,0];
  colors.forEach(col => {
    const c = glowColors[col] || fallback;
    avg[0] += c[0]; avg[1] += c[1]; avg[2] += c[2];
  });
  const n = colors.length;
  return `rgba(${Math.round(avg[0]/n)},${Math.round(avg[1]/n)},${Math.round(avg[2]/n)},0.4)`;
}

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
const DECKS_STORAGE_KEY = 'mtg_decks';
const AUTH_TOKEN_KEY = 'mtg_auth_token';
const AUTH_USER_KEY = 'mtg_auth_user';

function saveAuthToken(token) {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch (e) {
    console.error('Failed to save auth token:', e);
  }
}

function loadAuthToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch (e) {
    console.error('Failed to load auth token:', e);
  }
  return null;
}

function saveAuthUser(user) {
  try {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  } catch (e) {
    console.error('Failed to save auth user:', e);
  }
}

function loadAuthUser() {
  try {
    const data = localStorage.getItem(AUTH_USER_KEY);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error('Failed to load auth user:', e);
  }
  return null;
}

function clearAuth() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

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

function saveDecks(decks) {
  try {
    localStorage.setItem(DECKS_STORAGE_KEY, JSON.stringify(decks));
  } catch (e) {
    console.error('Failed to save decks to localStorage:', e);
  }
}

function loadDecks() {
  try {
    const data = localStorage.getItem(DECKS_STORAGE_KEY);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error('Failed to load decks from localStorage:', e);
  }
  return {};
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

// --- Auth API helpers ---
async function apiAuthPost(path, body) {
  const token = loadAuthToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(API + path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'API error');
  }
  return res.json();
}

async function apiAuthGet(path) {
  const token = loadAuthToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(API + path, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'API error');
  }
  return res.json();
}

// --- Commander Autocomplete ---
function CommanderAutocomplete({ value, onChange, placeholder, className }) {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => { setQuery(value || ''); }, [value]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInput = (val) => {
    setQuery(val);
    onChange(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.length < 2) { setResults([]); setShowDropdown(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await apiGet('/api/commanders/search_autocomplete', { q: val });
        setResults(data.results || []);
        setShowDropdown(true);
      } catch { setResults([]); }
      setLoading(false);
    }, 200);
  };

  const handleSelect = (cmd) => {
    setQuery(cmd.name);
    onChange(cmd.name);
    setShowDropdown(false);
    setResults([]);
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        value={query}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
        placeholder={placeholder}
        className={className}
      />
      {loading && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {results.map(cmd => (
            <button
              key={cmd.name}
              onClick={() => handleSelect(cmd)}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-700 flex items-center gap-2 transition-colors"
            >
              {cmd.image_uri && (
                <img src={cmd.image_uri} alt="" className="w-6 h-8 rounded object-cover flex-shrink-0" />
              )}
              <span className="flex-1 truncate">{cmd.name}</span>
              <ColorBadge colors={cmd.color_identity} />
              {cmd.partner_type && (
                <span className="text-[10px] text-purple-400 flex-shrink-0">
                  {cmd.partner_type === 'partner' ? 'Partner' :
                   cmd.partner_type === 'partner_with' ? 'Partner with' :
                   cmd.partner_type === 'partner_variant' ? 'Partner' :
                   cmd.partner_type === 'choose_a_background' ? 'Background' :
                   cmd.partner_type === 'background' ? 'BG' :
                   cmd.partner_type === 'friends_forever' ? 'Friends' :
                   cmd.partner_type === 'doctors_companion' ? 'Companion' :
                   cmd.partner_type === 'doctor' ? 'Doctor' : ''}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Partner Picker ---
function PartnerPicker({ commanderName, onSelectPartner, selectedPartner }) {
  const [partners, setPartners] = useState([]);
  const [partnerType, setPartnerType] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const autoSelectedRef = useRef(false);

  useEffect(() => {
    autoSelectedRef.current = false;
  }, [commanderName]);

  useEffect(() => {
    if (!commanderName) { setPartners([]); setPartnerType(''); return; }
    setLoading(true);
    apiGet(`/api/commander/${encodeURIComponent(commanderName)}/partners`)
      .then(data => {
        setPartnerType(data.partner_type || '');
        setPartners(data.partners || []);
        // If partner_with or partner_variant with only one option, auto-select once
        if ((data.partner_type === 'partner_with' || data.partner_type === 'partner_variant') && data.partners?.length === 1 && !autoSelectedRef.current) {
          autoSelectedRef.current = true;
          onSelectPartner(data.partners[0]);
        }
      })
      .catch(() => { setPartners([]); setPartnerType(''); })
      .finally(() => setLoading(false));
  }, [commanderName]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!partnerType) return null;

  const partnerLabel =
    partnerType === 'partner' ? 'Partner' :
    partnerType === 'partner_with' ? 'Partner With' :
    partnerType === 'partner_variant' ? 'Partner' :
    partnerType === 'choose_a_background' ? 'Choose a Background' :
    partnerType === 'background' ? 'Background For' :
    partnerType === 'friends_forever' ? 'Friends Forever' :
    partnerType === 'doctors_companion' ? "Doctor's Companion For" :
    partnerType === 'doctor' ? 'Doctor For' : 'Partner';

  const filtered = search.length >= 2
    ? partners.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : partners;

  return (
    <div className="bg-purple-900/30 border border-purple-700 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-purple-400">{partnerLabel}</h4>
        {selectedPartner && (
          <button
            onClick={() => onSelectPartner(null)}
            className="text-xs text-gray-400 hover:text-red-400"
          >
            Remove Partner
          </button>
        )}
      </div>

      {selectedPartner ? (
        <div className="flex items-center gap-3 bg-gray-800 rounded-lg p-2">
          {selectedPartner.image_uri && (
            <img src={selectedPartner.image_uri} alt={selectedPartner.name} className="w-12 h-16 rounded object-cover" />
          )}
          <div>
            <p className="font-medium text-sm">{selectedPartner.name}</p>
            <ColorBadge colors={selectedPartner.color_identity} />
          </div>
        </div>
      ) : (
        <>
          {loading ? (
            <div className="text-center py-2 text-gray-400 text-sm">Loading partners...</div>
          ) : (
            <>
              {partners.length > 5 && (
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search partners..."
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-purple-500"
                />
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[500px] overflow-y-auto p-1">
                {filtered.slice(0, 40).map(p => (
                  <button
                    key={p.name}
                    onClick={() => onSelectPartner(p)}
                    className="bg-gray-800 hover:bg-gray-700 rounded-lg p-2 text-left transition-colors group"
                  >
                    {p.image_uri && (
                      <img src={p.image_uri} alt={p.name} className="w-full rounded-lg shadow-lg group-hover:scale-[1.02] transition-transform" loading="lazy" />
                    )}
                    <p className="text-xs mt-1.5 text-center font-medium">{p.name}</p>
                    {p.color_identity && <div className="mt-1 text-center"><ColorBadge colors={p.color_identity} /></div>}
                  </button>
                ))}
              </div>
              {filtered.length === 0 && <p className="text-sm text-gray-500">No compatible partners found.</p>}
            </>
          )}
        </>
      )}
    </div>
  );
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
      className={`bg-gray-800 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all relative card-lift ${selected ? 'ring-2 ring-purple-500' : ''}`}
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
            {commander.num_decks > 0 && (
              <span className="text-xs text-gray-500">{commander.num_decks.toLocaleString()} decks</span>
            )}
          </div>
          {hasMatch && commander.missing_price > 0 && (
            <div className="bg-gray-900/60 rounded px-2 py-1 flex items-center justify-between">
              <span className="text-[10px] text-gray-500 uppercase tracking-wide">To complete</span>
              <span className={`text-sm font-bold ${
                commander.missing_price < 50 ? 'text-green-400' :
                commander.missing_price < 150 ? 'text-yellow-400' :
                'text-red-400'
              }`}>
                ${commander.missing_price.toFixed(2)}
              </span>
            </div>
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

function Recommendations({ collectionCount, onSelectCommander, compareList, onToggleCompare, excludeInDecks, onToggleExclude, deckCount }) {
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
        `/api/recommendations?min_owned=${minOwned}&limit=100${color ? '&color=' + color : ''}${search ? '&search=' + encodeURIComponent(search) : ''}${excludeInDecks ? '&exclude_in_decks=true' : ''}`,
        {}
      );
      setResults(data.results || []);
      setFetched(true);
    } catch (err) {
      setError(err.message);
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
          {deckCount > 0 && (
            <label className="flex items-center gap-2 text-sm cursor-pointer ml-2">
              <input
                type="checkbox"
                checked={excludeInDecks}
                onChange={onToggleExclude}
                className="rounded"
              />
              <span className="text-gray-400">Exclude cards in decks</span>
            </label>
          )}
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 grid-stagger">
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

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 grid-stagger">
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
                    <div className="flex items-center gap-1.5">
                      <AvailDot card={card} />
                      <CardName name={card.name} className="text-sm" />
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <DeckBadges inDecks={card.in_decks} />
                      {card.qty_owned > 1 && (
                        <span className="text-[10px] text-gray-500" title={`${card.qty_owned} owned, ${card.qty_in_decks || 0} in decks`}>
                          {card.qty_in_decks ? `${card.qty_owned - card.qty_in_decks}/${card.qty_owned}` : `x${card.qty_owned}`}
                        </span>
                      )}
                    </div>
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
                    <div className="flex items-center gap-1.5">
                      <AvailDot card={card} />
                      <CardName name={card.name} className="text-sm" />
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <DeckBadges inDecks={card.in_decks} />
                      <span className="text-xs text-yellow-400/70">
                        {card.price ? `$${card.price.toFixed(2)}` : ''}
                      </span>
                    </div>
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

function ManaCurve({ cards }) {
  // Group included cards by CMC bucket (0, 1, 2, 3, 4, 5, 6, 7+)
  const buckets = [0, 1, 2, 3, 4, 5, 6, 7];
  const counts = buckets.map(() => ({ total: 0, creature: 0, nonCreature: 0 }));

  for (const card of cards) {
    // Skip lands from mana curve
    if ((card.card_type || '').toLowerCase() === 'land') continue;
    const cmc = Math.floor(card.cmc || 0);
    const idx = Math.min(cmc, 7);
    const qty = card.qty || 1;
    counts[idx].total += qty;
    if ((card.card_type || '').toLowerCase() === 'creature') {
      counts[idx].creature += qty;
    } else {
      counts[idx].nonCreature += qty;
    }
  }

  const maxCount = Math.max(...counts.map(c => c.total), 1);

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h4 className="text-sm font-semibold text-gray-300 mb-3">Mana Curve</h4>
      <div className="flex items-end gap-1.5" style={{ height: '120px' }}>
        {buckets.map((cmc, i) => {
          const pct = counts[i].total / maxCount;
          const creaturePct = counts[i].total > 0 ? counts[i].creature / counts[i].total : 0;
          return (
            <div key={cmc} className="flex-1 flex flex-col items-center h-full justify-end">
              {/* Count label */}
              <span className="text-xs text-gray-400 mb-1">
                {counts[i].total > 0 ? counts[i].total : ''}
              </span>
              {/* Stacked bar */}
              <div
                className="w-full rounded-t relative overflow-hidden transition-all duration-300"
                style={{ height: `${Math.max(pct * 100, counts[i].total > 0 ? 4 : 0)}%`, minHeight: counts[i].total > 0 ? '4px' : '0' }}
              >
                {/* Creature portion (brighter blue) */}
                <div
                  className="absolute bottom-0 w-full bg-blue-500"
                  style={{ height: `${creaturePct * 100}%` }}
                />
                {/* Non-creature portion (darker blue) */}
                <div
                  className="absolute top-0 w-full bg-blue-800"
                  style={{ height: `${(1 - creaturePct) * 100}%` }}
                />
              </div>
              {/* CMC label */}
              <span className="mt-1 flex items-center justify-center">
                {cmc === 7 ? (
                  <span className="text-xs text-gray-500">7+</span>
                ) : (
                  <ManaSymbol symbol={String(cmc)} size={16} />
                )}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-2 justify-center">
        <span className="flex items-center gap-1 text-xs text-gray-400">
          <span className="w-3 h-2 bg-blue-500 rounded-sm inline-block" /> Creatures
        </span>
        <span className="flex items-center gap-1 text-xs text-gray-400">
          <span className="w-3 h-2 bg-blue-800 rounded-sm inline-block" /> Non-Creatures
        </span>
      </div>
    </div>
  );
}

function DeckStats({ cards }) {
  // Type counts
  const typeCounts = {};
  let totalCards = 0;
  let totalCmc = 0;
  let nonLandCount = 0;

  // Color pip counts from mana_cost strings like "{2}{U}{B}"
  const pipCounts = { W: 0, U: 0, B: 0, R: 0, G: 0 };

  for (const card of cards) {
    const qty = card.qty || 1;
    const type = card.card_type || 'Other';
    typeCounts[type] = (typeCounts[type] || 0) + qty;
    totalCards += qty;

    if (type.toLowerCase() !== 'land') {
      totalCmc += (card.cmc || 0) * qty;
      nonLandCount += qty;
    }

    // Count color pips
    const cost = card.mana_cost || '';
    for (const color of ['W', 'U', 'B', 'R', 'G']) {
      const matches = cost.match(new RegExp(`\\{[^}]*${color}[^}]*\\}`, 'g'));
      if (matches) pipCounts[color] += matches.length * qty;
    }
  }

  const avgCmc = nonLandCount > 0 ? (totalCmc / nonLandCount).toFixed(2) : '0.00';
  const totalPips = Object.values(pipCounts).reduce((a, b) => a + b, 0);

  const typeOrder = ['Creature', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Planeswalker', 'Land', 'Other'];
  const sortedTypes = typeOrder.filter(t => typeCounts[t] > 0);

  const typeColors = {
    Creature: 'bg-green-600', Instant: 'bg-blue-500', Sorcery: 'bg-red-500',
    Enchantment: 'bg-purple-500', Artifact: 'bg-yellow-600', Planeswalker: 'bg-orange-500',
    Land: 'bg-amber-800', Other: 'bg-gray-500',
  };

  const pipColors = {
    W: { bg: '#f9faf4', text: '#333' },
    U: { bg: '#0e68ab', text: '#fff' },
    B: { bg: '#2b2b2b', text: '#ccc' },
    R: { bg: '#d32029', text: '#fff' },
    G: { bg: '#00733e', text: '#fff' },
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-4">
      <h4 className="text-sm font-semibold text-gray-300">Deck Statistics</h4>

      {/* Average CMC */}
      <div className="text-center">
        <span className="text-3xl font-bold text-blue-400">{avgCmc}</span>
        <p className="text-xs text-gray-500 mt-0.5">Avg. Mana Value</p>
      </div>

      {/* Type breakdown */}
      <div className="space-y-1.5">
        <p className="text-xs text-gray-400 font-medium">Card Types</p>
        {sortedTypes.map(type => (
          <div key={type} className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-24 truncate">{type}</span>
            <div className="flex-1 bg-gray-700 rounded-full h-2">
              <div
                className={`${typeColors[type] || 'bg-gray-500'} h-2 rounded-full transition-all duration-300`}
                style={{ width: `${(typeCounts[type] / totalCards) * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 w-6 text-right">{typeCounts[type]}</span>
          </div>
        ))}
      </div>

      {/* Color pip distribution */}
      {totalPips > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-gray-400 font-medium">Color Pips ({totalPips})</p>
          <div className="flex gap-1">
            {['W', 'U', 'B', 'R', 'G'].filter(c => pipCounts[c] > 0).map(color => (
              <div
                key={color}
                className="flex-1 rounded-md py-3 flex items-center justify-center relative overflow-hidden"
                style={{
                  backgroundColor: pipColors[color].bg,
                  color: pipColors[color].text,
                  flex: pipCounts[color],
                  minWidth: '36px',
                }}
              >
                {/* Background icon at low opacity */}
                <div className="absolute inset-0 flex items-center justify-center opacity-30">
                  <ManaSymbol symbol={color} size={32} />
                </div>
                {/* Count in foreground */}
                <span className="text-lg font-bold relative z-10">{pipCounts[color]}</span>
              </div>
            ))}
          </div>
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
        cmc: c.cmc || 0,
        mana_cost: c.mana_cost || '',
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

      {/* Deck Stats Panel */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <ManaCurve cards={includedCards} />
        </div>
        <DeckStats cards={includedCards} />
      </div>

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
function CommanderDetail({ commander, collectionCount, onBack, onOpenDeckBuilder, excludeInDecks }) {
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
  const [selectedPartner, setSelectedPartner] = useState(null);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        budget: budget || null,
        theme: theme || null,
        exclude_in_decks: excludeInDecks || null,
      };
      if (selectedPartner) {
        params.partner = selectedPartner.name;
      }
      const d = await apiGet(`/api/commander/${encodeURIComponent(commander.name)}`, params);
      setData(d);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [commander.name, budget, theme, excludeInDecks, selectedPartner]);

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

  if (loading && !data) {
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

      {/* Partner Commander */}
      <PartnerPicker
        commanderName={commander.name}
        onSelectPartner={setSelectedPartner}
        selectedPartner={selectedPartner}
      />

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

      {/* Card List Toggles + Legend */}
      <div className="flex flex-wrap items-center justify-between gap-4">
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
        <div className="flex flex-wrap gap-3 text-[11px] text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Available</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" /> In deck, have spares</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-500" /> All copies in decks</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Not owned</span>
        </div>
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

// --- Card Availability Dot ---
function AvailDot({ card }) {
  // card has: qty_owned, qty_in_decks, in_decks
  const owned = card.qty_owned || 0;
  const inDecks = card.qty_in_decks || 0;
  const deckNames = (card.in_decks || []).map(d => d.name).join(', ');

  if (owned === 0) {
    return <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="Not owned" />;
  }
  if (inDecks === 0) {
    return <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" title={`Owned: ${owned}`} />;
  }
  if (owned > inDecks) {
    return <span className="w-2 h-2 rounded-full bg-yellow-500 flex-shrink-0" title={`Owned: ${owned}, In decks: ${inDecks} (${deckNames})`} />;
  }
  return <span className="w-2 h-2 rounded-full bg-gray-500 flex-shrink-0" title={`All ${owned} in decks (${deckNames})`} />;
}

function DeckBadges({ inDecks }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const ref = useRef(null);

  if (!inDecks || inDecks.length === 0) return null;

  const handleMouseEnter = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const viewportW = window.innerWidth;
    let x = rect.left;
    let y = rect.bottom + 4;
    if (x + 200 > viewportW) x = viewportW - 210;
    if (y + 100 > window.innerHeight) y = rect.top - 104;
    setTooltipPos({ x, y });
    setShowTooltip(true);
  };

  // Show compact: just a count badge that expands on hover
  return (
    <span
      ref={ref}
      className="relative inline-flex items-center ml-1 cursor-default"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span className="text-[10px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">
        <span className="text-purple-400">In {inDecks.length} Deck{inDecks.length > 1 ? 's' : ''}</span>
      </span>
      {showTooltip && (
        <div
          className="fixed z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl p-2 space-y-1 min-w-[140px]"
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          <p className="text-[10px] text-gray-500 font-medium mb-1">In {inDecks.length} deck{inDecks.length > 1 ? 's' : ''}:</p>
          {inDecks.map(d => (
            <p key={d.id} className="text-xs text-gray-300 truncate">{d.name}</p>
          ))}
        </div>
      )}
    </span>
  );
}

// --- My Decks ---
function MyDecks({ onDecksChanged, decksReady }) {
  const [decks, setDecks] = useState({});
  const [newName, setNewName] = useState('');
  const [newCommander, setNewCommander] = useState('');
  const [newPartner, setNewPartner] = useState(null);
  const [newCards, setNewCards] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editCards, setEditCards] = useState('');
  const [error, setError] = useState('');
  const [validating, setValidating] = useState(false);
  const [invalidCards, setInvalidCards] = useState([]);

  // Load decks only after restore is complete
  useEffect(() => {
    if (!decksReady) return;
    apiGet('/api/decks').then(data => {
      const deckMap = {};
      (data.decks || []).forEach(d => { deckMap[d.id] = d; });
      setDecks(deckMap);
      saveDecks(deckMap);
    }).catch(() => {});
  }, [decksReady]);

  // Parse card names from text
  const parseCardNames = (text) => {
    return text.trim().split('\n')
      .map(l => l.trim())
      .filter(l => l)
      .map(l => {
        const m = l.match(/^(\d+)x?\s+(.+)/);
        return m ? m[2].trim() : l.trim();
      });
  };

  const validateAndAdd = async () => {
    if (!newName.trim()) return;
    setError('');
    setInvalidCards([]);

    // Validate cards if any are provided
    if (newCards.trim()) {
      setValidating(true);
      try {
        const names = parseCardNames(newCards);
        if (names.length > 0) {
          const result = await apiPost('/api/cards/validate', { cards: names });
          if (result.invalid && result.invalid.length > 0) {
            setInvalidCards(result.invalid);
            setError(`${result.invalid.length} unrecognized card(s) found. Fix or remove them before saving.`);
            setValidating(false);
            return;
          }
        }
      } catch (e) {
        // If validation fails (network issue), allow saving anyway
        console.warn('Card validation failed, proceeding:', e);
      }
      setValidating(false);
    }

    // Create deck
    try {
      const deck = await apiPost('/api/decks', {
        name: newName, commander: newCommander, cards_text: newCards,
      });
      const updated = { ...decks, [deck.id]: deck };
      setDecks(updated);
      saveDecks(updated);
      onDecksChanged();
      setNewName(''); setNewCommander(''); setNewPartner(null); setNewCards('');
      setInvalidCards([]);
    } catch (e) { setError(e.message); }
  };

  const handleDelete = async (id) => {
    try {
      await fetch(`${API}/api/decks/${id}`, { method: 'DELETE' });
      const updated = { ...decks };
      delete updated[id];
      setDecks(updated);
      saveDecks(updated);
      onDecksChanged();
    } catch (e) { setError(e.message); }
  };

  const handleEdit = async (id) => {
    if (editingId === id) {
      // Validate before saving
      setError('');
      setInvalidCards([]);
      if (editCards.trim()) {
        setValidating(true);
        try {
          const names = parseCardNames(editCards);
          if (names.length > 0) {
            const result = await apiPost('/api/cards/validate', { cards: names });
            if (result.invalid && result.invalid.length > 0) {
              setInvalidCards(result.invalid);
              setError(`${result.invalid.length} unrecognized card(s) found. Fix or remove them before saving.`);
              setValidating(false);
              return;
            }
          }
        } catch (e) {
          console.warn('Card validation failed, proceeding:', e);
        }
        setValidating(false);
      }

      // Save
      try {
        const res = await fetch(`${API}/api/decks/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cards_text: editCards }),
        });
        const deck = await res.json();
        const updated = { ...decks, [id]: deck };
        setDecks(updated);
        saveDecks(updated);
        onDecksChanged();
        setEditingId(null);
        setInvalidCards([]);
      } catch (e) { setError(e.message); }
    } else {
      // Start editing - load full deck
      try {
        const deck = await apiGet(`/api/decks/${id}`);
        const cardsText = Object.entries(deck.cards || {}).map(([n, q]) => `${q} ${n}`).join('\n');
        setEditCards(cardsText);
        setEditingId(id);
        setInvalidCards([]);
      } catch (e) { setError(e.message); }
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold">My Decks</h2>
      <p className="text-gray-400">
        Add your existing deck lists here. Cards committed to decks can be excluded from
        recommendations so you only see what's actually available.
      </p>

      {/* Add new deck */}
      <div className="bg-gray-800 rounded-lg p-6 space-y-3">
        <h3 className="font-semibold text-lg">Add Deck</h3>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-1">Deck Name *</label>
            <input
              value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Ur-Dragon Tribal"
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-1">Commander</label>
            <CommanderAutocomplete
              value={newCommander}
              onChange={v => { setNewCommander(v); setNewPartner(null); }}
              placeholder="e.g. The Ur-Dragon"
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
        {newCommander && (
          <PartnerPicker
            commanderName={newCommander}
            selectedPartner={newPartner}
            onSelectPartner={setNewPartner}
          />
        )}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Card List (paste from Archidekt/Moxfield export)</label>
          <textarea
            value={newCards} onChange={e => { setNewCards(e.target.value); setInvalidCards([]); }}
            placeholder={"1 Sol Ring\n1 Command Tower\n1 Arcane Signet\n..."}
            rows={8}
            className="w-full bg-gray-900 border border-gray-700 rounded p-3 text-sm font-mono focus:outline-none focus:border-blue-500"
          />
        </div>
        {invalidCards.length > 0 && (
          <div className="bg-red-900/30 border border-red-700 rounded p-3 space-y-1">
            <p className="text-sm text-red-400 font-medium">Unrecognized cards:</p>
            <ul className="text-xs text-red-300 space-y-0.5">
              {invalidCards.map(name => <li key={name}>- {name}</li>)}
            </ul>
          </div>
        )}
        <button
          onClick={validateAndAdd} disabled={!newName.trim() || validating}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 px-4 py-2 rounded font-medium"
        >
          {validating ? 'Validating cards...' : 'Add Deck'}
        </button>
      </div>

      {error && <div className="bg-red-900/50 border border-red-700 rounded p-3 text-red-300">{error}</div>}

      {/* Deck list */}
      {Object.values(decks).length === 0 && (
        <p className="text-gray-500 text-center py-8">No decks added yet. Add a deck above to start tracking card usage.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 grid-stagger">
      {Object.values(decks).map(deck => {
        const glow = getColorGlow(deck.color_identity);
        const glowStyle = {
          boxShadow: `0 0 20px 2px ${glow}, inset 0 0 20px 0px ${glow}`,
        };
        return (
        <div key={deck.id} className="relative bg-gray-800 rounded-xl overflow-hidden transition-all hover:scale-[1.02]" style={glowStyle}>
          {/* Commander art banner */}
          {deck.art_crop && (
            <div className="absolute inset-0 z-0">
              <img src={deck.art_crop} alt="" className="w-full h-full object-cover opacity-20" />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/80 to-gray-900/40" />
            </div>
          )}
          <div className="relative z-10 p-4 flex flex-col h-full">
            {/* Commander image prominently displayed */}
            <div className="flex justify-center mb-3">
              {deck.image_uri && (
                <img src={deck.image_uri} alt={deck.commander} className="w-32 rounded-lg shadow-xl" style={{filter: `drop-shadow(0 0 8px ${glow})`}} />
              )}
            </div>
            <h4 className="font-bold text-center text-sm">{deck.name}</h4>
            {deck.commander && <p className="text-xs text-gray-400 text-center mt-0.5">{deck.commander}</p>}
            <div className="flex items-center justify-center gap-2 mt-1.5">
              {deck.color_identity && deck.color_identity.length > 0 && (
                <ColorBadge colors={deck.color_identity} />
              )}
              <span className="text-xs text-gray-500">{deck.card_count || 0} cards</span>
            </div>
            <div className="flex gap-2 justify-center mt-3">
              <button
                onClick={() => handleEdit(deck.id)}
                disabled={validating}
                className={`px-3 py-1 rounded text-xs ${
                  editingId === deck.id ? 'bg-green-700 hover:bg-green-600' : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                {editingId === deck.id ? (validating ? 'Validating...' : 'Save') : 'Edit'}
              </button>
              <button
                onClick={() => handleDelete(deck.id)}
                className="bg-red-800 hover:bg-red-700 px-3 py-1 rounded text-xs"
              >
                Delete
              </button>
            </div>
            {editingId === deck.id && (
              <div className="mt-3 space-y-2">
                <textarea
                  value={editCards} onChange={e => { setEditCards(e.target.value); setInvalidCards([]); }}
                  rows={8}
                  className="w-full bg-gray-900 border border-gray-700 rounded p-3 text-xs font-mono focus:outline-none focus:border-blue-500"
                />
                {invalidCards.length > 0 && (
                  <div className="bg-red-900/30 border border-red-700 rounded p-3 space-y-1">
                    <p className="text-xs text-red-400 font-medium">Unrecognized cards:</p>
                    <ul className="text-[11px] text-red-300 space-y-0.5">
                      {invalidCards.map(name => <li key={name}>- {name}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        );
      })}
      </div>

      {/* Legend */}
      {Object.values(decks).length > 0 && (
        <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
          <h4 className="text-sm font-medium text-gray-400">Availability Legend</h4>
          <div className="flex flex-wrap gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> Available</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-500" /> In deck, have spares</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-500" /> All copies in decks</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> Not owned</span>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Auth Modal ---
function AuthModal({ isOpen, onClose, onLogin }) {
  const [mode, setMode] = useState('login'); // 'login' or 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const data = await apiPost(endpoint, { username, password });

      // Save auth data
      saveAuthToken(data.token);
      saveAuthUser(data.user);

      // Notify parent and close
      onLogin(data.user, data.token);
      onClose();
      setLoading(false);
    } catch (err) {
      console.error('Auth error:', err);
      setError(err.message || 'Something went wrong. Check if the backend is running.');
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm space-y-4 page-fade-in">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">
            {mode === 'login' ? 'Login' : 'Create Account'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">&times;</button>
        </div>

        <p className="text-sm text-gray-400">
          {mode === 'login'
            ? 'Login to sync your collection and decks across devices.'
            : 'Create an account to save your collection and decks to the cloud.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter username"
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              required
              minLength={3}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              required
              minLength={4}
            />
          </div>

          {error && (
            <div className="bg-red-900/50 border border-red-700 rounded p-2 text-red-300 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 px-4 py-2 rounded font-medium transition-colors"
          >
            {loading ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create Account'}
          </button>
        </form>

        <div className="text-center text-sm text-gray-500">
          {mode === 'login' ? (
            <>
              Don't have an account?{' '}
              <button onClick={() => { setMode('register'); setError(''); }} className="text-blue-400 hover:underline">
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button onClick={() => { setMode('login'); setError(''); }} className="text-blue-400 hover:underline">
                Login
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Collection Statistics ---

function CollectionStats({ collectionCount }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (collectionCount > 0 && !stats) {
      setLoading(true);
      apiGet('/api/collection/stats')
        .then(data => { setStats(data); setLoading(false); })
        .catch(e => { setError(e.message); setLoading(false); });
    }
  }, [collectionCount, stats]);

  if (collectionCount === 0) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Collection Statistics</h2>
        <p className="text-gray-500 text-center py-12">Upload a collection to see your stats.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Collection Statistics</h2>
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-400">Analyzing your collection...</p>
          <p className="text-xs text-gray-500 mt-1">Fetching prices and card data from Scryfall</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Collection Statistics</h2>
        <div className="bg-red-900/50 border border-red-700 rounded p-3 text-red-300">{error}</div>
      </div>
    );
  }

  if (!stats) return null;

  const typeOrder = ['Creature', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Planeswalker', 'Land', 'Other'];
  const typeColors = {
    Creature: '#22c55e', Instant: '#3b82f6', Sorcery: '#ef4444',
    Enchantment: '#a855f7', Artifact: '#eab308', Planeswalker: '#f97316',
    Land: '#92400e', Other: '#6b7280',
  };
  const pipColors = {
    W: { bg: '#f9faf4', text: '#333' },
    U: { bg: '#0e68ab', text: '#fff' },
    B: { bg: '#2b2b2b', text: '#ccc' },
    R: { bg: '#d32029', text: '#fff' },
    G: { bg: '#00733e', text: '#fff' },
    C: { bg: '#6b7280', text: '#fff' },
  };

  const totalTyped = Object.values(stats.type_counts).reduce((a, b) => a + b, 0);
  const totalPips = Object.values(stats.color_counts).reduce((a, b) => a + b, 0);
  const cmcBuckets = [0, 1, 2, 3, 4, 5, 6, 7];
  const cmcCounts = cmcBuckets.map(b => stats.cmc_distribution[String(b)] || 0);
  const maxCmc = Math.max(...cmcCounts, 1);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Collection Statistics</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 grid-stagger">
        <div className="bg-gray-800 rounded-lg p-4 text-center">
          <span className="text-3xl font-bold text-blue-400 number-pop inline-block">{stats.total_unique.toLocaleString()}</span>
          <p className="text-xs text-gray-500 mt-1">Unique Cards</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 text-center">
          <span className="text-3xl font-bold text-green-400 number-pop inline-block">{stats.total_cards.toLocaleString()}</span>
          <p className="text-xs text-gray-500 mt-1">Total Cards</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 text-center">
          <span className="text-3xl font-bold text-yellow-400 number-pop inline-block">${stats.total_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <p className="text-xs text-gray-500 mt-1">Est. Total Value</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 text-center">
          <span className="text-3xl font-bold text-purple-400 number-pop inline-block">{stats.total_in_decks}</span>
          <p className="text-xs text-gray-500 mt-1">Cards in Decks</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Type Distribution */}
        <div className="bg-gray-800 rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-300">Card Type Distribution</h3>
          {/* Visual stacked bar */}
          <div className="flex rounded-full overflow-hidden h-4 bar-animate">
            {typeOrder.filter(t => stats.type_counts[t]).map(type => (
              <div
                key={type}
                style={{
                  width: `${(stats.type_counts[type] / totalTyped) * 100}%`,
                  backgroundColor: typeColors[type],
                }}
                title={`${type}: ${stats.type_counts[type]}`}
              />
            ))}
          </div>
          {/* Legend */}
          <div className="space-y-1.5">
            {typeOrder.filter(t => stats.type_counts[t]).map(type => (
              <div key={type} className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: typeColors[type] }}
                />
                <span className="text-xs text-gray-400 flex-1">{type}</span>
                <span className="text-xs text-gray-300 font-medium">{stats.type_counts[type]}</span>
                <span className="text-xs text-gray-500 w-10 text-right">
                  {((stats.type_counts[type] / totalTyped) * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Color Distribution */}
        <div className="bg-gray-800 rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-300">Color Distribution</h3>
          {totalPips > 0 && (
            <>
              {/* Visual blocks */}
              <div className="flex gap-2">
                {['W', 'U', 'B', 'R', 'G', 'C'].filter(c => stats.color_counts[c] > 0).map(color => (
                  <div
                    key={color}
                    className="rounded-lg py-4 flex flex-col items-center justify-center transition-all relative overflow-hidden"
                    style={{
                      backgroundColor: pipColors[color].bg,
                      color: pipColors[color].text,
                      flex: stats.color_counts[color],
                      minWidth: '60px',
                    }}
                  >
                    {/* Background icon at low opacity */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-20">
                      <ManaSymbol symbol={color} size={56} />
                    </div>
                    {/* Content in foreground */}
                    <span className="text-xl font-bold relative z-10">{stats.color_counts[color]}</span>
                    <p className="text-[10px] opacity-75 relative z-10">{color === 'C' ? 'Colorless' : COLOR_MAP[color]?.label || color}</p>
                  </div>
                ))}
              </div>
              {/* Percentage bar */}
              <div className="flex rounded-full overflow-hidden h-3">
                {['W', 'U', 'B', 'R', 'G', 'C'].filter(c => stats.color_counts[c] > 0).map(color => (
                  <div
                    key={color}
                    style={{
                      width: `${(stats.color_counts[color] / totalPips) * 100}%`,
                      backgroundColor: pipColors[color].bg,
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Mana Curve */}
        <div className="bg-gray-800 rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-300">Collection Mana Curve</h3>
          <div className="flex items-end gap-2" style={{ height: '140px' }}>
            {cmcBuckets.map((cmc, i) => {
              const pct = cmcCounts[i] / maxCmc;
              return (
                <div key={cmc} className="flex-1 flex flex-col items-center h-full justify-end">
                  <span className="text-xs text-gray-400 mb-1">
                    {cmcCounts[i] > 0 ? cmcCounts[i] : ''}
                  </span>
                  <div
                    className="w-full bg-blue-600 rounded-t transition-all duration-300"
                    style={{ height: `${Math.max(pct * 100, cmcCounts[i] > 0 ? 3 : 0)}%` }}
                  />
                  <span className="mt-1 flex items-center justify-center">
                    {cmc === 7 ? (
                      <span className="text-xs text-gray-500">7+</span>
                    ) : (
                      <ManaSymbol symbol={String(cmc)} size={16} />
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Most Valuable */}
        <div className="bg-gray-800 rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-300">Most Valuable Cards</h3>
          <div className="divide-y divide-gray-700">
            {stats.top_valuable.map((card, i) => (
              <div key={card.name} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 w-5">{i + 1}.</span>
                  <CardName name={card.name} className="text-sm" />
                  {card.qty > 1 && <span className="text-xs text-gray-500">x{card.qty}</span>}
                </div>
                <span className="text-sm font-medium text-yellow-400">${card.price.toFixed(2)}</span>
              </div>
            ))}
            {stats.top_valuable.length === 0 && (
              <p className="text-gray-500 text-sm py-4">No price data available</p>
            )}
          </div>
        </div>
      </div>
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
  const [excludeInDecks, setExcludeInDecks] = useState(false);
  const [deckCount, setDeckCount] = useState(0);
  const [decksReady, setDecksReady] = useState(false);

  // Auth state
  const [user, setUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [syncStatus, setSyncStatus] = useState(''); // '', 'syncing', 'synced', 'error'

  // Check for existing auth on mount
  useEffect(() => {
    const savedUser = loadAuthUser();
    const savedToken = loadAuthToken();
    if (savedUser && savedToken) {
      // Verify token is still valid
      apiAuthGet('/api/auth/me')
        .then(data => setUser(data.user))
        .catch(() => {
          clearAuth();
          setUser(null);
        });
    }
  }, []);

  // Sync to server when logged in and data changes
  const syncToServer = useCallback(async () => {
    if (!user) return;

    setSyncStatus('syncing');
    try {
      const collection = loadCollection() || {};
      const decks = loadDecks() || {};

      await Promise.all([
        apiAuthPost('/api/user/collection/save', { cards: collection }),
        apiAuthPost('/api/user/decks/save', { decks }),
      ]);

      setSyncStatus('synced');
      setTimeout(() => setSyncStatus(''), 2000);
    } catch (err) {
      console.error('Sync failed:', err);
      setSyncStatus('error');
      setTimeout(() => setSyncStatus(''), 3000);
    }
  }, [user]);

  // Handle login - load user data from server
  const handleLogin = async (loggedInUser, token) => {
    setUser(loggedInUser);

    try {
      // Load user data from server
      const data = await apiAuthGet('/api/user/data');

      // If server has data, use it; otherwise sync local data to server
      if (data.collection.count > 0 || data.decks.count > 0) {
        // Server has data - restore it locally
        if (data.collection.count > 0) {
          saveCollection(data.collection.cards);
          await apiPost('/api/collection/restore', { cards: data.collection.cards });
          setCollectionCount(data.collection.count);
        }
        if (data.decks.count > 0) {
          saveDecks(data.decks.decks);
          await apiPost('/api/decks/restore', { decks: data.decks.decks });
          setDeckCount(data.decks.count);
        }
        if (data.collection.count > 0) setTab('recommend');
      } else {
        // Server is empty - sync local data up
        await syncToServer();
      }
    } catch (err) {
      console.error('Failed to load user data:', err);
    }
  };

  // Handle logout
  const handleLogout = () => {
    clearAuth();
    setUser(null);
    setSyncStatus('');
  };

  // Restore collection and decks from localStorage on startup
  useEffect(() => {
    const saved = loadCollection();
    if (saved) {
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

    // Restore decks, then signal ready
    const savedDecks = loadDecks();
    if (savedDecks && Object.keys(savedDecks).length > 0) {
      apiPost('/api/decks/restore', { decks: savedDecks }).then(data => {
        setDeckCount(data.count || 0);
      }).catch(() => {}).finally(() => setDecksReady(true));
    } else {
      setDecksReady(true);
    }
  }, []);

  const handleUploaded = (data) => {
    setCollectionCount(data.count);
    if (data.cards) {
      saveCollection(data.cards);
      // Auto-sync to server if logged in
      if (user) syncToServer();
    }
  };

  const handleSelectCommander = (cmd) => {
    setSelectedCommander(cmd);
    setTab('detail');
  };

  const handleToggleCompare = (cmd) => {
    setCompareList(prev => {
      const exists = prev.find(c => c.name === cmd.name);
      if (exists) return prev.filter(c => c.name !== cmd.name);
      if (prev.length >= 3) return prev;
      return [...prev, cmd];
    });
  };

  const handleOpenDeckBuilder = (data) => {
    setDeckBuilderData(data);
    setTab('deckbuilder');
  };

  const handleDecksChanged = () => {
    apiGet('/api/decks').then(data => {
      setDeckCount((data.decks || []).length);
      // Auto-sync to server if logged in
      if (user) syncToServer();
    }).catch(() => {});
  };

  const tabs = [
    { id: 'upload', label: 'Upload Collection' },
    { id: 'recommend', label: 'Recommendations' },
    { id: 'search', label: 'Search' },
    { id: 'mydecks', label: `My Decks${deckCount ? ` (${deckCount})` : ''}` },
    { id: 'stats', label: 'Stats' },
  ];

  return (
    <div className="min-h-screen">
      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onLogin={handleLogin}
      />

      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold">MTG Commander Recommender</h1>
          <div className="flex items-center gap-4">
            {collectionCount > 0 && (
              <span className="text-sm text-gray-400">
                {collectionCount} cards
              </span>
            )}
            {/* Sync status */}
            {user && syncStatus && (
              <span className={`text-xs px-2 py-1 rounded ${
                syncStatus === 'syncing' ? 'bg-blue-900/50 text-blue-400' :
                syncStatus === 'synced' ? 'bg-green-900/50 text-green-400' :
                'bg-red-900/50 text-red-400'
              }`}>
                {syncStatus === 'syncing' ? 'Syncing...' :
                 syncStatus === 'synced' ? 'Saved!' : 'Sync failed'}
              </span>
            )}
            {/* Auth buttons */}
            {user ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400">
                  <span className="text-green-400">●</span> {user.username}
                </span>
                <button
                  onClick={syncToServer}
                  className="text-xs text-blue-400 hover:text-blue-300"
                  title="Sync to cloud"
                >
                  Sync
                </button>
                <button
                  onClick={handleLogout}
                  className="text-xs text-gray-400 hover:text-red-400"
                >
                  Logout
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded text-sm font-medium transition-colors"
              >
                Login / Sign Up
              </button>
            )}
          </div>
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
            excludeInDecks={excludeInDecks}
            onToggleExclude={() => setExcludeInDecks(prev => !prev)}
            deckCount={deckCount}
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

        <div style={{ display: tab === 'mydecks' ? 'block' : 'none' }}>
          <MyDecks onDecksChanged={handleDecksChanged} decksReady={decksReady} />
        </div>

        <div style={{ display: tab === 'stats' ? 'block' : 'none' }}>
          <CollectionStats collectionCount={collectionCount} />
        </div>

        {tab === 'detail' && selectedCommander && (
          <div className="page-fade-in">
            <CommanderDetail
              commander={selectedCommander}
              collectionCount={collectionCount}
              onBack={() => setTab('recommend')}
              onOpenDeckBuilder={handleOpenDeckBuilder}
              excludeInDecks={excludeInDecks}
            />
          </div>
        )}

        {tab === 'deckbuilder' && selectedCommander && deckBuilderData && (
          <div className="page-fade-in">
            <DeckBuilder
              data={deckBuilderData}
              commander={selectedCommander}
              onBack={() => setTab('detail')}
            />
          </div>
        )}

        {tab === 'compare' && compareList.length >= 2 && (
          <div className="page-fade-in">
            <CompareView
              commanders={compareList}
              onBack={() => setTab('recommend')}
              onSelectCommander={handleSelectCommander}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
