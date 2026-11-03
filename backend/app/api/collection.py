"""The owner's collection: upload, clear, availability, and stats."""
import asyncio

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..domain.parsing import parse_collection
from ..identity import Owner, get_owner
from ..services import analysis, store
from ..state import WorkingState

router = APIRouter(prefix="/collection", tags=["collection"])


def _summary(cards: dict[str, int]) -> dict:
    return WorkingState(cards).collection_summary()


@router.post("/upload")
async def upload_collection(file: UploadFile = File(...), owner: Owner = Depends(get_owner)):
    text = (await file.read()).decode("utf-8")
    cards = parse_collection(text, file.filename or "upload.txt")
    if not cards:
        raise HTTPException(status_code=400, detail="No cards found in uploaded file")
    store.set_collection(owner.key, cards)
    return _summary(cards)


@router.post("/text")
async def upload_text_collection(body: dict, owner: Owner = Depends(get_owner)):
    text = body.get("text", "")
    if not text.strip():
        raise HTTPException(status_code=400, detail="No text provided")
    cards = parse_collection(text)
    if not cards:
        raise HTTPException(status_code=400, detail="No cards found")
    store.set_collection(owner.key, cards)
    return _summary(cards)


@router.get("")
async def get_collection(owner: Owner = Depends(get_owner)):
    return _summary(store.get_collection(owner.key))


@router.delete("")
async def clear_collection(owner: Owner = Depends(get_owner)):
    store.clear_collection(owner.key)
    return _summary({})


@router.get("/availability")
async def get_collection_availability(owner: Owner = Depends(get_owner)):
    state = store.load_state(owner.key)
    usage = state.cards_in_decks()
    return {
        name: {
            "owned": qty,
            "in_decks": usage.get(name, {}).get("total_in_decks", 0),
            "available": max(0, qty - usage.get(name, {}).get("total_in_decks", 0)),
            "decks": usage.get(name, {}).get("decks", []),
        }
        for name, qty in state.collection.items()
    }


@router.get("/stats")
async def get_collection_stats(owner: Owner = Depends(get_owner)):
    state = store.load_state(owner.key)
    if not state.collection:
        return {"error": "No collection loaded", "total_unique": 0}
    return await asyncio.get_event_loop().run_in_executor(None, analysis.collection_stats, state)
