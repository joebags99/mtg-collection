import os
import sys
import tempfile
import uuid

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
    {"name": "Raised by Giants", "name_normalized": "raised by giants",
     "color_identity": ["G"], "image_uri": "", "art_crop": "",
     "edhrec_rank": 4, "partner_type": "background", "type_line": "Legendary Enchantment — Background"},
    {"name": "Pir, Imaginative Rascal", "name_normalized": "pir, imaginative rascal",
     "color_identity": ["G"], "image_uri": "", "art_crop": "",
     "edhrec_rank": 5, "partner_type": "partner_with", "partner_with": "Toothy, Imaginary Friend", "type_line": "Legendary Creature"},
    {"name": "Toothy, Imaginary Friend", "name_normalized": "toothy, imaginary friend",
     "color_identity": ["U"], "image_uri": "", "art_crop": "",
     "edhrec_rank": 6, "partner_type": "partner_with", "partner_with": "Pir, Imaginative Rascal", "type_line": "Legendary Creature"},
]


@pytest.fixture
def client(monkeypatch):
    """A TestClient with every external API stubbed and fresh working state."""
    from fastapi.testclient import TestClient

    from backend.app import app
    from backend.app.services import edhrec, scryfall

    monkeypatch.setattr(scryfall, "get_commanders", lambda: FAKE_COMMANDERS)
    monkeypatch.setattr(scryfall, "fetch_prices", lambda names: {})
    monkeypatch.setattr(scryfall, "fetch_card_types", lambda names: {})
    monkeypatch.setattr(scryfall, "fetch_card_mana", lambda names: {})
    monkeypatch.setattr(edhrec, "get_average_deck", lambda name, budget=None, theme=None: {
        "commander": name, "num_decks": 10,
        "themes": [{"name": "Counters", "slug": "counters", "count": 5}],
        "tags": [{"name": "Counters", "slug": "counters", "count": 5}],
        "decklist": [{"name": "Sol Ring", "name_normalized": "sol ring", "category": "Artifact"},
                     {"name": "Swords to Plowshares", "name_normalized": "swords to plowshares", "category": "Instant"}],
        "deck_card_names": ["sol ring", "swords to plowshares"],
    })
    monkeypatch.setattr(edhrec, "get_synergy_lists", lambda name: {k: [] for k in edhrec.SYNERGY_SECTIONS})
    monkeypatch.setattr(edhrec, "polite_pause", lambda seconds=0.1: None)

    # A fresh anonymous session per test keeps the shared database from leaking state between tests.
    with TestClient(app, headers={"X-Session-Id": f"test-{uuid.uuid4().hex}"}) as c:
        yield c


@pytest.fixture(autouse=True)
def _schema():
    from backend.app.db import init_db
    init_db()
