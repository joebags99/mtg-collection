"""The active collection and deck lists.

This is process-wide state shared by every request, exactly as the original
single-file app behaved. The frontend restores it from localStorage on load.
Moving it per-user into the database is the next step of the overhaul and
needs a frontend change, so it is isolated here behind one object.
"""


class WorkingState:
    def __init__(self):
        self.collection: dict[str, int] = {}        # normalized name -> quantity owned
        self.deck_lists: dict[str, dict] = {}       # deck id -> {id, name, commander, partner, cards}

    # --- collection ---
    def replace_collection(self, cards: dict[str, int]) -> None:
        self.collection.clear()
        self.collection.update(cards)

    def collection_summary(self) -> dict:
        return {
            "count": len(self.collection),
            "total_cards": sum(self.collection.values()),
            "cards": dict(sorted(self.collection.items())),
        }

    # --- decks ---
    def cards_in_decks(self) -> dict[str, dict]:
        """{normalized name: {total_in_decks, decks: [{id, name}]}} across all deck lists."""
        usage: dict[str, dict] = {}
        for deck_id, deck in self.deck_lists.items():
            for card_name, qty in deck.get("cards", {}).items():
                entry = usage.setdefault(card_name, {"total_in_decks": 0, "decks": []})
                entry["total_in_decks"] += qty
                entry["decks"].append({"id": deck_id, "name": deck.get("name", "")})
        return usage

    def available_cards(self, exclude_in_decks: bool = False) -> set[str]:
        """Owned card names, optionally minus those fully committed to decks."""
        if not exclude_in_decks:
            return set(self.collection.keys())
        usage = self.cards_in_decks()
        return {
            name for name, qty in self.collection.items()
            if qty > usage.get(name, {}).get("total_in_decks", 0)
        }


state = WorkingState()
