import { useMemo } from 'react';
import { AMBIENT_HEX } from '../../lib/colors';

/** Floating orbs and particles tinted by a color identity. Purely decorative. */
export function AmbientBackground({ colors = [] }: { colors?: readonly string[] }) {
  const activeColors = colors.length > 0
    ? colors.map((c) => AMBIENT_HEX[c] || '#3b82f6')
    : ['#3b82f6', '#8b5cf6'];

  const particles = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
    id: i,
    color: activeColors[i % activeColors.length],
    size: 3 + Math.random() * 6,
    left: Math.random() * 100,
    delay: Math.random() * 25,
    duration: 20 + Math.random() * 15,
  })), [activeColors.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const orbs = activeColors.slice(0, 2).map((color, i) => ({
    color,
    size: 250 + i * 100,
    left: i === 0 ? '5%' : '75%',
    top: i === 0 ? '10%' : '50%',
    delay: i * 5,
  }));

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {orbs.map((orb, i) => (
        <div
          key={`orb-${i}`}
          className="ambient-orb"
          style={{
            width: orb.size, height: orb.size, left: orb.left, top: orb.top,
            background: `radial-gradient(circle, ${orb.color}30 0%, transparent 70%)`,
            animationDelay: `${orb.delay}s`,
          }}
        />
      ))}
      {particles.map((p) => (
        <div
          key={`particle-${p.id}`}
          className="mana-particle"
          style={{
            width: p.size, height: p.size, left: `${p.left}%`, backgroundColor: p.color,
            boxShadow: `0 0 ${p.size}px ${p.color}80`,
            animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
