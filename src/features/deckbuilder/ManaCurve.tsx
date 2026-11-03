import { ManaSymbol } from '../../components/ui';
import type { BuilderCard } from './constants';

const BUCKETS = [0, 1, 2, 3, 4, 5, 6, 7];

/** Mana value histogram of non-land cards, split creature vs non-creature. */
export function ManaCurve({ cards }: { cards: BuilderCard[] }) {
  const counts = BUCKETS.map(() => ({ total: 0, creature: 0, nonCreature: 0 }));

  for (const card of cards) {
    const type = (card.card_type || '').toLowerCase();
    if (type === 'land') continue;
    const idx = Math.min(Math.floor(card.cmc || 0), 7);
    const qty = card.qty || 1;
    counts[idx].total += qty;
    if (type === 'creature') counts[idx].creature += qty;
    else counts[idx].nonCreature += qty;
  }

  const maxCount = Math.max(...counts.map((c) => c.total), 1);

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h4 className="text-sm font-semibold text-gray-300 mb-3">Mana Curve</h4>
      <div className="flex items-end gap-1.5" style={{ height: '120px' }}>
        {BUCKETS.map((cmc, i) => {
          const pct = counts[i].total / maxCount;
          const creaturePct = counts[i].total > 0 ? counts[i].creature / counts[i].total : 0;
          return (
            <div key={cmc} className="flex-1 flex flex-col items-center h-full justify-end">
              <span className="text-xs text-gray-400 mb-1">{counts[i].total > 0 ? counts[i].total : ''}</span>
              <div
                className="w-full rounded-t relative overflow-hidden transition-all duration-300"
                style={{ height: `${Math.max(pct * 100, counts[i].total > 0 ? 4 : 0)}%`, minHeight: counts[i].total > 0 ? '4px' : '0' }}
              >
                <div className="absolute bottom-0 w-full bg-blue-500" style={{ height: `${creaturePct * 100}%` }} />
                <div className="absolute top-0 w-full bg-blue-800" style={{ height: `${(1 - creaturePct) * 100}%` }} />
              </div>
              <span className="mt-1 flex items-center justify-center">
                {cmc === 7 ? <span className="text-xs text-gray-500">7+</span> : <ManaSymbol symbol={String(cmc)} size={16} />}
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
