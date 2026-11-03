import { getColorGlow } from '../../lib/colors';
import type { Commander, ScoredCommander } from '../../types/api';
import { ColorBadge } from './ColorBadge';
import { MatchBar } from './MatchBar';

/** A commander that may or may not carry collection match data. */
export type CardCommander = Commander & Partial<Pick<ScoredCommander, 'num_decks' | 'total_cards' | 'owned_count' | 'match_percentage' | 'missing_price'>>;

interface Props {
  commander: CardCommander;
  onClick?: (commander: CardCommander) => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleCompare?: (commander: CardCommander) => void;
}

export function CommanderCard({ commander, onClick, selectable, selected, onToggleCompare }: Props) {
  const match = commander.match_percentage;
  const hasMatch = match !== undefined;
  const colorGlow = getColorGlow(commander.color_identity);

  return (
    <div
      className={`rounded-xl cursor-pointer relative transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${selected ? 'ring-2 ring-purple-500' : ''}`}
      style={{
        boxShadow: `0 8px 32px ${colorGlow}, 0 0 0 1px rgba(255,255,255,0.05)`,
        background: 'linear-gradient(145deg, rgba(31, 41, 55, 0.95) 0%, rgba(17, 24, 39, 0.98) 100%)',
      }}
    >
      {selectable && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleCompare?.(commander); }}
          className={`absolute top-2 right-2 z-10 w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all backdrop-blur-sm ${
            selected ? 'bg-purple-500 border-purple-500 text-white scale-110' : 'bg-gray-900/80 border-gray-400 text-gray-400 hover:border-purple-400 hover:scale-105'
          }`}
          title={selected ? 'Remove from comparison' : 'Add to comparison'}
        >
          {selected ? '✓' : '+'}
        </button>
      )}
      <div onClick={() => onClick?.(commander)} className="overflow-hidden rounded-xl">
        {commander.image_uri && (
          <div className="relative">
            <img src={commander.image_uri} alt={commander.name} className="w-full aspect-[5/7] object-cover" loading="lazy" />
            {hasMatch && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/80 to-transparent px-2 pb-2 pt-8">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-300">{commander.owned_count}/{commander.total_cards}</span>
                  <span className={`text-lg font-bold ${match >= 60 ? 'text-green-400' : match >= 40 ? 'text-yellow-400' : 'text-gray-400'}`}>
                    {match}%
                  </span>
                </div>
                <MatchBar percentage={match} />
              </div>
            )}
          </div>
        )}
        <div className="p-3 space-y-1.5">
          <h3 className="font-bold text-sm leading-tight">{commander.name}</h3>
          <div className="flex items-center justify-between">
            <ColorBadge colors={commander.color_identity} />
            {(commander.num_decks ?? 0) > 0 && (
              <span className="text-xs text-gray-500">{commander.num_decks!.toLocaleString()} decks</span>
            )}
          </div>
          {hasMatch && (commander.missing_price ?? 0) > 0 && (
            <div className="bg-gray-900/80 rounded px-2 py-1.5 flex items-center justify-between border border-gray-700/50">
              <span className="text-[10px] text-gray-500 uppercase tracking-wide">To complete</span>
              <span className={`text-sm font-bold ${
                commander.missing_price! < 50 ? 'text-green-400' : commander.missing_price! < 150 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                ${commander.missing_price!.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
