"""Adapter tests with the HTTP layer mocked, since the sandbox cannot reach Scryfall or EDHREC."""
import requests

from backend.app import cache
from backend.app.services import edhrec, scryfall


class _Resp:
    def __init__(self, payload, status=200):
        self.status_code = status
        self._payload = payload
        self.text = ""

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code != 200:
            raise RuntimeError(self.status_code)


SOL_RING = {"name": "Sol Ring", "type_line": "Artifact", "mana_cost": "{1}", "cmc": 1.0,
            "oracle_text": "{T}: Add {C}{C}.", "prices": {"usd": "1.50"}, "color_identity": []}
ETALI = {"name": "Etali, Primal Conqueror // Etali, Primal Sickness",
         "type_line": "Legendary Creature — Elder Dinosaur // Legendary Creature — Elder Phyrexian Dinosaur",
         "mana_cost": "", "cmc": 7.0, "color_identity": ["R", "G"],
         "card_faces": [{"oracle_text": "When Etali enters, exile...", "mana_cost": "{5}{R}{R}"}, {"oracle_text": ""}],
         "prices": {"usd": None, "usd_foil": "12.00"}}


def test_fetch_prices_prefers_usd_then_foil_and_caches(monkeypatch):
    calls = []
    monkeypatch.setattr(scryfall.http, "post", lambda *a, **k: calls.append(k) or _Resp({"data": [SOL_RING, ETALI]}))
    monkeypatch.setattr(scryfall.time, "sleep", lambda s: None)
    cache.prices._data.clear()

    prices = scryfall.fetch_prices(["Sol Ring", "Etali, Primal Conqueror"])
    assert prices == {"sol ring": 1.5, "etali, primal conqueror": 12.0}
    assert len(calls) == 1
    assert scryfall.fetch_prices(["Sol Ring"]) == {"sol ring": 1.5}
    assert len(calls) == 1  # served from cache


def test_fetch_card_facts_populate_all_caches(monkeypatch):
    monkeypatch.setattr(scryfall.http, "post", lambda *a, **k: _Resp({"data": [SOL_RING, ETALI]}))
    monkeypatch.setattr(scryfall.time, "sleep", lambda s: None)
    for d in (cache.card_types, cache.mana, cache.oracle_text):
        d.clear()

    types = scryfall.fetch_card_types(["Sol Ring", "Etali, Primal Conqueror // Etali, Primal Sickness"])
    assert types == {"sol ring": "Artifact", "etali, primal conqueror": "Creature"}
    mana = scryfall.fetch_card_mana(["Sol Ring", "Etali, Primal Conqueror"])
    assert mana["etali, primal conqueror"] == {"cmc": 7.0, "mana_cost": "{5}{R}{R}"}
    assert cache.oracle_text["sol ring"] == "{t}: add {c}{c}."


def test_fetch_all_commanders_includes_backgrounds_once(monkeypatch):
    pages = {
        "is:commander f:commander": {"data": [
            {"name": "Thrasios, Triton Hero", "keywords": ["Partner"], "type_line": "Legendary Creature",
             "image_uris": {"normal": "n", "art_crop": "a"}, "edhrec_rank": 5, "color_identity": ["G", "U"]},
        ], "has_more": False},
        "t:background t:legendary t:enchantment f:commander": {"data": [
            {"name": "Raised by Giants", "type_line": "Legendary Enchantment — Background",
             "image_uris": {}, "edhrec_rank": 900, "color_identity": ["G"]},
        ], "has_more": False},
    }
    monkeypatch.setattr(scryfall.http, "get", lambda url, params=None, timeout=None: _Resp(pages[params["q"]]))
    cmds = scryfall.fetch_all_commanders()
    assert [(c["name"], c["partner_type"]) for c in cmds] == [
        ("Thrasios, Triton Hero", "partner"), ("Raised by Giants", "background")]
    assert cmds[0]["image_uri"] == "n" and cmds[0]["art_crop"] == "a"


def test_validate_card_names_groups_by_front_face_and_fails_open(monkeypatch):
    monkeypatch.setattr(scryfall.time, "sleep", lambda s: None)
    monkeypatch.setattr(scryfall.http, "post", lambda *a, **k: _Resp({"data": [ETALI]}))
    valid, invalid = scryfall.validate_card_names(["Etali, Primal Conqueror // Etali, Primal Sickness", "Not A Card"])
    assert valid == ["Etali, Primal Conqueror // Etali, Primal Sickness"] and invalid == ["Not A Card"]

    monkeypatch.setattr(scryfall.http, "post", lambda *a, **k: _Resp({}, status=500))
    valid, invalid = scryfall.validate_card_names(["Anything"])
    assert valid == ["Anything"] and invalid == []


