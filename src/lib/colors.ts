import type { Color } from '../types/api';

const onMana = 'rgb(var(--surface-0))';

/** Per-color metadata. `bg`/`text` are CSS color strings for inline styles; `token` is the CSS variable. */
export const COLOR_MAP: Record<Color, { label: string; token: string; bg: string; text: string }> = {
  W: { label: 'White', token: '--mana-w', bg: 'rgb(var(--mana-w))', text: onMana },
  U: { label: 'Blue', token: '--mana-u', bg: 'rgb(var(--mana-u))', text: onMana },
  B: { label: 'Black', token: '--mana-b', bg: 'rgb(var(--mana-b))', text: onMana },
  R: { label: 'Red', token: '--mana-r', bg: 'rgb(var(--mana-r))', text: onMana },
  G: { label: 'Green', token: '--mana-g', bg: 'rgb(var(--mana-g))', text: onMana },
};

export const ALL_COLORS: Color[] = ['W', 'U', 'B', 'R', 'G'];

const MANA_RGB: Record<string, [number, number, number]> = {
  W: [233, 227, 201],
  U: [79, 143, 214],
  B: [169, 139, 200],
  R: [224, 90, 79],
  G: [95, 174, 115],
};
const GILT: [number, number, number] = [212, 179, 106];

/** RGB triplet (as "r g b") for a color identity: the single color, or the average of several. Gilt for colorless. */
export function identityRgb(colors: readonly string[] | undefined): string {
  if (!colors || colors.length === 0) return GILT.join(' ');
  const sum = [0, 0, 0];
  colors.forEach((col) => {
    const c = MANA_RGB[col] || GILT;
    sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2];
  });
  const n = colors.length;
  return `${Math.round(sum[0] / n)} ${Math.round(sum[1] / n)} ${Math.round(sum[2] / n)}`;
}

/** A translucent glow color for a color identity. */
export function getColorGlow(colors: readonly string[] | undefined): string {
  if (!colors || colors.length === 0) return 'rgba(128,128,128,0.3)';
  return `rgba(${identityRgb(colors).split(' ').join(',')},0.4)`;
}

/** Inline style that re-points the accent tokens at a commander's identity. Spread onto a wrapper. */
export function identityAccentStyle(colors: readonly string[] | undefined): Record<string, string> {
  const rgb = identityRgb(colors);
  const [r, g, b] = rgb.split(' ').map(Number);
  const hi = [r, g, b].map((v) => Math.min(255, Math.round(v + (255 - v) * 0.25))).join(' ');
  return { '--accent': rgb, '--accent-hi': hi };
}
