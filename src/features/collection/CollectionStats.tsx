import { useState, type CSSProperties } from 'react';
import { CardName, LoadingOverlay, ManaSymbol, PageHero } from '../../components/ui';
import { apiGet } from '../../lib/api';
import { ALL_COLORS, COLOR_MAP, getColorGlow } from '../../lib/colors';
import type { CollectionStats as CollectionStatsData } from '../../types/api';

interface Props {
  collectionCount: number;
}

const TYPE_ORDER = ['Creature', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Planeswalker', 'Land', 'Other'];
const TYPE_COLORS: Record<string, string> = {
  Creature: '#22c55e', Instant: '#3b82f6', Sorcery: '#ef4444',
  Enchantment: '#a855f7', Artifact: '#eab308', Planeswalker: '#f97316',
  Land: '#92400e', Other: '#6b7280',
};
const PIP_COLORS: Record<string, { bg: string; text: string }> = {
  W: { bg: '#f9faf4', text: '#333' },
  U: { bg: '#0e68ab', text: '#fff' },
  B: { bg: '#2b2b2b', text: '#ccc' },
  R: { bg: '#d32029', text: '#fff' },
  G: { bg: '#00733e', text: '#fff' },
  C: { bg: '#6b7280', text: '#fff' },
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
            <div className="flex gap-2">
              {ALL_COLORS.map((c) => (
                <div
                  key={c}
                  className="mana-orb opacity-50"
                  style={{
                    backgroundColor: COLOR_MAP[c].bg,
                    color: COLOR_MAP[c].text,
                    '--orb-color': getColorGlow([c]),
                  } as CSSProperties}
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
        <div className="bg-gray-800 rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-300">Card Type Distribution</h3>
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
                <span className="text-xs text-gray-400 flex-1">{type}</span>
                <span className="text-xs text-gray-300 font-medium">{stats.type_counts[type]}</span>
                <span className="text-xs text-gray-500 w-10 text-right">
                  {((stats.type_counts[type] / totalTyped) * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-300">Color Distribution</h3>
          {totalPips > 0 && (
            <>
              <div className="flex gap-2">
                {presentColors.map((color) => (
                  <div
                    key={color}
                    className="rounded-lg py-4 flex flex-col items-center justify-center transition-all relative"
                    style={{
                      backgroundColor: PIP_COLORS[color].bg,
                      color: PIP_COLORS[color].text,
                      flex: stats.color_counts[color],
                      minWidth: '60px',
                    }}
                  >
                    <div
                      className="absolute opacity-15 pointer-events-none"
                      style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
                    >
                      <ManaSymbol symbol={color} size={80} />
                    </div>
                    <span className="text-xl font-bold relative z-10 drop-shadow-sm">{stats.color_counts[color]}</span>
                    <p className="text-[10px] opacity-75 relative z-10">{colorLabel(color)}</p>
                  </div>
                ))}
              </div>
              <div className="flex rounded-full overflow-hidden h-3">
                {presentColors.map((color) => (
                  <div
                    key={color}
                    style={{ width: `${(stats.color_counts[color] / totalPips) * 100}%`, backgroundColor: PIP_COLORS[color].bg }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-gray-800 rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-300">Collection Mana Curve</h3>
          <div className="flex items-end gap-2" style={{ height: '140px' }}>
            {CMC_BUCKETS.map((cmc, i) => {
              const pct = cmcCounts[i] / maxCmc;
              return (
                <div key={cmc} className="flex-1 flex flex-col items-center h-full justify-end">
                  <span className="text-xs text-gray-400 mb-1">{cmcCounts[i] > 0 ? cmcCounts[i] : ''}</span>
                  <div
                    className="w-full bg-blue-600 rounded-t transition-all duration-300"
                    style={{ height: `${Math.max(pct * 100, cmcCounts[i] > 0 ? 3 : 0)}%` }}
                  />
                  <span className="mt-1 flex items-center justify-center">
                    {cmc === 7 ? <span className="text-xs text-gray-500">7+</span> : <ManaSymbol symbol={String(cmc)} size={16} />}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

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
                <span className="text-sm font-medium text-yellow-400">${(card.price ?? 0).toFixed(2)}</span>
              </div>
            ))}
            {stats.top_valuable.length === 0 && <p className="text-gray-500 text-sm py-4">No price data available</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
