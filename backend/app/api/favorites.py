"""The owner's starred cards, used by Find My Commander."""
from fastapi import APIRouter, Depends

from ..identity import Owner, get_owner
from ..services import store

router = APIRouter(prefix="/favorites", tags=["favorites"])


@router.get("")
async def get_favorites(owner: Owner = Depends(get_owner)):
    cards = store.get_favorites(owner.key)
    return {"cards": cards, "count": len(cards)}


@router.put("")
async def set_favorites(body: dict, owner: Owner = Depends(get_owner)):
    cards = [str(c).strip().lower() for c in body.get("cards", []) if str(c).strip()]
    cards = list(dict.fromkeys(cards))  # dedupe, keep order
    store.set_favorites(owner.key, cards)
    return {"cards": cards, "count": len(cards)}
