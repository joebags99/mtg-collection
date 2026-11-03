import { useEffect, useRef, useState } from 'react';
import { apiGet } from '../../lib/api';
import type { Commander } from '../../types/api';
import { ColorBadge } from './ColorBadge';
import { PARTNER_BADGE } from './partnerLabels';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function CommanderAutocomplete({ value, onChange, placeholder, className }: Props) {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState<Commander[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setQuery(value || ''); }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: globalThis.MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInput = (val: string) => {
    setQuery(val);
    onChange(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.length < 2) { setResults([]); setShowDropdown(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await apiGet<{ results: Commander[] }>('/api/commanders/search_autocomplete', { q: val });
        setResults(data.results || []);
        setShowDropdown(true);
      } catch { setResults([]); }
      setLoading(false);
    }, 200);
  };

  const handleSelect = (cmd: Commander) => {
    setQuery(cmd.name);
    onChange(cmd.name);
    setShowDropdown(false);
    setResults([]);
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
        placeholder={placeholder}
        className={className}
      />
      {loading && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {results.map((cmd) => (
            <button
              key={cmd.name}
              onClick={() => handleSelect(cmd)}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-700 flex items-center gap-2 transition-colors"
            >
              {cmd.image_uri && <img src={cmd.image_uri} alt="" className="w-6 h-8 rounded object-cover flex-shrink-0" />}
              <span className="flex-1 truncate">{cmd.name}</span>
              <ColorBadge colors={cmd.color_identity} />
              {cmd.partner_type && (
                <span className="text-[10px] text-purple-400 flex-shrink-0">{PARTNER_BADGE[cmd.partner_type]}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
