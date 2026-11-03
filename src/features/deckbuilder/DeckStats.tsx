import { ManaSymbol } from '../../components/ui';
import { ALL_COLORS } from '../../lib/colors';
import type { Color } from '../../types/api';
import type { BuilderCard } from './constants';

const TYPE_ORDER = ['Creature', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Planeswalker', 'Land', 'Other'];
const TYPE_COLORS: Record<string, string> = {
  Creature: 'bg-green-600', Instant: 'bg-blue-500', Sorcery: 'bg-red-500',
  Enchantment: 'bg-purple-500', Artifact: 'bg-yellow-600', Planeswalker: 'bg-orange-500',
  Land: 'bg-amber-800', Other: 'bg-gray-500',
};
const PIP_COLORS: Record<Color, { bg: string; text: string }> = {
  W: { bg: '#f9faf4', text: '#333' },
  U: { bg: '#0e68ab', text: '#fff' },
  B: { bg: '#2b2b2b', text: '#ccc' },
  R: { bg: '#d32029', text: '#fff' },
  G: { bg: '#00733e', text: '#fff' },
};

/** Average mana value, type breakdown, and color pip distribution. */
export function DeckStats({ cards }: { cards: BuilderCard[] }) {
  const typeCounts: Record<string, number> = {};
  let totalCards = 0;
  let totalCmc = 0;
  let nonLandCount = 0;
  const pipCounts: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };

  for (const card of cards) {
    const qty = card.qty || 1;
    const type = card.card_type || 'Other';
    typeCounts[type] = (typeCounts[type] || 0) + qty;
    totalCards += qty;

    if (type.toLowerCase() !== 'land') {
      totalCmc += (card.cmc || 0) * qty;
      nonLandCount += qty;
    }

    const cost = card.mana_cost || '';
    for (const color of ALL_COLORS) {
      const matches = cost.match(new RegExp(`\\{[^}]*${color}[^}]*\\}`, 'g'));
      if (matches) pipCounts[color] += matches.length * qty;
    }
  }

  const avgCmc = nonLandCount > 0 ? (totalCmc / nonLandCount).toFixed(2) : '0.00';
  const totalPips = Object.values(pipCounts).reduce((a, b) => a + b, 0);
  const sortedTypes = TYPE_ORDER.filter((t) => typeCounts[t] > 0);

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-4">
      <h4 className="text-sm font-semibold text-gray-300">Deck Statistics</h4>

      <div className="text-center">
        <span className="text-3xl font-bold text-blue-400">{avgCmc}</span>
        <p className="text-xs text-gray-500 mt-0.5">Avg. Mana Value</p>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-gray-400 font-medium">Card Types</p>
        {sortedTypes.map((type) => (
          <div key={type} className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-24 truncate">{type}</span>
            <div className="flex-1 bg-gray-700 rounded-full h-2">
              <div
                className={`${TYPE_COLORS[type] || 'bg-gray-500'} h-2 rounded-full transition-all duration-300`}
                style={{ width: `${(typeCounts[type] / totalCards) * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 w-6 text-right">{typeCounts[type]}</span>
          </div>
        ))}
      </div>

      {totalPips > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-gray-400 font-medium">Color Pips ({totalPips})</p>
          <div className="flex gap-1">
            {ALL_COLORS.filter((c) => pipCounts[c] > 0).map((color) => (
              <div
                key={color}
                className="flex-1 rounded-md py-3 flex items-center justify-center relative"
                style={{ backgroundColor: PIP_COLORS[color].bg, color: PIP_COLORS[color].text, flex: pipCounts[color], minWidth: '36px' }}
              >
                <div className="absolute opacity-15 pointer-events-none" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                  <ManaSymbol symbol={color} size={56} />
                </div>
                <span className="text-lg font-bold relative z-10 drop-shadow-sm">{pipCounts[color]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
