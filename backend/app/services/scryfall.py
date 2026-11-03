"""Scryfall client: commander catalog, prices, card facts, and name validation.

All functions are synchronous and block on the network; call them from a thread
pool when inside an async route.
"""
import logging
import time

import requests

from .. import cache
from ..config import COMMANDER_LIST_TTL, EXTERNAL_API_DELAY
from ..domain.classify import parse_type_line
from ..domain.names import front_face, normalize_card_name
from ..domain.partners import detect_partner_type, partner_variant_label, partner_with_name

logger = logging.getLogger(__name__)

SEARCH_URL = "https://api.scryfall.com/cards/search"
COLLECTION_URL = "https://api.scryfall.com/cards/collection"
BATCH_SIZE = 75  # Scryfall's limit for /cards/collection


def _batches(items: list, size: int = BATCH_SIZE):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def _collection_lookup(names: list[str], timeout: int = 30) -> list[dict]:
    """POST a batch of names to /cards/collection. Returns the found cards (missing ones are dropped)."""
    resp = requests.post(COLLECTION_URL, json={"identifiers": [{"name": n} for n in names]}, timeout=timeout)
    resp.raise_for_status()
    return resp.json().get("data", [])


def _image_uris(card: dict) -> dict:
    return card.get("image_uris") or (card.get("card_faces", [{}])[0].get("image_uris") or {})


def _search_all(query: str) -> list[dict]:
    """Page through a Scryfall search ordered by EDHREC rank."""
    url, params = SEARCH_URL, {"q": query, "order": "edhrec", "unique": "cards"}
    found: list[dict] = []
    while url:
        resp = requests.get(url, params=params)
        if resp.status_code != 200:
            logger.error("Scryfall search error %s for %r", resp.status_code, query)
            break
        data = resp.json()
        found.extend(data.get("data", []))
        if not data.get("has_more"):
            break
        url, params = data.get("next_page"), {}
        time.sleep(EXTERNAL_API_DELAY)
    return found


def _commander_entry(card: dict, partner_type: str) -> dict:
    uris = _image_uris(card)
    normalized = normalize_card_name(card["name"])
    cache.remember_oracle(normalized, card)
    entry = {
        "name": card["name"],
        "name_normalized": normalized,
        "color_identity": card.get("color_identity", []),
        "image_uri": uris.get("normal", ""),
        "art_crop": uris.get("art_crop", ""),
        "edhrec_rank": card.get("edhrec_rank", 999999),
        "partner_type": partner_type,
        "type_line": card.get("type_line", ""),
    }
    if partner_type == "partner_with":
        entry["partner_with"] = partner_with_name(card)
    if partner_type == "partner_variant":
        entry["partner_variant_label"] = partner_variant_label(card)
    return entry


def fetch_all_commanders() -> list[dict]:
    """Every legal commander plus every Background, with partner metadata."""
    commanders = [_commander_entry(c, detect_partner_type(c)) for c in _search_all("is:commander f:commander")]
    seen = {c["name_normalized"] for c in commanders}
    for card in _search_all("t:background t:legendary t:enchantment f:commander"):
        if normalize_card_name(card["name"]) not in seen:
            entry = _commander_entry(card, "background")
            commanders.append(entry)
            seen.add(entry["name_normalized"])
    return commanders


_commanders: list[dict] = []
_commanders_fetched_at: float = 0.0


def get_commanders() -> list[dict]:
    """The commander catalog, refreshed once a day."""
    global _commanders, _commanders_fetched_at
    if not _commanders or time.time() - _commanders_fetched_at > COMMANDER_LIST_TTL:
        logger.info("Fetching all commanders from Scryfall...")
        _commanders = fetch_all_commanders()
        _commanders_fetched_at = time.time()
        logger.info("Fetched %d commanders", len(_commanders))
    return _commanders


def find_commander(name: str) -> dict | None:
    normalized = normalize_card_name(front_face(name))
    return next((c for c in get_commanders() if c["name_normalized"] == normalized), None)


