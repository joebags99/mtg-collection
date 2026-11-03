import type { DeckCard } from '../../types/api';
import { AvailDot, CardName, DeckBadges, SectionHeader, TypeSectionHeader, type FavoriteProps } from '../../components/ui';

export const CARD_TYPE_ORDER = ['Creature', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Planeswalker', 'Land', 'Other'];

export interface TypeGroup<T> {
  type: string;
  cards: T[];
}

/** Bucket cards by card_type in canonical order, dropping empty types. */
export function groupByType<T extends { card_type?: string }>(cards: T[]): TypeGroup<T>[] {
  const groups: Record<string, T[]> = {};
  for (const card of cards) {
    const type = card.card_type || 'Other';
    if (!groups[type]) groups[type] = [];
    groups[type].push(card);
  }
  return CARD_TYPE_ORDER.filter((t) => (groups[t]?.length ?? 0) > 0).map((t) => ({ type: t, cards: groups[t] }));
}

export interface CardListByTypeProps extends FavoriteProps {
  ownedCards: DeckCard[];
  missingCards: DeckCard[];
  showOwned: boolean;
  showMissing: boolean;
  totalMissingPrice: number;
}

export function CardListByType({ ownedCards, missingCards, showOwned, showMissing, totalMissingPrice, favorites, onToggleFavorite }: CardListByTypeProps) {
  const ownedGroups = groupByType(ownedCards);
  const missingGroups = groupByType(missingCards);

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {showOwned && (
        <div className="space-y-4">
          <SectionHeader color="green" count={ownedCards.length}>
            Owned Cards
          </SectionHeader>
          {ownedGroups.length === 0 && (
            <p className="text-gray-500 text-sm bg-gray-800 rounded-lg px-3 py-4">None</p>
          )}
          {ownedGroups.map(({ type, cards }) => (
            <div key={type}>
              <TypeSectionHeader type={type} count={cards.length} />
              <div className="bg-gray-800 rounded-lg divide-y divide-gray-700">
                {cards.map((card) => (
                  <div key={card.name} className="px-3 py-2 flex justify-between items-center hover:bg-gray-700/50 transition-colors">
                    <div className="flex items-center gap-1.5">
                      <AvailDot card={card} />
                      <CardName name={card.name} className="text-sm" favorites={favorites} onToggleFavorite={onToggleFavorite} />
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <DeckBadges inDecks={card.in_decks} />
                      {card.qty_owned > 1 && (
                        <span className="text-[10px] text-gray-500" title={`${card.qty_owned} owned, ${card.qty_in_decks || 0} in decks`}>
                          {card.qty_in_decks ? `${card.qty_owned - card.qty_in_decks}/${card.qty_owned}` : `x${card.qty_owned}`}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showMissing && (
        <div className="space-y-4">
          <div className="flex items-baseline gap-2">
            <SectionHeader color="red" count={missingCards.length}>
              Missing Cards
            </SectionHeader>
            {totalMissingPrice > 0 && (
              <span className="text-sm text-yellow-400">
                ~${totalMissingPrice.toFixed(2)}
              </span>
            )}
          </div>
          {missingGroups.length === 0 && (
            <p className="text-gray-500 text-sm bg-gray-800 rounded-lg px-3 py-4">None</p>
          )}
          {missingGroups.map(({ type, cards }) => (
            <div key={type}>
              <TypeSectionHeader type={type} count={cards.length} />
              <div className="bg-gray-800 rounded-lg divide-y divide-gray-700">
                {cards.map((card) => (
                  <div key={card.name} className="px-3 py-2 flex justify-between items-center hover:bg-gray-700/50 transition-colors">
                    <div className="flex items-center gap-1.5">
                      <AvailDot card={card} />
                      <CardName name={card.name} className="text-sm" favorites={favorites} onToggleFavorite={onToggleFavorite} />
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <DeckBadges inDecks={card.in_decks} />
                      <span className="text-xs text-yellow-400/70">
                        {card.price ? `$${card.price.toFixed(2)}` : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
