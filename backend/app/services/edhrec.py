"""EDHREC client: average decks and synergy / top-card lists for a commander.

EDHREC publishes the data behind each page as JSON on json.edhrec.com, which is what
the site itself loads. We read that directly; the HTML pages carry nothing extra.
"""
import logging
import re
import time

import requests

from .. import cache
from ..domain.names import edhrec_slug, front_face, normalize_card_name

logger = logging.getLogger(__name__)

JSON_BASE = "https://json.edhrec.com/pages"
_QTY_LINE = re.compile(r"^\d+x?\s+(.+)")

http = requests.Session()
http.headers.update({
    "User-Agent": "mtg-collection/0.1 (https://github.com/joebags99/mtg-collection)",
    "Accept": "application/json",
})

SYNERGY_SECTIONS = (
    "high_synergy", "new_cards", "top_creatures", "top_instants", "top_sorceries",
    "top_enchantments", "top_artifacts", "top_lands", "top_planeswalkers",
    "top_utility_lands", "top_mana_artifacts",
)
TOP_TYPE_SECTIONS = tuple(s for s in SYNERGY_SECTIONS if s.startswith("top_"))

# Our section name -> the `tag` EDHREC puts on that card list.
_SECTION_TAGS = {
    "high_synergy": "highsynergycards",
    "new_cards": "newcards",
    "top_creatures": "creatures",
    "top_instants": "instants",
    "top_sorceries": "sorceries",
    "top_enchantments": "enchantments",
    "top_artifacts": "utilityartifacts",
    "top_lands": "lands",
    "top_planeswalkers": "planeswalkers",
    "top_utility_lands": "utilitylands",
    "top_mana_artifacts": "manaartifacts",
}


def _is_missing(resp: requests.Response) -> bool:
    """json.edhrec.com is an S3 bucket: a page that does not exist comes back as 403 AccessDenied, not 404."""
    if resp.status_code == 404:
        return True
    return resp.status_code == 403 and "AccessDenied" in resp.text


def fetch_page(path: str) -> dict | None:
    """The JSON behind an EDHREC page, e.g. "commanders/atraxa-praetors-voice". None when the page does not exist."""
    resp = http.get(f"{JSON_BASE}/{path}.json", timeout=30)
    if _is_missing(resp):
        return None
    resp.raise_for_status()
    return resp.json()


def _commander_page(slug: str) -> dict | None:
    cached = cache.commander_pages.get(slug)
    if cached is not None:
        return cached
    page = fetch_page(f"commanders/{slug}")
    if page is not None:
        cache.commander_pages.set(slug, page)
    return page


def _average_deck_page(slug: str, budget: str | None, theme: str | None) -> dict | None:
    """Try the budget- or theme-specific average deck first, then the plain one."""
    candidates = []
    if budget in ("budget", "expensive"):
        candidates.append(f"average-decks/{slug}/{budget}")
    if theme:
        candidates.append(f"average-decks/{slug}/{theme}")
    candidates.append(f"average-decks/{slug}")
    for path in candidates:
        page = fetch_page(path)
        if page is not None:
            return page
    return None


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


def _json_dict(page: dict) -> dict:
    return page.get("container", {}).get("json_dict", {}) or {}


def _num_decks(page: dict) -> int:
    """How many decks EDHREC has for this commander, from whichever field carries it."""
    for candidate in (page.get("num_decks"), _json_dict(page).get("num_decks"), _json_dict(page).get("card", {}).get("num_decks")):
        if isinstance(candidate, int):
            return candidate
    counts = page.get("bracket_counts") or {}
    return sum(v for v in counts.values() if isinstance(v, int))


def get_synergy_lists(commander_name: str) -> dict[str, list[dict]]:
    """High synergy, new cards, and per-type top cards for a commander."""
    cached = cache.commander_synergy.get(commander_name)
    if cached is not None:
        return cached

    result: dict[str, list[dict]] = {key: [] for key in SYNERGY_SECTIONS}
    slug = edhrec_slug(front_face(commander_name))
    try:
        page = _commander_page(slug)
    except Exception as e:  # noqa: BLE001
        logger.error("Error fetching EDHREC commander page for %s: %s", commander_name, e)
        return result
    if page is None:
        logger.info("EDHREC has no commander page for %s", commander_name)
        cache.commander_synergy.set(commander_name, result)
        return result

    by_tag = {cl.get("tag"): cl.get("cardviews") for cl in _json_dict(page).get("cardlists", []) or [] if isinstance(cl, dict)}
    for key, tag in _SECTION_TAGS.items():
        result[key] = _cardviews(by_tag.get(tag))

    cache.commander_synergy.set(commander_name, result)
    return result


