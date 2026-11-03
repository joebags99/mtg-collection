"""EDHREC client: average decks and synergy / top-card lists for a commander."""
import logging
import re
import time

from pyedhrec import EDHRec

from .. import cache
from ..domain.names import edhrec_slug, front_face, normalize_card_name

logger = logging.getLogger(__name__)

_client = EDHRec()
_QTY_LINE = re.compile(r"^\d+x?\s+(.+)")

SYNERGY_SECTIONS = (
    "high_synergy", "new_cards", "top_creatures", "top_instants", "top_sorceries",
    "top_enchantments", "top_artifacts", "top_lands", "top_planeswalkers",
    "top_utility_lands", "top_mana_artifacts",
)
TOP_TYPE_SECTIONS = tuple(s for s in SYNERGY_SECTIONS if s.startswith("top_"))


def _cardviews(cardviews) -> list[dict]:
    """Normalize EDHREC cardview objects (dicts or bare names) into our card shape."""
    results = []
    for cv in cardviews or []:
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
            results.append({"name": cv, "name_normalized": normalize_card_name(cv),
                            "synergy": 0, "inclusion": 0, "label": ""})
    return results


def get_synergy_lists(commander_name: str) -> dict[str, list[dict]]:
    """High synergy, new cards, and per-type top cards for a commander."""
    cached = cache.commander_synergy.get(commander_name)
    if cached is not None:
        return cached

    slug = edhrec_slug(front_face(commander_name))
    methods = {
        "high_synergy": _client.get_high_synergy_cards,
        "new_cards": _client.get_new_cards,
        "top_creatures": _client.get_top_creatures,
        "top_instants": _client.get_top_instants,
        "top_sorceries": _client.get_top_sorceries,
        "top_enchantments": _client.get_top_enchantments,
        "top_artifacts": _client.get_top_artifacts,
        "top_lands": _client.get_top_lands,
        "top_planeswalkers": _client.get_top_planeswalkers,
        "top_utility_lands": _client.get_top_utility_lands,
        "top_mana_artifacts": _client.get_top_mana_artifacts,
    }
    result = {key: [] for key in SYNERGY_SECTIONS}
    for key, method in methods.items():
        try:
            raw = method(slug)
            if isinstance(raw, dict):
                for cards in raw.values():
                    result[key] = _cardviews(cards)
        except Exception as e:  # noqa: BLE001
            logger.error("Error fetching %s for %s: %s", key, commander_name, e)

    cache.commander_synergy.set(commander_name, result)
    return result


def _decklist_entry(card) -> dict | None:
    if isinstance(card, str):
        raw = card.strip()
        match = _QTY_LINE.match(raw)
        name = match.group(1) if match else raw
        return {"name": name, "name_normalized": normalize_card_name(name), "category": ""}
    if isinstance(card, dict) and card.get("name"):
        name = card["name"]
        return {
            "name": name,
            "name_normalized": normalize_card_name(name),
            "category": card.get("type", card.get("category", "")),
            "inclusion": card.get("inclusion", 0),
            "synergy": card.get("synergy", 0),
        }
    return None


def _empty_deck(commander_name: str, error: str | None = None) -> dict:
    deck = {"commander": commander_name, "num_decks": 0, "themes": [], "decklist": [], "deck_card_names": []}
    if error:
        deck["error"] = error
    return deck


def get_average_deck(commander_name: str, budget: str | None = None, theme: str | None = None) -> dict:
    """EDHREC average deck for a commander (or a pre-built partner-pair slug)."""
    key = f"{commander_name}|{budget or ''}|{theme or ''}"
    cached = cache.commander_decks.get(key)
    if cached is not None:
        return cached

    try:
        slug = edhrec_slug(front_face(commander_name))
        avg_deck = _client.get_commanders_average_deck(slug, budget)
        cmd_data = _client.get_commander_data(slug) or {}

        themes = []
        for t in cmd_data.get("container", {}).get("json_dict", {}).get("themes", []) or []:
            if isinstance(t, dict):
                themes.append({"name": t.get("name", ""), "slug": t.get("slug", ""), "count": t.get("count", 0)})

        decklist = [e for e in map(_decklist_entry, (avg_deck or {}).get("decklist", [])) if e]
        result = {
            "commander": commander_name,
            "num_decks": cmd_data.get("num_decks", 0),
            "themes": themes,
            "decklist": decklist,
            "deck_card_names": list({c["name_normalized"] for c in decklist}),
        }
        cache.commander_decks.set(key, result)
        return result
    except Exception as e:  # noqa: BLE001
        logger.error("Error fetching EDHREC data for %s: %s", commander_name, e)
        return _empty_deck(commander_name, str(e))


def polite_pause(seconds: float = 0.1) -> None:
    time.sleep(seconds)
