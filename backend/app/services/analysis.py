"""Analysis that combines the collection, EDHREC data, and Scryfall facts.

Each function here is synchronous and may block on the network. Routes run
them in a thread pool.
"""
import time

from .. import cache
from ..domain.classify import (EDHREC_LIST_TYPES, card_type_from_edhrec_lists,
                               classify_functional_category, derive_functional_tags)
from ..domain.names import front_face, normalize_card_name, partner_pair_slug
from ..domain.partners import compatible_partners
from ..state import WorkingState
from . import edhrec, scryfall

COLOR_ORDER = ("W", "U", "B", "R", "G")


def enrich_deck(deck: dict) -> dict:
    """Attach commander art and color identity to a saved deck."""
    lookup = {c["name_normalized"]: c for c in scryfall.get_commanders()}
    commander_name = deck.get("commander", "")
    partner_name = deck.get("partner", "")
    cmd = lookup.get(normalize_card_name(commander_name), {}) if commander_name else {}
    partner = lookup.get(normalize_card_name(partner_name), {}) if partner_name else {}

    colors = set(cmd.get("color_identity", [])) | set(partner.get("color_identity", []))
    result = {
        "id": deck["id"],
        "name": deck.get("name", ""),
        "commander": commander_name,
        "cards": deck.get("cards", {}),
        "card_count": sum(deck.get("cards", {}).values()),
        "color_identity": [c for c in COLOR_ORDER if c in colors],
        "image_uri": cmd.get("image_uri", ""),
        "art_crop": cmd.get("art_crop", ""),
        "partner_type": cmd.get("partner_type", ""),
    }
    if partner_name and partner:
        result["partner"] = partner_name
        result["partner_image_uri"] = partner.get("image_uri", "")
        result["partner_color_identity"] = partner.get("color_identity", [])
    return result


def collection_stats(state: WorkingState) -> dict:
    """Type, color, curve, and value breakdown of the whole collection."""
    names = list(state.collection)
    types = scryfall.fetch_card_types(names)
    mana = scryfall.fetch_card_mana(names)
    prices = scryfall.fetch_prices(names)

    cards, total_value = [], 0.0
    type_counts: dict[str, int] = {}
    color_counts = {c: 0 for c in (*COLOR_ORDER, "C")}
    cmc_distribution: dict[str, int] = {}

    for name, qty in state.collection.items():
        card_type = types.get(name, "Other")
        info = mana.get(name, {})
        price = prices.get(name)
        cmc, mana_cost = info.get("cmc", 0), info.get("mana_cost", "")
        cards.append({"name": name, "qty": qty, "card_type": card_type, "cmc": cmc,
                      "mana_cost": mana_cost, "price": price})
        if price:
            total_value += price * qty
        type_counts[card_type] = type_counts.get(card_type, 0) + qty

        colored = False
        for color in COLOR_ORDER:
            if "{" + color + "}" in mana_cost or "/" + color in mana_cost or color + "/" in mana_cost:
                color_counts[color] += qty
                colored = True
        if not colored and card_type != "Land":
            color_counts["C"] += qty

        bucket = str(min(int(cmc), 7)) if cmc else "0"
        cmc_distribution[bucket] = cmc_distribution.get(bucket, 0) + qty

    priced = sorted((c for c in cards if c["price"]), key=lambda c: c["price"], reverse=True)
    usage = state.cards_in_decks()
    return {
        "total_unique": len(state.collection),
        "total_cards": sum(state.collection.values()),
        "total_value": round(total_value, 2),
        "total_in_decks": sum(u.get("total_in_decks", 0) for u in usage.values()),
        "type_counts": type_counts,
        "color_counts": color_counts,
        "cmc_distribution": cmc_distribution,
        "top_valuable": priced[:10],
    }


def _average_deck_for(commander: str, partner: str | None, budget, theme) -> dict:
    """Prefer EDHREC's combined partner-pair page when a partner is given."""
    name = front_face(commander)
    if partner:
        try:
            combined = edhrec.get_average_deck(partner_pair_slug(name, partner), budget=budget, theme=theme)
            if combined.get("decklist") and not combined.get("error"):
                return {**combined, "commander": f"{name} // {front_face(partner)}"}
        except Exception:  # noqa: BLE001
            pass
    return edhrec.get_average_deck(name, budget=budget, theme=theme)


