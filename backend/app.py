import csv
import io
import re
import time
import logging
from typing import Optional

import requests
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pyedhrec import EDHRec

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="MTG Commander Recommender")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

edhrec = EDHRec()

# In-memory state
collection: set[str] = set()
# Cache: commander_name -> {avg_deck, commander_data, timestamp}
commander_cache: dict[str, dict] = {}
CACHE_TTL = 3600  # 1 hour


def normalize_card_name(name: str) -> str:
    """Normalize card name for comparison: lowercase, strip whitespace."""
    name = name.strip().lower()
    # Handle double-faced cards: "Card A // Card B" -> "card a"
    if "//" in name:
        name = name.split("//")[0].strip()
    return name


def parse_csv_collection(content: str) -> set[str]:
    """Parse CSV from Archidekt or Moxfield export. Returns set of normalized card names."""
    cards = set()
    reader = csv.DictReader(io.StringIO(content))

    # Try common column names for card name
    name_columns = ["Name", "name", "Card", "card", "Card Name", "card_name"]

    for row in reader:
        for col in name_columns:
            if col in row and row[col]:
                cards.add(normalize_card_name(row[col]))
                break
        else:
            # If no known column, try first column
            first_val = next(iter(row.values()), None)
            if first_val:
                cards.add(normalize_card_name(first_val))

    return cards


def parse_text_collection(content: str) -> set[str]:
    """Parse simple text format: '1 Card Name' or just 'Card Name' per line."""
    cards = set()
    for line in content.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        # Strip leading quantity like "4 " or "1x "
        match = re.match(r"^\d+x?\s+(.+)", line)
        if match:
            line = match.group(1)
        cards.add(normalize_card_name(line))
    return cards


def get_all_commanders() -> list[dict]:
    """Fetch all legal commanders from Scryfall bulk search."""
    commanders = []
    url = "https://api.scryfall.com/cards/search"
    params = {
        "q": "is:commander f:commander",
        "order": "edhrec",
        "unique": "cards",
    }

    while url:
        resp = requests.get(url, params=params)
        if resp.status_code != 200:
            logger.error(f"Scryfall error: {resp.status_code}")
            break
        data = resp.json()
        for card in data.get("data", []):
            commanders.append({
                "name": card["name"],
                "name_normalized": normalize_card_name(card["name"]),
                "color_identity": card.get("color_identity", []),
                "image_uri": (card.get("image_uris") or {}).get("normal", "")
                    or (card.get("card_faces", [{}])[0].get("image_uris") or {}).get("normal", ""),
                "edhrec_rank": card.get("edhrec_rank", 999999),
            })

        if data.get("has_more"):
            url = data.get("next_page")
            params = {}  # next_page is a full URL
            time.sleep(0.1)  # Scryfall rate limit
        else:
            url = None

    return commanders


# Cache for all commanders list
_all_commanders: list[dict] = []
_commanders_fetched_at: float = 0


def get_cached_commanders() -> list[dict]:
    global _all_commanders, _commanders_fetched_at
    if not _all_commanders or (time.time() - _commanders_fetched_at > 86400):
        logger.info("Fetching all commanders from Scryfall...")
        _all_commanders = get_all_commanders()
        _commanders_fetched_at = time.time()
        logger.info(f"Fetched {len(_all_commanders)} commanders")
    return _all_commanders


def get_commander_avg_deck(commander_name: str, budget: str = None, theme: str = None) -> dict:
    """Get average deck for a commander from EDHREC, with caching."""
    cache_key = f"{commander_name}|{budget or ''}|{theme or ''}"

    cached = commander_cache.get(cache_key)
    if cached and (time.time() - cached["timestamp"] < CACHE_TTL):
        return cached["data"]

    try:
        formatted = edhrec.format_card_name(commander_name)

        # Get average deck
        avg_deck = edhrec.get_commanders_average_deck(formatted, budget=budget)

        # Get commander data for themes/metadata
        cmd_data = edhrec.get_commander_data(formatted)

        # Extract themes from commander data
        themes = []
        if cmd_data:
            container = cmd_data.get("container", {})
            json_dict = container.get("json_dict", {})
            # Themes are in the panels or related data
            tribe_links = json_dict.get("tribe", [])
            theme_links = json_dict.get("themes", [])
            for t in (theme_links or []):
                themes.append({
                    "name": t.get("name", ""),
                    "slug": t.get("slug", ""),
                    "count": t.get("count", 0),
                })

        # Extract card names from average deck
        deck_cards = set()
        decklist = []
        if avg_deck and avg_deck.get("decklist"):
            for card in avg_deck["decklist"]:
                card_name = card.get("name", "")
                if card_name:
                    deck_cards.add(normalize_card_name(card_name))
                    decklist.append({
                        "name": card_name,
                        "name_normalized": normalize_card_name(card_name),
                        "category": card.get("type", card.get("category", "")),
                        "salt": card.get("salt", 0),
                        "price": card.get("price", 0),
                    })

        num_decks = 0
        if cmd_data:
            num_decks = cmd_data.get("num_decks", 0)

        result = {
            "commander": commander_name,
            "num_decks": num_decks,
            "themes": themes,
            "decklist": decklist,
            "deck_card_names": list(deck_cards),
        }

        commander_cache[cache_key] = {"data": result, "timestamp": time.time()}
        return result
    except Exception as e:
        logger.error(f"Error fetching EDHREC data for {commander_name}: {e}")
        return {
            "commander": commander_name,
            "num_decks": 0,
            "themes": [],
            "decklist": [],
            "deck_card_names": [],
            "error": str(e),
        }


