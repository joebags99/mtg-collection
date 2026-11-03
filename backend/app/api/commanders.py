"""Commander catalog, search, partners, detail, and card validation."""
import asyncio
from functools import partial
from typing import Optional

from fastapi import APIRouter, Request

from ..config import RATE_LIMIT
from ..domain.partners import compatible_partners
from ..ratelimit import rate_limit
from ..services import analysis, scryfall
from ..state import state

router = APIRouter(tags=["commanders"])


@router.get("/commanders")
async def list_commanders(color: Optional[str] = None, search: Optional[str] = None):
    results = scryfall.get_commanders()
    if color:
        wanted = set(color.upper())
        results = [c for c in results if set(c["color_identity"]) == wanted]
    if search:
        results = [c for c in results if search.lower() in c["name"].lower()]
    return {"count": len(results), "commanders": results[:200]}


@router.get("/commanders/search_autocomplete")
async def search_commanders_autocomplete(q: str = ""):
    if len(q) < 2:
        return {"results": []}
    q = q.lower()
    prefix, contains = [], []
    for c in scryfall.get_commanders():
        name = c["name"].lower()
        if name.startswith(q):
            prefix.append(c)
        elif q in name:
            contains.append(c)
    return {"results": (prefix + contains)[:20]}


@router.get("/commanders/popular")
async def popular_commanders():
    top = sorted(scryfall.get_commanders(), key=lambda c: c["edhrec_rank"])[:50]
    return {"commanders": top}


@router.get("/commander/{commander_name:path}/partners")
async def get_commander_partners(commander_name: str):
    commander = scryfall.find_commander(commander_name)
    if not commander:
        return {"partner_type": "", "partners": []}
    return {
        "partner_type": commander.get("partner_type", ""),
        "partner_with": commander.get("partner_with", ""),
        "partners": compatible_partners(commander, scryfall.get_commanders())[:100],
    }


@router.get("/commander/{commander_name:path}")
@rate_limit(RATE_LIMIT)
async def get_commander_detail(
    request: Request,
    commander_name: str,
    budget: Optional[str] = None,
    theme: Optional[str] = None,
    include_prices: bool = True,
    exclude_in_decks: bool = False,
    partner: Optional[str] = None,
):
    work = partial(analysis.commander_detail, state, commander_name, budget=budget, theme=theme,
                   include_prices=include_prices, exclude_in_decks=exclude_in_decks, partner=partner)
    return await asyncio.get_event_loop().run_in_executor(None, work)


@router.post("/cards/validate")
async def validate_cards(body: dict):
    names = body.get("cards", [])
    if not names:
        return {"valid": [], "invalid": []}
    valid, invalid = await asyncio.get_event_loop().run_in_executor(None, scryfall.validate_card_names, names)
    return {"valid": valid, "invalid": invalid}
