"""SQLite connection and schema."""
import logging
import sqlite3

from .config import DATABASE_PATH

logger = logging.getLogger(__name__)

# Data is keyed by an owner string: "user:<id>" for accounts, "anon:<session>" for browsers without one.
SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS collections (
    owner TEXT PRIMARY KEY,
    cards_json TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS decks (
    owner TEXT NOT NULL,
    deck_id TEXT NOT NULL,
    name TEXT NOT NULL,
    commander TEXT NOT NULL DEFAULT '',
    partner TEXT NOT NULL DEFAULT '',
    cards_json TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (owner, deck_id)
);

CREATE TABLE IF NOT EXISTS favorites (
    owner TEXT PRIMARY KEY,
    cards_json TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""

# Earlier versions keyed these tables by user id. Copy them across once, then drop them.
MIGRATE_LEGACY = """
INSERT OR IGNORE INTO collections (owner, cards_json, updated_at)
    SELECT 'user:' || user_id, cards_json, updated_at FROM user_collections;
INSERT OR IGNORE INTO decks (owner, deck_id, name, commander, cards_json, created_at, updated_at)
    SELECT 'user:' || user_id, deck_id, name, commander, cards_json, created_at, updated_at FROM user_decks;
INSERT OR IGNORE INTO favorites (owner, cards_json, updated_at)
    SELECT 'user:' || user_id, cards_json, updated_at FROM user_favorites;
DROP TABLE user_collections;
DROP TABLE user_decks;
DROP TABLE user_favorites;
"""


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _has_table(conn: sqlite3.Connection, name: str) -> bool:
    return conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone() is not None


def init_db() -> None:
    conn = get_db()
    try:
        conn.executescript(SCHEMA)
        if _has_table(conn, "user_collections"):
            logger.info("Migrating per-user tables to owner-keyed tables")
            conn.executescript(MIGRATE_LEGACY)
        conn.commit()
    finally:
        conn.close()
    logger.info("Database initialized at %s", DATABASE_PATH)
