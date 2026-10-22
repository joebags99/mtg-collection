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

// --- Ambient Background with floating particles and orbs ---
function AmbientBackground({ colors = [] }) {
  const colorValues = {
    W: '#f9faf4',
    U: '#0e68ab',
    B: '#6b5080',
    R: '#d32029',
    G: '#00733e',
  };

  const activeColors = colors.length > 0
    ? colors.map(c => colorValues[c] || '#3b82f6')
    : ['#3b82f6', '#8b5cf6'];

  const particles = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    color: activeColors[i % activeColors.length],
    size: 3 + Math.random() * 6,
    left: Math.random() * 100,
    delay: Math.random() * 25,
    duration: 20 + Math.random() * 15,
  }));

  const orbs = activeColors.slice(0, 2).map((color, i) => ({
    color,
    size: 250 + i * 100,
    left: i === 0 ? '5%' : '75%',
    top: i === 0 ? '10%' : '50%',
    delay: i * 5,
  }));

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {orbs.map((orb, i) => (
        <div
          key={`orb-${i}`}
          className="ambient-orb"
          style={{
            width: orb.size,
            height: orb.size,
            left: orb.left,
            top: orb.top,
            background: `radial-gradient(circle, ${orb.color}30 0%, transparent 70%)`,
            animationDelay: `${orb.delay}s`,
          }}
        />
      ))}
      {particles.map(p => (
        <div
          key={`particle-${p.id}`}
          className="mana-particle"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.left}%`,
            backgroundColor: p.color,
            boxShadow: `0 0 ${p.size}px ${p.color}80`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}

// --- Page Header (compact, sleek with glowing underline) ---
function PageHero({ title, subtitle, commanders = [], stats = [], children, colorIdentity = [] }) {
  const colors = colorIdentity.length > 0 ? colorIdentity :
    commanders.length > 0 ? (commanders[0]?.color_identity || []) : [];

  const glowColor = colors.length > 0 ? getColorGlow(colors) : 'rgba(59, 130, 246, 0.6)';

  return (
    <div className="relative mb-8 overflow-hidden" style={{ zIndex: 1 }}>
      <AmbientBackground colors={colors} />

      <div className="flex items-start justify-between gap-6 mb-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1
            className="text-3xl font-black tracking-tight glow-underline inline-block pb-2"
            style={{ '--glow-color': glowColor }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="text-gray-400 mt-2 max-w-2xl text-sm leading-relaxed">{subtitle}</p>
          )}
        </div>

        {stats.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {stats.map((stat, i) => (
              <div
                key={i}
                className="glass-panel rounded-xl px-4 py-2 text-center min-w-[80px]"
              >
                <div className="text-lg font-bold text-white">{stat.value}</div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider">{stat.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {children}
    </div>
  );
}

// --- Section Header with accent bar ---
function SectionHeader({ children, color = 'blue', size = 'md', count, className = '' }) {
  const colorMap = {
    blue: '#3b82f6',
    green: '#22c55e',
    red: '#ef4444',
    purple: '#a855f7',
    yellow: '#eab308',
    gray: '#6b7280',
    orange: '#f97316',
  };
  const sizeClasses = {
    sm: 'text-sm font-medium',
    md: 'text-lg font-semibold',
    lg: 'text-xl font-bold',
  };
  return (
    <h3
      className={`section-header ${sizeClasses[size]} ${className}`}
      style={{ '--accent-color': colorMap[color] || color }}
    >
      {children}
      {count !== undefined && (
        <span className="text-gray-500 font-normal ml-2">({count})</span>
      )}
    </h3>
  );
}

// --- Loading Overlay ---
function LoadingOverlay({ message, submessage }) {
  return (
    <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="flex flex-col items-center gap-4 p-8">
        <div className="loading-spinner" />
        {message && <p className="text-gray-200 font-medium text-center">{message}</p>}
        {submessage && <p className="text-gray-500 text-sm text-center max-w-xs">{submessage}</p>}
      </div>
    </div>
  );
}

// --- Card Type Section Header ---
function TypeSectionHeader({ type, count, className = '' }) {
  const typeClass = `type-${type.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div className={`card-type-section pt-3 pb-2 ${typeClass} ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-300">{type}</span>
        <span className="text-xs text-gray-500">{count}</span>
      </div>
    </div>
  );
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

function CardName({ name, className = '', favorites, onToggleFavorite }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef(null);
  const imgSrc = `https://api.scryfall.com/cards/named?format=image&version=normal&exact=${encodeURIComponent(name)}`;
  const isFav = favorites && favorites.has(name.toLowerCase());

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
      className={`inline-flex items-center gap-1 cursor-pointer hover:text-blue-400 transition-colors ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShow(false)}
    >
      {name}
      {onToggleFavorite && (
        <button
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggleFavorite(name); }}
          className={`text-xs leading-none transition-colors flex-shrink-0 ${isFav ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400'}`}
          title={isFav ? 'Remove from favorites' : 'Add to favorites'}
        >
          {isFav ? '★' : '☆'}
        </button>
      )}
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
const FAVORITES_STORAGE_KEY = 'mtg_favorites';

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

function saveFavorites(favs) {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...favs]));
  } catch (e) {
    console.error('Failed to save favorites:', e);
  }
}

function loadFavorites() {
  try {
    const data = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (data) return new Set(JSON.parse(data));
  } catch (e) {
    console.error('Failed to load favorites:', e);
  }
  return new Set();
}

// --- API helpers ---
async function apiGet(path, params = {}) {
  const url = new URL(API + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') url.searchParams.set(k, v);
  });
  let res;
  try {
    res = await fetch(url);
  } catch (networkErr) {
    console.error(`Network error calling ${path}:`, networkErr);
    throw new Error(`Network error: Cannot reach server at ${API}. Is the backend running?`);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'API error');
  }
  return res.json();
}

