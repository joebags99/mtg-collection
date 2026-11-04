import type { CSSProperties } from 'react';
import { identityAccentStyle } from '../../lib/colors';
import type { Commander, ScoredCommander } from '../../types/api';
import { ColorBadge } from './ColorBadge';
import { MatchBar } from './MatchBar';

/** A commander that may or may not carry collection match data. */
export type CardCommander = Commander & Partial<Pick<ScoredCommander, 'num_decks' | 'total_cards' | 'owned_count' | 'match_percentage' | 'missing_price' | 'tags' | 'partner'>>;

interface Props {
  commander: CardCommander;
  onClick?: (commander: CardCommander) => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleCompare?: (commander: CardCommander) => void;
}

/** Card art with a foil sheen on hover, the name in the display face, and match data when present. */
export function CommanderCard({ commander, onClick, selectable, selected, onToggleCompare }: Props) {
  const match = commander.match_percentage;
  const hasMatch = match !== undefined;
  const price = commander.missing_price ?? 0;

  return (
    <div
      className={`group rounded-lg relative bg-surface-2 border transition-all duration-2 hover:-translate-y-0.5 ${
        selected ? 'border-secondary ring-1 ring-secondary/50' : 'border-line hover:border-[rgb(var(--accent)/0.6)]'
      }`}
      style={identityAccentStyle(commander.color_identity) as CSSProperties}
    >
      {selectable && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleCompare?.(commander); }}
          className={`absolute top-2 right-2 z-10 w-7 h-7 rounded-full border flex items-center justify-center text-xs font-bold transition-all duration-1 backdrop-blur-sm ${
            selected ? 'bg-secondary border-secondary text-surface-0' : 'bg-surface-0/70 border-line-strong text-ink-muted opacity-0 group-hover:opacity-100 hover:border-secondary hover:text-secondary'
          }`}
          title={selected ? 'Remove from comparison' : 'Add to comparison'}
        >
          {selected ? '✓' : '+'}
        </button>
      )}
      <div onClick={() => onClick?.(commander)} className="cursor-pointer overflow-hidden rounded-lg">
        {commander.image_uri && (
          <div className="relative foil bg-surface-3">
            <img src={commander.image_uri} alt={commander.name} className="w-full aspect-[5/7] object-cover" loading="lazy" />
            {hasMatch && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-surface-0/95 via-surface-0/70 to-transparent px-3 pb-2.5 pt-10">
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-[11px] text-ink-muted num">{commander.owned_count}/{commander.total_cards}</span>
                  <span className={`text-xl font-display font-semibold ${match >= 60 ? 'text-ok' : match >= 40 ? 'text-warn' : 'text-ink-muted'}`}>
                    {match}%
                  </span>
                </div>
                <MatchBar percentage={match} />
              </div>
            )}
          </div>
        )}
        <div className="p-3 space-y-2">
          <h3 className="font-display font-semibold text-[15px] leading-snug text-ink">{commander.name}</h3>
          {commander.partner && (
            <p className="text-[11px] text-secondary leading-tight">with {commander.partner}</p>
          )}
          <div className="flex items-center justify-between">
            <ColorBadge colors={commander.color_identity} />
            {(commander.num_decks ?? 0) > 0 && (
              <span className="text-[11px] text-ink-faint num">{commander.num_decks!.toLocaleString()} decks</span>
            )}
          </div>
          {commander.tags && commander.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {commander.tags.slice(0, 3).map((t) => (
                <span key={t.slug} className="text-[10px] text-ink-muted border border-line rounded-sm px-1.5 py-px leading-tight">{t.name}</span>
              ))}
            </div>
          )}
          {hasMatch && price > 0 && (
            <div className="flex items-center justify-between border-t border-line pt-2">
              <span className="text-[10px] text-ink-faint uppercase tracking-[0.14em]">To complete</span>
              <span className={`text-sm num ${price < 50 ? 'text-ok' : price < 150 ? 'text-warn' : 'text-danger'}`}>
                ${price.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
