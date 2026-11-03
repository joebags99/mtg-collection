import { identityRgb } from '../../lib/colors';

/** A soft glow tinted by a color identity, sitting behind a hero. Decorative only. */
export function AmbientBackground({ colors = [] }: { colors?: readonly string[] }) {
  const rgb = identityRgb(colors).split(' ').join(' ');
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        zIndex: 0,
        background: `radial-gradient(ellipse 60% 120% at 8% 0%, rgb(${rgb} / 0.16), transparent 70%)`,
      }}
    />
  );
}
