import { useEffect, useState } from 'react';
import { AvailDot, CardName, ColorBadge, DeckBadges, SectionHeader, TypeSectionHeader, type CardCommander } from '../../components/ui';
import { getColorGlow } from '../../lib/colors';
import type { Color, CommanderDetail, FunctionalCategory } from '../../types/api';
import { canHaveMultiple, classifyFunctionalCategory, compareForRemoval, groupByType, makeAddComparator, planComposition } from './classify';
import { CompositionModal } from './CompositionModal';
import {
  CATEGORY_META, COLOR_TO_BASICS, DEFAULT_COMPOSITION,
  type BuilderCard, type Composition, type SuggestionMode, type ViewMode,
} from './constants';
import { DeckStats } from './DeckStats';
import { ManaCurve } from './ManaCurve';
import { DeckCardImage, StackCard } from './StackCard';

interface DeckBuilderProps {
  data: CommanderDetail;
  commander: CardCommander;
  onBack: () => void;
  favorites: Set<string>;
  onToggleFavorite: (name: string) => void;
}

interface Swap {
  remove: BuilderCard & { fromCategory: string };
  add: BuilderCard & { toCategory: string };
}

const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: 'list', label: 'List' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'stacks', label: 'Stacks' },
];
const MODE_OPTIONS: { value: SuggestionMode; label: string }[] = [
  { value: 'collection', label: 'Collection' },
  { value: 'cheapest', label: 'Cheapest' },
  { value: 'best', label: 'Best' },
];

function emptyCounts(): Record<FunctionalCategory, number> {
  return { lands: 0, ramp: 0, cardDraw: 0, removal: 0, synergy: 0, utility: 0 };
}

