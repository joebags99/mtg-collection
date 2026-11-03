import json
import os
import sqlite3
import tempfile


def test_legacy_user_tables_migrate_to_owner_tables(monkeypatch):
    from backend.app import db

    path = os.path.join(tempfile.mkdtemp(), "legacy.db")
    monkeypatch.setattr(db, "DATABASE_PATH", path)
    conn = sqlite3.connect(path)
    conn.executescript("""
        CREATE TABLE user_collections (user_id INTEGER PRIMARY KEY, cards_json TEXT NOT NULL, updated_at TIMESTAMP);
        CREATE TABLE user_decks (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, deck_id TEXT, name TEXT,
            commander TEXT, cards_json TEXT, created_at TIMESTAMP, updated_at TIMESTAMP);
        CREATE TABLE user_favorites (user_id INTEGER PRIMARY KEY, cards_json TEXT NOT NULL, updated_at TIMESTAMP);
        INSERT INTO user_collections VALUES (7, '{"sol ring": 2}', NULL);
        INSERT INTO user_decks (user_id, deck_id, name, commander, cards_json) VALUES (7, 'd1', 'Old', 'X', '{"swamp": 1}');
        INSERT INTO user_favorites VALUES (7, '["sol ring"]', NULL);
    """)
    conn.commit()
    conn.close()

    db.init_db()
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    assert json.loads(conn.execute("SELECT cards_json FROM collections WHERE owner='user:7'").fetchone()[0]) == {"sol ring": 2}
    assert conn.execute("SELECT name FROM decks WHERE owner='user:7'").fetchone()[0] == "Old"
    assert json.loads(conn.execute("SELECT cards_json FROM favorites WHERE owner='user:7'").fetchone()[0]) == ["sol ring"]
    assert conn.execute("SELECT 1 FROM sqlite_master WHERE name='user_collections'").fetchone() is None
    db.init_db()  # idempotent on the migrated database
    conn.close()
