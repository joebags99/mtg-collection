def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_requests_without_identity_are_rejected(client):
    assert client.get("/api/collection", headers={"X-Session-Id": ""}).status_code == 401


def test_collection_text_upload_and_summary(client):
    r = client.post("/api/collection/text", json={"text": "2 Sol Ring\nSwamp"})
    assert r.status_code == 200
    assert r.json() == {"count": 2, "total_cards": 3, "cards": {"sol ring": 2, "swamp": 1}}
    assert client.get("/api/collection").json()["count"] == 2
    assert client.delete("/api/collection").json()["count"] == 0
    assert client.get("/api/collection").json()["count"] == 0


def test_collections_are_isolated_per_session(client):
    client.post("/api/collection/text", json={"text": "1 Sol Ring"})
    other = {"X-Session-Id": "another-session-0002"}
    assert client.get("/api/collection", headers=other).json()["count"] == 0
    client.post("/api/collection/text", json={"text": "1 Swamp\n1 Island"}, headers=other)
    assert client.get("/api/collection").json()["cards"] == {"sol ring": 1}
    assert client.get("/api/collection", headers=other).json()["count"] == 2


def test_deck_crud_and_availability(client):
    client.post("/api/collection/text", json={"text": "1 Sol Ring"})
    r = client.post("/api/decks", json={"name": "Test", "commander": "Atraxa, Praetors' Voice", "cards_text": "1 Sol Ring"})
    assert r.status_code == 200
    deck = r.json()
    assert deck["color_identity"] == ["W", "U", "B", "G"]
    assert deck["card_count"] == 1

    assert len(client.get("/api/decks").json()["decks"]) == 1
    assert client.get("/api/decks", headers={"X-Session-Id": "another-session-0002"}).json()["decks"] == []
    avail = client.get("/api/collection/availability").json()
    assert avail["sol ring"] == {"owned": 1, "in_decks": 1, "available": 0,
                                 "decks": [{"id": deck["id"], "name": "Test"}]}

    r = client.put(f"/api/decks/{deck['id']}", json={"name": "Renamed", "cards_text": ""})
    assert r.json()["name"] == "Renamed" and r.json()["card_count"] == 0
    assert client.delete(f"/api/decks/{deck['id']}").json() == {"ok": True}
    assert client.get(f"/api/decks/{deck['id']}").status_code == 404


def test_favorites_round_trip(client):
    assert client.get("/api/favorites").json() == {"cards": [], "count": 0}
    r = client.put("/api/favorites", json={"cards": ["Sol Ring", "sol ring", " Rhystic Study "]})
    assert r.json()["cards"] == ["sol ring", "rhystic study"]
    assert client.get("/api/favorites").json()["count"] == 2


def test_commander_endpoints(client):
    assert client.get("/api/commanders/popular").json()["commanders"][0]["name"] == "Atraxa, Praetors' Voice"
    assert client.get("/api/commanders/search_autocomplete", params={"q": "thr"}).json()["results"][0]["name"].startswith("Thrasios")
    partners = client.get("/api/commander/Thrasios, Triton Hero/partners").json()
    assert partners["partner_type"] == "partner"
    assert [p["name"] for p in partners["partners"]] == ["Tymna the Weaver"]


def test_commander_lookup(client):
    assert client.get("/api/commanders/lookup", params={"name": "Tymna the Weaver // Back"}).json()["name"] == "Tymna the Weaver"
    assert client.get("/api/commanders/lookup", params={"name": "Nobody"}).status_code == 404


def test_commander_detail_splits_owned_and_missing(client):
    client.post("/api/collection/text", json={"text": "1 Sol Ring"})
    r = client.get("/api/commander/Atraxa, Praetors' Voice")
    assert r.status_code == 200
    body = r.json()
    assert body["owned_count"] == 1 and body["missing_count"] == 1
    assert body["owned_cards"][0]["name"] == "Sol Ring"
    assert body["owned_cards"][0]["functional_category"] == "ramp"
    assert body["missing_cards"][0]["functional_category"] == "removal"


