"""Adapter tests with the HTTP layer mocked, since the sandbox cannot reach Scryfall or EDHREC."""
import requests

from backend.app import cache
from backend.app.services import edhrec, scryfall


class _Resp:
    def __init__(self, payload, status=200, headers=None):
        self.status_code = status
        self._payload = payload
        self.text = ""
        self.headers = headers or {}

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
    monkeypatch.setattr(scryfall.http, "request", lambda *a, **k: calls.append(k) or _Resp({"data": [SOL_RING, ETALI]}))
    monkeypatch.setattr(scryfall.time, "sleep", lambda s: None)
    cache.prices._data.clear()

    prices = scryfall.fetch_prices(["Sol Ring", "Etali, Primal Conqueror"])
    assert prices == {"sol ring": 1.5, "etali, primal conqueror": 12.0}
    assert len(calls) == 1
    assert scryfall.fetch_prices(["Sol Ring"]) == {"sol ring": 1.5}
    assert len(calls) == 1  # served from cache


def test_fetch_card_facts_populate_all_caches(monkeypatch):
    monkeypatch.setattr(scryfall.http, "request", lambda *a, **k: _Resp({"data": [SOL_RING, ETALI]}))
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
    monkeypatch.setattr(scryfall.http, "request", lambda method, url, params=None, timeout=None: _Resp(pages[params["q"]]))
    cmds = scryfall.fetch_all_commanders()
    assert [(c["name"], c["partner_type"]) for c in cmds] == [
        ("Thrasios, Triton Hero", "partner"), ("Raised by Giants", "background")]
    assert cmds[0]["image_uri"] == "n" and cmds[0]["art_crop"] == "a"


def test_validate_card_names_groups_by_front_face_and_fails_open(monkeypatch):
    monkeypatch.setattr(scryfall.time, "sleep", lambda s: None)
    monkeypatch.setattr(scryfall.http, "request", lambda *a, **k: _Resp({"data": [ETALI]}))
    valid, invalid = scryfall.validate_card_names(["Etali, Primal Conqueror // Etali, Primal Sickness", "Not A Card"])
    assert valid == ["Etali, Primal Conqueror // Etali, Primal Sickness"] and invalid == ["Not A Card"]

    monkeypatch.setattr(scryfall.http, "request", lambda *a, **k: _Resp({}, status=500))
    valid, invalid = scryfall.validate_card_names(["Anything"])
    assert valid == ["Anything"] and invalid == []


def _page(status=200, **payload):
    return _Resp(payload, status=status)


COMMANDER_PAGE = {
    "bracket_counts": {"2": 30, "3": 12},
    "container": {"json_dict": {
        "themes": [{"name": "Counters", "slug": "counters", "count": 3}],
        "cardlists": [
            {"tag": "highsynergycards", "cardviews": [{"name": "Doubling Season", "synergy": 50, "inclusion": 60}]},
            {"tag": "manaartifacts", "cardviews": [{"name": "Sol Ring", "synergy": 1, "inclusion": 90}]},
            {"tag": "somethingelse", "cardviews": [{"name": "Ignored"}]},
        ],
    }},
}
AVERAGE_DECK_PAGE = {"deck": {"cards": ["1 Sol Ring", {"name": "Swords to Plowshares", "type": "Instant", "inclusion": 80}]}}


def _json_host(routes):
    """A fake http.get for json.edhrec.com: routes maps the path after /pages/ to a response."""
    def get(url, timeout=None):
        path = url.split("/pages/", 1)[1].removesuffix(".json")
        return routes.get(path) or _Resp({}, status=404)
    return get


def test_get_average_deck_reads_json_host(monkeypatch):
    monkeypatch.setattr(edhrec.http, "get", _json_host({
        "commanders/atraxa-praetors-voice": _page(**COMMANDER_PAGE),
        "average-decks/atraxa-praetors-voice": _page(**AVERAGE_DECK_PAGE),
    }))
    cache.commander_decks._data.clear()
    cache.commander_pages._data.clear()

    deck = edhrec.get_average_deck("Atraxa, Praetors' Voice")
    assert deck["num_decks"] == 42  # summed from bracket counts
    assert deck["themes"] == [{"name": "Counters", "slug": "counters", "count": 3}]
    assert deck["decklist"][0] == {"name": "Sol Ring", "name_normalized": "sol ring", "category": ""}
    assert deck["decklist"][1]["inclusion"] == 80
    assert sorted(deck["deck_card_names"]) == ["sol ring", "swords to plowshares"]


