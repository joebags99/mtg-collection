import { useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPost, apiPut } from '../../lib/api';
import { getColorGlow } from '../../lib/colors';
import { saveDecks } from '../../lib/storage';
import type { Commander, Deck, ValidateCardsResponse } from '../../types/api';
import { ColorBadge, CommanderAutocomplete, PageHero, PartnerPicker, SectionHeader } from '../../components/ui';

interface MyDecksProps {
  onDecksChanged: () => void;
  /** True once the app has restored saved decks to the server; the list loads after that. */
  decksReady: boolean;
}

/** Strip leading quantities ("2x Sol Ring" -> "Sol Ring") from a pasted list. */
function parseCardNames(text: string): string[] {
  return text.trim().split('\n')
    .map((l) => l.trim())
    .filter((l) => l)
    .map((l) => {
      const m = l.match(/^(\d+)x?\s+(.+)/);
      return m ? m[2].trim() : l.trim();
    });
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function MyDecks({ onDecksChanged, decksReady }: MyDecksProps) {
  const [decks, setDecks] = useState<Record<string, Deck>>({});
  const [newName, setNewName] = useState('');
  const [newCommander, setNewCommander] = useState('');
  const [newPartner, setNewPartner] = useState<Commander | null>(null);
  const [newCards, setNewCards] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCards, setEditCards] = useState('');
  const [error, setError] = useState('');
  const [validating, setValidating] = useState(false);
  const [invalidCards, setInvalidCards] = useState<string[]>([]);

  // Load decks only after restore is complete
  useEffect(() => {
    if (!decksReady) return;
    apiGet<{ decks: Deck[] }>('/api/decks').then((data) => {
      const deckMap: Record<string, Deck> = {};
      (data.decks || []).forEach((d) => { deckMap[d.id] = d; });
      setDecks(deckMap);
      saveDecks(deckMap);
    }).catch(() => {});
  }, [decksReady]);

  /** Returns false (and sets the error) when the list has unrecognized cards. Network failures pass. */
  const validateCards = async (text: string): Promise<boolean> => {
    if (!text.trim()) return true;
    setValidating(true);
    try {
      const names = parseCardNames(text);
      if (names.length > 0) {
        const result = await apiPost<ValidateCardsResponse>('/api/cards/validate', { cards: names });
        if (result.invalid && result.invalid.length > 0) {
          setInvalidCards(result.invalid);
          setError(`${result.invalid.length} unrecognized card(s) found. Fix or remove them before saving.`);
          setValidating(false);
          return false;
        }
      }
    } catch (e) {
      console.warn('Card validation failed, proceeding:', e);
    }
    setValidating(false);
    return true;
  };

  const validateAndAdd = async () => {
    if (!newName.trim()) return;
    setError('');
    setInvalidCards([]);
    if (!(await validateCards(newCards))) return;

    try {
      const deck = await apiPost<Deck>('/api/decks', {
        name: newName, commander: newCommander, partner: newPartner?.name || '', cards_text: newCards,
      });
      const updated = { ...decks, [deck.id]: deck };
      setDecks(updated);
      saveDecks(updated);
      onDecksChanged();
      setNewName(''); setNewCommander(''); setNewPartner(null); setNewCards('');
      setInvalidCards([]);
    } catch (e) { setError(errorMessage(e)); }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiDelete<{ ok: boolean }>(`/api/decks/${id}`);
      const updated = { ...decks };
      delete updated[id];
      setDecks(updated);
      saveDecks(updated);
      onDecksChanged();
    } catch (e) { setError(errorMessage(e)); }
  };

  const handleEdit = async (id: string) => {
    if (editingId === id) {
      setError('');
      setInvalidCards([]);
      if (!(await validateCards(editCards))) return;

      try {
        const deck = await apiPut<Deck>(`/api/decks/${id}`, { cards_text: editCards });
        const updated = { ...decks, [id]: deck };
        setDecks(updated);
        saveDecks(updated);
        onDecksChanged();
        setEditingId(null);
        setInvalidCards([]);
      } catch (e) { setError(errorMessage(e)); }
    } else {
      // Start editing - load full deck
      try {
        const deck = await apiGet<Deck>(`/api/decks/${id}`);
        const cardsText = Object.entries(deck.cards || {}).map(([n, q]) => `${q} ${n}`).join('\n');
        setEditCards(cardsText);
        setEditingId(id);
        setInvalidCards([]);
      } catch (e) { setError(errorMessage(e)); }
    }
  };

  const deckList = Object.values(decks);
  const totalCards = deckList.reduce((sum, d) => sum + (d.card_count || 0), 0);
  const heroColors = deckList.find((d) => d.image_uri)?.color_identity ?? [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHero
        title="My Decks"
        subtitle="Add your existing deck lists here. Cards committed to decks can be excluded from recommendations so you only see what's actually available."
        colorIdentity={heroColors}
        stats={deckList.length > 0 ? [
          { value: deckList.length, label: 'Decks' },
          { value: totalCards, label: 'Total Cards' },
        ] : []}
      />

      {/* Add new deck */}
      <div className="bg-gray-800/80 backdrop-blur rounded-xl p-6 space-y-4 border border-gray-700/50">
        <SectionHeader color="blue">Add New Deck</SectionHeader>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-1">Deck Name *</label>
            <input
              value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Ur-Dragon Tribal"
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-1">Commander</label>
            <CommanderAutocomplete
              value={newCommander}
              onChange={(v) => { setNewCommander(v); setNewPartner(null); }}
              placeholder="e.g. The Ur-Dragon"
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
        {newCommander && (
          <PartnerPicker
            commanderName={newCommander}
            selectedPartner={newPartner}
            onSelectPartner={setNewPartner}
          />
        )}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Card List (paste from Archidekt/Moxfield export)</label>
          <textarea
            value={newCards} onChange={(e) => { setNewCards(e.target.value); setInvalidCards([]); }}
            placeholder={'1 Sol Ring\n1 Command Tower\n1 Arcane Signet\n...'}
            rows={8}
            className="w-full bg-gray-900 border border-gray-700 rounded p-3 text-sm font-mono focus:outline-none focus:border-blue-500"
          />
        </div>
        {invalidCards.length > 0 && (
          <div className="bg-red-900/30 border border-red-700 rounded p-3 space-y-1">
            <p className="text-sm text-red-400 font-medium">Unrecognized cards:</p>
            <ul className="text-xs text-red-300 space-y-0.5">
              {invalidCards.map((name) => <li key={name}>- {name}</li>)}
            </ul>
          </div>
        )}
        <button
          onClick={validateAndAdd} disabled={!newName.trim() || validating}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 px-4 py-2 rounded font-medium"
        >
          {validating ? 'Validating cards...' : 'Add Deck'}
        </button>
      </div>

      {error && <div className="bg-red-900/50 border border-red-700 rounded p-3 text-red-300">{error}</div>}

      {/* Deck list */}
      {deckList.length === 0 && (
        <p className="text-gray-500 text-center py-8">No decks added yet. Add a deck above to start tracking card usage.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 grid-stagger">
        {deckList.map((deck) => (
          <DeckTile
            key={deck.id}
            deck={deck}
            editing={editingId === deck.id}
            validating={validating}
            editCards={editCards}
            invalidCards={invalidCards}
            onEditCardsChange={(v) => { setEditCards(v); setInvalidCards([]); }}
            onEdit={() => handleEdit(deck.id)}
            onDelete={() => handleDelete(deck.id)}
          />
        ))}
      </div>

      {/* Legend */}
      {deckList.length > 0 && (
        <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
          <h4 className="text-sm font-medium text-gray-400">Availability Legend</h4>
          <div className="flex flex-wrap gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> Available</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-500" /> In deck, have spares</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-500" /> All copies in decks</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> Not owned</span>
          </div>
        </div>
      )}
    </div>
  );
}

interface DeckTileProps {
  deck: Deck;
  editing: boolean;
  validating: boolean;
  editCards: string;
  invalidCards: string[];
  onEditCardsChange: (value: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}

/** One saved deck: commander art, counts, and the inline edit box. */
function DeckTile({ deck, editing, validating, editCards, invalidCards, onEditCardsChange, onEdit, onDelete }: DeckTileProps) {
  const glow = getColorGlow(deck.color_identity);
  const glowStyle = { boxShadow: `0 0 20px 2px ${glow}, inset 0 0 20px 0px ${glow}` };

  return (
    <div className="relative bg-gray-800 rounded-xl overflow-hidden transition-all hover:scale-[1.02]" style={glowStyle}>
      {/* Commander art banner */}
      {deck.art_crop && (
        <div className="absolute inset-0 z-0">
          <img src={deck.art_crop} alt="" className="w-full h-full object-cover opacity-20" />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/80 to-gray-900/40" />
        </div>
      )}
      <div className="relative z-10 p-4 flex flex-col h-full">
        {/* Commander image(s) prominently displayed */}
        <div className="flex justify-center mb-3">
          {deck.partner_image_uri ? (
            // Tucked partner layout - partner behind, main in front
            <div className="relative" style={{ width: '140px', height: '180px' }}>
              <img
                src={deck.partner_image_uri}
                alt={deck.partner}
                className="absolute w-28 rounded-lg shadow-lg"
                style={{ top: 0, right: 0, filter: `drop-shadow(0 0 6px ${glow})` }}
              />
              <img
                src={deck.image_uri}
                alt={deck.commander}
                className="absolute w-28 rounded-lg shadow-xl"
                style={{ bottom: 0, left: 0, filter: `drop-shadow(0 0 8px ${glow})`, zIndex: 1 }}
              />
            </div>
          ) : deck.image_uri ? (
            <img src={deck.image_uri} alt={deck.commander} className="w-32 rounded-lg shadow-xl" style={{ filter: `drop-shadow(0 0 8px ${glow})` }} />
          ) : null}
        </div>
        <h4 className="font-bold text-center text-sm">{deck.name}</h4>
        {deck.commander && (
          <p className="text-xs text-gray-400 text-center mt-0.5">
            {deck.commander}{deck.partner ? ` + ${deck.partner}` : ''}
          </p>
        )}
        <div className="flex items-center justify-center gap-2 mt-1.5">
          {deck.color_identity && deck.color_identity.length > 0 && (
            <ColorBadge colors={deck.color_identity} />
          )}
          <span className="text-xs text-gray-500">{deck.card_count || 0} cards</span>
        </div>
        <div className="flex gap-2 justify-center mt-3">
          <button
            onClick={onEdit}
            disabled={validating}
            className={`px-3 py-1 rounded text-xs ${
              editing ? 'bg-green-700 hover:bg-green-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            {editing ? (validating ? 'Validating...' : 'Save') : 'Edit'}
          </button>
          <button
            onClick={onDelete}
            className="bg-red-800 hover:bg-red-700 px-3 py-1 rounded text-xs"
          >
            Delete
          </button>
        </div>
        {editing && (
          <div className="mt-3 space-y-2">
            <textarea
              value={editCards} onChange={(e) => onEditCardsChange(e.target.value)}
              rows={8}
              className="w-full bg-gray-900 border border-gray-700 rounded p-3 text-xs font-mono focus:outline-none focus:border-blue-500"
            />
            {invalidCards.length > 0 && (
              <div className="bg-red-900/30 border border-red-700 rounded p-3 space-y-1">
                <p className="text-xs text-red-400 font-medium">Unrecognized cards:</p>
                <ul className="text-[11px] text-red-300 space-y-0.5">
                  {invalidCards.map((name) => <li key={name}>- {name}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
