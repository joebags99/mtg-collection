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
  const previewAdds = plan.adds;

  return (
    <div className="fixed inset-0 bg-surface-0/70 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-2 rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h3 className="text-xl font-bold text-ink mb-4">Deck Composition Targets</h3>
          <div className="flex items-center gap-2 mb-5">
            <span className="text-xs text-ink-muted">Prioritize:</span>
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSuggestionMode(opt.value)}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  suggestionMode === opt.value ? 'bg-warn text-ink' : 'bg-surface-3 text-ink-muted hover:text-ink'
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
                        <span className="text-ink text-sm">{label}</span>
                        <span className="text-xs text-ink-faint">{categoryCounts[key]}/{tempComposition[key]}</span>
                      </div>
                      <input
                        type="range"
                        min={min}
                        max={max}
                        value={tempComposition[key]}
                        onChange={(e) => setTempComposition((prev) => ({ ...prev, [key]: parseInt(e.target.value) }))}
                        className="w-full h-2 bg-surface-3 rounded-lg appearance-none cursor-pointer"
                        style={{ background: `linear-gradient(to right, rgb(var(--accent)) 0%, rgb(var(--accent)) ${fill}%, rgb(var(--line-strong)) ${fill}%, rgb(var(--line-strong)) 100%)` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="bg-surface-1 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted text-sm">Total allocated:</span>
                  <span className={`font-bold ${total === 99 ? 'text-ok' : total > 99 ? 'text-danger' : 'text-warn'}`}>
                    {total}/99
                  </span>
                </div>
                <p className="text-xs text-ink-faint mt-1">(commander is card #100)</p>
              </div>
            </div>
            <div className="w-64 flex-shrink-0">
              <h4 className="text-xs font-semibold text-ink-muted mb-3">Preview Changes</h4>
              {plan.removals.length === 0 && previewAdds.length === 0 ? (
                <p className="text-xs text-ink-faint italic">Adjust sliders to see changes</p>
              ) : (
                <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                  {plan.removals.map((r, i) => (
                    <div key={`r-${i}`} className="flex items-center gap-1.5 text-xs">
                      <span className="text-danger flex-shrink-0">−</span>
                      <span className="text-danger truncate">{r.qty > 1 ? `${r.qty}x ` : ''}{r.name}</span>
                      <span className="text-ink-faint text-[10px] flex-shrink-0">({r.category})</span>
                    </div>
                  ))}
                  {plan.removals.length > 0 && previewAdds.length > 0 && <div className="border-t border-line my-1" />}
                  {previewAdds.map((a, i) => (
                    <div key={`a-${i}`} className="flex items-center gap-1.5 text-xs">
                      <span className="text-ok flex-shrink-0">+</span>
                      <span className="text-ok truncate">{a.qty > 1 ? `${a.qty}x ` : ''}{a.name}</span>
                      <span className="text-ink-faint text-[10px] flex-shrink-0">({a.category})</span>
                      {a.owned && <span className="text-[9px] text-accent bg-accent/10 px-1 rounded flex-shrink-0">owned</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between pt-4 mt-4 border-t border-line">
            <button onClick={() => setTempComposition(() => DEFAULT_COMPOSITION)} className="text-sm text-ink-muted hover:text-ink transition-colors">
              Reset to Defaults
            </button>
            <div className="flex gap-3">
              <button onClick={onClose} className="px-4 py-2 text-ink-muted hover:text-ink transition-colors">Cancel</button>
              <button onClick={() => onApply(tempComposition)} className="px-4 py-2 bg-warn hover:bg-warn text-ink rounded font-medium transition-colors">
                Apply
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