/** Build the initial working deck from the average deck plus recommendations, filling basics to 99. */
function buildInitialDeck(data: CommanderDetail, commander: CardCommander): { cards: BuilderCard[]; counts: Composition } {
  const commanderNorm = (commander.name || '').toLowerCase();

  const initial: BuilderCard[] = [...data.owned_cards, ...data.missing_cards].map((c) => {
    const isCommander = (c.name_normalized || c.name?.toLowerCase()) === commanderNorm;
    const card: BuilderCard = { ...c, included: true, qty: 1, isCommander };
    card.functional_category = classifyFunctionalCategory(card);
    return card;
  });
  const recCards: BuilderCard[] = (data.recommendations || []).map((c) => {
    const card: BuilderCard = {
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

  const deckCounts = emptyCounts();
  for (const c of initial) {
    if (c.isCommander) continue;
    deckCounts[classifyFunctionalCategory(c)] += c.qty;
  }

  // Auto-fill basic lands to reach 99 non-commander cards (commander is #100).
  const currentTotal = initial.filter((c) => !c.isCommander).reduce((s, c) => s + c.qty, 0);
  const currentLands = deckCounts.lands || 0;
  const desiredLands = Math.max(currentLands, 38);
  const spaceForBasics = Math.max(0, 99 - currentTotal);
  const landDeficit = Math.min(Math.max(0, desiredLands - currentLands), spaceForBasics);

  const colors = commander.color_identity || [];
  const basics = colors.length > 0
    ? colors.filter((c) => COLOR_TO_BASICS[c as Color]).map((c) => COLOR_TO_BASICS[c as Color])
    : ['Wastes'];

  if (landDeficit > 0 && basics.length > 0) {
    const perType = Math.floor(landDeficit / basics.length);
    const remainder = landDeficit % basics.length;
    basics.forEach((basicName, i) => {
      const qty = perType + (i < remainder ? 1 : 0);
      if (qty <= 0) return;
      const existing = initial.find((c) => c.name === basicName);
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

  return { cards: [...initial, ...recCards], counts: deckCounts };
}

export function DeckBuilder({ data, commander, onBack, favorites, onToggleFavorite }: DeckBuilderProps) {
  const [deck, setDeck] = useState<BuilderCard[]>([]);
  const [exportText, setExportText] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const [showCompositionSettings, setShowCompositionSettings] = useState(false);
  const [composition, setComposition] = useState<Composition | null>(null);
  const [tempComposition, setTempComposition] = useState<Composition>(DEFAULT_COMPOSITION);
  const [suggestionMode, setSuggestionMode] = useState<SuggestionMode>('collection');

  useEffect(() => {
    if (data) {
      const { cards, counts } = buildInitialDeck(data, commander);
      setComposition(counts);
      setTempComposition(counts);
      setDeck(cards);
    }
  }, [data, commander.color_identity, commander.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const includedCards = deck.filter((c) => c.included);
  const excludedCards = deck.filter((c) => !c.included);
  const deckSize = includedCards.reduce((sum, c) => sum + c.qty, 0);

  const ownedCount = includedCards.filter((c) => c.owned).reduce((sum, c) => sum + c.qty, 0);
  const neededCount = includedCards.filter((c) => !c.owned).reduce((sum, c) => sum + c.qty, 0);
  const priceToComplete = includedCards
    .filter((c) => !c.owned && c.price)
    .reduce((sum, c) => sum + (c.price as number) * c.qty, 0);

  // The commander is excluded from composition analysis and swap logic.
  const nonCommanderIncluded = includedCards.filter((c) => !c.isCommander);
  const nonCommanderExcluded = excludedCards.filter((c) => !c.isCommander);
  const activeComposition = composition || DEFAULT_COMPOSITION;

  const categoryCounts = emptyCounts();
  for (const c of nonCommanderIncluded) categoryCounts[classifyFunctionalCategory(c)] += c.qty;

  const sortAddCandidates = makeAddComparator(suggestionMode);

  // Pair over-target cuts with under-target adds, up to five swaps.
  const swapSuggestions: Swap[] = [];
  const overCategories = CATEGORY_META.filter((m) => categoryCounts[m.key] > activeComposition[m.key]);
  const underCategories = CATEGORY_META.filter((m) => categoryCounts[m.key] < activeComposition[m.key]);

  if (overCategories.length > 0 && underCategories.length > 0) {
    const removable: Swap['remove'][] = [];
    for (const over of overCategories) {
      const excess = categoryCounts[over.key] - activeComposition[over.key];
      const candidates = nonCommanderIncluded
        .filter((c) => classifyFunctionalCategory(c) === over.key)
        .sort(compareForRemoval)
        .slice(0, excess);
      for (const c of candidates) removable.push({ ...c, fromCategory: over.label });
    }

    const addable: Swap['add'][] = [];
    for (const under of underCategories) {
      const deficit = activeComposition[under.key] - categoryCounts[under.key];
      const candidates = nonCommanderExcluded
        .filter((c) => classifyFunctionalCategory(c) === under.key)
        .sort(sortAddCandidates)
        .slice(0, deficit);
      for (const c of candidates) addable.push({ ...c, toCategory: under.label });
    }

    const pairCount = Math.min(removable.length, addable.length, 5);
    for (let i = 0; i < pairCount; i++) swapSuggestions.push({ remove: removable[i], add: addable[i] });
  }

  const toggle = (name: string) => {
    setDeck((prev) => prev.map((c) => {
      if (c.name !== name || c.isCommander) return c;
      return { ...c, included: !c.included, qty: c.included ? c.qty : 1 };
    }));
  };

  // For swaps: remove one copy (reduce qty for multi-copy cards like basics).
  const removeOneIncluded = (name: string) => {
    setDeck((prev) => prev.map((c) => {
      if (c.name !== name) return c;
      if (c.qty > 1) return { ...c, qty: c.qty - 1 };
      return { ...c, included: false, qty: 1 };
    }));
  };

  const addOneExcluded = (name: string) => {
    setDeck((prev) => prev.map((c) => (
      c.name === name ? { ...c, included: true, qty: c.included ? c.qty + 1 : 1 } : c
    )));
  };

  const setQty = (name: string, qty: number) => {
    const val = Math.max(0, qty);
    setDeck((prev) => prev.map((c) => {
      if (c.name !== name) return c;
      if (val === 0) return { ...c, included: false, qty: 1 };
      return { ...c, qty: val, included: true };
    }));
  };

  const handleExport = () => {
    const text = includedCards.map((c) => `${c.qty} ${c.name}`).join('\n');
    setExportText(text);
    navigator.clipboard.writeText(text).catch(() => {});
  };

  /** Apply composition targets by performing the planned removals and adds. */
  const applyComposition = (newTargets: Composition) => {
    const plan = planComposition(newTargets, categoryCounts, nonCommanderIncluded, nonCommanderExcluded, suggestionMode, CATEGORY_META);
    const removeMap: Record<string, number> = {};
    const addSet: Record<string, number> = {};
    const increaseMap: Record<string, number> = {};
    for (const r of plan.removals) removeMap[r.name] = (removeMap[r.name] || 0) + r.qty;
    for (const a of plan.adds) {
      const target = a.increase ? increaseMap : addSet;
      target[a.name] = (target[a.name] || 0) + a.qty;
    }

    setDeck((prev) => {
      const removalsLeft = { ...removeMap };
      const addsLeft = { ...addSet };
      const increasesLeft = { ...increaseMap };
      return prev.map((c) => {
        if (c.isCommander) return c;

        if (removalsLeft[c.name] > 0 && c.included) {
          const removeQty = removalsLeft[c.name];
          if (c.qty <= removeQty) {
            removalsLeft[c.name] = removeQty - c.qty;
            return { ...c, included: false, qty: 1 };
          }
          removalsLeft[c.name] = 0;
          return { ...c, qty: c.qty - removeQty };
        }

        if (increasesLeft[c.name] > 0 && c.included) {
          const addQty = increasesLeft[c.name];
          increasesLeft[c.name] = 0;
          return { ...c, qty: c.qty + addQty };
        }

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
  const openSettings = () => { setTempComposition(activeComposition); setShowCompositionSettings(true); };

  const ownershipDot = (card: BuilderCard) => {
    const inDecks = card.qty_in_decks || 0;
    return {
      className: !card.owned ? 'bg-danger' : inDecks >= (card.qty_owned || 1) ? 'bg-ink-faint' : inDecks > 0 ? 'bg-warn' : 'bg-ok',
      title: !card.owned ? 'Not owned' : inDecks > 0 ? `In ${(card.in_decks || []).map((d) => d.name).join(', ')}` : 'Owned',
    };
  };

  const renderListView = () => (
    <div className="grid md:grid-cols-3 gap-6">
      <div className="md:col-span-2 space-y-4">
        <SectionHeader color="green" count={deckSize}>In Deck</SectionHeader>
        {includedGroups.map(({ type, cards }) => (
          <div key={type}>
            <TypeSectionHeader type={type} count={cards.reduce((s, c) => s + c.qty, 0)} />
            <div className="bg-surface-2 rounded-lg divide-y divide-gray-700">
              {cards.map((card) => (
                <div key={card.name} className="px-3 py-1.5 flex justify-between items-center group hover:bg-surface-3/50">
                  <div className="flex items-center gap-2">
                    <AvailDot card={card} />
                    <CardName name={card.name} className="text-sm" favorites={favorites} onToggleFavorite={onToggleFavorite} />
                    {card.isRecommendation && <span className="text-xs text-secondary bg-secondary/10 px-1.5 py-0.5 rounded">rec</span>}
                    {card.isCommander && <span className="text-xs text-warn bg-warn/10 px-1.5 py-0.5 rounded">cmdr</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <DeckBadges inDecks={card.in_decks} />
                    {canHaveMultiple(card.name) ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => setQty(card.name, card.qty - 1)} className="w-5 h-5 rounded bg-surface-3 hover:bg-surface-3 text-xs flex items-center justify-center">-</button>
                        <span className="text-xs w-5 text-center">{card.qty}</span>
                        <button onClick={() => setQty(card.name, card.qty + 1)} className="w-5 h-5 rounded bg-surface-3 hover:bg-surface-3 text-xs flex items-center justify-center">+</button>
                      </div>
                    ) : (
                      card.qty > 1 && <span className="text-xs text-ink-faint">x{card.qty}</span>
                    )}
                    <button onClick={() => toggle(card.name)} className="text-xs text-danger opacity-0 group-hover:opacity-100 transition-opacity">
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
        <div className="bg-surface-2 rounded-lg divide-y divide-gray-700 max-h-[600px] overflow-y-auto">
          {excludedCards.map((card) => (
            <div key={card.name} className="px-3 py-1.5 flex justify-between items-center group">
              <div className="flex items-center gap-2">
                <AvailDot card={card} />
                <CardName name={card.name} className="text-sm text-ink-muted" favorites={favorites} onToggleFavorite={onToggleFavorite} />
                <DeckBadges inDecks={card.in_decks} />
              </div>
              <button onClick={() => toggle(card.name)} className="text-xs text-ok opacity-0 group-hover:opacity-100 transition-opacity">
                Add
              </button>
            </div>
          ))}
          {excludedCards.length === 0 && <p className="px-3 py-4 text-ink-faint text-sm">No removed cards</p>}
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
            {cards.map((card) => {
              const dot = ownershipDot(card);
              return (
                <div key={card.name} className="relative group">
                  <DeckCardImage name={card.name} small />
                  {card.qty > 1 && (
                    <span className="absolute top-1 right-1 bg-surface-0/80 text-ink text-xs font-bold px-1.5 py-0.5 rounded">x{card.qty}</span>
                  )}
                  <span className={`absolute top-1 left-1 w-2.5 h-2.5 rounded-full border border-surface-0 ${dot.className}`} title={dot.title} />
                  <div className="absolute inset-0 bg-surface-0/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 rounded-lg">
                    {canHaveMultiple(card.name) && (
                      <>
                        <button onClick={() => setQty(card.name, card.qty - 1)} className="w-6 h-6 rounded bg-surface-3 hover:bg-surface-3 text-xs flex items-center justify-center">-</button>
                        <span className="text-xs font-bold w-4 text-center">{card.qty}</span>
                        <button onClick={() => setQty(card.name, card.qty + 1)} className="w-6 h-6 rounded bg-surface-3 hover:bg-surface-3 text-xs flex items-center justify-center">+</button>
                      </>
                    )}
                    <button onClick={() => toggle(card.name)} className="w-6 h-6 rounded bg-danger hover:bg-danger text-xs flex items-center justify-center ml-1">✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  const renderStacksView = () => {
    // Bin-pack types into four columns, largest first, to even out column heights.
    const groupMap: Record<string, BuilderCard[]> = {};
    includedGroups.forEach((g) => { groupMap[g.type] = g.cards; });
    const typesWithCounts = includedGroups
      .map((g) => ({ type: g.type, count: g.cards.length }))
      .sort((a, b) => b.count - a.count);

    const columns: string[][] = [[], [], [], []];
    const columnHeights = [0, 0, 0, 0];
    for (const { type, count } of typesWithCounts) {
      const minIdx = columnHeights.indexOf(Math.min(...columnHeights));
      columns[minIdx].push(type);
      columnHeights[minIdx] += count;
    }

    const renderColumn = (type: string) => {
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
          <div key={colIdx} className="space-y-4">{types.map((type) => renderColumn(type))}</div>
        ))}
      </div>
    );
  };

  const colorGlow = getColorGlow(commander.color_identity);

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-accent hover:underline">← Back to Detail</button>

      <div
        className="bg-surface-2/80 rounded-xl p-4 flex items-center justify-between flex-wrap gap-4"
        style={{ boxShadow: `0 4px 20px ${colorGlow}` }}
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
            <p className="text-ink-muted text-sm">{commander.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
            deckSize === 100 ? 'bg-ok/10 text-ok border border-ok/40' :
            deckSize > 100 ? 'bg-danger/10 text-danger border border-danger/40' :
            'bg-warn/10 text-warn border border-warn/40'
          }`}>
            {deckSize}/100 cards
          </div>
          <div className="px-3 py-1.5 rounded-lg text-sm bg-surface-3/50 border border-line-strong">
            <span className="text-ok font-medium">{ownedCount}</span>
            <span className="text-ink-faint mx-1">/</span>
            <span className="text-danger font-medium">{neededCount}</span>
            <span className="text-ink-faint ml-1 text-xs">own/need</span>
          </div>
          {priceToComplete > 0 && (
            <div className="px-3 py-1.5 rounded-lg text-sm bg-warn/10 text-warn border border-warn/40/50">
              ~${priceToComplete.toFixed(2)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-surface-1 rounded-lg overflow-hidden border border-line">
            {VIEW_MODES.map((v) => (
              <button
                key={v.id}
                onClick={() => setViewMode(v.id)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === v.id ? 'bg-accent text-accent-ink text-ink' : 'text-ink-muted hover:text-ink hover:bg-surface-2'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <button onClick={openSettings} className="p-2 bg-surface-3 hover:bg-surface-3 rounded-lg transition-colors" title="Deck Composition Settings">
            <svg className="w-5 h-5 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button onClick={handleExport} className="bg-accent text-accent-ink hover:bg-accent-hi px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            Export Deck
          </button>
        </div>
      </div>

      {exportText && (
        <div className="bg-surface-2 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-ok">Copied to clipboard!</p>
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

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <ManaCurve cards={includedCards} />
        </div>
        <DeckStats cards={includedCards} />
      </div>

      <div className="bg-surface-2/50 rounded-xl border border-line p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-ink">Deck Composition</h3>
            <div className="flex items-center gap-1">
              {MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSuggestionMode(opt.value)}
                  className={`px-2 py-0.5 text-[10px] rounded-full transition-colors ${
                    suggestionMode === opt.value ? 'bg-warn text-ink' : 'bg-surface-3 text-ink-faint hover:text-ink'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <button onClick={openSettings} className="text-xs text-ink-muted hover:text-ink transition-colors">
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
                  <span className="text-ink-muted">{label}</span>
                  <span className={diff === 0 ? 'text-ok' : diff > 0 ? 'text-warn' : 'text-danger'}>
                    {actual}/{target}
                  </span>
                </div>
                <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${diff === 0 ? 'bg-ok' : diff > 0 ? 'bg-warn' : color}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {diff !== 0 && (
                  <p className="text-[10px] text-ink-faint">{diff > 0 ? `${diff} over` : `${-diff} short`}</p>
                )}
              </div>
            );
          })}
        </div>

        {swapSuggestions.length > 0 && (
          <div className="border-t border-line pt-3 space-y-2">
            <h4 className="text-xs font-medium text-ink-muted">Suggested Swaps</h4>
            {swapSuggestions.map((swap, i) => (
              <div key={i} className="flex items-center gap-2 text-xs bg-surface-1/50 rounded-lg px-3 py-2">
                <button
                  onClick={() => { removeOneIncluded(swap.remove.name); addOneExcluded(swap.add.name); }}
                  className="px-2 py-1 bg-warn hover:bg-warn text-ink rounded text-[10px] font-medium transition-colors flex-shrink-0"
                >
                  Swap
                </button>
                <span className="text-danger truncate" title={swap.remove.name}>- {swap.remove.name}</span>
                <span className="text-ink-faint flex-shrink-0 text-[10px]">({swap.remove.fromCategory})</span>
                <svg className="w-3 h-3 text-ink-faint flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                <span className="text-ok truncate" title={swap.add.name}>+ {swap.add.name}</span>
                <span className="text-ink-faint flex-shrink-0 text-[10px]">({swap.add.toCategory})</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {viewMode === 'list' && renderListView()}
      {viewMode === 'gallery' && renderGalleryView()}
      {viewMode === 'stacks' && renderStacksView()}

      {showCompositionSettings && (
        <CompositionModal
          tempComposition={tempComposition}
          setTempComposition={setTempComposition}
          categoryCounts={categoryCounts}
          suggestionMode={suggestionMode}
          setSuggestionMode={setSuggestionMode}
          nonCommanderIncluded={nonCommanderIncluded}
          nonCommanderExcluded={nonCommanderExcluded}
          onApply={applyComposition}
          onClose={() => setShowCompositionSettings(false)}
        />
      )}
    </div>
  );
}
