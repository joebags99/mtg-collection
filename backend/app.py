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

# Price cache: normalized card name -> price in USD
price_cache: dict[str, float] = {}
PRICE_CACHE_TTL = 86400  # 24 hours
_price_cache_time: float = 0

# Synergy/type card cache
synergy_cache: dict[str, dict] = {}


def normalize_card_name(name: str) -> str:
    """Normalize card name for comparison: lowercase, strip whitespace."""
    name = name.strip().lower()
    if "//" in name:
        name = name.split("//")[0].strip()
    return name


def parse_csv_collection(content: str) -> set[str]:
    """Parse CSV from Archidekt or Moxfield export. Returns set of normalized card names."""
    cards = set()
    reader = csv.DictReader(io.StringIO(content))
    name_columns = ["Name", "name", "Card", "card", "Card Name", "card_name"]

    for row in reader:
        for col in name_columns:
            if col in row and row[col]:
                cards.add(normalize_card_name(row[col]))
                break
        else:
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
            params = {}
            time.sleep(0.1)
        else:
            url = None

    return commanders


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


def fetch_prices_bulk(card_names: list[str]) -> dict[str, float]:
    """Fetch prices for multiple cards using Scryfall collection endpoint."""
    global _price_cache_time
    prices = {}
    uncached = []

    for name in card_names:
        normalized = normalize_card_name(name)
        if normalized in price_cache and (time.time() - _price_cache_time < PRICE_CACHE_TTL):
            prices[normalized] = price_cache[normalized]
        else:
            uncached.append(name)

    for i in range(0, len(uncached), 75):
        batch = uncached[i:i+75]
        identifiers = [{"name": name} for name in batch]
        try:
            resp = requests.post(
                "https://api.scryfall.com/cards/collection",
                json={"identifiers": identifiers},
                timeout=15,
            )
            if resp.status_code == 200:
                data = resp.json()
                for card in data.get("data", []):
                    card_prices = card.get("prices", {})
                    usd = card_prices.get("usd") or card_prices.get("usd_foil")
                    if usd:
                        normalized = normalize_card_name(card["name"])
                        price_val = float(usd)
                        price_cache[normalized] = price_val
                        prices[normalized] = price_val
                _price_cache_time = time.time()
            time.sleep(0.1)
        except Exception as e:
            logger.error(f"Error fetching bulk prices: {e}")

    return prices


def extract_cardview_names(cardviews) -> list[dict]:
    """Extract card info from EDHREC cardview objects."""
    results = []
    if not cardviews:
        return results
    for cv in cardviews:
        if isinstance(cv, dict):
            name = cv.get("name", "")
            if name:
                results.append({
                    "name": name,
                    "name_normalized": normalize_card_name(name),
                    "synergy": cv.get("synergy", 0),
                    "inclusion": cv.get("inclusion", 0),
                    "label": cv.get("label", ""),
                })
        elif isinstance(cv, str):
            results.append({
                "name": cv,
                "name_normalized": normalize_card_name(cv),
                "synergy": 0,
                "inclusion": 0,
                "label": "",
            })
    return results


def get_commander_synergy_cards(commander_name: str) -> dict:
    """Get high synergy cards, new cards, and type-specific top cards from EDHREC."""
    cache_key = commander_name
    if cache_key in synergy_cache and (time.time() - synergy_cache[cache_key].get("timestamp", 0) < CACHE_TTL):
        return synergy_cache[cache_key]["data"]

    name_for_edhrec = commander_name.split("//")[0].strip()
    formatted = edhrec.format_card_name(name_for_edhrec)

    result = {
        "high_synergy": [],
        "new_cards": [],
        "top_creatures": [],
        "top_instants": [],
        "top_sorceries": [],
        "top_enchantments": [],
        "top_artifacts": [],
        "top_lands": [],
        "top_planeswalkers": [],
        "top_utility_lands": [],
        "top_mana_artifacts": [],
    }

    method_map = {
        "high_synergy": edhrec.get_high_synergy_cards,
        "new_cards": edhrec.get_new_cards,
        "top_creatures": edhrec.get_top_creatures,
        "top_instants": edhrec.get_top_instants,
        "top_sorceries": edhrec.get_top_sorceries,
        "top_enchantments": edhrec.get_top_enchantments,
        "top_artifacts": edhrec.get_top_artifacts,
        "top_lands": edhrec.get_top_lands,
        "top_planeswalkers": edhrec.get_top_planeswalkers,
        "top_utility_lands": edhrec.get_top_utility_lands,
        "top_mana_artifacts": edhrec.get_top_mana_artifacts,
    }

    for key, method in method_map.items():
        try:
            raw = method(formatted)
            # raw is a dict like {"Header": [cardviews...]}
            if isinstance(raw, dict):
                for header, cards in raw.items():
                    result[key] = extract_cardview_names(cards)
        except Exception as e:
            logger.error(f"Error fetching {key} for {commander_name}: {e}")

    synergy_cache[cache_key] = {"data": result, "timestamp": time.time()}
    return result


