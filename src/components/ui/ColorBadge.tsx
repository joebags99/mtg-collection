import { COLOR_MAP } from '../../lib/colors';
import type { Color } from '../../types/api';

/** Mana pips for a color identity, in WUBRG order. A single gray pip for colorless. */
export function ColorBadge({ colors, size = 'sm' }: { colors?: readonly Color[] | readonly string[]; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-3.5 h-3.5 text-[9px]' : 'w-5 h-5 text-[11px]';
  if (!colors || colors.length === 0) {
    return (
      <span className="inline-flex" title="Colorless">
        <span className={`${dim} rounded-full inline-flex items-center justify-center font-bold text-surface-0`} style={{ backgroundColor: 'rgb(var(--mana-c))' }}>C</span>
      </span>
    );
  }
  return (
    <span className="inline-flex -space-x-0.5">
      {colors.map((c) => {
        const meta = COLOR_MAP[c as Color];
        return (
          <span
            key={c}
            title={meta?.label ?? c}
            className={`${dim} rounded-full inline-flex items-center justify-center font-bold text-surface-0 ring-1 ring-surface-0`}
            style={{ backgroundColor: meta ? `rgb(var(${meta.token}))` : 'rgb(var(--mana-c))' }}
          >
            {c}
          </span>
        );
      })}
    </span>
  );
}
