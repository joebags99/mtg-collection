import type { Color } from '../types/api';

export const COLOR_MAP: Record<Color, { label: string; bg: string; text: string; symbol: string }> = {
  W: { label: 'White', bg: '#f9faf4', text: '#333', symbol: '☀' },
  U: { label: 'Blue', bg: '#0e68ab', text: '#fff', symbol: '💧' },
  B: { label: 'Black', bg: '#2b2b2b', text: '#ccc', symbol: '💀' },
  R: { label: 'Red', bg: '#d32029', text: '#fff', symbol: '🔥' },
  G: { label: 'Green', bg: '#00733e', text: '#fff', symbol: '🌲' },
};

export const ALL_COLORS: Color[] = ['W', 'U', 'B', 'R', 'G'];

const GLOW_RGB: Record<string, [number, number, number]> = {
  W: [249, 250, 244],
  U: [14, 104, 171],
  B: [100, 80, 120],
  R: [211, 32, 41],
  G: [0, 115, 62],
};
const FALLBACK: [number, number, number] = [128, 128, 128];

/** A translucent glow color for a color identity: the single color, or the average of several. */
export function getColorGlow(colors: readonly string[] | undefined): string {
  if (!colors || colors.length === 0) return 'rgba(128,128,128,0.3)';
  const sum = [0, 0, 0];
  colors.forEach((col) => {
    const c = GLOW_RGB[col] || FALLBACK;
    sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2];
  });
  const n = colors.length;
  return `rgba(${Math.round(sum[0] / n)},${Math.round(sum[1] / n)},${Math.round(sum[2] / n)},0.4)`;
}

/** Hex colors for ambient backgrounds (B is lifted so it reads on a dark page). */
export const AMBIENT_HEX: Record<string, string> = {
  W: '#f9faf4',
  U: '#0e68ab',
  B: '#6b5080',
  R: '#d32029',
  G: '#00733e',
};
