export function MatchBar({ percentage, size = 'sm' }: { percentage: number; size?: 'sm' | 'md' }) {
  const color =
    percentage >= 60 ? 'bg-ok' :
    percentage >= 40 ? 'bg-warn' :
    percentage >= 20 ? 'bg-warn/60' : 'bg-danger';
  const h = size === 'sm' ? 'h-1' : 'h-2';
  return (
    <div className={`w-full bg-surface-0/60 rounded-full ${h}`}>
      <div className={`${color} ${h} rounded-full transition-all duration-3`} style={{ width: `${Math.min(percentage, 100)}%` }} />
    </div>
  );
}
