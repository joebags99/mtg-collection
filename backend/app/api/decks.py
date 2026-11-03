"""The owner's saved deck lists."""
from fastapi import APIRouter, Depends, HTTPException

from ..domain.parsing import parse_card_lines
from ..identity import Owner, get_owner
from ..services import analysis, store

router = APIRouter(prefix="/decks", tags=["decks"])


def _get(owner: Owner, deck_id: str) -> dict:
    deck = store.get_deck(owner.key, deck_id)
    if deck is None:
        raise HTTPException(status_code=404, detail="Deck not found")
    return deck


@router.get("")
async def list_decks(owner: Owner = Depends(get_owner)):
    return {"decks": [analysis.enrich_deck(d) for d in store.list_decks(owner.key).values()]}


@router.post("")
async def create_deck(body: dict, owner: Owner = Depends(get_owner)):
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
    store.save_deck(owner.key, deck)
    return analysis.enrich_deck(deck)


@router.get("/{deck_id}")
async def get_deck(deck_id: str, owner: Owner = Depends(get_owner)):
    return analysis.enrich_deck(_get(owner, deck_id))


@router.put("/{deck_id}")
async def update_deck(deck_id: str, body: dict, owner: Owner = Depends(get_owner)):
    deck = _get(owner, deck_id)
    if "name" in body:
        deck["name"] = body["name"].strip()
    if "commander" in body:
        deck["commander"] = body["commander"].strip()
    if "partner" in body:
        deck["partner"] = body["partner"].strip() if body["partner"] else ""
    if "cards_text" in body:
        deck["cards"] = parse_card_lines(body["cards_text"])
    store.save_deck(owner.key, deck)
    return analysis.enrich_deck(deck)


@router.delete("/{deck_id}")
async def delete_deck(deck_id: str, owner: Owner = Depends(get_owner)):
    if not store.delete_deck(owner.key, deck_id):
        raise HTTPException(status_code=404, detail="Deck not found")
    return {"ok": True}
