import { useEffect, useRef, useState } from 'react';
import { ColorBadge, MatchBar, PageHero, SectionHeader, type CardCommander } from '../../components/ui';
import { apiGet, apiPost } from '../../lib/api';
import type { Color, CommanderDetail, FavoriteMatch, FavoritesRecommendationResponse } from '../../types/api';

interface Props {
  favorites: Set<string>;
  onToggleFavorite: (name: string) => void;
  onClearFavorites: () => void;
  onSelectCommander: (cmd: CardCommander) => void;
  onOpenDeckBuilder: (data: CommanderDetail, cmd?: CardCommander) => void;
}

const COLOR_NAMES: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };

const CATEGORY_COLORS: Record<string, string> = {
  Creature: 'text-green-300 bg-green-900/30',
  Instant: 'text-blue-300 bg-blue-900/30',
  Sorcery: 'text-purple-300 bg-purple-900/30',
  Enchantment: 'text-yellow-300 bg-yellow-900/30',
  Artifact: 'text-gray-300 bg-gray-700/50',
  Planeswalker: 'text-orange-300 bg-orange-900/30',
};

export function FavoritesTab({ favorites, onToggleFavorite, onClearFavorites, onSelectCommander, onOpenDeckBuilder }: Props) {
  const [results, setResults] = useState<FavoriteMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [detectedColors, setDetectedColors] = useState<Color[]>([]);
  const [searched, setSearched] = useState(false);
  const [buildingDeck, setBuildingDeck] = useState<string | null>(null);
  const [expandedCommander, setExpandedCommander] = useState<string | null>(null);

  const [cardSearch, setCardSearch] = useState('');
  const [cardSuggestions, setCardSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const favList = [...favorites];

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleCardSearchInput = (val: string) => {
    setCardSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.length < 2) { setCardSuggestions([]); setShowSuggestions(false); return; }
    setSearchLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const resp = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(val)}`);
        const data = (await resp.json()) as { data?: string[] };
        setCardSuggestions(data.data || []);
        setShowSuggestions(true);
      } catch { setCardSuggestions([]); }
      setSearchLoading(false);
    }, 200);
  };

  const handleAddCard = (name: string) => {
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
      const data = await apiPost<FavoritesRecommendationResponse>('/api/recommendations/from-favorites', { card_names: favList });
      setResults(data.results || []);
      setDetectedColors(data.detected_colors || []);
      setSearched(true);
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  };

  const handleBuildDeck = async (cmd: FavoriteMatch) => {
    setBuildingDeck(cmd.name);
    try {
      const data = await apiGet<CommanderDetail>(`/api/commander/${encodeURIComponent(cmd.name)}`);
      onOpenDeckBuilder(data, cmd);
    } catch (err) {
      setError((err as Error).message);
    }
    setBuildingDeck(null);
  };

  return (
    <div className="space-y-6 page-fade-in">
      <PageHero
        title="Find My Commander"
        subtitle="Star cards you love, and we'll find commanders that synergize with them using EDHREC data."
        colorIdentity={detectedColors}
      />

      <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white">
            {favList.length === 0 ? 'No favorites yet' : `Your Favorites (${favList.length})`}
          </h2>
          {favList.length > 0 && (
            <button onClick={onClearFavorites} className="text-xs text-gray-500 hover:text-red-400 transition-colors">
              Clear all
            </button>
          )}
        </div>

        <div ref={searchRef} className="relative">
          <div className="flex items-center gap-2 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 focus-within:border-blue-500 transition-colors">
            <span className="text-gray-500 text-sm">☆</span>
            <input
              value={cardSearch}
              onChange={(e) => handleCardSearchInput(e.target.value)}
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
              {cardSuggestions.map((name) => {
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

        {favList.length === 0 ? (
          <p className="text-sm text-gray-500">Search above or star cards from any card list in the app.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {favList.map((name) => (
              <span key={name} className="inline-flex items-center gap-1.5 bg-gray-700 border border-gray-600 rounded-full px-3 py-1 text-sm">
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
                Detected colors: <span className="font-medium text-white">{detectedColors.map((c) => COLOR_NAMES[c] || c).join(', ')}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {error && <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-300 text-sm">{error}</div>}

      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-400 gap-3">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span>Checking commanders against your favorites&hellip;</span>
        </div>
      )}

      {searched && !loading && (
        <div className="space-y-3">
          <SectionHeader color="blue" count={results.length}>Commander Recommendations</SectionHeader>

          {results.length === 0 ? (
            <div className="bg-gray-800 rounded-lg p-6 text-center text-gray-500">
              <p>No commanders found that match your favorites.</p>
              <p className="text-xs mt-1">Try adding more cards or cards with different colors.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {results.map((cmd) => {
                const isExpanded = expandedCommander === cmd.name;
                const hasPreview = cmd.preview_cards?.length > 0;
                return (
                  <div key={cmd.name} className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden hover:border-gray-600 transition-colors">
                    <div className="p-4 space-y-3">
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
                          <div className="text-xs text-gray-400 mt-0.5">{cmd.num_decks?.toLocaleString()} decks on EDHREC</div>
                          <div className="mt-1.5">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-gray-400">{cmd.match_count} of {cmd.total_favorites} favorites fit</span>
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

                      <div className="flex flex-wrap gap-1">
                        {cmd.matched_cards.map((card) => (
                          <span key={card} className="text-xs bg-yellow-900/30 text-yellow-300 border border-yellow-800/50 rounded px-1.5 py-0.5">
                            ★ {card}
                          </span>
                        ))}
                      </div>

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
                        {hasPreview && (
                          <button
                            onClick={() => setExpandedCommander(isExpanded ? null : cmd.name)}
                            className="ml-auto text-xs text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1"
                          >
                            {isExpanded ? 'Hide preview ▲' : 'Top cards ▼'}
                          </button>
                        )}
                      </div>
                    </div>

                    {isExpanded && hasPreview && (
                      <div className="border-t border-gray-700 bg-gray-900/50 px-4 py-3">
                        <p className="text-xs text-gray-500 mb-2">
                          Top cards for {cmd.name} — <span className="text-gray-600">% = how often played in this commander's decks</span>
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {cmd.preview_cards.map((card) => {
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
                                  <span className={`opacity-60 ${card.is_favorite ? '' : 'text-gray-500'}`}>{card.inclusion}%</span>
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
