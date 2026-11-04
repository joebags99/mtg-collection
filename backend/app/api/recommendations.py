"""Commander scoring against the collection or a list of favorite cards."""
import asyncio
from functools import partial
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request

from ..config import RATE_LIMIT
from ..ratelimit import rate_limit
from ..identity import Owner, get_owner
from ..services import analysis, store

router = APIRouter(tags=["recommendations"])


@router.post("/recommendations")
@rate_limit(RATE_LIMIT)
async def get_recommendations(
    request: Request,
    color: Optional[str] = None,
    search: Optional[str] = None,
    min_owned: int = 20,
    min_colors: int = 0,
    tag: Optional[str] = None,
    limit: int = 50,
    exclude_in_decks: bool = False,
    owner: Owner = Depends(get_owner),
):
    state = store.load_state(owner.key)
    if not state.collection:
        raise HTTPException(status_code=400, detail="No collection uploaded. Upload your collection first.")
    work = partial(analysis.recommend_commanders, state, color=color, search=search, min_owned=min_owned,
                   min_colors=min_colors, tag=tag or None, limit=limit, exclude_in_decks=exclude_in_decks)
    return {"results": await asyncio.get_event_loop().run_in_executor(None, work)}


@router.post("/recommendations/from-favorites")
@rate_limit(RATE_LIMIT)
async def recommendations_from_favorites(request: Request, body: dict):
    names = body.get("card_names", [])
    if not names:
        raise HTTPException(status_code=400, detail="No card names provided")
    if len(names) > 100:
        raise HTTPException(status_code=400, detail="Too many cards (max 100)")
    work = partial(analysis.commanders_for_favorites, names, body.get("limit", 40))
    return await asyncio.get_event_loop().run_in_executor(None, work)


@router.post("/compare")
@rate_limit(RATE_LIMIT)
async def compare_commanders(request: Request, body: dict, owner: Owner = Depends(get_owner)):
    names = body.get("commanders", [])
    if len(names) < 2 or len(names) > 3:
        raise HTTPException(status_code=400, detail="Provide 2-3 commander names")
    work = partial(analysis.compare_commanders, store.load_state(owner.key), names)
    return await asyncio.get_event_loop().run_in_executor(None, work)


@router.get("/health")
async def health():
    return {"status": "ok"}