def test_get_average_deck_prefers_budget_page_and_falls_back(monkeypatch):
    seen = []
    def get(url, timeout=None):
        seen.append(url.split("/pages/", 1)[1])
        if url.endswith("/budget.json"):
            return _Resp({}, status=404)
        if "average-decks" in url:
            return _page(**AVERAGE_DECK_PAGE)
        return _page(**COMMANDER_PAGE)
    monkeypatch.setattr(edhrec.http, "get", get)
    cache.commander_decks._data.clear()
    cache.commander_pages._data.clear()
    deck = edhrec.get_average_deck("Atraxa, Praetors' Voice", budget="budget")
    assert deck["decklist"]
    assert seen[:2] == ["average-decks/atraxa-praetors-voice/budget.json", "average-decks/atraxa-praetors-voice.json"]


def test_s3_access_denied_counts_as_missing(monkeypatch):
    denied = _Resp({}, status=403)
    denied.text = '<?xml version="1.0"?><Error><Code>AccessDenied</Code></Error>'
    monkeypatch.setattr(edhrec.http, "get", lambda url, timeout=None: denied)
    assert edhrec.fetch_page("average-decks/passionate-archaeologist") is None

    blocked = _Resp({}, status=403)
    blocked.text = "forbidden by WAF"
    monkeypatch.setattr(edhrec.http, "get", lambda url, timeout=None: blocked)
    import pytest
    with pytest.raises(RuntimeError):
        edhrec.fetch_page("commanders/atraxa-praetors-voice")


def test_missing_commander_gives_empty_shapes_not_errors(monkeypatch):
    monkeypatch.setattr(edhrec.http, "get", _json_host({}))
    cache.commander_decks._data.clear()
    cache.commander_synergy._data.clear()
    cache.commander_pages._data.clear()
    deck = edhrec.get_average_deck("Nobody")
    assert deck["decklist"] == [] and "error" not in deck
    assert all(v == [] for v in edhrec.get_synergy_lists("Nobody").values())


def test_get_average_deck_returns_error_shape_on_failure(monkeypatch):
    def boom(url, timeout=None):
        raise requests.ConnectionError("edhrec down")
    monkeypatch.setattr(edhrec.http, "get", boom)
    cache.commander_decks._data.clear()
    cache.commander_pages._data.clear()
    deck = edhrec.get_average_deck("Nobody")
    assert deck["decklist"] == [] and "edhrec down" in deck["error"]


def test_get_synergy_lists_maps_tags_and_shares_the_page_fetch(monkeypatch):
    calls = []
    def get(url, timeout=None):
        calls.append(url)
        return _page(**COMMANDER_PAGE) if "commanders/" in url else _page(**AVERAGE_DECK_PAGE)
    monkeypatch.setattr(edhrec.http, "get", get)
    cache.commander_synergy._data.clear()
    cache.commander_decks._data.clear()
    cache.commander_pages._data.clear()

    lists = edhrec.get_synergy_lists("Atraxa, Praetors' Voice")
    assert lists["high_synergy"][0]["name_normalized"] == "doubling season"
    assert lists["top_mana_artifacts"][0]["name"] == "Sol Ring"
    assert all(lists[k] == [] for k in edhrec.SYNERGY_SECTIONS if k not in ("high_synergy", "top_mana_artifacts"))
    edhrec.get_average_deck("Atraxa, Praetors' Voice")
    assert sum("commanders/" in c for c in calls) == 1  # commander page fetched once for both


def test_scryfall_session_sends_identifying_headers():
    assert scryfall.http.headers["Accept"] == "application/json"
    assert "mtg-collection" in scryfall.http.headers["User-Agent"]


def test_scryfall_429_waits_retry_after_and_retries_once(monkeypatch):
    responses = iter([_Resp({}, status=429, headers={"Retry-After": "3"}), _Resp({"data": [SOL_RING]})])
    monkeypatch.setattr(scryfall.http, "request", lambda *a, **k: next(responses))
    slept = []
    monkeypatch.setattr(scryfall.time, "sleep", lambda s: slept.append(s))
    assert scryfall._collection_lookup(["Sol Ring"])[0]["name"] == "Sol Ring"
    assert 3.0 in slept