scryfall_type_cache = {}


def fetch_card_types_bulk(card_names: list[str]) -> dict[str, str]:
    """Fetch card types from Scryfall collection endpoint for cards we can't classify locally."""
    result = {}
    uncached = [n for n in card_names if n not in scryfall_type_cache]
    # Return cached results first
    for n in card_names:
        if n in scryfall_type_cache:
            result[n] = scryfall_type_cache[n]

    # Batch fetch uncached cards from Scryfall
    for i in range(0, len(uncached), 75):
        batch = uncached[i:i+75]
        identifiers = [{"name": n} for n in batch]
        try:
            resp = requests.post(
                "https://api.scryfall.com/cards/collection",
                json={"identifiers": identifiers},
                timeout=15,
            )
            if resp.status_code == 200:
                for card in resp.json().get("data", []):
                    name = card.get("name", "")
                    type_line = card.get("type_line", "")
                    card_type = _parse_type_line(type_line)
                    scryfall_type_cache[name] = card_type
                    result[name] = card_type
            time.sleep(0.1)
        except Exception as e:
            logger.error(f"Scryfall type fetch error: {e}")

    return result


def _parse_type_line(type_line: str) -> str:
    """Parse a Scryfall type_line into our categories."""
    # Use the front face only for DFCs
    front = type_line.split("//")[0].strip().lower()
    if "creature" in front:
        return "Creature"
    if "planeswalker" in front:
        return "Planeswalker"
    if "instant" in front:
        return "Instant"
    if "sorcery" in front:
        return "Sorcery"
    if "enchantment" in front:
        return "Enchantment"
    if "artifact" in front:
        return "Artifact"
    if "land" in front:
        return "Land"
    return "Other"


def classify_card_type(card_name: str, type_data: dict) -> str:
    """Determine card type from the type-specific lists."""
    normalized = normalize_card_name(card_name)
    type_map = [
        ("Creature", "top_creatures"),
        ("Instant", "top_instants"),
        ("Sorcery", "top_sorceries"),
        ("Enchantment", "top_enchantments"),
        ("Artifact", "top_artifacts"),
        ("Artifact", "top_mana_artifacts"),
        ("Planeswalker", "top_planeswalkers"),
        ("Land", "top_lands"),
        ("Land", "top_utility_lands"),
    ]
    for type_name, key in type_map:
        for card in type_data.get(key, []):
            if card.get("name_normalized") == normalized:
                return type_name
    return ""


