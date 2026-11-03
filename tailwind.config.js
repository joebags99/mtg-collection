/** @type {import('tailwindcss').Config} */
const rgb = (v) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: { 0: rgb('--surface-0'), 1: rgb('--surface-1'), 2: rgb('--surface-2'), 3: rgb('--surface-3') },
        line: { DEFAULT: rgb('--line'), strong: rgb('--line-strong') },
        ink: { DEFAULT: rgb('--ink'), muted: rgb('--ink-muted'), faint: rgb('--ink-faint') },
        accent: { DEFAULT: rgb('--accent'), hi: rgb('--accent-hi'), ink: rgb('--accent-ink') },
        secondary: rgb('--secondary'),
        ok: rgb('--ok'),
        warn: rgb('--warn'),
        danger: rgb('--danger'),
        info: rgb('--info'),
        mana: { w: rgb('--mana-w'), u: rgb('--mana-u'), b: rgb('--mana-b'), r: rgb('--mana-r'), g: rgb('--mana-g'), c: rgb('--mana-c') },
      },
      fontFamily: {
        display: ['var(--font-display)'],
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: { sm: 'var(--r-sm)', DEFAULT: 'var(--r-md)', md: 'var(--r-md)', lg: 'var(--r-lg)', xl: 'var(--r-lg)' },
      transitionTimingFunction: { DEFAULT: 'var(--ease)' },
      transitionDuration: { DEFAULT: 'var(--dur-2)', 1: 'var(--dur-1)', 2: 'var(--dur-2)', 3: 'var(--dur-3)' },
    },
  },
  plugins: [],
};