def test_recommendations_require_collection(client):
    assert client.post("/api/recommendations").status_code == 400
    client.post("/api/collection/text", json={"text": "1 Sol Ring"})
    r = client.post("/api/recommendations", params={"min_owned": 1})
    assert r.status_code == 200
    results = r.json()["results"]
    assert results[0]["match_percentage"] == 50.0
    names = [x["name"] for x in results]
    assert "Raised by Giants" not in names  # a Background cannot lead a deck
    assert results[0]["tags"][0]["slug"] == "counters"


def test_recommendations_score_partner_with_as_a_pair(client):
    client.post("/api/collection/text", json={"text": "1 Sol Ring"})
    r = client.post("/api/recommendations", params={"min_owned": 1, "search": "Pir"})
    pir = r.json()["results"][0]
    assert pir["name"] == "Pir, Imaginative Rascal" and pir["partner"] == "Toothy, Imaginary Friend"


def test_recommendations_min_colors_and_tag_filters(client):
    client.post("/api/collection/text", json={"text": "1 Sol Ring"})
    r = client.post("/api/recommendations", params={"min_owned": 1, "min_colors": 3})
    assert [x["name"] for x in r.json()["results"]] == ["Atraxa, Praetors' Voice"]
    assert client.post("/api/recommendations", params={"min_owned": 1, "tag": "counters"}).json()["results"]
    assert client.post("/api/recommendations", params={"min_owned": 1, "tag": "storm"}).json()["results"] == []


def test_commander_lists_exclude_backgrounds(client):
    assert "Raised by Giants" not in [c["name"] for c in client.get("/api/commanders/popular").json()["commanders"]]
    assert "Raised by Giants" not in [c["name"] for c in client.get("/api/commanders").json()["commanders"]]
    assert [c["name"] for c in client.get("/api/commanders", params={"min_colors": 4}).json()["commanders"]] == ["Atraxa, Praetors' Voice"]


def test_compare(client):
    r = client.post("/api/compare", json={"commanders": ["Atraxa, Praetors' Voice", "Tymna the Weaver"]})
    assert r.status_code == 200
    assert r.json()["shared_count"] == 2
    assert client.post("/api/compare", json={"commanders": ["only one"]}).status_code == 400


def test_register_claims_anonymous_data_and_token_wins(client):
    client.post("/api/collection/text", json={"text": "1 Sol Ring"})
    client.put("/api/favorites", json={"cards": ["sol ring"]})
    r = client.post("/api/auth/register", json={"username": "joe", "password": "pass"})
    assert r.status_code == 200
    auth = {"Authorization": f"Bearer {r.json()['token']}"}
    assert client.post("/api/auth/register", json={"username": "joe", "password": "pass"}).status_code == 400
    assert client.get("/api/auth/me", headers=auth).json()["user"]["username"] == "joe"
    assert client.get("/api/auth/me").status_code == 401

    # The account now owns what the browser session had; the session itself is empty.
    assert client.get("/api/collection", headers=auth).json()["cards"] == {"sol ring": 1}
    assert client.get("/api/favorites", headers=auth).json()["cards"] == ["sol ring"]
    assert client.get("/api/collection").json()["count"] == 0


def test_login_keeps_account_data_over_session_data(client):
    r = client.post("/api/auth/register", json={"username": "amy", "password": "pass"}, headers={"X-Session-Id": "fresh-session-0003"})
    auth = {"Authorization": f"Bearer {r.json()['token']}"}
    client.post("/api/collection/text", json={"text": "1 Rhystic Study"}, headers=auth)

    client.post("/api/collection/text", json={"text": "1 Sol Ring"})  # the test session
    assert client.post("/api/auth/login", json={"username": "amy", "password": "wrong"}).status_code == 401
    r = client.post("/api/auth/login", json={"username": "amy", "password": "pass"})
    assert r.status_code == 200
    auth = {"Authorization": f"Bearer {r.json()['token']}"}
    assert client.get("/api/collection", headers=auth).json()["cards"] == {"rhystic study": 1}
    assert client.get("/api/collection").json()["count"] == 0
