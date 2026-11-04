interface Props {
  value: number;
  onChange: (value: number) => void;
}

const OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Any' },
  { value: 1, label: '1 or more' },
  { value: 2, label: '2 or more' },
  { value: 3, label: '3 or more' },
  { value: 4, label: '4 or more' },
  { value: 5, label: 'All five' },
];

/** "At least N colors" without caring which ones. */
export function ColorCountSelect({ value, onChange }: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="bg-surface-1 border border-line rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent/70"
    >
      {OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