_NAME_KEYS = ("name", "card", "cardname", "card_name", "sanitized_wo", "sanitized")


def _decklist_entry(card, category: str = "") -> dict | None:
    """One average-deck card as our shape, from a "1 Name" string, a [name, qty] pair, or a card object."""
    if isinstance(card, (list, tuple)) and card and isinstance(card[0], str):
        qty = card[1] if len(card) > 1 and isinstance(card[1], int) else 1
        name = card[0]
        return {"name": name, "name_normalized": normalize_card_name(name), "category": category, "qty": qty}
    if isinstance(card, str):
        raw = card.strip()
        match = _QTY_LINE.match(raw)
        name = match.group(1) if match else raw
        return {"name": name, "name_normalized": normalize_card_name(name), "category": category}
    if isinstance(card, dict):
        inner = card.get("card") if isinstance(card.get("card"), dict) else None
        source = inner or card
        name = next((source[k] for k in _NAME_KEYS if isinstance(source.get(k), str) and source[k]), None)
        if not name:
            return None
        return {
            "name": name,
            "name_normalized": normalize_card_name(name),
            "category": source.get("type", source.get("category", source.get("primary_type", category))),
            "inclusion": source.get("inclusion", card.get("inclusion", 0)),
            "synergy": source.get("synergy", card.get("synergy", 0)),
        }
    return None


def _deck_cards(avg_page: dict) -> list[tuple[object, str]]:
    """(entry, category) pairs from an average-deck page, whatever container EDHREC wraps them in.

    The current shape is {"deck": {"cards": {"Artifact": [["Sol Ring", 1], ...], "Land": [...], ...}}}.
    """
    deck = avg_page.get("deck")
    cards = deck.get("cards") if isinstance(deck, dict) else deck
    if isinstance(cards, dict):
        out: list[tuple[object, str]] = []
        for key, value in cards.items():
            if isinstance(value, list):           # {type: [entries]}
                out.extend((entry, key) for entry in value)
            elif isinstance(value, dict):         # {name: {...}}
                out.append(({"name": key, **value}, ""))
            else:                                 # {name: qty}
                out.append(([key, value], ""))
        return out
    if isinstance(cards, list):
        return [(entry, "") for entry in cards]
    return []


def parse_decklist(avg_page: dict, commander_name: str = "") -> list[dict]:
    cards = _deck_cards(avg_page)
    decklist = [e for e in (_decklist_entry(entry, category) for entry, category in cards) if e]
    if cards and not decklist:
        sample = repr(cards[0][0])[:300]
        logger.warning("EDHREC average deck for %s has %d entries but none parsed; first entry: %s",
                       commander_name, len(cards), sample)
    return decklist


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

    slug = edhrec_slug(front_face(commander_name))
    try:
        avg_page = _average_deck_page(slug, budget, theme)
        cmd_page = _commander_page(slug) or {}
    except Exception as e:  # noqa: BLE001
        logger.error("Error fetching EDHREC data for %s: %s", commander_name, e)
        return _empty_deck(commander_name, str(e))

    if avg_page is None:
        logger.info("EDHREC has no average deck for %s", commander_name)
        result = _empty_deck(commander_name)
        cache.commander_decks.set(key, result)
        return result

    themes = []
    for t in _json_dict(cmd_page).get("themes", []) or []:
        if isinstance(t, dict):
            themes.append({"name": t.get("name", ""), "slug": t.get("slug", ""), "count": t.get("count", 0)})

    decklist = parse_decklist(avg_page, commander_name)
    result = {
        "commander": commander_name,
        "num_decks": _num_decks(cmd_page) or _num_decks(avg_page),
        "themes": themes,
        "decklist": decklist,
        "deck_card_names": list({c["name_normalized"] for c in decklist}),
    }
    cache.commander_decks.set(key, result)
    return result


def polite_pause(seconds: float = 0.1) -> None:
    time.sleep(seconds)
