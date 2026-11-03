import type { CSSProperties, ReactNode } from 'react';

const ACCENTS: Record<string, string> = {
  blue: 'rgb(var(--info))', green: 'rgb(var(--ok))', red: 'rgb(var(--danger))', purple: 'rgb(var(--secondary))',
  yellow: 'rgb(var(--warn))', gray: 'rgb(var(--ink-faint))', orange: 'rgb(var(--warn))', accent: 'rgb(var(--accent))',
};
const SIZES = { sm: 'text-xs font-medium uppercase tracking-[0.14em]', md: 'text-base font-semibold', lg: 'text-xl font-semibold font-display' } as const;

interface SectionHeaderProps {
  children: ReactNode;
  /** A key from the accent palette, or any CSS color. */
  color?: string;
  size?: keyof typeof SIZES;
  count?: number;
  className?: string;
}

export function SectionHeader({ children, color = 'accent', size = 'md', count, className = '' }: SectionHeaderProps) {
  return (
    <h3
      className={`section-header text-ink ${SIZES[size]} ${className}`}
      style={{ '--accent-color': ACCENTS[color] || color } as CSSProperties}
    >
      {children}
      {count !== undefined && <span className="text-ink-faint font-normal ml-2 num text-sm">{count}</span>}
    </h3>
  );
}

export function TypeSectionHeader({ type, count, className = '' }: { type: string; count: number; className?: string }) {
  const typeClass = `type-${type.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div className={`card-type-section pt-3 pb-2 ${typeClass} ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-ink-muted">{type}</span>
        <span className="text-xs text-ink-faint num">{count}</span>
      </div>
    </div>
  );
}
