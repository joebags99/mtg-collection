"""Cloud sync of a logged-in user's collection, decks, and favorites."""
from fastapi import APIRouter, Depends

from ..auth import require_user
from ..services import users

router = APIRouter(prefix="/user", tags=["user"])


@router.post("/collection/save")
async def save_user_collection(body: dict, user: dict = Depends(require_user)):
    cards = body.get("cards", {})
    users.save_collection(user["user_id"], cards)
    return {"success": True, "count": len(cards)}


@router.get("/collection")
async def get_user_collection(user: dict = Depends(require_user)):
    cards, updated_at = users.load_collection(user["user_id"])
    if updated_at is None:
        return {"cards": {}, "count": 0}
    return {"cards": cards, "count": len(cards), "updated_at": updated_at}


@router.post("/decks/save")
async def save_user_decks(body: dict, user: dict = Depends(require_user)):
    decks = body.get("decks", {})
    users.save_decks(user["user_id"], decks)
    return {"success": True, "count": len(decks)}


@router.get("/decks")
async def get_user_decks(user: dict = Depends(require_user)):
    decks = users.load_decks(user["user_id"])
    return {"decks": decks, "count": len(decks)}


@router.get("/data")
async def get_all_user_data(user: dict = Depends(require_user)):
    uid = user["user_id"]
    cards, _ = users.load_collection(uid)
    decks = users.load_decks(uid)
    favorites, _ = users.load_favorites(uid)
    return {
        "collection": {"cards": cards, "count": len(cards)},
        "decks": {"decks": decks, "count": len(decks)},
        "favorites": {"cards": favorites, "count": len(favorites)},
    }


@router.post("/favorites/save")
async def save_user_favorites(body: dict, user: dict = Depends(require_user)):
    cards = body.get("cards", [])
    users.save_favorites(user["user_id"], cards)
    return {"success": True, "count": len(cards)}


@router.get("/favorites")
async def get_user_favorites(user: dict = Depends(require_user)):
    cards, updated_at = users.load_favorites(user["user_id"])
    if updated_at is None:
        return {"cards": [], "count": 0}
    return {"cards": cards, "count": len(cards), "updated_at": updated_at}
