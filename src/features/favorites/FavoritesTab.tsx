import { useEffect, useRef, useState } from 'react';
import { ColorBadge, MatchBar, PageHero, SectionHeader, type CardCommander } from '../../components/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';
import { commanderDetailQuery, keys } from '../../lib/queries';
import { useDiscoverState } from '../../app/DiscoverState';
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
  Creature: 'text-ok bg-ok/10',
  Instant: 'text-accent bg-accent/10',
  Sorcery: 'text-secondary bg-secondary/10',
  Enchantment: 'text-warn bg-warn/10',
  Artifact: 'text-ink bg-surface-3/50',
  Planeswalker: 'text-warn bg-warn/10',
};

export function FavoritesTab({ favorites, onToggleFavorite, onClearFavorites, onSelectCommander, onOpenDeckBuilder }: Props) {
  const queryClient = useQueryClient();
  const { fav, setFav } = useDiscoverState();
  const [localError, setLocalError] = useState('');
  const [buildingDeck, setBuildingDeck] = useState<string | null>(null);
  const expandedCommander = fav.expanded;
  const setExpandedCommander = (name: string | null) => setFav({ expanded: name });

  const matches = useQuery({
    queryKey: keys.favoriteMatches(fav.searched ?? []),
    queryFn: () => apiPost<FavoritesRecommendationResponse>('/api/recommendations/from-favorites', { card_names: fav.searched }),
    enabled: fav.searched !== null && fav.searched.length > 0,
  });
  const results = matches.data?.results ?? [];
  const detectedColors: Color[] = matches.data?.detected_colors ?? [];
  const loading = matches.isFetching;
  const error = localError || (matches.error ? (matches.error as Error).message : '');
  const searched = fav.searched !== null && matches.isSuccess;

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

  const handleFind = () => {
    if (favList.length === 0) return;
    setLocalError('');
    const sorted = [...favList].sort();
    if (fav.searched && JSON.stringify(fav.searched) === JSON.stringify(sorted)) matches.refetch();
    else setFav({ searched: sorted, expanded: null });
  };

  const handleBuildDeck = async (cmd: FavoriteMatch) => {
    setBuildingDeck(cmd.name);
    try {
      const data = await queryClient.fetchQuery(commanderDetailQuery(cmd.name));
      onOpenDeckBuilder(data, cmd);
    } catch (err) {
      setLocalError((err as Error).message);
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

      <div className="bg-surface-2/50 rounded-xl border border-line p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ink">
            {favList.length === 0 ? 'No favorites yet' : `Your Favorites (${favList.length})`}
          </h2>
          {favList.length > 0 && (
            <button onClick={onClearFavorites} className="text-xs text-ink-faint hover:text-danger transition-colors">
              Clear all
            </button>
          )}
        </div>

        <div ref={searchRef} className="relative">
          <div className="flex items-center gap-2 bg-surface-1 border border-line-strong rounded-lg px-3 py-2 focus-within:border-accent transition-colors">
            <span className="text-ink-faint text-sm">☆</span>
            <input
              value={cardSearch}
              onChange={(e) => handleCardSearchInput(e.target.value)}
              onFocus={() => { if (cardSuggestions.length > 0) setShowSuggestions(true); }}
              placeholder="Search for a card to add to favorites…"
              className="flex-1 bg-transparent text-sm outline-none placeholder-ink-faint"
            />
            {searchLoading && (
              <div className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin flex-shrink-0" />
            )}
          </div>
          {showSuggestions && cardSuggestions.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-surface-2 border border-line-strong rounded-lg shadow-xl max-h-56 overflow-y-auto">
              {cardSuggestions.map((name) => {
                const isFav = favorites.has(name.toLowerCase());
                return (
                  <button
                    key={name}
                    onClick={() => handleAddCard(name)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-surface-3 flex items-center justify-between gap-2 transition-colors"
                  >
                    <span className="truncate">{name}</span>
                    <span className={`text-xs flex-shrink-0 ${isFav ? 'text-warn' : 'text-ink-faint'}`}>
                      {isFav ? '★ added' : '+ add'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {favList.length === 0 ? (
          <p className="text-sm text-ink-faint">Search above or star cards from any card list in the app.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {favList.map((name) => (
              <span key={name} className="inline-flex items-center gap-1.5 bg-surface-3 border border-line-strong rounded-full px-3 py-1 text-sm">
                <span className="text-warn text-xs">★</span>
                {name}
                <button
                  onClick={() => onToggleFavorite(name)}
                  className="text-ink-faint hover:text-danger transition-colors ml-0.5 text-xs leading-none"
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
              className="bg-accent text-accent-ink hover:bg-accent-hi disabled:opacity-60 disabled:cursor-not-allowed px-5 py-2 rounded-lg font-medium text-sm transition-colors"
            >
              {loading ? 'Searching...' : 'Find My Commander'}
            </button>
            {detectedColors.length > 0 && (
              <span className="text-xs text-ink-muted">
                Detected colors: <span className="font-medium text-ink">{detectedColors.map((c) => COLOR_NAMES[c] || c).join(', ')}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {error && <div className="bg-danger/10 border border-danger/40 rounded-lg p-3 text-danger text-sm">{error}</div>}

      {loading && (
        <div className="flex items-center justify-center py-12 text-ink-muted gap-3">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span>Checking commanders against your favorites&hellip;</span>
        </div>
      )}

      {searched && !loading && (
        <div className="space-y-3">
          <SectionHeader color="blue" count={results.length}>Commander Recommendations</SectionHeader>

          {results.length === 0 ? (
            <div className="bg-surface-2 rounded-lg p-6 text-center text-ink-faint">
              <p>No commanders found that match your favorites.</p>
              <p className="text-xs mt-1">Try adding more cards or cards with different colors.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {results.map((cmd) => {
                const isExpanded = expandedCommander === cmd.name;
                const hasPreview = cmd.preview_cards?.length > 0;
                return (
                  <div key={cmd.name} className="bg-surface-2 border border-line rounded-xl overflow-hidden hover:border-line-strong transition-colors">
                    <div className="p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        {cmd.image_uri && (
                          <img
                            src={cmd.image_uri}
                            alt={cmd.name}
                            className="w-12 h-12 rounded-lg object-cover object-top flex-shrink-0 border border-line-strong"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-ink text-sm">{cmd.name}</span>
                            <ColorBadge colors={cmd.color_identity} />
                          </div>
                          <div className="text-xs text-ink-muted mt-0.5">{cmd.num_decks?.toLocaleString()} decks on EDHREC</div>
                          <div className="mt-1.5">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-ink-muted">{cmd.match_count} of {cmd.total_favorites} favorites fit</span>
                              <span className={`font-bold ${
                                cmd.match_percentage >= 75 ? 'text-ok' :
                                cmd.match_percentage >= 50 ? 'text-warn' :
                                'text-warn'
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
                          <span key={card} className="text-xs bg-warn/10 text-warn border border-warn/40 rounded px-1.5 py-0.5">
                            ★ {card}
                          </span>
                        ))}
                      </div>

                      <div className="flex gap-2 items-center pt-1">
                        <button
                          onClick={() => onSelectCommander(cmd)}
                          className="text-xs bg-surface-3 hover:bg-surface-3 px-3 py-1.5 rounded transition-colors"
                        >
                          View Commander
                        </button>
                        <button
                          onClick={() => handleBuildDeck(cmd)}
                          disabled={buildingDeck === cmd.name}
                          className="text-xs bg-accent text-accent-ink hover:bg-accent-hi disabled:opacity-60 px-3 py-1.5 rounded transition-colors font-medium"
                        >
                          {buildingDeck === cmd.name ? 'Loading…' : 'Build Deck'}
                        </button>
                        {hasPreview && (
                          <button
                            onClick={() => setExpandedCommander(isExpanded ? null : cmd.name)}
                            className="ml-auto text-xs text-ink-muted hover:text-ink transition-colors flex items-center gap-1"
                          >
                            {isExpanded ? 'Hide preview ▲' : 'Top cards ▼'}
                          </button>
                        )}
                      </div>
                    </div>

                    {isExpanded && hasPreview && (
                      <div className="border-t border-line bg-surface-1/50 px-4 py-3">
                        <p className="text-xs text-ink-faint mb-2">
                          Top cards for {cmd.name} — <span className="text-ink-faint">% = how often played in this commander's decks</span>
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {cmd.preview_cards.map((card) => {
                            const catStyle = CATEGORY_COLORS[card.category] || 'text-ink-muted bg-surface-3/30';
                            return (
                              <span
                                key={card.name}
                                className={`inline-flex items-center gap-1 text-xs rounded px-1.5 py-0.5 border ${
                                  card.is_favorite
                                    ? 'bg-warn/10 text-warn border-warn/40/60'
                                    : `${catStyle} border-transparent`
                                }`}
                                title={card.category || ''}
                              >
                                {card.is_favorite && <span className="text-warn">★</span>}
                                {card.name}
                                {card.inclusion > 0 && (
                                  <span className={`opacity-60 ${card.is_favorite ? '' : 'text-ink-faint'}`}>{card.inclusion}%</span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                        {cmd.preview_cards.length >= 15 && (
                          <p className="text-xs text-ink-faint mt-2">+ more — click View Commander for the full list</p>
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
