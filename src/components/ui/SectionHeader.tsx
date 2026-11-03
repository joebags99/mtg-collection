import type { CSSProperties, ReactNode } from 'react';

const ACCENTS: Record<string, string> = {
  blue: '#3b82f6', green: '#22c55e', red: '#ef4444', purple: '#a855f7',
  yellow: '#eab308', gray: '#6b7280', orange: '#f97316',
};
const SIZES = { sm: 'text-sm font-medium', md: 'text-lg font-semibold', lg: 'text-xl font-bold' } as const;

interface SectionHeaderProps {
  children: ReactNode;
  /** A key from the accent palette, or any CSS color. */
  color?: string;
  size?: keyof typeof SIZES;
  count?: number;
  className?: string;
}

export function SectionHeader({ children, color = 'blue', size = 'md', count, className = '' }: SectionHeaderProps) {
  return (
    <h3
      className={`section-header ${SIZES[size]} ${className}`}
      style={{ '--accent-color': ACCENTS[color] || color } as CSSProperties}
    >
      {children}
      {count !== undefined && <span className="text-gray-500 font-normal ml-2">({count})</span>}
    </h3>
  );
}

export function TypeSectionHeader({ type, count, className = '' }: { type: string; count: number; className?: string }) {
  const typeClass = `type-${type.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div className={`card-type-section pt-3 pb-2 ${typeClass} ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-300">{type}</span>
        <span className="text-xs text-gray-500">{count}</span>
      </div>
    </div>
  );
}
