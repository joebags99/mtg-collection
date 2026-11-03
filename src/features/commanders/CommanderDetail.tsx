import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from '../../lib/api';
import { getColorGlow } from '../../lib/colors';
import type { Color, Commander, CommanderDetail as CommanderDetailData, PartnersResponse } from '../../types/api';
import {
  CardName, ColorBadge, LoadingOverlay, MatchBar, PartnerPicker, SectionHeader, type CardCommander,
} from '../../components/ui';
import { CardListByType } from './CardListByType';

type RecSort = 'synergy_desc' | 'synergy_asc' | 'inclusion_desc';
type RecFilter = 'all' | 'owned' | 'not_owned';

type DetailParams = {
  budget: string | null;
  theme: string | null;
  exclude_in_decks: boolean | null;
  partner?: string;
};

export interface CommanderDetailProps {
  commander: CardCommander;
  collectionCount: number;
  onBack: () => void;
  onOpenDeckBuilder: (data: CommanderDetailData, cmd?: CardCommander) => void;
  excludeInDecks: boolean;
  favorites: Set<string>;
  onToggleFavorite: (name: string) => void;
}

export function CommanderDetail({ commander, onBack, onOpenDeckBuilder, excludeInDecks, favorites, onToggleFavorite }: CommanderDetailProps) {
  const [data, setData] = useState<CommanderDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [budget, setBudget] = useState('');
  const [theme, setTheme] = useState('');
  const [showOwned, setShowOwned] = useState(true);
  const [showMissing, setShowMissing] = useState(true);
  const [exportText, setExportText] = useState('');
  const [recSort, setRecSort] = useState<RecSort>('synergy_desc');
  const [recFilter, setRecFilter] = useState<RecFilter>('all');
  const [recTypeFilter, setRecTypeFilter] = useState('all');
  const [selectedPartner, setSelectedPartner] = useState<Commander | null>(null);
  const [partnerData, setPartnerData] = useState<PartnersResponse | null>(null);
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
      let partner: Commander | null = null;

      // Check for locked partner first
      if (commander.partner_type && ['partner_with', 'partner_variant'].includes(commander.partner_type)) {
        try {
          const pData = await apiGet<PartnersResponse>(`/api/commander/${encodeURIComponent(commander.name)}/partners`);
          setPartnerData(pData);
          if ((pData.partner_type === 'partner_with' || pData.partner_type === 'partner_variant') && pData.partners?.length === 1) {
            partner = pData.partners[0];
            setSelectedPartner(partner);
          }
        } catch {
          // Ignore partner fetch errors
        }
      }

      // Now fetch EDHREC data (with partner if found)
      try {
        const params: DetailParams = { budget: budget || null, theme: theme || null, exclude_in_decks: excludeInDecks || null };
        if (partner) params.partner = partner.name;
        const d = await apiGet<CommanderDetailData>(`/api/commander/${encodeURIComponent(commander.name)}`, params);
        setData(d);
      } catch (err) {
        setError((err as Error).message);
      }
      setLoading(false);
    };

    fetchInitial();
  }, [commander.name, commander.partner_type]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch when filters or partner selection changes (after initial load)
  const fetchDetail = useCallback(async (partnerOverride?: Commander | null) => {
    setLoading(true);
    setError('');
    try {
      const params: DetailParams = { budget: budget || null, theme: theme || null, exclude_in_decks: excludeInDecks || null };
      const p = partnerOverride !== undefined ? partnerOverride : selectedPartner;
      if (p) params.partner = p.name;
      const d = await apiGet<CommanderDetailData>(`/api/commander/${encodeURIComponent(commander.name)}`, params);
      setData(d);
    } catch (err) {
      setError((err as Error).message);
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
  const handlePartnerChange = useCallback((newPartner: Commander | null) => {
    setSelectedPartner(newPartner);
    if (initialFetchDone.current && data) {
      fetchDetail(newPartner);
    }
  }, [data, fetchDetail]);

  const handleExport = (type: 'full' | 'missing') => {
    if (!data) return;
    const allCards = [...data.owned_cards, ...data.missing_cards];
    const text = type === 'full'
      ? allCards.map((c) => `1 ${c.name}`).join('\n')
      : data.missing_cards.map((c) => `1 ${c.name}`).join('\n');
    setExportText(text);
    navigator.clipboard.writeText(text).catch(() => {});
  };

  if (loading && !data) {
    return <LoadingOverlay message={`Loading ${commander.name}...`} submessage="Fetching average deck from EDHREC, classifying cards, and loading prices." />;
  }

  if (error) {
    return (
      <div>
        <button onClick={onBack} className="text-accent hover:underline mb-4">← Back</button>
        <div className="bg-danger/10 border border-danger/40 rounded p-3 text-danger">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const matchColor = data.match_percentage >= 60 ? 'text-ok' :
    data.match_percentage >= 40 ? 'text-warn' : 'text-danger';

  // Compute combined color identity if partner selected
  const colorOrder: Color[] = ['W', 'U', 'B', 'R', 'G'];
  const combinedColors = selectedPartner
    ? colorOrder.filter((c) => (commander.color_identity || []).includes(c) || (selectedPartner.color_identity || []).includes(c))
    : commander.color_identity;

  // Compute available card types in recommendations for the type filter
  const allRecs = data.recommendations || [];
  const recTypes = [...new Set(allRecs.map((r) => r.card_type || 'Other'))].sort();

  // Apply filters
  let filteredRecs = [...allRecs];
  if (recFilter === 'owned') filteredRecs = filteredRecs.filter((c) => c.owned);
  else if (recFilter === 'not_owned') filteredRecs = filteredRecs.filter((c) => !c.owned);
  if (recTypeFilter !== 'all') filteredRecs = filteredRecs.filter((c) => (c.card_type || 'Other') === recTypeFilter);
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
        <button onClick={onBack} className="text-accent hover:underline">← Back</button>

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
                  {selectedPartner && <span className="text-xl text-ink-muted font-normal"> + {selectedPartner.name}</span>}
                </h2>
                <ColorBadge colors={combinedColors} />
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={`https://edhrec.com/commanders/${commander.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-surface-3 hover:bg-surface-3 rounded text-sm text-ink transition-colors"
                >
                  EDHREC
                </a>
              </div>
            </div>
            <div className="flex items-baseline gap-4">
              <span className={`text-4xl font-bold ${matchColor}`}>{data.match_percentage}%</span>
              <span className="text-ink-muted">
                {data.owned_count}/{data.total_cards} cards owned
              </span>
            </div>
            <MatchBar percentage={data.match_percentage} size="md" />
            <div className="flex gap-4 text-sm">
              {data.num_decks > 0 && (
                <span className="text-ink-faint">{data.num_decks.toLocaleString()} decks on EDHREC</span>
              )}
              {data.total_missing_price > 0 && (
                <span className="text-warn">
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
      <div className="bg-surface-2 rounded-lg p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs text-ink-muted mb-1">Budget</label>
          <div className="flex gap-1">
            {[
              { value: '', label: 'Any' },
              { value: 'budget', label: '$' },
              { value: 'expensive', label: '$$$' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setBudget(opt.value)}
                className={`px-3 py-1 rounded text-sm ${
                  budget === opt.value
                    ? 'bg-accent text-accent-ink text-ink'
                    : 'bg-surface-3 text-ink hover:bg-surface-3'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {data.themes && data.themes.length > 0 && (
          <div>
            <label className="block text-xs text-ink-muted mb-1">Theme</label>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="bg-surface-1 border border-line rounded px-3 py-1.5 text-sm focus:outline-none focus:border-accent/70"
            >
              <option value="">All themes</option>
              {data.themes.map((t) => (
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
            className="bg-secondary text-surface-0 hover:bg-secondary text-surface-0 px-3 py-1.5 rounded text-sm font-medium"
          >
            Deck Builder
          </button>
          <button
            onClick={() => handleExport('full')}
            className="bg-surface-3 hover:bg-surface-3 px-3 py-1.5 rounded text-sm"
          >
            Export Full Deck
          </button>
          <button
            onClick={() => handleExport('missing')}
            className="bg-warn/20 text-warn border border-warn/40 hover:bg-warn/30 px-3 py-1.5 rounded text-sm"
          >
            Export Missing Cards
          </button>
        </div>
      </div>

      {exportText && (
        <div className="bg-surface-2 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-ok">Copied to clipboard! You can also copy from below:</p>
            <button onClick={() => setExportText('')} className="text-xs text-ink-muted hover:text-ink">Close</button>
          </div>
          <textarea
            readOnly
            value={exportText}
            rows={6}
            className="w-full bg-surface-1 border border-line rounded p-3 text-xs font-mono"
            onFocus={(e) => e.target.select()}
          />
        </div>
      )}

      {data.error && (
        <div className="bg-warn/10 border border-warn/40 rounded p-3 text-warn text-sm">
          Note: {data.error}
        </div>
      )}

      {/* Card List Toggles + Legend */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={showOwned} onChange={(e) => setShowOwned(e.target.checked)} className="rounded" />
            <span className="text-ok">Owned ({data.owned_count})</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={showMissing} onChange={(e) => setShowMissing(e.target.checked)} className="rounded" />
            <span className="text-danger">Missing ({data.missing_count})</span>
          </label>
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] text-ink-muted">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-ok" /> Available</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warn" /> In deck, have spares</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-ink-faint" /> All copies in decks</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-danger" /> Not owned</span>
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
          <p className="text-xs text-ink-muted ml-3">
            Cards with high synergy for this commander that aren't in the average deck.
          </p>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <label className="text-xs text-ink-muted">Sort:</label>
              <select
                value={recSort}
                onChange={(e) => setRecSort(e.target.value as RecSort)}
                className="bg-surface-1 border border-line rounded px-2 py-1 text-xs focus:outline-none focus:border-accent/70"
              >
                <option value="synergy_desc">Highest Synergy</option>
                <option value="synergy_asc">Lowest Synergy</option>
                <option value="inclusion_desc">Most Included</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-ink-muted">Show:</label>
              <select
                value={recFilter}
                onChange={(e) => setRecFilter(e.target.value as RecFilter)}
                className="bg-surface-1 border border-line rounded px-2 py-1 text-xs focus:outline-none focus:border-accent/70"
              >
                <option value="all">All</option>
                <option value="owned">In Collection</option>
                <option value="not_owned">Not In Collection</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-ink-muted">Type:</label>
              <select
                value={recTypeFilter}
                onChange={(e) => setRecTypeFilter(e.target.value)}
                className="bg-surface-1 border border-line rounded px-2 py-1 text-xs focus:outline-none focus:border-accent/70"
              >
                <option value="all">All Types</option>
                {recTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="bg-surface-2 rounded-lg divide-y divide-gray-700">
            {filteredRecs.map((card) => (
              <div key={card.name} className="px-3 py-2 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  {card.owned ? (
                    <span className="w-2 h-2 rounded-full bg-ok flex-shrink-0" title="In collection" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-surface-3 flex-shrink-0" title="Not in collection" />
                  )}
                  <CardName name={card.name} className="text-sm" favorites={favorites} onToggleFavorite={onToggleFavorite} />
                  {card.card_type && (
                    <span className="text-xs text-ink-faint">{card.card_type}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs">
                  {card.synergy != null && (
                    <span className={`font-medium ${card.synergy > 0 ? 'text-ok' : 'text-ink-muted'}`}>
                      {card.synergy > 0 ? '+' : ''}{card.synergy}% synergy
                    </span>
                  )}
                  {card.inclusion != null && (
                    <span className="text-ink-faint">{card.inclusion}% inclusion</span>
                  )}
                  {card.source && (
                    <span className="text-secondary/70">{card.source}</span>
                  )}
                </div>
              </div>
            ))}
            {filteredRecs.length === 0 && (
              <p className="px-3 py-4 text-ink-faint text-sm">No recommendations match the current filters.</p>
            )}
          </div>
        </div>
      )}

      </div>
    </div>
  );
}
