"""An owner's working data for one request: their collection and deck lists."""


class WorkingState:
    def __init__(self, collection: dict[str, int] | None = None, deck_lists: dict[str, dict] | None = None):
        self.collection: dict[str, int] = collection or {}        # normalized name -> quantity owned
        self.deck_lists: dict[str, dict] = deck_lists or {}       # deck id -> {id, name, commander, partner, cards}

    def collection_summary(self) -> dict:
        return {
            "count": len(self.collection),
            "total_cards": sum(self.collection.values()),
            "cards": dict(sorted(self.collection.items())),
        }

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