def test_scryfall_throttle_spaces_requests(monkeypatch):
    monkeypatch.setattr(scryfall.http, "request", lambda *a, **k: _Resp({"data": []}))
    slept = []
    monkeypatch.setattr(scryfall.time, "sleep", lambda s: slept.append(s))
    monkeypatch.setattr(scryfall, "_last_request_at", scryfall.time.time())
    scryfall._collection_lookup(["x"])
    assert slept and 0 < slept[0] <= scryfall.EXTERNAL_API_DELAY


def test_catalog_persists_across_process_memory(monkeypatch):
    from backend.app.services import scryfall_store
    scryfall_store.save_catalog([{"name": "Atraxa, Praetors' Voice", "name_normalized": "atraxa, praetors' voice"}], scryfall.time.time())
    monkeypatch.setattr(scryfall, "_commanders", [])
    monkeypatch.setattr(scryfall, "fetch_all_commanders", lambda: (_ for _ in ()).throw(AssertionError("should not crawl")))
    assert scryfall.get_commanders()[0]["name"].startswith("Atraxa")


def test_stale_disk_catalog_survives_failed_crawl(monkeypatch):
    from backend.app.services import scryfall_store
    scryfall_store.save_catalog([{"name": "Old Commander"}], 0.0)  # long expired
    monkeypatch.setattr(scryfall, "_commanders", [])
    monkeypatch.setattr(scryfall, "fetch_all_commanders", lambda: [])
    assert scryfall.get_commanders() == [{"name": "Old Commander"}]


def test_card_facts_and_prices_warm_from_disk(monkeypatch):
    from backend.app.services import scryfall_store
    monkeypatch.setattr(scryfall.http, "request", lambda *a, **k: _Resp({"data": [SOL_RING]}))
    monkeypatch.setattr(scryfall.time, "sleep", lambda s: None)
    for d in (cache.card_types, cache.mana, cache.oracle_text):
        d.clear()
    cache.prices._data.clear()
    scryfall.fetch_card_types(["Sol Ring"])
    scryfall.fetch_prices(["Sol Ring"])
    for d in (cache.card_types, cache.mana, cache.oracle_text):
        d.clear()
    cache.prices._data.clear()
    scryfall_store.warm_caches()
    assert cache.card_types["sol ring"] == "Artifact"
    assert cache.mana["sol ring"]["cmc"] == 1.0
    assert cache.prices.get("sol ring") == 1.5


def test_parse_decklist_reads_the_current_edhrec_shape():
    page = {"deck": {
        "commander": ["Fire Lord Zuko"],
        "cards": {
            "Artifact": [["Arcane Signet", 1], ["Sol Ring", 1]],
            "Land": [["Command Tower", 1], ["Mountain", 7]],
            "Creature": [["Zuko, Exiled Prince", 1]],
        },
    }}
    deck = edhrec.parse_decklist(page)
    assert [(c["name"], c["category"], c["qty"]) for c in deck] == [
        ("Arcane Signet", "Artifact", 1), ("Sol Ring", "Artifact", 1),
        ("Command Tower", "Land", 1), ("Mountain", "Land", 7), ("Zuko, Exiled Prince", "Creature", 1),
    ]
    assert edhrec._num_decks({"container": {"json_dict": {"card": {"num_decks": 14184}}}, "bracket_counts": {"2": 1}}) == 14184


def test_parse_decklist_accepts_edhrec_card_object_shapes():
    strings = {"deck": {"cards": ["1 Sol Ring", "Swamp"]}}
    assert [c["name"] for c in edhrec.parse_decklist(strings)] == ["Sol Ring", "Swamp"]
    wrapped = {"deck": {"cards": [{"card": {"name": "Sol Ring", "primary_type": "Artifact"}, "inclusion": 95}]}}
    entry = edhrec.parse_decklist(wrapped)[0]
    assert entry["name"] == "Sol Ring" and entry["category"] == "Artifact" and entry["inclusion"] == 95
    keyed = {"deck": {"cards": {"Sol Ring": 1, "Swamp": {"inclusion": 50}}}}
    assert sorted(c["name"] for c in edhrec.parse_decklist(keyed)) == ["Sol Ring", "Swamp"]
    wrapped_in_card = {"deck": {"cards": [{"card": {"name": "Sol Ring", "primary_type": "Artifact"}, "inclusion": 95}]}}
    assert edhrec.parse_decklist(wrapped_in_card)[0]["category"] == "Artifact"
    bare_list = {"deck": ["1 Sol Ring"]}
    assert edhrec.parse_decklist(bare_list)[0]["name"] == "Sol Ring"
    assert edhrec.parse_decklist({"deck": {"cards": [{"mystery": 1}]}}) == []
