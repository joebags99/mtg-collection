import { COLOR_MAP } from '../../lib/colors';
import type { Color } from '../../types/api';

export function ColorBadge({ colors }: { colors?: readonly Color[] | readonly string[] }) {
  if (!colors || colors.length === 0) {
    return <span className="text-xs bg-gray-600 px-1.5 py-0.5 rounded">C</span>;
  }
  return (
    <span className="inline-flex gap-0.5">
      {colors.map((c) => {
        const meta = COLOR_MAP[c as Color];
        return (
          <span
            key={c}
            className="text-xs px-1.5 py-0.5 rounded font-bold"
            style={{ backgroundColor: meta?.bg, color: meta?.text }}
          >
            {c}
          </span>
        );
      })}
    </span>
  );
}