def get_commander_avg_deck(commander_name: str, budget: str = None, theme: str = None) -> dict:
    """Get average deck for a commander from EDHREC, with caching."""
    cache_key = f"{commander_name}|{budget or ''}|{theme or ''}"

    cached = commander_cache.get(cache_key)
    if cached and (time.time() - cached["timestamp"] < CACHE_TTL):
        return cached["data"]

    try:
        name_for_edhrec = commander_name.split("//")[0].strip()
        formatted = edhrec.format_card_name(name_for_edhrec)

        avg_deck = edhrec.get_commanders_average_deck(formatted, budget)
        cmd_data = edhrec.get_commander_data(formatted)

        # Extract themes
        themes = []
        if cmd_data:
            container = cmd_data.get("container", {})
            json_dict = container.get("json_dict", {})
            theme_links = json_dict.get("themes", [])
            for t in (theme_links or []):
                if isinstance(t, dict):
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
                if isinstance(card, str):
                    card_raw = card.strip()
                    qty_match = re.match(r"^\d+x?\s+(.+)", card_raw)
                    card_name = qty_match.group(1) if qty_match else card_raw
                    deck_cards.add(normalize_card_name(card_name))
                    decklist.append({
                        "name": card_name,
                        "name_normalized": normalize_card_name(card_name),
                        "category": "",
                    })
                elif isinstance(card, dict):
                    card_name = card.get("name", "")
                    if card_name:
                        deck_cards.add(normalize_card_name(card_name))
                        decklist.append({
                            "name": card_name,
                            "name_normalized": normalize_card_name(card_name),
                            "category": card.get("type", card.get("category", "")),
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
    text = body.get("text", "")
    if not text.strip():
        raise HTTPException(status_code=400, detail="No text provided")

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
    return {"count": len(collection), "cards": sorted(collection)}


@app.post("/api/collection/restore")
async def restore_collection(body: dict):
    cards = body.get("cards", [])
    if not cards:
        raise HTTPException(status_code=400, detail="No cards provided")

    collection.clear()
    for card in cards:
        collection.add(normalize_card_name(card))
    return {"count": len(collection), "cards": sorted(collection)}


@app.get("/api/commanders")
async def list_commanders(color: Optional[str] = None, search: Optional[str] = None):
    commanders = get_cached_commanders()
    results = commanders

    if color:
        color_set = set(color.upper())
        results = [c for c in results if set(c["color_identity"]) == color_set]

    if search:
        search_lower = search.lower()
        results = [c for c in results if search_lower in c["name"].lower()]

    return {"count": len(results), "commanders": results[:200]}


@app.get("/api/commanders/popular")
async def popular_commanders():
    commanders = get_cached_commanders()
    top = sorted(commanders, key=lambda c: c["edhrec_rank"])[:50]
    return {"commanders": top}


@app.get("/api/commander/{commander_name}")
async def get_commander_detail(
    commander_name: str,
    budget: Optional[str] = None,
    theme: Optional[str] = None,
    include_prices: bool = True,
):
    """Get commander average deck from EDHREC, compare with collection, categorize by type."""
    data = get_commander_avg_deck(commander_name, budget=budget, theme=theme)

    # Get type-specific data for categorization
    type_data = {}
    try:
        type_data = get_commander_synergy_cards(commander_name)
    except Exception as e:
        logger.error(f"Error fetching type data for {commander_name}: {e}")

    # Build a set of all cards in the avg deck
    avg_deck_names = set(c["name_normalized"] for c in data.get("decklist", []))

    # First pass: classify what we can from EDHREC type data
    all_cards = []
    unclassified_names = []
    for card in data.get("decklist", []):
        card_type = card.get("category", "") or classify_card_type(card["name"], type_data)
        all_cards.append({**card, "card_type": card_type})
        if not card_type:
            unclassified_names.append(card["name"])

    # Fallback: fetch types from Scryfall for unclassified cards
    if unclassified_names:
        scryfall_types = fetch_card_types_bulk(unclassified_names)
        for card in all_cards:
            if not card["card_type"] and card["name"] in scryfall_types:
                card["card_type"] = scryfall_types[card["name"]]

    # Split into owned/missing
    owned = []
    missing = []
    missing_names = []
    for card in all_cards:
        if card["name_normalized"] in collection:
            owned.append({**card, "owned": True})
        else:
            missing.append({**card, "owned": False})
            missing_names.append(card["name"])

    # Fetch prices for missing cards
    total_missing_price = 0
    if include_prices and missing_names:
        prices = fetch_prices_bulk(missing_names)
        for card in missing:
            price = prices.get(card["name_normalized"])
            card["price"] = price
            if price:
                total_missing_price += price

    # Build recommendations: synergy/new/top cards not in avg deck (both owned and not)
    recommendations = []
    seen_recs = set()
    for key in ["high_synergy", "new_cards"]:
        for card in type_data.get(key, []):
            normalized = card["name_normalized"]
            if normalized not in avg_deck_names and normalized not in seen_recs:
                seen_recs.add(normalized)
                recommendations.append({
                    "name": card["name"],
                    "name_normalized": normalized,
                    "synergy": card.get("synergy", 0),
                    "inclusion": card.get("inclusion", 0),
                    "source": "High Synergy" if key == "high_synergy" else "New Card",
                    "owned": normalized in collection,
                })

    # Also check all type-specific top cards
    for key in ["top_creatures", "top_instants", "top_sorceries", "top_enchantments",
                "top_artifacts", "top_lands", "top_planeswalkers", "top_utility_lands",
                "top_mana_artifacts"]:
        for card in type_data.get(key, []):
            normalized = card["name_normalized"]
            if normalized not in avg_deck_names and normalized not in seen_recs:
                seen_recs.add(normalized)
                type_label = key.replace("top_", "").replace("_", " ").title()
                recommendations.append({
                    "name": card["name"],
                    "name_normalized": normalized,
                    "synergy": card.get("synergy", 0),
                    "inclusion": card.get("inclusion", 0),
                    "source": f"Top {type_label}",
                    "owned": normalized in collection,
                })

    # Sort recommendations by synergy descending
    recommendations.sort(key=lambda r: r.get("synergy", 0), reverse=True)

    return {
        "commander": data["commander"],
        "num_decks": data.get("num_decks", 0),
        "themes": data.get("themes", []),
        "total_cards": len(data.get("decklist", [])),
        "owned_count": len(owned),
        "missing_count": len(missing),
        "match_percentage": round(len(owned) / max(len(data.get("decklist", [])), 1) * 100, 1),
        "total_missing_price": round(total_missing_price, 2),
        "owned_cards": owned,
        "missing_cards": missing,
        "recommendations": recommendations,
        "error": data.get("error"),
    }


@app.post("/api/recommendations")
async def get_recommendations(
    color: Optional[str] = None,
    search: Optional[str] = None,
    min_owned: int = 20,
    limit: int = 50,
):
    if not collection:
        raise HTTPException(status_code=400, detail="No collection uploaded. Upload your collection first.")

    commanders = get_cached_commanders()

    if color:
        color_set = set(color.upper())
        commanders = [c for c in commanders if set(c["color_identity"]) == color_set]

    if search:
        search_lower = search.lower()
        commanders = [c for c in commanders if search_lower in c["name"].lower()]

    commanders = sorted(commanders, key=lambda c: c["edhrec_rank"])[:200]

    results = []
    for cmd in commanders:
        data = get_commander_avg_deck(cmd["name"])
        deck_cards = set(data.get("deck_card_names", []))
        if not deck_cards:
            continue

        owned_count = len(deck_cards & collection)
        missing_count = len(deck_cards) - owned_count
        total = len(deck_cards)

        if owned_count >= min_owned:
            missing_names = [
                card["name"] for card in data.get("decklist", [])
                if card["name_normalized"] not in collection
            ]

            results.append({
                "name": cmd["name"],
                "color_identity": cmd["color_identity"],
                "image_uri": cmd["image_uri"],
                "edhrec_rank": cmd["edhrec_rank"],
                "num_decks": data.get("num_decks", 0),
                "total_cards": total,
                "owned_count": owned_count,
                "missing_count": missing_count,
                "match_percentage": round(owned_count / max(total, 1) * 100, 1),
                "_missing_names": missing_names,
            })

        time.sleep(0.1)

    # Fetch prices for all missing cards across all results
    all_missing = set()
    for r in results:
        all_missing.update(r.get("_missing_names", []))
    if all_missing:
        prices = fetch_prices_bulk(list(all_missing))
        for r in results:
            total_price = 0
            for name in r.pop("_missing_names", []):
                p = prices.get(normalize_card_name(name))
                if p:
                    total_price += p
            r["missing_price"] = round(total_price, 2)
    else:
        for r in results:
            r.pop("_missing_names", None)
            r["missing_price"] = 0

    results.sort(key=lambda r: r["match_percentage"], reverse=True)
    return {"results": results[:limit]}


@app.get("/api/health")
async def health():
    return {"status": "ok", "collection_size": len(collection)}
