"""Parsers for collection and deck list text formats."""
import csv
import io
import re

from .names import normalize_card_name

_QTY_LINE = re.compile(r"^(\d+)x?\s+(.+)")
_NAME_COLUMNS = ("Name", "name", "Card", "card", "Card Name", "card_name")
_QTY_COLUMNS = ("Quantity", "quantity", "Qty", "qty", "Count", "count")


def parse_card_lines(content: str) -> dict[str, int]:
    """Parse '1 Card Name' / '2x Card Name' / 'Card Name' lines into {normalized name: qty}."""
    cards: dict[str, int] = {}
    for line in content.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        match = _QTY_LINE.match(line)
        if match:
            qty, name = int(match.group(1)), normalize_card_name(match.group(2))
        else:
            qty, name = 1, normalize_card_name(line)
        cards[name] = cards.get(name, 0) + qty
    return cards


def parse_csv_collection(content: str) -> dict[str, int]:
    """Parse an Archidekt or Moxfield CSV export into {normalized name: qty}."""
    cards: dict[str, int] = {}
    for row in csv.DictReader(io.StringIO(content)):
        name = next((normalize_card_name(row[c]) for c in _NAME_COLUMNS if row.get(c)), None)
        if not name:
            first_val = next(iter(row.values()), None)
            name = normalize_card_name(first_val) if first_val else None
        if not name:
            continue
        qty = 1
        for col in _QTY_COLUMNS:
            if row.get(col):
                try:
                    qty = int(row[col])
                except ValueError:
                    pass
                break
        cards[name] = cards.get(name, 0) + qty
    return cards


def looks_like_csv(text: str) -> bool:
    first = text.splitlines()[0] if text.splitlines() else ""
    return "," in first and len(first.split(",")) > 2


def parse_collection(text: str, filename: str = "") -> dict[str, int]:
    """Pick CSV or line parsing from the filename, falling back to a content sniff."""
    if filename.endswith(".csv") or (not filename and looks_like_csv(text)):
        return parse_csv_collection(text)
    return parse_card_lines(text)
