"""The working collection: upload, restore, availability, and stats."""
import asyncio

from fastapi import APIRouter, File, HTTPException, UploadFile

from ..domain.names import normalize_card_name
from ..domain.parsing import parse_collection
from ..services import analysis
from ..state import state

router = APIRouter(prefix="/collection", tags=["collection"])


@router.post("/upload")
async def upload_collection(file: UploadFile = File(...)):
    text = (await file.read()).decode("utf-8")
    cards = parse_collection(text, file.filename or "upload.txt")
    if not cards:
        raise HTTPException(status_code=400, detail="No cards found in uploaded file")
    state.replace_collection(cards)
    return state.collection_summary()


@router.post("/text")
async def upload_text_collection(body: dict):
    text = body.get("text", "")
    if not text.strip():
        raise HTTPException(status_code=400, detail="No text provided")
    cards = parse_collection(text)
    if not cards:
        raise HTTPException(status_code=400, detail="No cards found")
    state.replace_collection(cards)
    return state.collection_summary()


@router.get("")
async def get_collection():
    return state.collection_summary()


@router.post("/restore")
async def restore_collection(body: dict):
    cards = body.get("cards", {})
    if not cards:
        raise HTTPException(status_code=400, detail="No cards provided")
    restored: dict[str, int] = {}
    if isinstance(cards, list):  # legacy format: list of names
        for name in cards:
            n = normalize_card_name(name)
            restored[n] = restored.get(n, 0) + 1
    else:
        restored = {normalize_card_name(n): int(q) for n, q in cards.items()}
    state.replace_collection(restored)
    return state.collection_summary()


@router.get("/availability")
async def get_collection_availability():
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
async def get_collection_stats():
    if not state.collection:
        return {"error": "No collection loaded", "total_unique": 0}
    return await asyncio.get_event_loop().run_in_executor(None, analysis.collection_stats, state)
