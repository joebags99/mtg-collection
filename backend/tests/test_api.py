def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok", "collection_size": 0}


def test_collection_text_upload_and_summary(client):
    r = client.post("/api/collection/text", json={"text": "2 Sol Ring\nSwamp"})
    assert r.status_code == 200
    assert r.json() == {"count": 2, "total_cards": 3, "cards": {"sol ring": 2, "swamp": 1}}
    assert client.get("/api/collection").json()["count"] == 2


def test_collection_restore_accepts_legacy_list(client):
    r = client.post("/api/collection/restore", json={"cards": ["Sol Ring", "Sol Ring"]})
    assert r.json()["cards"] == {"sol ring": 2}


def test_deck_crud_and_availability(client):
    client.post("/api/collection/text", json={"text": "1 Sol Ring"})
    r = client.post("/api/decks", json={"name": "Test", "commander": "Atraxa, Praetors' Voice", "cards_text": "1 Sol Ring"})
    assert r.status_code == 200
    deck = r.json()
    assert deck["color_identity"] == ["W", "U", "B", "G"]
    assert deck["card_count"] == 1

    assert len(client.get("/api/decks").json()["decks"]) == 1
    avail = client.get("/api/collection/availability").json()
    assert avail["sol ring"] == {"owned": 1, "in_decks": 1, "available": 0,
                                 "decks": [{"id": deck["id"], "name": "Test"}]}

    r = client.put(f"/api/decks/{deck['id']}", json={"name": "Renamed", "cards_text": ""})
    assert r.json()["name"] == "Renamed" and r.json()["card_count"] == 0
    assert client.delete(f"/api/decks/{deck['id']}").json() == {"ok": True}
    assert client.get(f"/api/decks/{deck['id']}").status_code == 404


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
    assert body["owned_cards"][0]["functional_category"] == "utility"
    assert body["missing_cards"][0]["functional_category"] == "utility"


def test_recommendations_require_collection(client):
    assert client.post("/api/recommendations").status_code == 400
    client.post("/api/collection/text", json={"text": "1 Sol Ring"})
    r = client.post("/api/recommendations", params={"min_owned": 1})
    assert r.status_code == 200
    assert r.json()["results"][0]["match_percentage"] == 50.0


def test_compare(client):
    r = client.post("/api/compare", json={"commanders": ["Atraxa, Praetors' Voice", "Tymna the Weaver"]})
    assert r.status_code == 200
    assert r.json()["shared_count"] == 2
    assert client.post("/api/compare", json={"commanders": ["only one"]}).status_code == 400


def test_auth_and_user_sync(client):
    r = client.post("/api/auth/register", json={"username": "joe", "password": "pass"})
    assert r.status_code == 200
    token = r.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.post("/api/auth/register", json={"username": "joe", "password": "pass"}).status_code == 400
    assert client.post("/api/auth/login", json={"username": "joe", "password": "wrong"}).status_code == 401
    assert client.get("/api/auth/me", headers=headers).json()["user"]["username"] == "joe"
    assert client.get("/api/auth/me").status_code == 401

    client.post("/api/user/collection/save", json={"cards": {"sol ring": 1}}, headers=headers)
    client.post("/api/user/decks/save", json={"decks": {"d1": {"name": "D", "commander": "X", "cards": {}}}}, headers=headers)
    client.post("/api/user/favorites/save", json={"cards": ["Sol Ring"]}, headers=headers)
    data = client.get("/api/user/data", headers=headers).json()
    assert data["collection"]["cards"] == {"sol ring": 1}
    assert data["decks"]["decks"]["d1"]["name"] == "D"
    assert data["favorites"]["cards"] == ["Sol Ring"]
