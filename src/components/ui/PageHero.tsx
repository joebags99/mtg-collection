import type { CSSProperties, ReactNode } from 'react';
import { getColorGlow } from '../../lib/colors';
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

export function PageHero({ title, subtitle, commanders = [], stats = [], children, colorIdentity = [] }: PageHeroProps) {
  const colors = colorIdentity.length > 0 ? colorIdentity : (commanders[0]?.color_identity ?? []);
  const glowColor = colors.length > 0 ? getColorGlow(colors) : 'rgba(59, 130, 246, 0.6)';

  return (
    <div className="relative mb-8 overflow-hidden" style={{ zIndex: 1 }}>
      <AmbientBackground colors={colors} />
      <div className="flex items-start justify-between gap-6 mb-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1
            className="text-3xl font-black tracking-tight glow-underline inline-block pb-2"
            style={{ '--glow-color': glowColor } as CSSProperties}
          >
            {title}
          </h1>
          {subtitle && <p className="text-gray-400 mt-2 max-w-2xl text-sm leading-relaxed">{subtitle}</p>}
        </div>
        {stats.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {stats.map((stat, i) => (
              <div key={i} className="glass-panel rounded-xl px-4 py-2 text-center min-w-[80px]">
                <div className="text-lg font-bold text-white">{stat.value}</div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider">{stat.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
