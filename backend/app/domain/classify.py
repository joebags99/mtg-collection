"""Card type and functional-role classification."""
import re

CARD_TYPES = ("Creature", "Planeswalker", "Instant", "Sorcery", "Enchantment", "Artifact", "Land")

# EDHREC top-card list key -> card type label
EDHREC_LIST_TYPES = {
    "top_creatures": "Creature",
    "top_instants": "Instant",
    "top_sorceries": "Sorcery",
    "top_enchantments": "Enchantment",
    "top_artifacts": "Artifact",
    "top_mana_artifacts": "Artifact",
    "top_planeswalkers": "Planeswalker",
    "top_lands": "Land",
    "top_utility_lands": "Land",
}


def parse_type_line(type_line: str) -> str:
    """Map a Scryfall type line to one coarse card type, using the front face only."""
    front = type_line.split("//")[0].strip().lower()
    for label in CARD_TYPES:
        if label.lower() in front:
            return label
    return "Other"


def card_type_from_edhrec_lists(name_normalized: str, type_data: dict) -> str:
    """Infer card type from which EDHREC top-card list contains the card. '' when unknown."""
    for key, label in EDHREC_LIST_TYPES.items():
        for card in type_data.get(key, []):
            if card.get("name_normalized") == name_normalized:
                return label
    return ""


_RAMP = ("add {", "add one mana", "add two mana", "add three mana", "adds one mana",
         "search your library for a basic land", "search your library for a land",
         "put that card onto the battlefield")
_DRAW = ("draw a card", "draw cards", "draw two", "draw three", "draws a card",
         "draw x card", "draw that many")
_REMOVAL = ("destroy target", "destroy all", "exile target", "exile all", "counter target spell",
            "return target", "deals damage to any target", "deals damage to target", "fight",
            "-x/-x", "gets -")
_UTILITY = ("search your library", "hexproof", "indestructible", "protection from", "shroud",
            "return target card from your graveyard", "return target creature card from your graveyard",
            "put target card from a graveyard", "can't be countered", "flash", "copy target",
            "create a token", "create a copy", "whenever a creature enters",
            "whenever a nontoken creature", "whenever you cast", "at the beginning of your upkeep",
            "sacrifice a creature", "each opponent", "whenever an opponent")


def _any(patterns, text: str) -> bool:
    return any(p in text for p in patterns)


def classify_functional_category(
    name_normalized: str,
    card_type: str,
    type_data: dict,
    oracle: str = "",
) -> str:
    """Assign a deck-building role: lands, ramp, cardDraw, removal, synergy, or utility.

    `type_data` is the commander's EDHREC synergy payload; `oracle` is the card's
    lowercased oracle text (may be empty).
    """
    if card_type == "Land":
        return "lands"

    mana_artifacts = {c.get("name_normalized") for c in type_data.get("top_mana_artifacts", [])}
    if name_normalized in mana_artifacts:
        return "ramp"

    oracle = oracle.lower()
    first_ability = oracle.split("\n")[0] if oracle else ""

    if _any(_RAMP, oracle):
        return "ramp"

    if _any(_DRAW, oracle):
        if card_type in ("Instant", "Sorcery", "Enchantment") or _any(_DRAW, first_ability):
            return "cardDraw"

    if _any(_REMOVAL, oracle):
        if card_type in ("Instant", "Sorcery") or _any(_REMOVAL, first_ability):
            return "removal"

    if _any(_UTILITY, oracle):
        return "utility"

    synergy = {c.get("name_normalized") for c in type_data.get("high_synergy", [])}
    if name_normalized in synergy:
        return "synergy"

    top_lists = ("top_creatures", "top_instants", "top_sorceries", "top_enchantments",
                 "top_artifacts", "top_planeswalkers", "top_lands", "top_utility_lands")
    for key in top_lists:
        if any(c.get("name_normalized") == name_normalized for c in type_data.get(key, [])):
            return "synergy"

    return "utility"


# Functional tags for oracle-text scoring of cards EDHREC hasn't indexed yet.
FUNCTIONAL_TAGS = {
    "ramp":       [r"add \{", r"search your library for a.*land", r"put.*land.*onto the battlefield"],
    "draw":       [r"draw a card", r"draw \w+ cards", r"draws? \w+ card"],
    "removal":    [r"destroy target", r"exile target", r"return target.*to.*hand"],
    "wipe":       [r"destroy all", r"exile all", r"each player sacrifices", r"deals \d+ damage to each creature"],
    "tokens":     [r"create.*token", r"put.*token.*onto the battlefield"],
    "sacrifice":  [r"sacrifice a", r"sacrifice an", r"when.*is put into a graveyard"],
    "graveyard":  [r"from your graveyard", r"from a graveyard", r"put.*into your graveyard"],
    "counters":   [r"put \w+ \+1/\+1 counter", r"proliferate", r"add a counter"],
    "copy":       [r"copy target", r"create a copy of", r"copy of that spell"],
    "etb":        [r"when.*enters( the battlefield)?", r"enters the battlefield"],
    "lifegain":   [r"you gain \d+ life", r"gain \d+ life", r"lifelink"],
    "reanimator": [r"return target.*from.*graveyard.*battlefield", r"return.*creature.*graveyard.*play"],
    "storm":      [r"storm", r"whenever you cast.*instant or sorcery", r"magecraft"],
    "tribal":     [r"other \w+ you control get", r"of the chosen type", r"share a creature type"],
    "flicker":    [r"exile.*then return.*to the battlefield", r"blink"],
    "combat":     [r"double strike", r"trample", r"whenever.*attacks", r"combat damage"],
}
_COMPILED_TAGS = {tag: [re.compile(p) for p in pats] for tag, pats in FUNCTIONAL_TAGS.items()}


def derive_functional_tags(oracle_text: str) -> set[str]:
    """Tags whose patterns match the (lowercased) oracle text."""
    return {tag for tag, pats in _COMPILED_TAGS.items() if any(p.search(oracle_text) for p in pats)}