def _attach_types(cards: list[dict], type_data: dict) -> None:
    """Fill card_type from EDHREC lists, then Scryfall for whatever is left."""
    for card in cards:
        card["card_type"] = card.get("card_type") or card_type_from_edhrec_lists(card["name_normalized"], type_data)
    missing = [c["name"] for c in cards if not c["card_type"]]
    if missing:
        found = scryfall.fetch_card_types(missing)
        for c in cards:
            if not c["card_type"]:
                c["card_type"] = found.get(c["name_normalized"], "")


def _attach_mana(cards: list[dict]) -> None:
    mana = scryfall.fetch_card_mana([c["name"] for c in cards])
    for c in cards:
        info = mana.get(c["name_normalized"], {})
        c["cmc"] = info.get("cmc", 0)
        c["mana_cost"] = info.get("mana_cost", "")


def _classify(card: dict, type_data: dict) -> None:
    card["functional_category"] = classify_functional_category(
        card["name_normalized"], card.get("card_type", ""), type_data,
        cache.oracle_text.get(card["name_normalized"], ""),
    )


def _recommendations(type_data: dict, exclude: set[str], collection: dict) -> list[dict]:
    """Synergy, new, and top-type cards not already in the average deck."""
    type_lookup = {c["name_normalized"]: label
                   for key, label in EDHREC_LIST_TYPES.items() for c in type_data.get(key, [])}
    recs, seen = [], set()

    def add(card, source, card_type):
        n = card["name_normalized"]
        if n in exclude or n in seen:
            return
        seen.add(n)
        recs.append({"name": card["name"], "name_normalized": n, "synergy": card.get("synergy", 0),
                     "inclusion": card.get("inclusion", 0), "source": source,
                     "owned": n in collection, "card_type": card_type})

    for card in type_data.get("high_synergy", []):
        add(card, "High Synergy", type_lookup.get(card["name_normalized"], ""))
    for card in type_data.get("new_cards", []):
        add(card, "New Card", type_lookup.get(card["name_normalized"], ""))
    for key in edhrec.TOP_TYPE_SECTIONS:
        label = key.replace("top_", "").replace("_", " ").title()
        for card in type_data.get(key, []):
            add(card, f"Top {label}", EDHREC_LIST_TYPES[key])

    _attach_types(recs, type_data)
    if recs:
        _attach_mana(recs)
    for r in recs:
        _classify(r, type_data)
    recs.sort(key=lambda r: r.get("synergy", 0), reverse=True)
    return recs


def commander_detail(state: WorkingState, commander_name: str, *, budget=None, theme=None,
                     include_prices=True, exclude_in_decks=False, partner=None) -> dict:
    """The average deck for a commander split into owned and missing, with recommendations."""
    name = front_face(commander_name)
    data = _average_deck_for(name, partner, budget, theme)
    type_data = edhrec.get_synergy_lists(name)

    cards = [{**c, "card_type": c.get("category", "")} for c in data.get("decklist", [])]
    _attach_types(cards, type_data)
    if cards:
        _attach_mana(cards)

    available = state.available_cards(exclude_in_decks)
    usage = state.cards_in_decks()
    owned, missing = [], []
    for card in cards:
        n = card["name_normalized"]
        card_usage = usage.get(n, {})
        entry = {**card, "qty_owned": state.collection.get(n, 0),
                 "qty_in_decks": card_usage.get("total_in_decks", 0),
                 "in_decks": card_usage.get("decks", [])}
        if n in available:
            owned.append({**entry, "owned": True})
        else:
            missing.append({**entry, "owned": False})

    total_missing_price = 0.0
    if include_prices and missing:
        prices = scryfall.fetch_prices([c["name"] for c in missing])
        for c in missing:
            c["price"] = prices.get(c["name_normalized"])
            total_missing_price += c["price"] or 0

    for c in owned + missing:
        _classify(c, type_data)

    avg_deck_names = {c["name_normalized"] for c in cards}
    recommendations = _recommendations(type_data, avg_deck_names, state.collection)

    total = len(cards)
    return {
        "commander": data["commander"],
        "num_decks": data.get("num_decks", 0),
        "themes": data.get("themes", []),
        "total_cards": total,
        "owned_count": len(owned),
        "missing_count": len(missing),
        "match_percentage": round(len(owned) / max(total, 1) * 100, 1),
        "total_missing_price": round(total_missing_price, 2),
        "owned_cards": owned,
        "missing_cards": missing,
        "recommendations": recommendations,
        "error": data.get("error"),
    }


def _solo_commanders(commanders: list[dict]) -> list[dict]:
    """Commanders that can lead a deck by themselves. Backgrounds are enchantments that only pair."""
    return [c for c in commanders if c.get("partner_type") != "background"]