def test_get_average_deck_parses_string_and_dict_entries(monkeypatch):
    monkeypatch.setattr(edhrec._client, "get_commanders_average_deck",
                        lambda slug, budget: {"decklist": ["1 Sol Ring", {"name": "Swords to Plowshares", "type": "Instant", "inclusion": 80}]})
    monkeypatch.setattr(edhrec._client, "get_commander_data",
                        lambda slug: {"num_decks": 42, "container": {"json_dict": {"themes": [{"name": "Counters", "slug": "counters", "count": 3}]}}})
    cache.commander_decks._data.clear()

    deck = edhrec.get_average_deck("Atraxa, Praetors' Voice")
    assert deck["num_decks"] == 42
    assert deck["themes"] == [{"name": "Counters", "slug": "counters", "count": 3}]
    assert deck["decklist"][0] == {"name": "Sol Ring", "name_normalized": "sol ring", "category": ""}
    assert deck["decklist"][1]["inclusion"] == 80
    assert sorted(deck["deck_card_names"]) == ["sol ring", "swords to plowshares"]


def test_get_average_deck_returns_error_shape_on_failure(monkeypatch):
    def boom(slug, budget):
        raise RuntimeError("edhrec down")
    monkeypatch.setattr(edhrec._client, "get_commanders_average_deck", boom)
    cache.commander_decks._data.clear()
    deck = edhrec.get_average_deck("Nobody")
    assert deck["decklist"] == [] and "edhrec down" in deck["error"]


def test_get_synergy_lists_tolerates_section_failures(monkeypatch):
    def ok(slug):
        return {"High Synergy Cards": [{"name": "Doubling Season", "synergy": 50, "inclusion": 60}]}

    def fail(slug):
        raise RuntimeError("nope")

    monkeypatch.setattr(edhrec._client, "get_high_synergy_cards", ok)
    for method in ("get_new_cards", "get_top_creatures", "get_top_instants", "get_top_sorceries",
                   "get_top_enchantments", "get_top_artifacts", "get_top_lands", "get_top_planeswalkers",
                   "get_top_utility_lands", "get_top_mana_artifacts"):
        monkeypatch.setattr(edhrec._client, method, fail)
    cache.commander_synergy._data.clear()

    lists = edhrec.get_synergy_lists("Atraxa, Praetors' Voice")
    assert lists["high_synergy"][0]["name_normalized"] == "doubling season"
    assert all(lists[k] == [] for k in edhrec.SYNERGY_SECTIONS if k != "high_synergy")


def test_scryfall_session_sends_identifying_headers():
    assert scryfall.http.headers["Accept"] == "application/json"
    assert "mtg-collection" in scryfall.http.headers["User-Agent"]


class _Html:
    def __init__(self, text, status=200):
        self.text = text
        self.status_code = status

    def raise_for_status(self):
        if self.status_code != 200:
            raise requests.HTTPError(response=self)


def test_discover_build_id_matches_both_homepage_shapes(monkeypatch):
    monkeypatch.setattr(edhrec._client.session, "get", lambda url, timeout=None: _Html('<script id="__NEXT_DATA__" type="application/json">{"buildId":"abc123","props":{}}</script>'))
    assert edhrec.discover_build_id() == "abc123"
    monkeypatch.setattr(edhrec._client.session, "get", lambda url, timeout=None: _Html('<script src="/_next/static/XyZ_9/_buildManifest.js" defer></script>'))
    assert edhrec.discover_build_id() == "XyZ_9"
    monkeypatch.setattr(edhrec._client.session, "get", lambda url, timeout=None: _Html("<html>no ids here</html>"))
    assert edhrec.discover_build_id() is None


def test_stale_build_id_is_refreshed_once_on_404(monkeypatch):
    ids = iter(["old", "new"])
    monkeypatch.setattr(edhrec, "discover_build_id", lambda: next(ids))
    monkeypatch.setattr(edhrec, "_build_id_checked_at", 0.0)
    edhrec._client.current_build_id = None
    calls = []

    def fetch():
        calls.append(edhrec._client.current_build_id)
        if edhrec._client.current_build_id == "old":
            resp = _Html("", status=404)
            raise requests.HTTPError(response=resp)
        return {"ok": True}

    # First call sets "old", 404s, then refreshes to "new" and succeeds.
    monkeypatch.setattr(edhrec, "_BUILD_ID_RETRY_COOLDOWN", 0.0)
    assert edhrec._with_fresh_build_id(fetch) == {"ok": True}
    assert calls == ["old", "new"]
