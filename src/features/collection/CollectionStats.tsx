import { useState } from 'react';
import { CardName, LoadingOverlay, ManaSymbol, PageHero, ColorBadge, Button } from '../../components/ui';
import { apiGet } from '../../lib/api';
import { ALL_COLORS, COLOR_MAP } from '../../lib/colors';
import type { CollectionStats as CollectionStatsData } from '../../types/api';

interface Props {
  collectionCount: number;
}

const TYPE_ORDER = ['Creature', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Planeswalker', 'Land', 'Other'];
const TYPE_COLORS: Record<string, string> = {
  Creature: 'rgb(var(--mana-g))', Instant: 'rgb(var(--mana-u))', Sorcery: 'rgb(var(--mana-r))',
  Enchantment: 'rgb(var(--mana-b))', Artifact: 'rgb(var(--mana-c))', Planeswalker: 'rgb(var(--accent))',
  Land: 'rgb(var(--warn))', Other: 'rgb(var(--ink-faint))',
};
const PIP_COLORS: Record<string, { bg: string; text: string }> = {
  W: { bg: 'rgb(var(--mana-w))', text: 'rgb(var(--surface-0))' },
  U: { bg: 'rgb(var(--mana-u))', text: 'rgb(var(--surface-0))' },
  B: { bg: 'rgb(var(--mana-b))', text: 'rgb(var(--surface-0))' },
  R: { bg: 'rgb(var(--mana-r))', text: 'rgb(var(--surface-0))' },
  G: { bg: 'rgb(var(--mana-g))', text: 'rgb(var(--surface-0))' },
  C: { bg: 'rgb(var(--mana-c))', text: 'rgb(var(--surface-0))' },
};
const PIP_ORDER = ['W', 'U', 'B', 'R', 'G', 'C'];
const CMC_BUCKETS = [0, 1, 2, 3, 4, 5, 6, 7];

function colorLabel(color: string): string {
  if (color === 'C') return 'Colorless';
  return COLOR_MAP[color as keyof typeof COLOR_MAP]?.label || color;
}

export function CollectionStats({ collectionCount }: Props) {
  const [stats, setStats] = useState<CollectionStatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadStats = () => {
    setLoading(true);
    setError('');
    apiGet<CollectionStatsData>('/api/collection/stats')
      .then((data) => { setStats(data); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  };

  if (collectionCount === 0) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold">Collection Statistics</h2>
        <p className="text-ink-faint text-center py-12">Upload a collection to see your stats.</p>
      </div>
    );
  }

  if (loading) {
    return <LoadingOverlay message="Analyzing your collection..." submessage="Fetching prices and card data from Scryfall." />;
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold">Collection Statistics</h2>
        <div className="bg-danger/10 border border-danger/40 rounded p-3 text-danger">{error}</div>
        <Button onClick={loadStats} size="sm">Retry</Button>
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
          <div className="flex items-center gap-5 mt-6">
            <ColorBadge colors={ALL_COLORS} size="md" />
            <Button onClick={loadStats}>Load Statistics</Button>
          </div>
          <p className="text-xs text-ink-faint mt-3">
            This fetches data from Scryfall and may take a moment for large collections.
          </p>
        </PageHero>
      </div>
    );
  }

  const totalTyped = Object.values(stats.type_counts).reduce((a, b) => a + b, 0);
  const totalPips = Object.values(stats.color_counts).reduce((a, b) => a + b, 0);
  const cmcCounts = CMC_BUCKETS.map((b) => stats.cmc_distribution[String(b)] || 0);
  const maxCmc = Math.max(...cmcCounts, 1);
  const presentTypes = TYPE_ORDER.filter((t) => stats.type_counts[t]);
  const presentColors = PIP_ORDER.filter((c) => stats.color_counts[c] > 0);

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
          { value: stats.total_in_decks, label: 'In Decks' },
        ]}
      />

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-surface-2 rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-ink">Card Type Distribution</h3>
          <div className="flex rounded-full overflow-hidden h-4 bar-animate">
            {presentTypes.map((type) => (
              <div
                key={type}
                style={{ width: `${(stats.type_counts[type] / totalTyped) * 100}%`, backgroundColor: TYPE_COLORS[type] }}
                title={`${type}: ${stats.type_counts[type]}`}
              />
            ))}
          </div>
          <div className="space-y-1.5">
            {presentTypes.map((type) => (
              <div key={type} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: TYPE_COLORS[type] }} />
                <span className="text-xs text-ink-muted flex-1">{type}</span>
                <span className="text-xs text-ink font-medium">{stats.type_counts[type]}</span>
                <span className="text-xs text-ink-faint w-10 text-right">
                  {((stats.type_counts[type] / totalTyped) * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface-2 rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-ink">Color Distribution</h3>
          {totalPips > 0 && (
            <>
              <div className="flex rounded-full overflow-hidden h-4 bar-animate">
                {presentColors.map((color) => (
                  <div
                    key={color}
                    style={{ width: `${(stats.color_counts[color] / totalPips) * 100}%`, backgroundColor: PIP_COLORS[color].bg }}
                    title={`${colorLabel(color)}: ${stats.color_counts[color]}`}
                  />
                ))}
              </div>
              <div className="space-y-1.5">
                {presentColors.map((color) => (
                  <div key={color} className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-2 text-ink-muted">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PIP_COLORS[color].bg }} />
                      {colorLabel(color)}
                    </span>
                    <span className="num">
                      <span className="text-ink">{stats.color_counts[color]}</span>
                      <span className="text-ink-faint ml-2 w-12 inline-block text-right">{((stats.color_counts[color] / totalPips) * 100).toFixed(1)}%</span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-surface-2 rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-ink">Collection Mana Curve</h3>
          <div className="flex items-end gap-2" style={{ height: '140px' }}>
            {CMC_BUCKETS.map((cmc, i) => {
              const pct = cmcCounts[i] / maxCmc;
              return (
                <div key={cmc} className="flex-1 flex flex-col items-center h-full justify-end">
                  <span className="text-xs text-ink-muted mb-1">{cmcCounts[i] > 0 ? cmcCounts[i] : ''}</span>
                  <div
                    className="w-full bg-accent text-accent-ink rounded-t transition-all duration-300"
                    style={{ height: `${Math.max(pct * 100, cmcCounts[i] > 0 ? 3 : 0)}%` }}
                  />
                  <span className="mt-1 flex items-center justify-center">
                    {cmc === 7 ? <span className="text-xs text-ink-faint">7+</span> : <ManaSymbol symbol={String(cmc)} size={16} />}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-surface-2 rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-ink">Most Valuable Cards</h3>
          <div className="divide-y divide-gray-700">
            {stats.top_valuable.map((card, i) => (
              <div key={card.name} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-faint w-5">{i + 1}.</span>
                  <CardName name={card.name} className="text-sm" />
                  {card.qty > 1 && <span className="text-xs text-ink-faint">x{card.qty}</span>}
                </div>
                <span className="text-sm font-medium text-warn">${(card.price ?? 0).toFixed(2)}</span>
              </div>
            ))}
            {stats.top_valuable.length === 0 && <p className="text-ink-faint text-sm py-4">No price data available</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
