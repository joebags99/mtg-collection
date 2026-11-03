import { ColorBadge } from '../../components/ui';
import { ALL_COLORS } from '../../lib/colors';
import type { Color } from '../../types/api';
import type { BuilderCard } from './constants';

const TYPE_ORDER = ['Creature', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Planeswalker', 'Land', 'Other'];
const TYPE_COLORS: Record<string, string> = {
  Creature: 'bg-ok', Instant: 'bg-accent text-accent-ink', Sorcery: 'bg-danger',
  Enchantment: 'bg-secondary text-surface-0', Artifact: 'bg-warn', Planeswalker: 'bg-warn',
  Land: 'bg-warn/70', Other: 'bg-ink-faint',
};
const PIP_COLORS: Record<Color, { bg: string; text: string }> = {
  W: { bg: 'rgb(var(--mana-w))', text: 'rgb(var(--surface-0))' },
  U: { bg: 'rgb(var(--mana-u))', text: 'rgb(var(--surface-0))' },
  B: { bg: 'rgb(var(--mana-b))', text: 'rgb(var(--surface-0))' },
  R: { bg: 'rgb(var(--mana-r))', text: 'rgb(var(--surface-0))' },
  G: { bg: 'rgb(var(--mana-g))', text: 'rgb(var(--surface-0))' },
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
    <div className="bg-surface-2 rounded-lg p-4 space-y-4">
      <h4 className="text-sm font-semibold text-ink">Deck Statistics</h4>

      <div className="text-center">
        <span className="text-3xl font-bold text-accent">{avgCmc}</span>
        <p className="text-xs text-ink-faint mt-0.5">Avg. Mana Value</p>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-ink-muted font-medium">Card Types</p>
        {sortedTypes.map((type) => (
          <div key={type} className="flex items-center gap-2">
            <span className="text-xs text-ink-muted w-24 truncate">{type}</span>
            <div className="flex-1 bg-surface-3 rounded-full h-2">
              <div
                className={`${TYPE_COLORS[type] || 'bg-ink-faint'} h-2 rounded-full transition-all duration-300`}
                style={{ width: `${(typeCounts[type] / totalCards) * 100}%` }}
              />
            </div>
            <span className="text-xs text-ink-muted w-6 text-right">{typeCounts[type]}</span>
          </div>
        ))}
      </div>

      {totalPips > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-ink-muted font-medium">Color Pips ({totalPips})</p>
          <div className="flex rounded-full overflow-hidden h-2 bg-surface-0/60">
            {ALL_COLORS.filter((c) => pipCounts[c] > 0).map((color) => (
              <div
                key={color}
                style={{ width: `${(pipCounts[color] / totalPips) * 100}%`, backgroundColor: PIP_COLORS[color].bg }}
                title={`${color}: ${pipCounts[color]}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
            {ALL_COLORS.filter((c) => pipCounts[c] > 0).map((color) => (
              <span key={color} className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                <ColorBadge colors={[color]} />
                <span className="num text-ink">{pipCounts[color]}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