def _pair_for(cmd: dict, catalog: list[dict]) -> dict | None:
    """The fixed partner of a 'Partner with' commander, when it has exactly one."""
    if cmd.get("partner_type") != "partner_with":
        return None
    partners = compatible_partners(cmd, catalog)
    return partners[0] if len(partners) == 1 else None


def _deck_for(cmd: dict, catalog: list[dict], theme: str | None = None) -> tuple[dict, str | None]:
    """The average deck to score a commander against, preferring the pair page for 'Partner with'.

    Returns (deck, partner name or None).
    """
    partner = _pair_for(cmd, catalog)
    if partner:
        pair = edhrec.get_average_deck(partner_pair_slug(cmd["name"], partner["name"]), theme=theme)
        if pair.get("deck_card_names"):
            return pair, partner["name"]
    return edhrec.get_average_deck(cmd["name"], theme=theme), None


def recommend_commanders(state: WorkingState, *, color=None, search=None, min_owned=20, min_colors=0,
                         tag=None, limit=50, exclude_in_decks=False) -> list[dict]:
    """Rank popular commanders by how much of their average deck the collection covers.

    `tag` narrows to commanders EDHREC tags with that archetype and scores them against
    the archetype's own average deck when EDHREC publishes one.
    """
    available = state.available_cards(exclude_in_decks)
    catalog = scryfall.get_commanders()
    commanders = _solo_commanders(catalog)
    if color:
        wanted = set(color.upper())
        commanders = [c for c in commanders if set(c["color_identity"]) == wanted]
    if min_colors:
        commanders = [c for c in commanders if len(c["color_identity"]) >= min_colors]
    if search:
        commanders = [c for c in commanders if search.lower() in c["name"].lower()]
    commanders = sorted(commanders, key=lambda c: c["edhrec_rank"])[:200]

    results = []
    for cmd in commanders:
        data, partner = _deck_for(cmd, catalog, theme=tag)
        if tag and not any(t["slug"] == tag for t in data.get("themes", [])):
            continue
        deck_cards = set(data.get("deck_card_names", []))
        if not deck_cards:
            continue
        owned_count = len(deck_cards & available)
        if owned_count < min_owned:
            edhrec.polite_pause()
            continue
        results.append({
            "name": cmd["name"],
            "partner": partner,
            "color_identity": cmd["color_identity"],
            "image_uri": cmd["image_uri"],
            "edhrec_rank": cmd["edhrec_rank"],
            "num_decks": data.get("num_decks", 0),
            "tags": data.get("tags", []),
            "total_cards": len(deck_cards),
            "owned_count": owned_count,
            "missing_count": len(deck_cards) - owned_count,
            "match_percentage": round(owned_count / max(len(deck_cards), 1) * 100, 1),
            "_missing": [c["name"] for c in data.get("decklist", []) if c["name_normalized"] not in available],
        })
        edhrec.polite_pause()

    all_missing = {n for r in results for n in r["_missing"]}
    prices = scryfall.fetch_prices(list(all_missing)) if all_missing else {}
    for r in results:
        r["missing_price"] = round(sum(prices.get(normalize_card_name(n), 0) for n in r.pop("_missing")), 2)

    results.sort(key=lambda r: r["match_percentage"], reverse=True)
    return results[:limit]


def _weighted_pool(avg: dict, synergy: dict) -> dict[str, tuple[float, str, str]]:
    """{normalized name: (weight 0..1, display name, category)} of cards a commander wants."""
    pool: dict[str, tuple[float, str, str]] = {}
    for card in avg.get("decklist", []):
        inclusion = card.get("inclusion", 0)
        pool[card["name_normalized"]] = ((inclusion / 100.0) if inclusion > 0 else 0.55,
                                         card["name"], card.get("category", ""))
    for section in ("high_synergy", *edhrec.TOP_TYPE_SECTIONS):
        for card in synergy.get(section, []):
            n = card["name_normalized"]
            if n in pool:
                continue
            weight = min(card.get("inclusion", 0) / 100.0 + max(0.0, card.get("synergy", 0) / 100.0) * 0.3, 0.95)
            if weight > 0.05:
                cat = "Synergy" if section == "high_synergy" else section.replace("top_", "").replace("_", " ").title()
                pool[n] = (weight, card["name"], cat)
    for card in synergy.get("new_cards", []):
        n = card["name_normalized"]
        if n in pool:
            continue
        # New cards have artificially low inclusion, so synergy counts for more.
        weight = min(card.get("inclusion", 0) / 100.0 + max(0.0, card.get("synergy", 0) / 100.0) * 0.6, 0.85)
        if weight > 0.02:
            pool[n] = (weight, card["name"], "New")
    return pool


