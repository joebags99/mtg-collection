import { useEffect, useState } from 'react';
import { apiPost } from '../../lib/api';
import { getColorGlow } from '../../lib/colors';
import type { CompareResponse } from '../../types/api';
import { CardName, ColorBadge, LoadingOverlay, MatchBar, PageHero, SectionHeader, type CardCommander } from '../../components/ui';

export interface CompareViewProps {
  commanders: CardCommander[];
  onBack: () => void;
  /** Hide the inline Back link when the view sits inside a drawer with its own close control. */
  showBack?: boolean;
  onSelectCommander: (cmd: CardCommander) => void;
}

export function CompareView({ commanders, onBack, onSelectCommander, showBack = true }: CompareViewProps) {
  const [data, setData] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    apiPost<CompareResponse>('/api/compare', { commanders: commanders.map((c) => c.name) })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [commanders]);

  if (loading) {
    return <LoadingOverlay message="Comparing commanders..." submessage="Fetching deck data and matching against your collection." />;
  }

  if (error) {
    return (
      <div>
        {showBack && <button onClick={onBack} className="text-accent hover:underline mb-4">← Back</button>}
        <div className="bg-danger/10 border border-danger/40 rounded p-3 text-danger">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {showBack && <button onClick={onBack} className="text-accent hover:underline">← Back</button>}

      {/* Hero header with all commanders */}
      <PageHero
        title="Commander Comparison"
        subtitle={`Comparing ${data.commanders.length} commanders side by side`}
        commanders={commanders}
        stats={[
          { value: data.shared_count, label: 'Shared Cards' },
          { value: `${Math.max(...data.commanders.map((c) => c.match_percentage))}%`, label: 'Best Match' },
        ]}
      />

      {/* Summary cards with color glows */}
      <div className={`grid gap-6 ${data.commanders.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {data.commanders.map((cmd, i) => {
          const matchColor = cmd.match_percentage >= 60 ? 'text-ok' :
            cmd.match_percentage >= 40 ? 'text-warn' : 'text-danger';
          const orig = commanders[i];
          const colorGlow = getColorGlow(orig?.color_identity);
          return (
            <div
              key={cmd.name}
              className="relative rounded-xl p-5 space-y-4 overflow-hidden"
              style={{
                background: 'rgb(var(--surface-2))',
                boxShadow: `0 8px 32px ${colorGlow}`,
              }}
            >
              {/* Background art */}
              {orig?.image_uri && (
                <div className="foil">
                  <img src={orig.art_crop || orig.image_uri} alt="" />
                </div>
              )}

              <div className="relative z-10">
                {orig?.image_uri && (
                  <img
                    src={orig.image_uri}
                    alt={cmd.name}
                    className="w-36 rounded-lg mx-auto foil"
                    style={{ boxShadow: `0 8px 24px ${colorGlow}` }}
                  />
                )}
                <h3
                  className="font-bold text-center cursor-pointer hover:text-accent mt-3 text-lg"
                  onClick={() => onSelectCommander(orig || { name: cmd.name, color_identity: [], image_uri: '', edhrec_rank: 999999 })}
                >
                  {cmd.name}
                </h3>
                <div className="flex justify-center mt-2">
                  <ColorBadge colors={orig?.color_identity} />
                </div>
                <div className="text-center mt-4">
                  <span className={`text-4xl font-bold ${matchColor}`}>{cmd.match_percentage}%</span>
                  <p className="text-xs text-ink-muted mt-1">{cmd.owned_count}/{cmd.total_cards} owned</p>
                </div>
                <div className="mt-3">
                  <MatchBar percentage={cmd.match_percentage} size="md" />
                </div>
                <div className="text-center text-sm mt-3">
                  {cmd.missing_price > 0 && (
                    <span className="bg-warn/10 text-warn px-3 py-1 rounded-full text-xs">
                      ~${cmd.missing_price.toFixed(2)} to complete
                    </span>
                  )}
                </div>
                <div className="text-center text-xs text-ink-faint mt-3 space-y-1">
                  <p>{cmd.unique_cards.length} unique cards</p>
                  {cmd.num_decks > 0 && <p>{cmd.num_decks.toLocaleString()} decks on EDHREC</p>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Shared cards */}
      <div className="bg-surface-2/80 backdrop-blur rounded-xl p-5 space-y-3 border border-line">
        <SectionHeader color="blue" count={data.shared_count}>
          Shared Across All
        </SectionHeader>
        <p className="text-xs text-ink-muted">Cards that appear in every commander's average deck.</p>
        <div className="flex flex-wrap gap-2">
          {(data.commanders[0]?.shared_cards || []).map((name) => (
            <span key={name} className="text-xs bg-surface-3 px-2 py-1 rounded">
              <CardName name={name} />
            </span>
          ))}
        </div>
      </div>

      {/* Unique cards per commander */}
      <div className={`grid gap-4 ${data.commanders.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {data.commanders.map((cmd) => (
          <div key={cmd.name} className="bg-surface-2 rounded-lg p-4 space-y-2">
            <h4 className="font-semibold text-sm text-secondary">
              Only in {cmd.name} ({cmd.unique_cards.length})
            </h4>
            <div className="divide-y divide-gray-700 max-h-72 overflow-y-auto">
              {cmd.unique_cards.map((name) => (
                <div key={name} className="py-1 text-sm">
                  <CardName name={name} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
