"""Card name normalization and EDHREC slugs."""
import re
import unicodedata


def normalize_card_name(name: str) -> str:
    """Lowercase, strip, and keep only the front face of a double-faced card."""
    name = name.strip().lower()
    if "//" in name:
        name = name.split("//")[0].strip()
    return name


def front_face(name: str) -> str:
    """Front-face name of a double-faced card, with original casing."""
    return name.split("//")[0].strip()


def edhrec_slug(name: str) -> str:
    """Convert a card name to EDHREC's URL slug.

    "Mr. House, President and CEO" -> "mr-house-president-and-ceo"
    "Altaïr Ibn-La'Ahad"           -> "altair-ibn-laahad"
    """
    s = unicodedata.normalize("NFD", name)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower().replace("-", " ")
    s = re.sub(r"[^a-z0-9\s]", "", s)
    return re.sub(r"\s+", "-", s.strip())


def partner_pair_slug(a: str, b: str) -> str:
    """EDHREC slug for a partner pair; EDHREC orders the two names alphabetically."""
    return "-".join(sorted([edhrec_slug(front_face(a)), edhrec_slug(front_face(b))]))
