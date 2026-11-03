import type { FunctionalCategory } from '../../types/api';
import { planComposition } from './classify';
import {
  CATEGORY_META, DEFAULT_COMPOSITION,
  type BuilderCard, type Composition, type SuggestionMode,
} from './constants';

const MODE_OPTIONS: { value: SuggestionMode; label: string }[] = [
  { value: 'collection', label: 'My Collection' },
  { value: 'cheapest', label: 'Cheapest' },
  { value: 'best', label: 'Best Synergy' },
];

function sliderRange(key: FunctionalCategory): { min: number; max: number } {
  const min = key === 'lands' ? 30 : key === 'synergy' ? 10 : key === 'removal' ? 3 : 5;
  const max = key === 'lands' ? 45 : key === 'synergy' ? 40 : key === 'utility' ? 25 : 20;
  return { min, max };
}

interface CompositionModalProps {
  tempComposition: Composition;
  setTempComposition: (update: (prev: Composition) => Composition) => void;
  categoryCounts: Record<FunctionalCategory, number>;
  suggestionMode: SuggestionMode;
  setSuggestionMode: (mode: SuggestionMode) => void;
  nonCommanderIncluded: BuilderCard[];
  nonCommanderExcluded: BuilderCard[];
  onApply: (targets: Composition) => void;
  onClose: () => void;
}

/** Sliders for per-category targets with a live preview of the resulting swaps. */
export function CompositionModal({
  tempComposition, setTempComposition, categoryCounts, suggestionMode, setSuggestionMode,
  nonCommanderIncluded, nonCommanderExcluded, onApply, onClose,
}: CompositionModalProps) {
  const total = Object.values(tempComposition).reduce((a, b) => a + b, 0);
  const plan = planComposition(tempComposition, categoryCounts, nonCommanderIncluded, nonCommanderExcluded, suggestionMode, CATEGORY_META);
  const previewAdds = [...plan.adds, ...plan.increases];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h3 className="text-xl font-bold text-white mb-4">Deck Composition Targets</h3>
          <div className="flex items-center gap-2 mb-5">
            <span className="text-xs text-gray-400">Prioritize:</span>
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSuggestionMode(opt.value)}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  suggestionMode === opt.value ? 'bg-yellow-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex gap-6">
            <div className="flex-1 min-w-0">
              <div className="space-y-5 mb-6">
                {CATEGORY_META.map(({ key, label }) => {
                  const { min, max } = sliderRange(key);
                  const fill = ((tempComposition[key] - min) / (max - min)) * 100;
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-300 text-sm">{label}</span>
                        <span className="text-xs text-gray-500">{categoryCounts[key]}/{tempComposition[key]}</span>
                      </div>
                      <input
                        type="range"
                        min={min}
                        max={max}
                        value={tempComposition[key]}
                        onChange={(e) => setTempComposition((prev) => ({ ...prev, [key]: parseInt(e.target.value) }))}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                        style={{ background: `linear-gradient(to right, #eab308 0%, #eab308 ${fill}%, #374151 ${fill}%, #374151 100%)` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="bg-gray-900 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">Total allocated:</span>
                  <span className={`font-bold ${total === 99 ? 'text-green-400' : total > 99 ? 'text-red-400' : 'text-yellow-400'}`}>
                    {total}/99
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">(commander is card #100)</p>
              </div>
            </div>
            <div className="w-64 flex-shrink-0">
              <h4 className="text-xs font-semibold text-gray-400 mb-3">Preview Changes</h4>
              {plan.removals.length === 0 && previewAdds.length === 0 ? (
                <p className="text-xs text-gray-600 italic">Adjust sliders to see changes</p>
              ) : (
                <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                  {plan.removals.map((r, i) => (
                    <div key={`r-${i}`} className="flex items-center gap-1.5 text-xs">
                      <span className="text-red-400 flex-shrink-0">−</span>
                      <span className="text-red-400 truncate">{r.qty > 1 ? `${r.qty}x ` : ''}{r.name}</span>
                      <span className="text-gray-600 text-[10px] flex-shrink-0">({r.category})</span>
                    </div>
                  ))}
                  {plan.removals.length > 0 && previewAdds.length > 0 && <div className="border-t border-gray-700/50 my-1" />}
                  {previewAdds.map((a, i) => (
                    <div key={`a-${i}`} className="flex items-center gap-1.5 text-xs">
                      <span className="text-green-400 flex-shrink-0">+</span>
                      <span className="text-green-400 truncate">{a.qty > 1 ? `${a.qty}x ` : ''}{a.name}</span>
                      <span className="text-gray-600 text-[10px] flex-shrink-0">({a.category})</span>
                      {a.owned && <span className="text-[9px] text-blue-400 bg-blue-400/10 px-1 rounded flex-shrink-0">owned</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between pt-4 mt-4 border-t border-gray-700">
            <button onClick={() => setTempComposition(() => DEFAULT_COMPOSITION)} className="text-sm text-gray-400 hover:text-white transition-colors">
              Reset to Defaults
            </button>
            <div className="flex gap-3">
              <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={() => onApply(tempComposition)} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded font-medium transition-colors">
                Apply
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
