import os
import sys
import tempfile

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)
# A file-backed temp database: ":memory:" would be a new empty DB on every connection.
os.environ["DATABASE_PATH"] = os.path.join(tempfile.mkdtemp(), "test.db")


FAKE_COMMANDERS = [
    {"name": "Atraxa, Praetors' Voice", "name_normalized": "atraxa, praetors' voice",
     "color_identity": ["W", "U", "B", "G"], "image_uri": "img", "art_crop": "art",
     "edhrec_rank": 1, "partner_type": "", "type_line": "Legendary Creature"},
    {"name": "Thrasios, Triton Hero", "name_normalized": "thrasios, triton hero",
     "color_identity": ["G", "U"], "image_uri": "", "art_crop": "",
     "edhrec_rank": 2, "partner_type": "partner", "type_line": "Legendary Creature"},
    {"name": "Tymna the Weaver", "name_normalized": "tymna the weaver",
     "color_identity": ["W", "B"], "image_uri": "", "art_crop": "",
     "edhrec_rank": 3, "partner_type": "partner", "type_line": "Legendary Creature"},
]


@pytest.fixture
def client(monkeypatch):
    """A TestClient with every external API stubbed and fresh working state."""
    from fastapi.testclient import TestClient

    from backend.app import app
    from backend.app.services import edhrec, scryfall
    from backend.app.state import state

    monkeypatch.setattr(scryfall, "get_commanders", lambda: FAKE_COMMANDERS)
    monkeypatch.setattr(scryfall, "fetch_prices", lambda names: {})
    monkeypatch.setattr(scryfall, "fetch_card_types", lambda names: {})
    monkeypatch.setattr(scryfall, "fetch_card_mana", lambda names: {})
    monkeypatch.setattr(edhrec, "get_average_deck", lambda name, budget=None, theme=None: {
        "commander": name, "num_decks": 10, "themes": [],
        "decklist": [{"name": "Sol Ring", "name_normalized": "sol ring", "category": "Artifact"},
                     {"name": "Swords to Plowshares", "name_normalized": "swords to plowshares", "category": "Instant"}],
        "deck_card_names": ["sol ring", "swords to plowshares"],
    })
    monkeypatch.setattr(edhrec, "get_synergy_lists", lambda name: {k: [] for k in edhrec.SYNERGY_SECTIONS})
    monkeypatch.setattr(edhrec, "polite_pause", lambda seconds=0.1: None)

    state.collection.clear()
    state.deck_lists.clear()
    with TestClient(app) as c:
        yield c