async function apiPost(path, body) {
  let res;
  try {
    res = await fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    console.error(`Network error calling ${path}:`, networkErr);
    throw new Error(`Network error: Cannot reach server at ${API}. Is the backend running?`);
  }
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
function PartnerPicker({ commanderName, onSelectPartner, selectedPartner, partnerData }) {
  // partnerData can be passed from parent to avoid duplicate fetches
  const [partners, setPartners] = useState(partnerData?.partners || []);
  const [partnerType, setPartnerType] = useState(partnerData?.partner_type || '');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Only fetch if partnerData wasn't provided
  useEffect(() => {
    if (partnerData) {
      setPartnerType(partnerData.partner_type || '');
      setPartners(partnerData.partners || []);
      return;
    }
    if (!commanderName) { setPartners([]); setPartnerType(''); return; }
    setLoading(true);
    apiGet(`/api/commander/${encodeURIComponent(commanderName)}/partners`)
      .then(data => {
        setPartnerType(data.partner_type || '');
        setPartners(data.partners || []);
      })
      .catch(() => { setPartners([]); setPartnerType(''); })
      .finally(() => setLoading(false));
  }, [commanderName, partnerData]);

  if (!partnerType) return null;

  // For locked partners (partner_with/variant with 1 option), don't show remove button
  const isLockedPartner = (partnerType === 'partner_with' || partnerType === 'partner_variant') && partners.length === 1;

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
        {selectedPartner && !isLockedPartner && (
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

      {loading && <LoadingOverlay message="Processing your collection..." submessage="Validating card names and updating your collection." />}

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
  const colorGlow = getColorGlow(commander.color_identity);

  return (
      <div
        className={`rounded-xl cursor-pointer relative transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${selected ? 'ring-2 ring-purple-500' : ''}`}
        style={{
          boxShadow: `0 8px 32px ${colorGlow}, 0 0 0 1px rgba(255,255,255,0.05)`,
          background: 'linear-gradient(145deg, rgba(31, 41, 55, 0.95) 0%, rgba(17, 24, 39, 0.98) 100%)'
        }}
      >
        {selectable && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleCompare?.(commander); }}
            className={`absolute top-2 right-2 z-10 w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all backdrop-blur-sm ${
              selected ? 'bg-purple-500 border-purple-500 text-white scale-110' : 'bg-gray-900/80 border-gray-400 text-gray-400 hover:border-purple-400 hover:scale-105'
            }`}
            title={selected ? 'Remove from comparison' : 'Add to comparison'}
          >
            {selected ? '✓' : '+'}
          </button>
        )}
        <div onClick={() => onClick?.(commander)} className="overflow-hidden rounded-xl">
          {commander.image_uri && (
            <div className="relative">
              <img
                src={commander.image_uri}
                alt={commander.name}
                className="w-full aspect-[5/7] object-cover"
                loading="lazy"
              />
            {hasMatch && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/80 to-transparent px-2 pb-2 pt-8">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-300">
                    {commander.owned_count}/{commander.total_cards}
                  </span>
                  <span className={`text-lg font-bold ${
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
            <div className="bg-gray-900/80 rounded px-2 py-1.5 flex items-center justify-between border border-gray-700/50">
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

  // Get top 3 commanders for the hero display
  const topCommanders = sortedResults.slice(0, 3);

  return (
    <div className="space-y-6">
      <PageHero
        title="Commander Recommendations"
        subtitle={`Based on your collection of ${collectionCount.toLocaleString()} cards, ranked by how many cards you already own in each commander's average EDHREC deck.`}
        commanders={topCommanders}
        stats={fetched ? [
          { value: results.length, label: 'Commanders Found' },
          { value: `${Math.max(...results.map(r => r.match_percentage || 0))}%`, label: 'Best Match' },
          { value: `$${Math.min(...results.filter(r => r.missing_price).map(r => r.missing_price || 999)).toFixed(0)}`, label: 'Cheapest Build' }
        ] : []}
      />

      {/* Filters */}
      <div className="bg-gray-800/80 backdrop-blur rounded-xl p-4 space-y-4 border border-gray-700/50">
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

      {loading && <LoadingOverlay message="Fetching recommendations from EDHREC..." submessage="Comparing up to 200 commanders with your collection. This may take a few minutes." />}

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

function CardListByType({ ownedCards, missingCards, showOwned, showMissing, totalMissingPrice, favorites, onToggleFavorite }) {
  const ownedGroups = groupByType(ownedCards);
  const missingGroups = groupByType(missingCards);

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {showOwned && (
        <div className="space-y-4">
          <SectionHeader color="green" count={ownedCards.length}>
            Owned Cards
          </SectionHeader>
          {ownedGroups.length === 0 && (
            <p className="text-gray-500 text-sm bg-gray-800 rounded-lg px-3 py-4">None</p>
          )}
          {ownedGroups.map(({ type, cards }) => (
            <div key={type}>
              <TypeSectionHeader type={type} count={cards.length} />
              <div className="bg-gray-800 rounded-lg divide-y divide-gray-700">
                {cards.map(card => (
                  <div key={card.name} className="px-3 py-2 flex justify-between items-center hover:bg-gray-700/50 transition-colors">
                    <div className="flex items-center gap-1.5">
                      <AvailDot card={card} />
                      <CardName name={card.name} className="text-sm" favorites={favorites} onToggleFavorite={onToggleFavorite} />
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
          <div className="flex items-baseline gap-2">
            <SectionHeader color="red" count={missingCards.length}>
              Missing Cards
            </SectionHeader>
            {totalMissingPrice > 0 && (
              <span className="text-sm text-yellow-400">
                ~${totalMissingPrice.toFixed(2)}
              </span>
            )}
          </div>
          {missingGroups.length === 0 && (
            <p className="text-gray-500 text-sm bg-gray-800 rounded-lg px-3 py-4">None</p>
          )}
          {missingGroups.map(({ type, cards }) => (
            <div key={type}>
              <TypeSectionHeader type={type} count={cards.length} />
              <div className="bg-gray-800 rounded-lg divide-y divide-gray-700">
                {cards.map(card => (
                  <div key={card.name} className="px-3 py-2 flex justify-between items-center hover:bg-gray-700/50 transition-colors">
                    <div className="flex items-center gap-1.5">
                      <AvailDot card={card} />
                      <CardName name={card.name} className="text-sm" favorites={favorites} onToggleFavorite={onToggleFavorite} />
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
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          !card.owned ? 'bg-red-500' :
          (card.qty_in_decks || 0) >= (card.qty_owned || 1) ? 'bg-gray-500' :
          (card.qty_in_decks || 0) > 0 ? 'bg-yellow-500' :
          'bg-green-500'
        }`} title={
          !card.owned ? 'Need to buy' :
          (card.qty_in_decks || 0) > 0 ? `In ${(card.in_decks || []).map(d => d.name).join(', ')}` :
          'Owned'
        } />
        <span className="text-xs truncate flex-1">{card.name}</span>
        {!card.owned && card.price > 0 && (
          <span className="text-[10px] text-yellow-400 flex-shrink-0">${card.price.toFixed(2)}</span>
        )}
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
                className="flex-1 rounded-md py-3 flex items-center justify-center relative"
                style={{
                  backgroundColor: pipColors[color].bg,
                  color: pipColors[color].text,
                  flex: pipCounts[color],
                  minWidth: '36px',
                }}
              >
                {/* Large background icon that overflows */}
                <div
                  className="absolute opacity-15 pointer-events-none"
                  style={{
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <ManaSymbol symbol={color} size={56} />
                </div>
                {/* Count in foreground */}
                <span className="text-lg font-bold relative z-10 drop-shadow-sm">{pipCounts[color]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Client-side functional category classification
// Uses card_type as primary signal, with name-based heuristics for ramp/draw/removal
const RAMP_NAMES = new Set([
  'sol ring', 'mana crypt', 'mana vault', 'arcane signet', 'mind stone', 'thought vessel',
  'fellwar stone', 'commander\'s sphere', 'chromatic lantern', 'gilded lotus',
  'thran dynamo', 'worn powerstone', 'hedron archive', 'dreamstone hedron',
  'cultivate', 'kodama\'s reach', 'farseek', 'rampant growth', 'nature\'s lore',
  'three visits', 'skyshroud claim', 'explosive vegetation', 'migration path',
  'sakura-tribe elder', 'birds of paradise', 'llanowar elves', 'elvish mystic',
  'fyndhorn elves', 'avacyn\'s pilgrim', 'bloom tender', 'priest of titania',
  'dark ritual', 'cabal ritual', 'dockside extortionist',
]);

const DRAW_NAMES = new Set([
  'rhystic study', 'mystic remora', 'phyrexian arena', 'sylvan library', 'necropotence',
  'harmonize', 'read the bones', 'night\'s whisper', 'sign in blood', 'painful truths',
  'brainstorm', 'ponder', 'preordain', 'windfall', 'wheel of fortune', 'treasure cruise',
  'dig through time', 'fact or fiction', 'blue sun\'s zenith', 'pull from tomorrow',
  'consecrated sphinx', 'esper sentinel', 'archivist of oghma', 'beast whisperer',
  'guardian project', 'the great henge', 'skullclamp', 'mask of memory',
]);

const REMOVAL_NAMES = new Set([
  'swords to plowshares', 'path to exile', 'beast within', 'chaos warp', 'generous gift',
  'assassin\'s trophy', 'anguished unmaking', 'vindicate', 'mortify', 'putrefy',
  'counterspell', 'swan song', 'negate', 'dovin\'s veto', 'mana drain', 'force of will',
  'force of negation', 'fierce guardianship', 'pact of negation', 'arcane denial',
  'cyclonic rift', 'toxic deluge', 'wrath of god', 'damnation', 'blasphemous act',
  'farewell', 'vandalblast', 'return to dust', 'krosan grip', 'nature\'s claim',
  'go for the throat', 'terminate', 'reality shift', 'rapid hybridization', 'pongify',
  'despark', 'abrupt decay',
]);

const UTILITY_NAMES = new Set([
  // Tutors
  'demonic tutor', 'vampiric tutor', 'enlightened tutor', 'mystical tutor', 'worldly tutor',
  'gamble', 'diabolic tutor', 'diabolic intent', 'final parting', 'scheming symmetry',
  'fabricate', 'whir of invention', 'tribute mage', 'trophy mage', 'trinket mage',
  'imperial seal', 'grim tutor', 'wishclaw talisman', 'profane tutor',
  // Protection / interaction
  'lightning greaves', 'swiftfoot boots', 'whispersilk cloak', 'darksteel plate',
  'teferi\'s protection', 'grand abolisher', 'drannith magistrate', 'defense grid',
  'deflecting swat', 'flawless maneuver', 'tibalt\'s trickery', 'red elemental blast',
  'pyroblast', 'veil of summer', 'silence', 'autumn\'s veil',
  // Recursion
  'eternal witness', 'regrowth', 'noxious revival', 'sun titan', 'reanimate',
  'animate dead', 'necromancy', 'living death', 'victimize', 'karmic guide',
  'phyrexian reclamation', 'muldrotha, the gravetide', 'underworld breach',
  'sevinne\'s reclamation', 'brought back', 'hall of heliod\'s generosity',
  // General value / staples
  'smothering tithe', 'land tax', 'trouble in pairs', 'black market connections',
  'propaganda', 'ghostly prison', 'sphere of safety', 'crawlspace',
  'panharmonicon', 'conjurer\'s closet', 'helm of the host', 'strionic resonator',
  'sensei\'s divining top', 'scroll rack', 'rings of brighthearth',
  'illusionist\'s bracers', 'lithoform engine', 'heroic intervention',
]);

function classifyFunctionalCategory(card) {
  // Use backend classification if available and specific
  if (card.functional_category && card.functional_category !== 'utility' && card.functional_category !== 'synergy') {
    return card.functional_category;
  }
  // Client-side fallback using card_type + name heuristics
  const ct = (card.card_type || '').toLowerCase();
  if (ct === 'land') return 'lands';

  const name = (card.name || '').toLowerCase();
  if (RAMP_NAMES.has(name) || name.includes('signet') || name.includes('talisman')) return 'ramp';
  if (DRAW_NAMES.has(name)) return 'cardDraw';
  if (REMOVAL_NAMES.has(name)) return 'removal';
  if (UTILITY_NAMES.has(name)) return 'utility';

  // If backend already classified it (as synergy or utility), trust that
  if (card.functional_category) {
    return card.functional_category;
  }

  // Avg deck cards that aren't common staples are synergy picks for this commander
  if (!card.isRecommendation && !card.isBasicLand) return 'synergy';

  return 'utility';
}

// Basic lands for each color identity
const COLOR_TO_BASICS = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' };

function DeckBuilder({ data, commander, onBack, favorites, onToggleFavorite }) {
  const [deck, setDeck] = useState([]);
  const [exportText, setExportText] = useState('');
  const [viewMode, setViewMode] = useState('list'); // list, gallery, stacks

  // Deck composition settings
  const [showCompositionSettings, setShowCompositionSettings] = useState(false);
  const [composition, setComposition] = useState(null);
  const [tempComposition, setTempComposition] = useState(DEFAULT_COMPOSITION);
  const [suggestionMode, setSuggestionMode] = useState('collection'); // 'collection', 'cheapest', 'best'

  // Initialize with avg deck + classify cards + auto-fill basic lands
  useEffect(() => {
    if (data) {
      const commanderNorm = (commander.name || '').toLowerCase();

      const initial = [...data.owned_cards, ...data.missing_cards].map(c => {
        const isCommander = (c.name_normalized || c.name?.toLowerCase()) === commanderNorm;
        const card = { ...c, included: true, qty: 1, isCommander };
        card.functional_category = classifyFunctionalCategory(card);
        return card;
      });
      const recCards = (data.recommendations || []).map(c => {
        const card = {
          name: c.name,
          card_type: c.card_type || 'Other',
          functional_category: c.functional_category || 'utility',
          owned: c.owned,
          synergy: c.synergy,
          cmc: c.cmc || 0,
          mana_cost: c.mana_cost || '',
          included: false,
          isRecommendation: true,
          qty: 1,
        };
        card.functional_category = classifyFunctionalCategory(card);
        return card;
      });

      // Compute composition targets from the actual avg deck
      const deckCounts = {};
      for (const cat of ['lands', 'ramp', 'cardDraw', 'removal', 'synergy', 'utility']) deckCounts[cat] = 0;
      for (const c of initial) {
        if (c.isCommander) continue;
        const fc = classifyFunctionalCategory(c);
        if (fc in deckCounts) deckCounts[fc] += c.qty;
      }

      // Auto-fill basic lands to reach 99 non-commander cards
      const currentTotal = initial.filter(c => !c.isCommander).reduce((s, c) => s + c.qty, 0);
      const currentLands = deckCounts.lands || 0;
      const desiredLands = Math.max(currentLands, 38);
      // Fill basics to bring lands up, but cap total deck at 99 (commander is #100)
      const spaceForBasics = Math.max(0, 99 - currentTotal);
      const landDeficit = Math.min(Math.max(0, desiredLands - currentLands), spaceForBasics);

      const colors = commander.color_identity || [];
      const basics = colors.length > 0
        ? colors.filter(c => COLOR_TO_BASICS[c]).map(c => COLOR_TO_BASICS[c])
        : ['Wastes'];

      if (landDeficit > 0 && basics.length > 0) {
        const perType = Math.floor(landDeficit / basics.length);
        const remainder = landDeficit % basics.length;
        basics.forEach((basicName, i) => {
          const qty = perType + (i < remainder ? 1 : 0);
          if (qty <= 0) return;
          const existing = initial.find(c => c.name === basicName);
          if (existing) {
            existing.qty = (existing.qty || 1) + qty;
            existing.isBasicLand = true;
          } else {
            initial.push({
              name: basicName,
              name_normalized: basicName.toLowerCase(),
              card_type: 'Land',
              functional_category: 'lands',
              owned: true,
              isBasicLand: true,
              included: true,
              qty,
              cmc: 0,
              mana_cost: '',
            });
          }
        });
        deckCounts.lands += landDeficit;
      }

      // Set composition targets from actual deck breakdown
      setComposition(deckCounts);
      setTempComposition(deckCounts);

      setDeck([...initial, ...recCards]);
    }
  }, [data, commander.color_identity, commander.name]);

  const includedCards = deck.filter(c => c.included);
  const excludedCards = deck.filter(c => !c.included);
  const deckSize = includedCards.reduce((sum, c) => sum + c.qty, 0);

  // Calculate owned vs needed and price
  const ownedCount = includedCards.filter(c => c.owned).reduce((sum, c) => sum + c.qty, 0);
  const neededCount = includedCards.filter(c => !c.owned).reduce((sum, c) => sum + c.qty, 0);
  const priceToComplete = includedCards
    .filter(c => !c.owned && c.price)
    .reduce((sum, c) => sum + (c.price * c.qty), 0);

  // Composition analysis: actual counts vs targets per functional category
  const CATEGORY_META = [
    { key: 'lands', label: 'Lands', color: 'bg-amber-500' },
    { key: 'ramp', label: 'Ramp', color: 'bg-green-500' },
    { key: 'cardDraw', label: 'Draw', color: 'bg-blue-500' },
    { key: 'removal', label: 'Removal', color: 'bg-red-500' },
    { key: 'synergy', label: 'Synergy', color: 'bg-purple-500' },
    { key: 'utility', label: 'Utility', color: 'bg-gray-400' },
  ];

  // Exclude commander from composition analysis and swap logic
  const nonCommanderIncluded = includedCards.filter(c => !c.isCommander);
  const nonCommanderExcluded = excludedCards.filter(c => !c.isCommander);

  const activeComposition = composition || DEFAULT_COMPOSITION;

  const categoryCounts = {};
  for (const cat of CATEGORY_META) categoryCounts[cat.key] = 0;
  for (const c of nonCommanderIncluded) {
    const fc = classifyFunctionalCategory(c);
    if (fc in categoryCounts) categoryCounts[fc] += c.qty;
  }

  // Sort function for add candidates based on suggestion mode
  const sortAddCandidates = (a, b) => {
    if (suggestionMode === 'collection') {
      if (a.owned && !b.owned) return -1;
      if (!a.owned && b.owned) return 1;
      const pa = a.price || 0, pb = b.price || 0;
      if (pa !== pb) return pa - pb;
      return (b.synergy || 0) - (a.synergy || 0);
    } else if (suggestionMode === 'cheapest') {
      const pa = a.price || 0, pb = b.price || 0;
      if (pa !== pb) return pa - pb;
      return (b.synergy || 0) - (a.synergy || 0);
    } else { // 'best'
      return (b.synergy || 0) - (a.synergy || 0);
    }
  };

  // Build swap suggestions: for over-target categories, find cards to cut;
  // for under-target categories, find cards from excluded list to add.
  // Removal priority: basic lands first, then unowned, then most expensive, then lowest synergy.
  const swapSuggestions = [];
  const overCategories = CATEGORY_META.filter(m => categoryCounts[m.key] > activeComposition[m.key]);
  const underCategories = CATEGORY_META.filter(m => categoryCounts[m.key] < activeComposition[m.key]);

  if (overCategories.length > 0 && underCategories.length > 0) {
    // Find removable cards from over-represented categories (never remove commander)
    const removable = [];
    for (const over of overCategories) {
      const excess = categoryCounts[over.key] - activeComposition[over.key];
      const candidates = nonCommanderIncluded
        .filter(c => classifyFunctionalCategory(c) === over.key)
        .sort((a, b) => {
          if (a.isBasicLand && !b.isBasicLand) return -1;
          if (!a.isBasicLand && b.isBasicLand) return 1;
          if (!a.owned && b.owned) return -1;
          if (a.owned && !b.owned) return 1;
          const pa = a.price || 0, pb = b.price || 0;
          if (pa !== pb) return pb - pa;
          return (a.synergy || 0) - (b.synergy || 0);
        })
        .slice(0, excess);
      for (const c of candidates) removable.push({ ...c, fromCategory: over.label });
    }

    // Find addable cards for under-represented categories
    const addable = [];
    for (const under of underCategories) {
      const deficit = activeComposition[under.key] - categoryCounts[under.key];
      const candidates = nonCommanderExcluded
        .filter(c => classifyFunctionalCategory(c) === under.key)
        .sort(sortAddCandidates)
        .slice(0, deficit);
      for (const c of candidates) addable.push({ ...c, toCategory: under.label });
    }

    // Pair them up: each swap is "remove X, add Y"
    const pairCount = Math.min(removable.length, addable.length, 5);
    for (let i = 0; i < pairCount; i++) {
      swapSuggestions.push({ remove: removable[i], add: addable[i] });
    }
  }

  const toggle = (name) => {
    setDeck(prev => prev.map(c => {
      if (c.name !== name || c.isCommander) return c;
      return { ...c, included: !c.included, qty: c.included ? c.qty : 1 };
    }));
  };

  // For swaps: remove one copy (reduce qty for multi-copy cards like basics)
  const removeOneIncluded = (name) => {
    setDeck(prev => prev.map(c => {
      if (c.name !== name) return c;
      if (c.qty > 1) return { ...c, qty: c.qty - 1 };
      return { ...c, included: false, qty: 1 };
    }));
  };

  const addOneExcluded = (name) => {
    setDeck(prev => prev.map(c =>
      c.name === name ? { ...c, included: true, qty: c.included ? c.qty + 1 : 1 } : c
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

  // Apply composition targets: actually perform the removals/adds to the deck
  const applyComposition = (newTargets) => {
    // Build lists of card names to remove/add with quantities
    const removeMap = {};    // name -> qty to remove
    const addSet = {};       // name -> qty to add (excluded cards)
    const increaseMap = {};  // name -> qty to increase (already-included unlimited cards)

    for (const { key } of CATEGORY_META) {
      const actual = categoryCounts[key];
      const newTarget = newTargets[key];
      const diff = actual - newTarget;

      if (diff > 0) {
        const candidates = nonCommanderIncluded
          .filter(c => classifyFunctionalCategory(c) === key)
          .sort((a, b) => {
            if (a.isBasicLand && !b.isBasicLand) return -1;
            if (!a.isBasicLand && b.isBasicLand) return 1;
            if (!a.owned && b.owned) return -1;
            if (a.owned && !b.owned) return 1;
            const pa = a.price || 0, pb = b.price || 0;
            if (pa !== pb) return pb - pa;
            return (a.synergy || 0) - (b.synergy || 0);
          });
        let remaining = diff;
        for (const c of candidates) {
          if (remaining <= 0) break;
          const take = Math.min(c.qty, remaining);
          removeMap[c.name] = (removeMap[c.name] || 0) + take;
          remaining -= take;
        }
      } else if (diff < 0) {
        let remaining = Math.abs(diff);
        // First: add from excluded cards
        const candidates = nonCommanderExcluded
          .filter(c => classifyFunctionalCategory(c) === key)
          .sort(sortAddCandidates);
        for (const c of candidates) {
          if (remaining <= 0) break;
          addSet[c.name] = (addSet[c.name] || 0) + 1;
          remaining -= 1;
        }
        // Second: if still remaining, increase qty on already-included unlimited cards (basic lands)
        if (remaining > 0) {
          const includedUnlimited = nonCommanderIncluded
            .filter(c => classifyFunctionalCategory(c) === key && canHaveMultiple(c.name))
            .sort(sortAddCandidates);
          for (const c of includedUnlimited) {
            if (remaining <= 0) break;
            increaseMap[c.name] = (increaseMap[c.name] || 0) + remaining;
            remaining = 0;
          }
        }
      }
    }

    // Build new deck array (no mutation of lookup objects during iteration)
    setDeck(prev => {
      const removalsLeft = { ...removeMap };
      const addsLeft = { ...addSet };
      const increasesLeft = { ...increaseMap };
      return prev.map(c => {
        if (c.isCommander) return c;

        // Handle removals
        if (removalsLeft[c.name] > 0 && c.included) {
          const removeQty = removalsLeft[c.name];
          if (c.qty <= removeQty) {
            removalsLeft[c.name] = removeQty - c.qty;
            return { ...c, included: false, qty: 1 };
          } else {
            removalsLeft[c.name] = 0;
            return { ...c, qty: c.qty - removeQty };
          }
        }

        // Handle qty increases on already-included unlimited cards
        if (increasesLeft[c.name] > 0 && c.included) {
          const addQty = increasesLeft[c.name];
          increasesLeft[c.name] = 0;
          return { ...c, qty: c.qty + addQty };
        }

        // Handle additions of excluded cards
        if (addsLeft[c.name] > 0 && !c.included) {
          addsLeft[c.name] = 0;
          return { ...c, included: true, qty: 1 };
        }

        return c;
      });
    });

    setComposition(newTargets);
    setShowCompositionSettings(false);
  };

  const includedGroups = groupByType(includedCards);

  // --- View renderers ---
  const renderListView = () => (
    <div className="grid md:grid-cols-3 gap-6">
      <div className="md:col-span-2 space-y-4">
        <SectionHeader color="green" count={deckSize}>In Deck</SectionHeader>
        {includedGroups.map(({ type, cards }) => (
          <div key={type}>
            <TypeSectionHeader type={type} count={cards.reduce((s, c) => s + c.qty, 0)} />
            <div className="bg-gray-800 rounded-lg divide-y divide-gray-700">
              {cards.map(card => (
                <div key={card.name} className="px-3 py-1.5 flex justify-between items-center group deck-card-enhanced hover:bg-gray-700/50">
                  <div className="flex items-center gap-2">
                    <AvailDot card={card} />
                    <CardName name={card.name} className="text-sm" favorites={favorites} onToggleFavorite={onToggleFavorite} />
                    {card.isRecommendation && <span className="text-xs text-purple-400 bg-purple-900/30 px-1.5 py-0.5 rounded">rec</span>}
                    {card.isCommander && <span className="text-xs text-yellow-400 bg-yellow-900/30 px-1.5 py-0.5 rounded">cmdr</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <DeckBadges inDecks={card.in_decks} />
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
        <SectionHeader color="gray" count={excludedCards.length}>Removed / Available</SectionHeader>
        <div className="bg-gray-800 rounded-lg divide-y divide-gray-700 max-h-[600px] overflow-y-auto">
          {excludedCards.map(card => (
            <div key={card.name} className="px-3 py-1.5 flex justify-between items-center group">
              <div className="flex items-center gap-2">
                <AvailDot card={card} />
                <CardName name={card.name} className="text-sm text-gray-400" favorites={favorites} onToggleFavorite={onToggleFavorite} />
                <DeckBadges inDecks={card.in_decks} />
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
          <TypeSectionHeader type={type} count={cards.reduce((s, c) => s + c.qty, 0)} className="mb-2" />
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 gap-2">
            {cards.map(card => (
              <div key={card.name} className="relative group">
                <DeckCardImage name={card.name} small />
                {card.qty > 1 && (
                  <span className="absolute top-1 right-1 bg-black/80 text-white text-xs font-bold px-1.5 py-0.5 rounded">
                    x{card.qty}
                  </span>
                )}
                <span className={`absolute top-1 left-1 w-2.5 h-2.5 rounded-full border border-black ${
                  !card.owned ? 'bg-red-500' :
                  (card.qty_in_decks || 0) >= (card.qty_owned || 1) ? 'bg-gray-500' :
                  (card.qty_in_decks || 0) > 0 ? 'bg-yellow-500' :
                  'bg-green-500'
                }`} title={
                  !card.owned ? 'Not owned' :
                  (card.qty_in_decks || 0) > 0 ? `In ${(card.in_decks || []).map(d => d.name).join(', ')}` :
                  'Owned'
                } />
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

  const renderStacksView = () => {
    // Smart column pairing: minimize total height by grouping shorter lists together
    const groupMap = {};
    includedGroups.forEach(g => { groupMap[g.type] = g.cards; });

    // Get types sorted by card count (descending)
    const typesWithCounts = includedGroups
      .map(g => ({ type: g.type, count: g.cards.length }))
      .sort((a, b) => b.count - a.count);

    // Bin-packing: distribute types into 4 columns to minimize max height
    const columns = [[], [], [], []];
    const columnHeights = [0, 0, 0, 0];

    for (const { type, count } of typesWithCounts) {
      // Find column with smallest height
      const minIdx = columnHeights.indexOf(Math.min(...columnHeights));
      columns[minIdx].push(type);
      columnHeights[minIdx] += count;
    }

    const renderColumn = (type) => {
      const cards = groupMap[type];
      if (!cards || cards.length === 0) return null;
      return (
        <div key={type}>
          <TypeSectionHeader type={type} count={cards.reduce((s, c) => s + c.qty, 0)} className="mb-1" />
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
      );
    };

    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {columns.map((types, colIdx) => (
          <div key={colIdx} className="space-y-4">
            {types.map(type => renderColumn(type))}
          </div>
        ))}
      </div>
    );
  };

  const colorGlow = getColorGlow(commander.color_identity);

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-blue-400 hover:underline">← Back to Detail</button>

      {/* Enhanced header with color glow */}
      <div
        className="bg-gray-800/80 rounded-xl p-4 flex items-center justify-between flex-wrap gap-4"
        style={{ boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 20px ${colorGlow}` }}
      >
        <div className="flex items-center gap-4">
          {commander.image_uri && (
            <img
              src={commander.image_uri}
              alt={commander.name}
              className="w-16 h-auto rounded-lg shadow-lg hidden sm:block"
              style={{ boxShadow: `0 4px 12px ${colorGlow}` }}
            />
          )}
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-3">
              Deck Builder
              <ColorBadge colors={commander.color_identity} />
            </h2>
            <p className="text-gray-400 text-sm">{commander.name}</p>
          </div>
        </div>

        {/* Stats pills */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
            deckSize === 100 ? 'bg-green-900/50 text-green-400 border border-green-700' :
            deckSize > 100 ? 'bg-red-900/50 text-red-400 border border-red-700' :
            'bg-yellow-900/50 text-yellow-400 border border-yellow-700'
          }`}>
            {deckSize}/100 cards
          </div>
          <div className="px-3 py-1.5 rounded-lg text-sm bg-gray-700/50 border border-gray-600">
            <span className="text-green-400 font-medium">{ownedCount}</span>
            <span className="text-gray-500 mx-1">/</span>
            <span className="text-red-400 font-medium">{neededCount}</span>
            <span className="text-gray-500 ml-1 text-xs">own/need</span>
          </div>
          {priceToComplete > 0 && (
            <div className="px-3 py-1.5 rounded-lg text-sm bg-yellow-900/30 text-yellow-400 border border-yellow-700/50">
              ~${priceToComplete.toFixed(2)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="flex bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
            {[
              { id: 'list', label: 'List' },
              { id: 'gallery', label: 'Gallery' },
              { id: 'stacks', label: 'Stacks' },
            ].map(v => (
              <button
                key={v.id}
                onClick={() => setViewMode(v.id)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === v.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => { setTempComposition(activeComposition); setShowCompositionSettings(true); }}
            className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            title="Deck Composition Settings"
          >
            <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button onClick={handleExport} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
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

      {/* Composition Analysis Panel */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-300">Deck Composition</h3>
            <div className="flex items-center gap-1">
              {[
                { value: 'collection', label: 'Collection' },
                { value: 'cheapest', label: 'Cheapest' },
                { value: 'best', label: 'Best' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSuggestionMode(opt.value)}
                  className={`px-2 py-0.5 text-[10px] rounded-full transition-colors ${
                    suggestionMode === opt.value
                      ? 'bg-yellow-600 text-white'
                      : 'bg-gray-700 text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => { setTempComposition(activeComposition); setShowCompositionSettings(true); }}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            Edit Targets
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {CATEGORY_META.map(({ key, label, color }) => {
            const actual = categoryCounts[key];
            const target = activeComposition[key];
            const diff = actual - target;
            const pct = Math.min(100, Math.round((actual / Math.max(target, 1)) * 100));
            return (
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">{label}</span>
                  <span className={diff === 0 ? 'text-green-400' : diff > 0 ? 'text-yellow-400' : 'text-red-400'}>
                    {actual}/{target}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${diff === 0 ? 'bg-green-500' : diff > 0 ? 'bg-yellow-500' : color}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {diff !== 0 && (
                  <p className="text-[10px] text-gray-500">
                    {diff > 0 ? `${diff} over` : `${-diff} short`}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Swap Suggestions */}
        {swapSuggestions.length > 0 && (
          <div className="border-t border-gray-700/50 pt-3 space-y-2">
            <h4 className="text-xs font-medium text-gray-400">Suggested Swaps</h4>
            {swapSuggestions.map((swap, i) => (
              <div key={i} className="flex items-center gap-2 text-xs bg-gray-900/50 rounded-lg px-3 py-2">
                <button
                  onClick={() => { removeOneIncluded(swap.remove.name); addOneExcluded(swap.add.name); }}
                  className="px-2 py-1 bg-yellow-600 hover:bg-yellow-500 text-white rounded text-[10px] font-medium transition-colors flex-shrink-0"
                >
                  Swap
                </button>
                <span className="text-red-400 truncate" title={swap.remove.name}>
                  - {swap.remove.name}
                </span>
                <span className="text-gray-500 flex-shrink-0 text-[10px]">({swap.remove.fromCategory})</span>
                <svg className="w-3 h-3 text-gray-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                <span className="text-green-400 truncate" title={swap.add.name}>
                  + {swap.add.name}
                </span>
                <span className="text-gray-500 flex-shrink-0 text-[10px]">({swap.add.toCategory})</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {viewMode === 'list' && renderListView()}
      {viewMode === 'gallery' && renderGalleryView()}
      {viewMode === 'stacks' && renderStacksView()}

      {/* Deck Composition Settings Modal */}
      {showCompositionSettings && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold text-white mb-4">Deck Composition Targets</h3>
              {/* Suggestion priority toggle */}
              <div className="flex items-center gap-2 mb-5">
                <span className="text-xs text-gray-400">Prioritize:</span>
                {[
                  { value: 'collection', label: 'My Collection' },
                  { value: 'cheapest', label: 'Cheapest' },
                  { value: 'best', label: 'Best Synergy' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setSuggestionMode(opt.value)}
                    className={`px-3 py-1 text-xs rounded-full transition-colors ${
                      suggestionMode === opt.value
                        ? 'bg-yellow-600 text-white'
                        : 'bg-gray-700 text-gray-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-6">
                {/* Left: Sliders */}
                <div className="flex-1 min-w-0">
                  <div className="space-y-5 mb-6">
                    {CATEGORY_META.map(({ key, label }) => {
                      const min = key === 'lands' ? 30 : key === 'synergy' ? 10 : key === 'removal' ? 3 : 5;
                      const max = key === 'lands' ? 45 : key === 'synergy' ? 40 : key === 'utility' ? 25 : 20;
                      return (
                        <div key={key}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-gray-300 text-sm">{label}</span>
                            <span className="text-xs text-gray-500">
                              {categoryCounts[key]}/{tempComposition[key]}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={min}
                            max={max}
                            value={tempComposition[key]}
                            onChange={(e) => setTempComposition(prev => ({ ...prev, [key]: parseInt(e.target.value) }))}
                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                            style={{
                              background: `linear-gradient(to right, #eab308 0%, #eab308 ${((tempComposition[key] - min) / (max - min)) * 100}%, #374151 ${((tempComposition[key] - min) / (max - min)) * 100}%, #374151 100%)`
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="bg-gray-900 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 text-sm">Total allocated:</span>
                      <span className={`font-bold ${
                        Object.values(tempComposition).reduce((a, b) => a + b, 0) === 99
                          ? 'text-green-400'
                          : Object.values(tempComposition).reduce((a, b) => a + b, 0) > 99
                            ? 'text-red-400'
                            : 'text-yellow-400'
                      }`}>
                        {Object.values(tempComposition).reduce((a, b) => a + b, 0)}/99
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">(commander is card #100)</p>
                  </div>
                </div>
                {/* Right: Live preview */}
                <div className="w-64 flex-shrink-0">
                  <h4 className="text-xs font-semibold text-gray-400 mb-3">Preview Changes</h4>
                  {(() => {
                    const previewRemovals = [];
                    const previewAdds = [];
                    for (const { key, label } of CATEGORY_META) {
                      const actual = categoryCounts[key];
                      const newTarget = tempComposition[key];
                      const diff = actual - newTarget;
                      if (diff > 0) {
                        const candidates = nonCommanderIncluded
                          .filter(c => classifyFunctionalCategory(c) === key)
                          .sort((a, b) => {
                            if (a.isBasicLand && !b.isBasicLand) return -1;
                            if (!a.isBasicLand && b.isBasicLand) return 1;
                            if (!a.owned && b.owned) return -1;
                            if (a.owned && !b.owned) return 1;
                            const pa = a.price || 0, pb = b.price || 0;
                            if (pa !== pb) return pb - pa;
                            return (a.synergy || 0) - (b.synergy || 0);
                          });
                        let remaining = diff;
                        for (const c of candidates) {
                          if (remaining <= 0) break;
                          const take = Math.min(c.qty, remaining);
                          previewRemovals.push({ name: c.name, qty: take, category: label });
                          remaining -= take;
                        }
                      } else if (diff < 0) {
                        let remaining = Math.abs(diff);
                        // First: add from excluded cards
                        const candidates = nonCommanderExcluded
                          .filter(c => classifyFunctionalCategory(c) === key)
                          .sort(sortAddCandidates);
                        for (const c of candidates) {
                          if (remaining <= 0) break;
                          previewAdds.push({ name: c.name, qty: 1, category: label, owned: c.owned, synergy: c.synergy });
                          remaining -= 1;
                        }
                        // Second: if still remaining, increase qty on already-included unlimited cards
                        if (remaining > 0) {
                          const includedUnlimited = nonCommanderIncluded
                            .filter(c => classifyFunctionalCategory(c) === key && canHaveMultiple(c.name))
                            .sort(sortAddCandidates);
                          for (const c of includedUnlimited) {
                            if (remaining <= 0) break;
                            previewAdds.push({ name: c.name, qty: remaining, category: label, owned: c.owned, synergy: c.synergy });
                            remaining = 0;
                          }
                        }
                      }
                    }
                    if (previewRemovals.length === 0 && previewAdds.length === 0) {
                      return <p className="text-xs text-gray-600 italic">Adjust sliders to see changes</p>;
                    }
                    return (
                      <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                        {previewRemovals.map((r, i) => (
                          <div key={`r-${i}`} className="flex items-center gap-1.5 text-xs">
                            <span className="text-red-400 flex-shrink-0">−</span>
                            <span className="text-red-400 truncate">{r.qty > 1 ? `${r.qty}x ` : ''}{r.name}</span>
                            <span className="text-gray-600 text-[10px] flex-shrink-0">({r.category})</span>
                          </div>
                        ))}
                        {previewRemovals.length > 0 && previewAdds.length > 0 && (
                          <div className="border-t border-gray-700/50 my-1" />
                        )}
                        {previewAdds.map((a, i) => (
                          <div key={`a-${i}`} className="flex items-center gap-1.5 text-xs">
                            <span className="text-green-400 flex-shrink-0">+</span>
                            <span className="text-green-400 truncate">{a.qty > 1 ? `${a.qty}x ` : ''}{a.name}</span>
                            <span className="text-gray-600 text-[10px] flex-shrink-0">({a.category})</span>
                            {a.owned && <span className="text-[9px] text-blue-400 bg-blue-400/10 px-1 rounded flex-shrink-0">owned</span>}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div className="flex items-center justify-between pt-4 mt-4 border-t border-gray-700">
                <button
                  onClick={() => setTempComposition(DEFAULT_COMPOSITION)}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Reset to Defaults
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowCompositionSettings(false)}
                    className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => applyComposition(tempComposition)}
                    className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded font-medium transition-colors"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
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
    return <LoadingOverlay message="Comparing commanders..." submessage="Fetching deck data and matching against your collection." />;
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

      {/* Hero header with all commanders */}
      <PageHero
        title="Commander Comparison"
        subtitle={`Comparing ${data.commanders.length} commanders side by side`}
        commanders={commanders}
        stats={[
          { value: data.shared_count, label: 'Shared Cards' },
          { value: `${Math.max(...data.commanders.map(c => c.match_percentage))}%`, label: 'Best Match' }
        ]}
      />

      {/* Summary cards with color glows */}
      <div className={`grid gap-6 ${data.commanders.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {data.commanders.map((cmd, i) => {
          const matchColor = cmd.match_percentage >= 60 ? 'text-green-400' :
            cmd.match_percentage >= 40 ? 'text-yellow-400' : 'text-red-400';
          const orig = commanders[i];
          const colorGlow = getColorGlow(orig?.color_identity);
          return (
            <div
              key={cmd.name}
              className="relative rounded-xl p-5 space-y-4 overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(31, 41, 55, 0.95) 0%, rgba(17, 24, 39, 0.98) 100%)',
                boxShadow: `0 8px 32px ${colorGlow}, inset 0 1px 0 rgba(255,255,255,0.05)`
              }}
            >
              {/* Background art */}
              {orig?.image_uri && (
                <div className="commander-card-art-bg">
                  <img src={orig.art_crop || orig.image_uri} alt="" />
                </div>
              )}

              <div className="relative z-10">
                {orig?.image_uri && (
                  <img
                    src={orig.image_uri}
                    alt={cmd.name}
                    className="w-36 rounded-lg mx-auto showcase-card"
                    style={{ boxShadow: `0 8px 24px ${colorGlow}` }}
                  />
                )}
                <h3
                  className="font-bold text-center cursor-pointer hover:text-blue-400 mt-3 text-lg"
                  onClick={() => onSelectCommander(orig || { name: cmd.name })}
                >
                  {cmd.name}
                </h3>
                <div className="flex justify-center mt-2">
                  <ColorBadge colors={orig?.color_identity} />
                </div>
                <div className="text-center mt-4">
                  <span className={`text-4xl font-bold ${matchColor}`}>{cmd.match_percentage}%</span>
                  <p className="text-xs text-gray-400 mt-1">{cmd.owned_count}/{cmd.total_cards} owned</p>
                </div>
                <div className="mt-3">
                  <MatchBar percentage={cmd.match_percentage} size="lg" />
                </div>
                <div className="text-center text-sm mt-3">
                  {cmd.missing_price > 0 && (
                    <span className="bg-yellow-900/50 text-yellow-400 px-3 py-1 rounded-full text-xs">
                      ~${cmd.missing_price.toFixed(2)} to complete
                    </span>
                  )}
                </div>
                <div className="text-center text-xs text-gray-500 mt-3 space-y-1">
                  <p>{cmd.unique_cards.length} unique cards</p>
                  {cmd.num_decks > 0 && <p>{cmd.num_decks.toLocaleString()} decks on EDHREC</p>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Shared cards */}
      <div className="bg-gray-800/80 backdrop-blur rounded-xl p-5 space-y-3 border border-gray-700/50">
        <SectionHeader color="blue" count={data.shared_count}>
          Shared Across All
        </SectionHeader>
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
// Default deck composition values
const DEFAULT_COMPOSITION = {
  lands: 38,
  ramp: 10,
  cardDraw: 10,
  removal: 8,
  synergy: 20,
  utility: 13
};

function CommanderDetail({ commander, collectionCount, onBack, onOpenDeckBuilder, excludeInDecks, favorites, onToggleFavorite }) {
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
  const [partnerData, setPartnerData] = useState(null);
  const initialFetchDone = useRef(false);
  const currentCommander = useRef(commander.name);

  // Reset state when commander changes
  useEffect(() => {
    if (currentCommander.current !== commander.name) {
      currentCommander.current = commander.name;
      initialFetchDone.current = false;
      setData(null);
      setSelectedPartner(null);
      setPartnerData(null);
    }
  }, [commander.name]);

  // Fetch partner info and EDHREC data - runs once on mount
  useEffect(() => {
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;

    const fetchInitial = async () => {
      setLoading(true);
      setError('');
      let partner = null;

      // Check for locked partner first
      if (commander.partner_type && ['partner_with', 'partner_variant'].includes(commander.partner_type)) {
        try {
          const pData = await apiGet(`/api/commander/${encodeURIComponent(commander.name)}/partners`);
          setPartnerData(pData);
          if ((pData.partner_type === 'partner_with' || pData.partner_type === 'partner_variant') && pData.partners?.length === 1) {
            partner = pData.partners[0];
            setSelectedPartner(partner);
          }
        } catch (e) {
          // Ignore partner fetch errors
        }
      }

      // Now fetch EDHREC data (with partner if found)
      try {
        const params = { budget: budget || null, theme: theme || null, exclude_in_decks: excludeInDecks || null };
        if (partner) params.partner = partner.name;
        const d = await apiGet(`/api/commander/${encodeURIComponent(commander.name)}`, params);
        setData(d);
      } catch (err) {
        setError(err.message);
      }
      setLoading(false);
    };

    fetchInitial();
  }, [commander.name, commander.partner_type]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch when filters or partner selection changes (after initial load)
  const fetchDetail = useCallback(async (partnerOverride) => {
    setLoading(true);
    setError('');
    try {
      const params = { budget: budget || null, theme: theme || null, exclude_in_decks: excludeInDecks || null };
      const p = partnerOverride !== undefined ? partnerOverride : selectedPartner;
      if (p) params.partner = p.name;
      const d = await apiGet(`/api/commander/${encodeURIComponent(commander.name)}`, params);
      setData(d);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [commander.name, budget, theme, excludeInDecks, selectedPartner]);

  // Refetch when filters change (but not on initial mount)
  const prevFilters = useRef({ budget: '', theme: '' });
  useEffect(() => {
    if (!initialFetchDone.current || !data) return;
    if (prevFilters.current.budget !== budget || prevFilters.current.theme !== theme) {
      prevFilters.current = { budget, theme };
      fetchDetail();
    }
  }, [budget, theme, data, fetchDetail]);

  // Handle partner selection changes from PartnerPicker
  const handlePartnerChange = useCallback((newPartner) => {
    setSelectedPartner(newPartner);
    if (initialFetchDone.current && data) {
      fetchDetail(newPartner);
    }
  }, [data, fetchDetail]);

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
    return <LoadingOverlay message={`Loading ${commander.name}...`} submessage="Fetching average deck from EDHREC, classifying cards, and loading prices." />;
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

  // Compute combined color identity if partner selected
  const colorOrder = ['W', 'U', 'B', 'R', 'G'];
  const combinedColors = selectedPartner
    ? colorOrder.filter(c => (commander.color_identity || []).includes(c) || (selectedPartner.color_identity || []).includes(c))
    : commander.color_identity;

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

  // Get the backdrop image - prefer art_crop for wider aspect ratio
  const backdropImage = commander.art_crop || commander.image_uri;

  return (
    <div className="relative">
      {/* Commander backdrop blur effect */}
      {backdropImage && (
        <div
          className="commander-backdrop"
          style={{ backgroundImage: `url(${backdropImage})` }}
        />
      )}

      <div className="relative z-10 space-y-6">
        <button onClick={onBack} className="text-blue-400 hover:underline">← Back</button>

        {/* Header */}
        <div className="flex gap-6 items-start">
          {/* Commander image(s) - tucked layout when partner selected */}
          {selectedPartner ? (
            <div className="relative flex-shrink-0" style={{ width: '200px', height: '280px' }}>
              <img
                src={selectedPartner.image_uri}
                alt={selectedPartner.name}
                className="absolute w-40 rounded-lg shadow-lg"
                style={{ top: 0, right: 0 }}
              />
              <img
                src={commander.image_uri}
                alt={commander.name}
                className="absolute w-40 rounded-lg shadow-xl"
                style={{ bottom: 0, left: 0, zIndex: 1 }}
              />
            </div>
          ) : commander.image_uri ? (
            <img
              src={commander.image_uri}
              alt={commander.name}
              className="w-48 rounded-lg shadow-lg flex-shrink-0"
              style={{ boxShadow: `0 8px 32px ${getColorGlow(commander.color_identity)}` }}
            />
          ) : null}
          <div className="space-y-3 flex-1">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-3xl font-bold">
                  {commander.name}
                  {selectedPartner && <span className="text-xl text-gray-400 font-normal"> + {selectedPartner.name}</span>}
                </h2>
                <ColorBadge colors={combinedColors} />
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={`https://edhrec.com/commanders/${commander.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-300 transition-colors"
                >
                  EDHREC
                </a>
              </div>
            </div>
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
        onSelectPartner={handlePartnerChange}
        selectedPartner={selectedPartner}
        partnerData={partnerData}
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
        favorites={favorites}
        onToggleFavorite={onToggleFavorite}
      />

      {/* Possible Recommendations */}
      {allRecs.length > 0 && (
        <div className="space-y-3">
          <SectionHeader color="purple" count={filteredRecs.length}>
            Possible Recommendations
          </SectionHeader>
          <p className="text-xs text-gray-400 ml-3">
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
                  <CardName name={card.name} className="text-sm" favorites={favorites} onToggleFavorite={onToggleFavorite} />
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
        name: newName, commander: newCommander, partner: newPartner?.name || '', cards_text: newCards,
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

  const deckList = Object.values(decks);
  const totalCards = deckList.reduce((sum, d) => sum + (d.card_count || 0), 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHero
        title="My Decks"
        subtitle="Add your existing deck lists here. Cards committed to decks can be excluded from recommendations so you only see what's actually available."
        commanders={deckList.filter(d => d.image_uri).slice(0, 3)}
        stats={deckList.length > 0 ? [
          { value: deckList.length, label: 'Decks' },
          { value: totalCards, label: 'Total Cards' }
        ] : []}
      />

      {/* Add new deck */}
      <div className="bg-gray-800/80 backdrop-blur rounded-xl p-6 space-y-4 border border-gray-700/50">
        <SectionHeader color="blue">Add New Deck</SectionHeader>
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
            {/* Commander image(s) prominently displayed */}
            <div className="flex justify-center mb-3">
              {deck.partner_image_uri ? (
                // Tucked partner layout - partner behind, main in front
                <div className="relative" style={{ width: '140px', height: '180px' }}>
                  <img
                    src={deck.partner_image_uri}
                    alt={deck.partner}
                    className="absolute w-28 rounded-lg shadow-lg"
                    style={{ top: 0, right: 0, filter: `drop-shadow(0 0 6px ${glow})` }}
                  />
                  <img
                    src={deck.image_uri}
                    alt={deck.commander}
                    className="absolute w-28 rounded-lg shadow-xl"
                    style={{ bottom: 0, left: 0, filter: `drop-shadow(0 0 8px ${glow})`, zIndex: 1 }}
                  />
                </div>
              ) : deck.image_uri ? (
                <img src={deck.image_uri} alt={deck.commander} className="w-32 rounded-lg shadow-xl" style={{filter: `drop-shadow(0 0 8px ${glow})`}} />
              ) : null}
            </div>
            <h4 className="font-bold text-center text-sm">{deck.name}</h4>
            {deck.commander && (
              <p className="text-xs text-gray-400 text-center mt-0.5">
                {deck.commander}{deck.partner ? ` + ${deck.partner}` : ''}
              </p>
            )}
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

  const loadStats = () => {
    setLoading(true);
    setError('');
    apiGet('/api/collection/stats')
      .then(data => { setStats(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  };

  if (collectionCount === 0) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Collection Statistics</h2>
        <p className="text-gray-500 text-center py-12">Upload a collection to see your stats.</p>
      </div>
    );
  }

  if (loading) {
    return <LoadingOverlay message="Analyzing your collection..." submessage="Fetching prices and card data from Scryfall." />;
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Collection Statistics</h2>
        <div className="bg-red-900/50 border border-red-700 rounded p-3 text-red-300">{error}</div>
        <button onClick={loadStats} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded text-sm">
          Retry
        </button>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="space-y-6">
        <PageHero
          title="Collection Statistics"
          subtitle={`Analyze your ${collectionCount.toLocaleString()} cards to see type distribution, mana curve, color breakdown, and estimated value.`}
          colorIdentity={['U', 'R']}
        >
          <div className="flex items-center gap-6 mt-6">
            {/* Decorative mana orbs */}
            <div className="flex gap-2">
              {['W', 'U', 'B', 'R', 'G'].map(c => (
                <div
                  key={c}
                  className="mana-orb opacity-50"
                  style={{
                    backgroundColor: COLOR_MAP[c]?.bg,
                    color: COLOR_MAP[c]?.text,
                    '--orb-color': getColorGlow([c])
                  }}
                >
                  {c}
                </div>
              ))}
            </div>
            <button
              onClick={loadStats}
              className="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-lg font-medium transition-colors animated-border"
            >
              Load Statistics
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            This fetches data from Scryfall and may take a moment for large collections.
          </p>
        </PageHero>
      </div>
    );
  }

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
      <PageHero
        title="Collection Statistics"
        subtitle="Your collection at a glance"
        colorIdentity={['W', 'U', 'B', 'R', 'G']}
        stats={[
          { value: stats.total_unique.toLocaleString(), label: 'Unique Cards' },
          { value: stats.total_cards.toLocaleString(), label: 'Total Cards' },
          { value: `$${stats.total_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, label: 'Est. Value' },
          { value: stats.total_in_decks, label: 'In Decks' }
        ]}
      />

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
                    className="rounded-lg py-4 flex flex-col items-center justify-center transition-all relative"
                    style={{
                      backgroundColor: pipColors[color].bg,
                      color: pipColors[color].text,
                      flex: stats.color_counts[color],
                      minWidth: '60px',
                    }}
                  >
                    {/* Large background icon that overflows */}
                    <div
                      className="absolute opacity-15 pointer-events-none"
                      style={{
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                      }}
                    >
                      <ManaSymbol symbol={color} size={80} />
                    </div>
                    {/* Content in foreground */}
                    <span className="text-xl font-bold relative z-10 drop-shadow-sm">{stats.color_counts[color]}</span>
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

// --- About Page ---
function AboutPage() {
  return (
    <div className="page-fade-in max-w-4xl mx-auto">
      <AmbientBackground colorIdentity={['W', 'U', 'B', 'R', 'G']} />

      <div className="mb-8">
        <h1 className="text-4xl font-bold text-amber-200 mb-2">About MTG Commander Recommender</h1>
        <p className="text-gray-400">Turn your card collection into your next Commander deck</p>
        <div className="h-px bg-gradient-to-r from-amber-500/50 to-transparent mt-4" />
      </div>

      <div className="space-y-8">
        <section>
          <h2 className="text-2xl font-bold text-amber-300 mb-4">What is MTG Commander Recommender?</h2>
          <p className="text-gray-300 leading-relaxed mb-4">
            MTG Commander Recommender is a free tool designed for Magic: The Gathering players who want to build
            Commander (EDH) decks using cards they already own.
          </p>
          <p className="text-gray-300 leading-relaxed mb-4">
            Instead of browsing decklists and buying singles, MTG Commander Recommender analyzes your existing
            collection and recommends commanders that synergize with the cards you have. It's the perfect solution
            for players looking to:
          </p>
          <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
            <li>Build new decks without buying more cards</li>
            <li>Find unexpected commanders that match their collection</li>
            <li>Discover synergies they didn't know existed</li>
            <li>Make the most of their bulk collection</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-amber-300 mb-4">How It Works</h2>

          <div className="space-y-6">
            <div className="glass-panel rounded-xl p-5">
              <h3 className="text-lg font-bold text-white mb-2">Step 1: Export Your Collection</h3>
              <p className="text-gray-300">
                Export your card collection from popular tools like Archidekt, Moxfield, Manabox, or Dragon Shield.
                MTG Commander Recommender supports CSV exports and simple card lists.
              </p>
            </div>

            <div className="glass-panel rounded-xl p-5">
              <h3 className="text-lg font-bold text-white mb-2">Step 2: Paste and Analyze</h3>
              <p className="text-gray-300">
                Paste your collection into MTG Commander Recommender. The algorithm compares your cards against
                the synergy data for over 1,500 commanders.
              </p>
            </div>

            <div className="glass-panel rounded-xl p-5">
              <h3 className="text-lg font-bold text-white mb-2">Step 3: Get Recommendations</h3>
              <p className="text-gray-300">
                See which commanders you can build with your existing cards. View match percentages, estimated
                costs to complete, and detailed decklists.
              </p>
            </div>

            <div className="glass-panel rounded-xl p-5">
              <h3 className="text-lg font-bold text-white mb-2">Step 4: Build Your Deck</h3>
              <p className="text-gray-300">
                Use the deck builder to customize your deck, adjust card counts, and export your final list
                to your favorite deck building platform.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-amber-300 mb-4">Data Sources</h2>
          <p className="text-gray-300 leading-relaxed">
            MTG Commander Recommender uses data from <a href="https://edhrec.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">EDHREC</a> for
            average decklists and synergy scores, and <a href="https://scryfall.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Scryfall</a> for
            card data and pricing information.
          </p>
        </section>

        <section className="glass-panel rounded-xl p-6 text-center">
          <h2 className="text-xl font-bold text-white mb-2">Ready to Start?</h2>
          <p className="text-gray-300 mb-4">
            Upload your collection and discover which commanders are waiting to be built!
          </p>
        </section>
      </div>
    </div>
  );
}

// --- Guides Page ---
function GuidesPage({ onNavigate }) {
  const [selectedGuide, setSelectedGuide] = useState(null);

  const guides = [
    {
      id: 'recommendations',
      title: 'Reading Your Commander Recommendations',
      description: 'Learn how to interpret the metrics and choose the best commander for your collection. Understand Match Percentage, synergy scores, and how to evaluate your options.',
      readTime: '5 min read',
      content: (
        <div className="space-y-6">
          <section>
            <h3 className="text-xl font-bold text-amber-300 mb-3">Understanding Match Percentage</h3>
            <p className="text-gray-300 mb-4">
              The match percentage shows how many cards from the average EDHREC decklist you already own.
              A higher percentage means you can build the deck with fewer purchases.
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
              <li><span className="text-green-400">60%+</span> - Excellent match, very few cards needed</li>
              <li><span className="text-yellow-400">40-59%</span> - Good match, moderate investment needed</li>
              <li><span className="text-gray-400">Below 40%</span> - Lower match, more cards to acquire</li>
            </ul>
          </section>

          <section>
            <h3 className="text-xl font-bold text-amber-300 mb-3">Cost to Complete</h3>
            <p className="text-gray-300 mb-4">
              This shows the estimated cost of cards you're missing based on current Scryfall prices.
              Use this to find budget-friendly options or identify expensive staples you might want to proxy.
            </p>
          </section>

          <section>
            <h3 className="text-xl font-bold text-amber-300 mb-3">Filtering and Sorting</h3>
            <p className="text-gray-300 mb-4">
              Use the color filters to narrow down by color identity. Sort by match percentage to find
              your best options, or by price to find the cheapest decks to complete.
            </p>
          </section>

          <section>
            <h3 className="text-xl font-bold text-amber-300 mb-3">Comparing Commanders</h3>
            <p className="text-gray-300">
              Can't decide between commanders? Use the compare feature to see them side by side.
              Select 2-3 commanders and compare their card overlap, unique cards, and completion costs.
            </p>
          </section>
        </div>
      )
    },
    {
      id: 'exporting',
      title: 'Exporting Your Collection: Step-by-Step Guide',
      description: 'Detailed instructions for exporting your card collection from popular platforms like Archidekt, Moxfield, Manabox, and Dragon Shield Scanner.',
      readTime: '7 min read',
      content: (
        <div className="space-y-6">
          <section>
            <h3 className="text-xl font-bold text-amber-300 mb-3">From Moxfield</h3>
            <ol className="list-decimal list-inside text-gray-300 space-y-2 ml-4">
              <li>Go to your collection page on Moxfield</li>
              <li>Click the "Export" button (download icon)</li>
              <li>Select "CSV" format</li>
              <li>Copy the contents or download the file</li>
              <li>Paste into MTG Commander Recommender</li>
            </ol>
          </section>

          <section>
            <h3 className="text-xl font-bold text-amber-300 mb-3">From Archidekt</h3>
            <ol className="list-decimal list-inside text-gray-300 space-y-2 ml-4">
              <li>Navigate to your collection</li>
              <li>Click "Export" in the menu</li>
              <li>Choose "Text" or "CSV" format</li>
              <li>Copy the exported list</li>
              <li>Paste into MTG Commander Recommender</li>
            </ol>
          </section>

          <section>
            <h3 className="text-xl font-bold text-amber-300 mb-3">From Manabox</h3>
            <ol className="list-decimal list-inside text-gray-300 space-y-2 ml-4">
              <li>Open Manabox app and go to your collection</li>
              <li>Tap the share/export button</li>
              <li>Select "Export as CSV" or "Plain text"</li>
              <li>Copy or share the exported list</li>
              <li>Paste into MTG Commander Recommender</li>
            </ol>
          </section>

          <section>
            <h3 className="text-xl font-bold text-amber-300 mb-3">From Dragon Shield Scanner</h3>
            <ol className="list-decimal list-inside text-gray-300 space-y-2 ml-4">
              <li>Open Dragon Shield app</li>
              <li>Go to your collection folder</li>
              <li>Tap "Export" or the share icon</li>
              <li>Choose CSV or text format</li>
              <li>Paste into MTG Commander Recommender</li>
            </ol>
          </section>

          <section>
            <h3 className="text-xl font-bold text-amber-300 mb-3">Simple Card List</h3>
            <p className="text-gray-300 mb-4">
              You can also paste a simple list with one card per line. Quantities are optional:
            </p>
            <pre className="bg-gray-800 rounded p-4 text-sm text-gray-300 font-mono">
{`4 Lightning Bolt
2 Counterspell
Sol Ring
Arcane Signet`}
            </pre>
          </section>
        </div>
      )
    },
    {
      id: 'deckbuilder',
      title: 'Using the Deck Builder',
      description: 'Learn how to customize your deck, adjust card counts, add lands, and export your finished decklist.',
      readTime: '4 min read',
      content: (
        <div className="space-y-6">
          <section>
            <h3 className="text-xl font-bold text-amber-300 mb-3">Starting a Build</h3>
            <p className="text-gray-300 mb-4">
              From the commander detail page, click "Open in Deck Builder" to start customizing your deck.
              The builder will pre-populate with the average decklist, highlighting cards you own.
            </p>
          </section>

          <section>
            <h3 className="text-xl font-bold text-amber-300 mb-3">Adding and Removing Cards</h3>
            <p className="text-gray-300 mb-4">
              Click cards to toggle them in/out of your deck. The card counter at the top shows your
              current total. Commander decks need exactly 100 cards (including your commander).
            </p>
          </section>

          <section>
            <h3 className="text-xl font-bold text-amber-300 mb-3">View Modes</h3>
            <p className="text-gray-300 mb-4">
              Switch between Grid view (visual) and Stacks view (organized by type) to see your deck
              from different perspectives. Use the mana curve chart to balance your deck's costs.
            </p>
          </section>

          <section>
            <h3 className="text-xl font-bold text-amber-300 mb-3">Exporting Your Deck</h3>
            <p className="text-gray-300">
              When you're done, use the Export button to copy your decklist. You can import this into
              Moxfield, Archidekt, or any other deck building platform.
            </p>
          </section>
        </div>
      )
    }
  ];

  if (selectedGuide) {
    const guide = guides.find(g => g.id === selectedGuide);
    return (
      <div className="page-fade-in max-w-4xl mx-auto">
        <AmbientBackground colorIdentity={['U', 'G']} />

        <button
          onClick={() => setSelectedGuide(null)}
          className="text-blue-400 hover:text-blue-300 mb-6 flex items-center gap-2"
        >
          <span>←</span> Back to Guides
        </button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-amber-200 mb-2">{guide.title}</h1>
          <p className="text-gray-500 text-sm">{guide.readTime}</p>
        </div>

        <div className="glass-panel rounded-xl p-6">
          {guide.content}
        </div>
      </div>
    );
  }

  return (
    <div className="page-fade-in max-w-5xl mx-auto">
      <AmbientBackground colorIdentity={['U', 'G']} />

      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-amber-200 mb-4">Commander Deck Building Guides</h1>
        <p className="text-gray-400 max-w-2xl mx-auto">
          Learn everything you need to know about building Commander decks,
          understanding your recommendations, and making the most of MTG Commander Recommender.
        </p>
      </div>

      {/* Guide Cards */}
      <div className="grid md:grid-cols-2 gap-6 mb-12">
        {guides.map(guide => (
          <button
            key={guide.id}
            onClick={() => setSelectedGuide(guide.id)}
            className="glass-panel rounded-xl p-6 text-left hover:bg-gray-800/50 transition-colors group"
          >
            <h2 className="text-xl font-bold text-white mb-3 group-hover:text-amber-200 transition-colors">
              {guide.title}
            </h2>
            <p className="text-gray-400 text-sm mb-4 leading-relaxed">
              {guide.description}
            </p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">{guide.readTime}</span>
              <span className="text-blue-400 text-sm group-hover:translate-x-1 transition-transform">
                Read →
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Help Section */}
      <div className="glass-panel rounded-xl p-8 text-center">
        <h2 className="text-2xl font-bold text-white mb-3">Need More Help?</h2>
        <p className="text-gray-400">
          Have questions that aren't covered in our guides?{' '}
          <button onClick={() => onNavigate('about')} className="text-blue-400 hover:underline">
            Visit our About page
          </button>{' '}
          to learn more about MTG Commander Recommender.
        </p>
      </div>
    </div>
  );
}

// --- Favorites Tab ---

function FavoritesTab({ favorites, onToggleFavorite, onClearFavorites, onSelectCommander, onOpenDeckBuilder }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [detectedColors, setDetectedColors] = useState([]);
  const [searched, setSearched] = useState(false);
  const [buildingDeck, setBuildingDeck] = useState(null);
  const [expandedCommander, setExpandedCommander] = useState(null);

  // Card search state
  const [cardSearch, setCardSearch] = useState('');
  const [cardSuggestions, setCardSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef(null);
  const debounceRef = useRef(null);

  const favList = [...favorites];

  // Close suggestions on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleCardSearchInput = (val) => {
    setCardSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.length < 2) { setCardSuggestions([]); setShowSuggestions(false); return; }
    setSearchLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const resp = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(val)}`);
        const data = await resp.json();
        setCardSuggestions(data.data || []);
        setShowSuggestions(true);
      } catch { setCardSuggestions([]); }
      setSearchLoading(false);
    }, 200);
  };

  const handleAddCard = (name) => {
    onToggleFavorite(name);
    setCardSearch('');
    setCardSuggestions([]);
    setShowSuggestions(false);
  };

  const handleFind = async () => {
    if (favList.length === 0) return;
    setLoading(true);
    setError('');
    setExpandedCommander(null);
    try {
      const data = await apiPost('/api/recommendations/from-favorites', { card_names: favList });
      setResults(data.results || []);
      setDetectedColors(data.detected_colors || []);
      setSearched(true);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleBuildDeck = async (cmd) => {
    setBuildingDeck(cmd.name);
    try {
      const data = await apiGet(`/api/commander/${encodeURIComponent(cmd.name)}`);
      onOpenDeckBuilder(data, cmd);
    } catch (err) {
      setError(err.message);
    }
    setBuildingDeck(null);
  };

  const COLOR_NAMES = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };

  const CATEGORY_COLORS = {
    Creature: 'text-green-300 bg-green-900/30',
    Instant: 'text-blue-300 bg-blue-900/30',
    Sorcery: 'text-purple-300 bg-purple-900/30',
    Enchantment: 'text-yellow-300 bg-yellow-900/30',
    Artifact: 'text-gray-300 bg-gray-700/50',
    Planeswalker: 'text-orange-300 bg-orange-900/30',
  };

  return (
    <div className="space-y-6 page-fade-in">
      <PageHero
        title="Find My Commander"
        subtitle="Star cards you love, and we'll find commanders that synergize with them using EDHREC data."
        colorIdentity={detectedColors}
      />

      {/* Favorites panel */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white">
            {favList.length === 0 ? 'No favorites yet' : `Your Favorites (${favList.length})`}
          </h2>
          {favList.length > 0 && (
            <button
              onClick={onClearFavorites}
              className="text-xs text-gray-500 hover:text-red-400 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Card search */}
        <div ref={searchRef} className="relative">
          <div className="flex items-center gap-2 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 focus-within:border-blue-500 transition-colors">
            <span className="text-gray-500 text-sm">☆</span>
            <input
              value={cardSearch}
              onChange={e => handleCardSearchInput(e.target.value)}
              onFocus={() => { if (cardSuggestions.length > 0) setShowSuggestions(true); }}
              placeholder="Search for a card to add to favorites…"
              className="flex-1 bg-transparent text-sm outline-none placeholder-gray-600"
            />
            {searchLoading && (
              <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            )}
          </div>
          {showSuggestions && cardSuggestions.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-56 overflow-y-auto">
              {cardSuggestions.map(name => {
                const isFav = favorites.has(name.toLowerCase());
                return (
                  <button
                    key={name}
                    onClick={() => handleAddCard(name)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-700 flex items-center justify-between gap-2 transition-colors"
                  >
                    <span className="truncate">{name}</span>
                    <span className={`text-xs flex-shrink-0 ${isFav ? 'text-yellow-400' : 'text-gray-500'}`}>
                      {isFav ? '★ added' : '+ add'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Favorited cards */}
        {favList.length === 0 ? (
          <p className="text-sm text-gray-500">Search above or star cards from any card list in the app.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {favList.map(name => (
              <span
                key={name}
                className="inline-flex items-center gap-1.5 bg-gray-700 border border-gray-600 rounded-full px-3 py-1 text-sm"
              >
                <span className="text-yellow-400 text-xs">★</span>
                {name}
                <button
                  onClick={() => onToggleFavorite(name)}
                  className="text-gray-500 hover:text-red-400 transition-colors ml-0.5 text-xs leading-none"
                  title="Remove"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {favList.length > 0 && (
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleFind}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed px-5 py-2 rounded-lg font-medium text-sm transition-colors"
            >
              {loading ? 'Searching...' : 'Find My Commander'}
            </button>
            {detectedColors.length > 0 && (
              <span className="text-xs text-gray-400">
                Detected colors: <span className="font-medium text-white">{detectedColors.map(c => COLOR_NAMES[c] || c).join(', ')}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-300 text-sm">{error}</div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-400 gap-3">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span>Checking commanders against your favorites&hellip;</span>
        </div>
      )}

      {/* Results */}
      {searched && !loading && (
        <div className="space-y-3">
          <SectionHeader color="blue" count={results.length}>
            Commander Recommendations
          </SectionHeader>

          {results.length === 0 ? (
            <div className="bg-gray-800 rounded-lg p-6 text-center text-gray-500">
              <p>No commanders found that match your favorites.</p>
              <p className="text-xs mt-1">Try adding more cards or cards with different colors.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {results.map(cmd => {
                const isExpanded = expandedCommander === cmd.name;
                return (
                  <div key={cmd.name} className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden hover:border-gray-600 transition-colors">
                    <div className="p-4 space-y-3">
                      {/* Header row */}
                      <div className="flex items-start gap-3">
                        {cmd.image_uri && (
                          <img
                            src={cmd.image_uri}
                            alt={cmd.name}
                            className="w-12 h-12 rounded-lg object-cover object-top flex-shrink-0 border border-gray-600"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-white text-sm">{cmd.name}</span>
                            <ColorBadge colors={cmd.color_identity} />
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {cmd.num_decks?.toLocaleString()} decks on EDHREC
                          </div>
                          <div className="mt-1.5">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-gray-400">
                                {cmd.match_count} of {cmd.total_favorites} favorites fit
                              </span>
                              <span className={`font-bold ${
                                cmd.match_percentage >= 75 ? 'text-green-400' :
                                cmd.match_percentage >= 50 ? 'text-yellow-400' :
                                'text-orange-400'
                              }`}>
                                {cmd.match_percentage}%
                              </span>
                            </div>
                            <MatchBar percentage={cmd.match_percentage} size="sm" />
                          </div>
                        </div>
                      </div>

                      {/* Matched favorites */}
                      <div className="flex flex-wrap gap-1">
                        {cmd.matched_cards.map(card => (
                          <span key={card} className="text-xs bg-yellow-900/30 text-yellow-300 border border-yellow-800/50 rounded px-1.5 py-0.5">
                            ★ {card}
                          </span>
                        ))}
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2 items-center pt-1">
                        <button
                          onClick={() => onSelectCommander(cmd)}
                          className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded transition-colors"
                        >
                          View Commander
                        </button>
                        <button
                          onClick={() => handleBuildDeck(cmd)}
                          disabled={buildingDeck === cmd.name}
                          className="text-xs bg-blue-700 hover:bg-blue-600 disabled:opacity-60 px-3 py-1.5 rounded transition-colors font-medium"
                        >
                          {buildingDeck === cmd.name ? 'Loading…' : 'Build Deck'}
                        </button>
                        {cmd.preview_cards?.length > 0 && (
                          <button
                            onClick={() => setExpandedCommander(isExpanded ? null : cmd.name)}
                            className="ml-auto text-xs text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1"
                          >
                            {isExpanded ? 'Hide preview ▲' : 'Top cards ▼'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded preview panel */}
                    {isExpanded && cmd.preview_cards?.length > 0 && (
                      <div className="border-t border-gray-700 bg-gray-900/50 px-4 py-3">
                        <p className="text-xs text-gray-500 mb-2">
                          Top cards for {cmd.name} — <span className="text-gray-600">% = how often played in this commander's decks</span>
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {cmd.preview_cards.map(card => {
                            const catStyle = CATEGORY_COLORS[card.category] || 'text-gray-400 bg-gray-700/30';
                            return (
                              <span
                                key={card.name}
                                className={`inline-flex items-center gap-1 text-xs rounded px-1.5 py-0.5 border ${
                                  card.is_favorite
                                    ? 'bg-yellow-900/40 text-yellow-300 border-yellow-700/60'
                                    : `${catStyle} border-transparent`
                                }`}
                                title={card.category || ''}
                              >
                                {card.is_favorite && <span className="text-yellow-400">★</span>}
                                {card.name}
                                {card.inclusion > 0 && (
                                  <span className={`opacity-60 ${card.is_favorite ? '' : 'text-gray-500'}`}>
                                    {card.inclusion}%
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                        {cmd.preview_cards.length >= 15 && (
                          <p className="text-xs text-gray-600 mt-2">+ more — click View Commander for the full list</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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
  const [excludeInDecks, setExcludeInDecks] = useState(false);
  const [deckCount, setDeckCount] = useState(0);
  const [decksReady, setDecksReady] = useState(false);

  // Favorites state
  const [favorites, setFavorites] = useState(() => loadFavorites());

  const handleToggleFavorite = useCallback((cardName) => {
    setFavorites(prev => {
      const next = new Set(prev);
      const key = cardName.toLowerCase();
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      saveFavorites(next);
      return next;
    });
  }, []);

  const handleClearFavorites = useCallback(() => {
    const empty = new Set();
    setFavorites(empty);
    saveFavorites(empty);
  }, []);

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

  const handleOpenDeckBuilder = (data, cmd) => {
    if (cmd) setSelectedCommander(cmd);
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
    { id: 'favorites', label: `Find My Commander${favorites.size > 0 ? ` (${favorites.size}★)` : ''}` },
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
          <div className="flex items-center gap-8">
            <h1 className="text-xl font-bold">MTG Commander Recommender</h1>
            <nav className="flex items-center gap-6">
              <button
                onClick={() => setTab('guides')}
                className={`text-sm font-medium transition-colors ${
                  tab === 'guides' ? 'text-blue-400' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Guides
              </button>
              <button
                onClick={() => setTab('about')}
                className={`text-sm font-medium transition-colors ${
                  tab === 'about' ? 'text-blue-400' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                About
              </button>
            </nav>
          </div>
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
                tab === t.id ||
                (tab === 'detail' && t.id === 'recommend') ||
                (tab === 'deckbuilder' && t.id === 'recommend')
                  ? 'border-blue-500 text-blue-400'
                  : t.id === 'favorites' && favorites.size > 0
                  ? 'border-transparent text-yellow-400/80 hover:text-yellow-300'
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

        <div style={{ display: tab === 'favorites' ? 'block' : 'none' }}>
          <FavoritesTab
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            onClearFavorites={handleClearFavorites}
            onSelectCommander={handleSelectCommander}
            onOpenDeckBuilder={handleOpenDeckBuilder}
          />
        </div>

        <div style={{ display: tab === 'mydecks' ? 'block' : 'none' }}>
          <MyDecks onDecksChanged={handleDecksChanged} decksReady={decksReady} />
        </div>

        {tab === 'stats' && (
          <div className="page-fade-in">
            <CollectionStats collectionCount={collectionCount} />
          </div>
        )}

        {tab === 'detail' && selectedCommander && (
          <div className="page-fade-in">
            <CommanderDetail
              commander={selectedCommander}
              collectionCount={collectionCount}
              onBack={() => setTab('recommend')}
              onOpenDeckBuilder={handleOpenDeckBuilder}
              excludeInDecks={excludeInDecks}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
            />
          </div>
        )}

        {tab === 'deckbuilder' && selectedCommander && deckBuilderData && (
          <div className="page-fade-in">
            <DeckBuilder
              data={deckBuilderData}
              commander={selectedCommander}
              onBack={() => setTab('detail')}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
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

        {tab === 'about' && (
          <div className="page-fade-in">
            <AboutPage />
          </div>
        )}

        {tab === 'guides' && (
          <div className="page-fade-in">
            <GuidesPage onNavigate={setTab} />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
