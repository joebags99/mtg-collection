export function MatchBar({ percentage, size = 'sm' }: { percentage: number; size?: 'sm' | 'md' }) {
  const color =
    percentage >= 60 ? 'bg-green-500' :
    percentage >= 40 ? 'bg-yellow-500' :
    percentage >= 20 ? 'bg-orange-500' : 'bg-red-500';
  const h = size === 'sm' ? 'h-1.5' : 'h-2.5';
  return (
    <div className={`w-full bg-gray-700 rounded-full ${h}`}>
      <div className={`${color} ${h} rounded-full transition-all duration-500`} style={{ width: `${Math.min(percentage, 100)}%` }} />
    </div>
  );
}
