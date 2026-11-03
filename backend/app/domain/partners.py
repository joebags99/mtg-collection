"""Partner mechanics: detecting a commander's partner type and finding legal pairings."""
import re

from .names import normalize_card_name

_VARIANT = re.compile(r"[Pp]artner\s*[——]\s*([^\n(]+)")
_PARTNER_WITH = re.compile(r"[Pp]artner with ([^\n(]+)")


def _full_oracle(card: dict) -> str:
    text = card.get("oracle_text", "")
    for face in card.get("card_faces", []):
        text += "\n" + face.get("oracle_text", "")
    return text


def partner_variant_label(card: dict) -> str:
    """'Father & Son' from 'Partner—Father & Son'. Empty when absent."""
    match = _VARIANT.search(_full_oracle(card))
    return match.group(1).strip() if match else ""


def partner_with_name(card: dict) -> str:
    """The named partner from 'Partner with X'. Empty when absent."""
    match = _PARTNER_WITH.search(_full_oracle(card))
    return match.group(1).strip() if match else ""


def detect_partner_type(card: dict) -> str:
    """One of: partner, partner_with, partner_variant, choose_a_background, background,
    friends_forever, doctors_companion, doctor, or '' for none."""
    keywords = [k.lower() for k in card.get("keywords", [])]
    oracle = _full_oracle(card).lower()
    type_line = card.get("type_line", "").lower()

    if "partner with" in oracle:
        return "partner_with"
    if partner_variant_label(card):
        return "partner_variant"
    if "choose a background" in oracle:
        return "choose_a_background"
    if "background" in type_line and "legendary" in type_line and "enchantment" in type_line:
        return "background"
    if "friends forever" in keywords or "friends forever" in oracle:
        return "friends_forever"
    if "doctor's companion" in keywords or "doctor's companion" in oracle:
        return "doctors_companion"
    if "time lord" in type_line and "doctor" in type_line:
        return "doctor"
    if "partner" in keywords:
        return "partner"
    return ""


# Which partner types each type may pair with. Symmetric mechanics exclude the card itself.
_PAIRS_WITH = {
    "partner": ("partner",),
    "friends_forever": ("friends_forever",),
    "choose_a_background": ("background",),
    "background": ("choose_a_background",),
    "doctors_companion": ("doctor",),
    "doctor": ("doctors_companion",),
}


def compatible_partners(commander: dict, all_commanders: list[dict]) -> list[dict]:
    """Commanders that can legally pair with `commander`."""
    pt = commander.get("partner_type", "")
    me = commander["name_normalized"]

    if pt == "partner_variant":
        label = commander.get("partner_variant_label", "")
        if not label:
            return []
        return [c for c in all_commanders
                if c.get("partner_type") == "partner_variant"
                and c.get("partner_variant_label", "") == label
                and c["name_normalized"] != me]

    if pt == "partner_with":
        target = commander.get("partner_with", "")
        if not target:
            return []
        normalized = normalize_card_name(target)
        return [c for c in all_commanders if c["name_normalized"] == normalized]

    allowed = _PAIRS_WITH.get(pt)
    if not allowed:
        return []
    return [c for c in all_commanders
            if c.get("partner_type") in allowed and c["name_normalized"] != me]
