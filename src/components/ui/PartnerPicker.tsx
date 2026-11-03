import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';
import type { Commander, PartnersResponse, PartnerType } from '../../types/api';
import { ColorBadge } from './ColorBadge';
import { PARTNER_HEADING } from './partnerLabels';

interface Props {
  commanderName: string;
  onSelectPartner: (partner: Commander | null) => void;
  selectedPartner: Commander | null;
  /** Pass the parent's fetch result to avoid a duplicate request. */
  partnerData?: PartnersResponse | null;
}

export function PartnerPicker({ commanderName, onSelectPartner, selectedPartner, partnerData }: Props) {
  const [partners, setPartners] = useState<Commander[]>(partnerData?.partners || []);
  const [partnerType, setPartnerType] = useState<PartnerType>(partnerData?.partner_type || '');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (partnerData) {
      setPartnerType(partnerData.partner_type || '');
      setPartners(partnerData.partners || []);
      return;
    }
    if (!commanderName) { setPartners([]); setPartnerType(''); return; }
    setLoading(true);
    apiGet<PartnersResponse>(`/api/commander/${encodeURIComponent(commanderName)}/partners`)
      .then((data) => { setPartnerType(data.partner_type || ''); setPartners(data.partners || []); })
      .catch(() => { setPartners([]); setPartnerType(''); })
      .finally(() => setLoading(false));
  }, [commanderName, partnerData]);

  if (!partnerType) return null;

  // A named partner or a one-option variant is locked in; no remove button.
  const isLockedPartner = (partnerType === 'partner_with' || partnerType === 'partner_variant') && partners.length === 1;
  const filtered = search.length >= 2
    ? partners.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : partners;

  return (
    <div className="bg-purple-900/30 border border-purple-700 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-purple-400">{PARTNER_HEADING[partnerType]}</h4>
        {selectedPartner && !isLockedPartner && (
          <button onClick={() => onSelectPartner(null)} className="text-xs text-gray-400 hover:text-red-400">
            Remove Partner
          </button>
        )}
      </div>

      {selectedPartner ? (
        <div className="flex items-center gap-3 bg-gray-800 rounded-lg p-2">
          {selectedPartner.image_uri && (
            <img src={selectedPartner.image_uri} alt={selectedPartner.name} className="w-12 h-16 rounded object-cover" />
          )}
          <div>
            <p className="font-medium text-sm">{selectedPartner.name}</p>
            <ColorBadge colors={selectedPartner.color_identity} />
          </div>
        </div>
      ) : loading ? (
        <div className="text-center py-2 text-gray-400 text-sm">Loading partners...</div>
      ) : (
        <>
          {partners.length > 5 && (
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search partners..."
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-purple-500"
            />
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[500px] overflow-y-auto p-1">
            {filtered.slice(0, 40).map((p) => (
              <button
                key={p.name}
                onClick={() => onSelectPartner(p)}
                className="bg-gray-800 hover:bg-gray-700 rounded-lg p-2 text-left transition-colors group"
              >
                {p.image_uri && (
                  <img src={p.image_uri} alt={p.name} className="w-full rounded-lg shadow-lg group-hover:scale-[1.02] transition-transform" loading="lazy" />
                )}
                <p className="text-xs mt-1.5 text-center font-medium">{p.name}</p>
                {p.color_identity && <div className="mt-1 text-center"><ColorBadge colors={p.color_identity} /></div>}
              </button>
            ))}
          </div>
          {filtered.length === 0 && <p className="text-sm text-gray-500">No compatible partners found.</p>}
        </>
      )}
    </div>
  );
}
