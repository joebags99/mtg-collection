import { useState, type MouseEvent } from 'react';
import type { BuilderCard } from './constants';

const STRIP_HEIGHT = 32;

export function DeckCardImage({ name, small }: { name: string; small?: boolean }) {
  const src = `https://api.scryfall.com/cards/named?format=image&version=${small ? 'small' : 'normal'}&exact=${encodeURIComponent(name)}`;
  return <img src={src} alt={name} className="rounded-lg shadow-lg" loading="lazy" />;
}

interface StackCardProps {
  card: BuilderCard;
  index: number;
  isLast: boolean;
  canMultiple: boolean;
  onToggle: (name: string) => void;
  onSetQty: (name: string, qty: number) => void;
}

/** One strip in the stacked view; shows the full card image on hover. */
export function StackCard({ card, index, isLast, canMultiple, onSetQty }: StackCardProps) {
  const [hovered, setHovered] = useState(false);
  const [imgPos, setImgPos] = useState({ x: 0, y: 0 });
  const imgSrc = `https://api.scryfall.com/cards/named?format=image&version=normal&exact=${encodeURIComponent(card.name)}`;

  const handleMouseEnter = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    let x = rect.right + 8;
    let y = rect.top;
    if (x + 260 > viewportW) x = rect.left - 268;
    if (y + 370 > viewportH) y = viewportH - 380;
    if (y < 8) y = 8;
    setImgPos({ x, y });
    setHovered(true);
  };

  const inDecks = card.qty_in_decks || 0;
  return (
    <div
      className="relative group"
      style={{
        height: isLast ? 'auto' : `${STRIP_HEIGHT}px`,
        overflow: isLast ? 'visible' : 'hidden',
        zIndex: hovered ? 100 : index,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={`flex items-center gap-1 px-1.5 cursor-pointer rounded-t border border-line ${
          hovered ? 'bg-surface-3 border-accent' : 'bg-surface-2'
        }`}
        style={{ height: `${STRIP_HEIGHT}px` }}
      >
        <span className="text-xs text-ink-faint w-4 text-center flex-shrink-0">{card.qty}</span>
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          !card.owned ? 'bg-danger' :
          inDecks >= (card.qty_owned || 1) ? 'bg-ink-faint' :
          inDecks > 0 ? 'bg-warn' :
          'bg-ok'
        }`} title={
          !card.owned ? 'Need to buy' :
          inDecks > 0 ? `In ${(card.in_decks || []).map((d) => d.name).join(', ')}` :
          'Owned'
        } />
        <span className="text-xs truncate flex-1">{card.name}</span>
        {!card.owned && (card.price ?? 0) > 0 && (
          <span className="text-[10px] text-warn flex-shrink-0">${card.price!.toFixed(2)}</span>
        )}
        {canMultiple && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); onSetQty(card.name, card.qty - 1); }}
              className="w-4 h-4 rounded bg-surface-3 hover:bg-ink-faint text-[10px] flex items-center justify-center"
            >-</button>
            <button
              onClick={(e) => { e.stopPropagation(); onSetQty(card.name, card.qty + 1); }}
              className="w-4 h-4 rounded bg-surface-3 hover:bg-ink-faint text-[10px] flex items-center justify-center"
            >+</button>
          </div>
        )}
      </div>

      {hovered && (
        <div className="fixed z-[200] pointer-events-none" style={{ left: imgPos.x, top: imgPos.y }}>
          <img src={imgSrc} alt={card.name} className="w-[250px] rounded-lg shadow-2xl border border-line-strong" />
        </div>
      )}
    </div>
  );
}
