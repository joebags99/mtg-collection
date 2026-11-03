import { useState, type MouseEvent } from 'react';

export interface FavoriteProps {
  favorites?: Set<string>;
  onToggleFavorite?: (name: string) => void;
}

interface CardNameProps extends FavoriteProps {
  name: string;
  className?: string;
}

/** A card name with a Scryfall image preview on hover and an optional favorite star. */
export function CardName({ name, className = '', favorites, onToggleFavorite }: CardNameProps) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const imgSrc = `https://api.scryfall.com/cards/named?format=image&version=normal&exact=${encodeURIComponent(name)}`;
  const isFav = favorites?.has(name.toLowerCase()) ?? false;

  const handleMouseEnter = (e: MouseEvent<HTMLSpanElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    let x = rect.right + 8;
    let y = rect.top;
    if (x + 250 > window.innerWidth) x = rect.left - 258;
    if (y + 350 > window.innerHeight) y = window.innerHeight - 360;
    if (y < 8) y = 8;
    setPos({ x, y });
    setShow(true);
  };

  return (
    <span
      className={`inline-flex items-center gap-1 cursor-pointer hover:text-blue-400 transition-colors ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShow(false)}
    >
      {name}
      {onToggleFavorite && (
        <button
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggleFavorite(name); }}
          className={`text-xs leading-none transition-colors flex-shrink-0 ${isFav ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400'}`}
          title={isFav ? 'Remove from favorites' : 'Add to favorites'}
        >
          {isFav ? '★' : '☆'}
        </button>
      )}
      {show && (
        <div className="fixed z-50 pointer-events-none" style={{ left: pos.x, top: pos.y }}>
          <img src={imgSrc} alt={name} className="w-[250px] rounded-lg shadow-2xl border border-gray-700" />
        </div>
      )}
    </span>
  );
}
