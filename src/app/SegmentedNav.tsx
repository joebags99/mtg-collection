import { NavLink } from 'react-router-dom';

export interface Segment {
  to: string;
  label: string;
  badge?: string;
  end?: boolean;
}

/** A row of sub-navigation links under a surface title. */
export function SegmentedNav({ segments }: { segments: Segment[] }) {
  return (
    <nav className="inline-flex gap-1 p-1 rounded-lg bg-surface-1 border border-line mb-6">
      {segments.map((s) => (
        <NavLink
          key={s.to}
          to={s.to}
          end={s.end}
          className={({ isActive }) =>
            `px-3.5 py-1.5 rounded text-sm transition-colors duration-1 flex items-center gap-2 ${
              isActive ? 'bg-surface-3 text-ink' : 'text-ink-muted hover:text-ink'
            }`
          }
        >
          {s.label}
          {s.badge && <span className="text-[10px] num text-accent">{s.badge}</span>}
        </NavLink>
      ))}
    </nav>
  );
}
