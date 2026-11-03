import type { CSSProperties, ReactNode } from 'react';
import { identityAccentStyle } from '../../lib/colors';
import type { Commander } from '../../types/api';
import { AmbientBackground } from './AmbientBackground';

export interface HeroStat {
  label: string;
  value: ReactNode;
}

interface PageHeroProps {
  title: string;
  subtitle?: ReactNode;
  commanders?: Commander[];
  stats?: HeroStat[];
  children?: ReactNode;
  colorIdentity?: readonly string[];
}

/** Page title in the display face with an accent rule, optional stat tiles, and an identity-tinted glow. */
export function PageHero({ title, subtitle, commanders = [], stats = [], children, colorIdentity = [] }: PageHeroProps) {
  const colors = colorIdentity.length > 0 ? colorIdentity : (commanders[0]?.color_identity ?? []);
  const accent = colors.length > 0 ? (identityAccentStyle(colors) as CSSProperties) : undefined;

  return (
    <div className="relative mb-8" style={{ zIndex: 1, ...accent }}>
      <AmbientBackground colors={colors} />
      <div className="relative flex items-end justify-between gap-6 mb-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-4xl font-semibold rule-accent inline-block">{title}</h1>
          {subtitle && <p className="text-ink-muted mt-3 max-w-2xl text-sm leading-relaxed">{subtitle}</p>}
        </div>
        {stats.length > 0 && (
          <div className="flex gap-px rounded-lg overflow-hidden border border-line bg-line">
            {stats.map((stat, i) => (
              <div key={i} className="bg-surface-1 px-4 py-2 min-w-[88px]">
                <div className="text-lg font-medium text-ink num leading-tight">{stat.value}</div>
                <div className="text-[10px] text-ink-faint uppercase tracking-[0.14em] mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