def commanders_for_favorites(card_names: list[str], limit: int = 40) -> dict:
    """Score commanders by how strongly they want the given favorite cards."""
    detected = scryfall.fetch_color_identity_union(card_names)
    commanders = scryfall.get_commanders()
    if detected:
        commanders = [c for c in commanders if detected.issubset(set(c["color_identity"]))]
    commanders = sorted(commanders, key=lambda c: c["edhrec_rank"])[:150]

    favorites = {normalize_card_name(n) for n in card_names}
    display = {normalize_card_name(n): n for n in card_names}

    results = []
    for cmd in commanders:
        avg = edhrec.get_average_deck(cmd["name"])
        synergy = edhrec.get_synergy_lists(cmd["name"])
        pool = _weighted_pool(avg, synergy)
        if not pool:
            continue

        cmd_norm = normalize_card_name(cmd["name"])
        cmd_tags = derive_functional_tags(cache.oracle_text.get(cmd_norm, ""))

        score, matched = 0.0, set()
        for n in favorites:
            if n in pool:
                score += pool[n][0]
                matched.add(n)
            elif cmd_tags:
                # Fallback for cards EDHREC hasn't indexed: functional overlap with the commander.
                overlap = derive_functional_tags(cache.oracle_text.get(n, "")) & cmd_tags
                if overlap:
                    score += min(len(overlap) * 0.15, 0.3)
                    matched.add(n)
        if not matched:
            continue

        preview, seen = [], set()
        for n in sorted(matched, key=lambda n: pool[n][0] if n in pool else 0.0, reverse=True):
            if n == cmd_norm:
                continue
            weight, name, cat = pool[n] if n in pool else (0.15, display.get(n, n), "Functional")
            preview.append({"name": display.get(n, name), "category": cat, "is_favorite": True,
                            "inclusion": round(weight * 100)})
            seen.add(n)
        for n, (weight, name, cat) in sorted(pool.items(), key=lambda kv: kv[1][0], reverse=True):
            if len(preview) >= 15:
                break
            if n in seen or n == cmd_norm or (cat or "").lower() in ("land", "lands"):
                continue
            preview.append({"name": name, "category": cat, "is_favorite": False, "inclusion": round(weight * 100)})

        results.append({
            "name": cmd["name"],
            "color_identity": cmd["color_identity"],
            "image_uri": cmd["image_uri"],
            "edhrec_rank": cmd["edhrec_rank"],
            "num_decks": avg.get("num_decks", 0),
            "match_count": len(matched),
            "total_favorites": len(favorites),
            "match_percentage": round(score / float(len(favorites)) * 100.0, 1),
            "matched_cards": sorted(display[n] for n in matched if n in display),
            "preview_cards": preview,
        })
        edhrec.polite_pause(0.05)

    results.sort(key=lambda r: (r["match_percentage"], -r["edhrec_rank"]), reverse=True)
    return {"results": results[:limit], "detected_colors": sorted(detected),
            "total_commanders_checked": len(commanders)}


def compare_commanders(state: WorkingState, names: list[str]) -> dict:
    """Side-by-side coverage of two or three commanders' average decks."""
    owned_all = set(state.collection)
    results = []
    for name in names:
        data = edhrec.get_average_deck(front_face(name))
        deck_cards = set(data.get("deck_card_names", []))
        owned = deck_cards & owned_all
        missing_names = [c["name"] for c in data.get("decklist", []) if c["name_normalized"] not in owned_all]
        prices = scryfall.fetch_prices(missing_names) if missing_names else {}
        results.append({
            "name": name,
            "num_decks": data.get("num_decks", 0),
            "total_cards": len(deck_cards),
            "owned_count": len(owned),
            "missing_count": len(deck_cards) - len(owned),
            "match_percentage": round(len(owned) / max(len(deck_cards), 1) * 100, 1),
            "missing_price": round(sum(prices.get(normalize_card_name(n), 0) for n in missing_names), 2),
            "_deck": deck_cards,
            "owned_cards": sorted(owned),
            "missing_cards": sorted(deck_cards - owned_all),
        })

    sets = [r["_deck"] for r in results]
    shared = set.intersection(*sets) if sets else set()
    for r in results:
        others = [s for s in sets if s is not r["_deck"]]
        r["unique_cards"] = sorted(r["_deck"] - set.union(*others)) if others else sorted(r["_deck"])
        r["shared_cards"] = sorted(shared)
        del r["_deck"]
    return {"commanders": results, "shared_count": len(shared)}


def new_deck_id() -> str:
    return f"deck_{int(time.time() * 1000)}"