def fetch_prices(card_names: list[str]) -> dict[str, float]:
    """{normalized name: USD price} using the cheapest of usd / usd_foil available."""
    result: dict[str, float] = {}
    uncached = []
    for name in card_names:
        normalized = normalize_card_name(name)
        cached = cache.prices.get(normalized)
        if cached is not None:
            result[normalized] = cached
        else:
            uncached.append(name)

    for batch in _batches(uncached):
        try:
            for card in _collection_lookup(batch, timeout=15):
                p = card.get("prices", {})
                usd = p.get("usd") or p.get("usd_foil")
                if usd:
                    normalized = normalize_card_name(card["name"])
                    cache.prices.set(normalized, float(usd))
                    result[normalized] = float(usd)
            time.sleep(EXTERNAL_API_DELAY)
        except Exception as e:  # noqa: BLE001
            logger.error("Error fetching bulk prices: %s", e)
    return result


def _remember_facts(card: dict) -> str:
    """Cache type, oracle, and mana for a Scryfall card. Returns its normalized name."""
    normalized = normalize_card_name(card.get("name", ""))
    cache.card_types.setdefault(normalized, parse_type_line(card.get("type_line", "")))
    cache.remember_oracle(normalized, card)
    mana_cost = card.get("mana_cost", "")
    if not mana_cost and card.get("card_faces"):
        mana_cost = card["card_faces"][0].get("mana_cost", "")
    cache.mana.setdefault(normalized, {"cmc": card.get("cmc", 0), "mana_cost": mana_cost})
    return normalized


def _fetch_facts(card_names: list[str], known: dict) -> None:
    """Look up any names missing from `known` and populate all fact caches."""
    uncached = [n for n in card_names if normalize_card_name(n) not in known]
    for batch in _batches(uncached):
        try:
            for card in _collection_lookup(batch):
                _remember_facts(card)
            time.sleep(EXTERNAL_API_DELAY)
        except Exception as e:  # noqa: BLE001
            logger.error("Scryfall card fetch error: %s", e)


def fetch_card_types(card_names: list[str]) -> dict[str, str]:
    """{normalized name: card type}."""
    _fetch_facts(card_names, cache.card_types)
    return {n: cache.card_types[n] for n in map(normalize_card_name, card_names) if n in cache.card_types}


def fetch_card_mana(card_names: list[str]) -> dict[str, dict]:
    """{normalized name: {cmc, mana_cost}}."""
    _fetch_facts(card_names, cache.mana)
    return {n: cache.mana[n] for n in map(normalize_card_name, card_names) if n in cache.mana}


def fetch_color_identity_union(card_names: list[str]) -> set[str]:
    """Union of color identities across the given cards. Also caches their oracle text."""
    colors: set[str] = set()
    for batch in _batches([front_face(n) for n in card_names]):
        try:
            for card in _collection_lookup(batch, timeout=15):
                colors.update(card.get("color_identity", []))
                cache.remember_oracle(normalize_card_name(card.get("name", "")), card)
        except Exception as e:  # noqa: BLE001
            logger.error("Color identity fetch error: %s", e)
        time.sleep(EXTERNAL_API_DELAY)
    return colors


def validate_card_names(card_names: list[str]) -> tuple[list[str], list[str]]:
    """Split names into (recognized, unrecognized). On Scryfall failure everything is treated as valid."""
    by_front: dict[str, list[str]] = {}
    for name in card_names:
        by_front.setdefault(front_face(name), []).append(name)

    valid: list[str] = []
    invalid: list[str] = []
    for batch in _batches(list(by_front)):
        try:
            found = {normalize_card_name(c["name"]) for c in _collection_lookup(batch, timeout=15)}
            for front in batch:
                (valid if normalize_card_name(front) in found else invalid).extend(by_front[front])
            time.sleep(EXTERNAL_API_DELAY)
        except Exception as e:  # noqa: BLE001
            logger.error("Card validation error: %s", e)
            for front in batch:
                valid.extend(by_front[front])
    return valid, invalid
