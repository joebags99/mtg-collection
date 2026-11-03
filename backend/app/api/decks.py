"""Deck lists held in the working state."""
from fastapi import APIRouter, HTTPException

from ..domain.parsing import parse_card_lines
from ..services import analysis
from ..state import state

router = APIRouter(prefix="/decks", tags=["decks"])


def _get(deck_id: str) -> dict:
    deck = state.deck_lists.get(deck_id)
    if deck is None:
        raise HTTPException(status_code=404, detail="Deck not found")
    return deck


@router.get("")
async def list_decks():
    return {"decks": [analysis.enrich_deck(d) for d in state.deck_lists.values()]}


@router.post("")
async def create_deck(body: dict):
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Deck name is required")
    deck = {
        "id": analysis.new_deck_id(),
        "name": name,
        "commander": body.get("commander", "").strip(),
        "partner": body.get("partner", "").strip(),
        "cards": parse_card_lines(body.get("cards_text", "")),
    }
    state.deck_lists[deck["id"]] = deck
    return analysis.enrich_deck(deck)


@router.post("/restore")
async def restore_decks(body: dict):
    decks = body.get("decks", {})
    state.deck_lists.clear()
    state.deck_lists.update(decks)
    return {"count": len(state.deck_lists)}


@router.get("/{deck_id}")
async def get_deck(deck_id: str):
    return analysis.enrich_deck(_get(deck_id))


@router.put("/{deck_id}")
async def update_deck(deck_id: str, body: dict):
    deck = _get(deck_id)
    if "name" in body:
        deck["name"] = body["name"].strip()
    if "commander" in body:
        deck["commander"] = body["commander"].strip()
    if "partner" in body:
        deck["partner"] = body["partner"].strip() if body["partner"] else ""
    if "cards_text" in body:
        deck["cards"] = parse_card_lines(body["cards_text"])
    return analysis.enrich_deck(deck)


@router.delete("/{deck_id}")
async def delete_deck(deck_id: str):
    _get(deck_id)
    del state.deck_lists[deck_id]
    return {"ok": True}