# --- API Endpoints ---

@app.post("/api/collection/upload")
async def upload_collection(file: UploadFile = File(...)):
    """Upload a CSV collection file from Archidekt or Moxfield."""
    content = await file.read()
    text = content.decode("utf-8")

    if file.filename and file.filename.endswith(".csv"):
        cards = parse_csv_collection(text)
    else:
        cards = parse_text_collection(text)

    if not cards:
        raise HTTPException(status_code=400, detail="No cards found in uploaded file")

    collection.clear()
    collection.update(cards)

    return {"count": len(collection), "cards": sorted(collection)}


@app.post("/api/collection/text")
async def upload_text_collection(body: dict):
    """Upload collection as plain text."""
    text = body.get("text", "")
    if not text.strip():
        raise HTTPException(status_code=400, detail="No text provided")

    # Detect if it's CSV-like
    if "," in text.splitlines()[0] and len(text.splitlines()[0].split(",")) > 2:
        cards = parse_csv_collection(text)
    else:
        cards = parse_text_collection(text)

    if not cards:
        raise HTTPException(status_code=400, detail="No cards found")

    collection.clear()
    collection.update(cards)

    return {"count": len(collection), "cards": sorted(collection)}


@app.get("/api/collection")
async def get_collection():
    """Get current collection."""
    return {"count": len(collection), "cards": sorted(collection)}


@app.get("/api/commanders")
async def list_commanders(color: Optional[str] = None, search: Optional[str] = None):
    """List all legal commanders, optionally filtered by color identity and name search."""
    commanders = get_cached_commanders()

    results = commanders

    if color:
        color_set = set(color.upper())
        results = [c for c in results if set(c["color_identity"]) == color_set]

    if search:
        search_lower = search.lower()
        results = [c for c in results if search_lower in c["name"].lower()]

    return {"count": len(results), "commanders": results[:200]}


@app.get("/api/commander/{commander_name}")
async def get_commander_detail(commander_name: str, budget: Optional[str] = None, theme: Optional[str] = None):
    """Get commander average deck from EDHREC and compare with collection."""
    data = get_commander_avg_deck(commander_name, budget=budget, theme=theme)

    # Compare with collection
    owned = []
    missing = []
    for card in data.get("decklist", []):
        if card["name_normalized"] in collection:
            owned.append({**card, "owned": True})
        else:
            missing.append({**card, "owned": False})

    return {
        "commander": data["commander"],
        "num_decks": data.get("num_decks", 0),
        "themes": data.get("themes", []),
        "total_cards": len(data.get("decklist", [])),
        "owned_count": len(owned),
        "missing_count": len(missing),
        "match_percentage": round(len(owned) / max(len(data.get("decklist", [])), 1) * 100, 1),
        "owned_cards": owned,
        "missing_cards": missing,
        "error": data.get("error"),
    }


@app.post("/api/recommendations")
async def get_recommendations(
    color: Optional[str] = None,
    search: Optional[str] = None,
    min_owned: int = 20,
    limit: int = 50,
):
    """
    Get commander recommendations based on collection.
    Fetches avg decks for top commanders and ranks by owned card count.
    This is expensive - fetches EDHREC data for each commander checked.
    """
    if not collection:
        raise HTTPException(status_code=400, detail="No collection uploaded. Upload your collection first.")

    commanders = get_cached_commanders()

    # Filter
    if color:
        color_set = set(color.upper())
        commanders = [c for c in commanders if set(c["color_identity"]) == color_set]

    if search:
        search_lower = search.lower()
        commanders = [c for c in commanders if search_lower in c["name"].lower()]

    # Only check top commanders by EDHREC rank (to avoid thousands of requests)
    commanders = sorted(commanders, key=lambda c: c["edhrec_rank"])[:200]

    results = []
    for cmd in commanders:
        data = get_commander_avg_deck(cmd["name"])
        deck_cards = set(data.get("deck_card_names", []))
        if not deck_cards:
            continue

        owned_count = len(deck_cards & collection)
        total = len(deck_cards)

        if owned_count >= min_owned:
            results.append({
                "name": cmd["name"],
                "color_identity": cmd["color_identity"],
                "image_uri": cmd["image_uri"],
                "edhrec_rank": cmd["edhrec_rank"],
                "num_decks": data.get("num_decks", 0),
                "total_cards": total,
                "owned_count": owned_count,
                "match_percentage": round(owned_count / max(total, 1) * 100, 1),
            })

        time.sleep(0.1)  # Rate limiting

    results.sort(key=lambda r: r["match_percentage"], reverse=True)
    return {"results": results[:limit]}


@app.get("/api/health")
async def health():
    return {"status": "ok", "collection_size": len(collection)}
