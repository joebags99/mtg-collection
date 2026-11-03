import { useState, type MouseEvent } from 'react';
import type { DeckUsage } from '../../types/api';

interface AvailCard {
  qty_owned?: number;
  qty_in_decks?: number;
  in_decks?: DeckUsage[];
}

/** A colored dot: red not owned, green free, yellow partly in decks, gray fully committed. */
export function AvailDot({ card }: { card: AvailCard }) {
  const owned = card.qty_owned || 0;
  const inDecks = card.qty_in_decks || 0;
  const deckNames = (card.in_decks || []).map((d) => d.name).join(', ');

  if (owned === 0) return <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="Not owned" />;
  if (inDecks === 0) return <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" title={`Owned: ${owned}`} />;
  if (owned > inDecks) {
    return <span className="w-2 h-2 rounded-full bg-yellow-500 flex-shrink-0" title={`Owned: ${owned}, In decks: ${inDecks} (${deckNames})`} />;
  }
  return <span className="w-2 h-2 rounded-full bg-gray-500 flex-shrink-0" title={`All ${owned} in decks (${deckNames})`} />;
}

/** A compact "In N decks" badge that lists the decks on hover. */
export function DeckBadges({ inDecks }: { inDecks?: DeckUsage[] }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  if (!inDecks || inDecks.length === 0) return null;

  const handleMouseEnter = (e: MouseEvent<HTMLSpanElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    let x = rect.left;
    let y = rect.bottom + 4;
    if (x + 200 > window.innerWidth) x = window.innerWidth - 210;
    if (y + 100 > window.innerHeight) y = rect.top - 104;
    setTooltipPos({ x, y });
    setShowTooltip(true);
  };

  const plural = inDecks.length > 1 ? 's' : '';
  return (
    <span className="relative inline-flex items-center ml-1 cursor-default" onMouseEnter={handleMouseEnter} onMouseLeave={() => setShowTooltip(false)}>
      <span className="text-[10px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">
        <span className="text-purple-400">In {inDecks.length} Deck{plural}</span>
      </span>
      {showTooltip && (
        <div className="fixed z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl p-2 space-y-1 min-w-[140px]" style={{ left: tooltipPos.x, top: tooltipPos.y }}>
          <p className="text-[10px] text-gray-500 font-medium mb-1">In {inDecks.length} deck{plural}:</p>
          {inDecks.map((d) => <p key={d.id} className="text-xs text-gray-300 truncate">{d.name}</p>)}
        </div>
      )}
    </span>
  );
}
