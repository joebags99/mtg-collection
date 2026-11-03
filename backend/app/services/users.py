"""Per-user persistence: accounts, saved collection, decks, and favorites."""
import json
from typing import Optional

from ..db import get_db


def find_user_by_name(username: str) -> Optional[dict]:
    conn = get_db()
    try:
        row = conn.execute("SELECT id, username, password_hash FROM users WHERE username = ?", (username,)).fetchone()
    finally:
        conn.close()
    return dict(row) if row else None


def create_user(username: str, password_hash: str) -> int:
    conn = get_db()
    try:
        cur = conn.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", (username, password_hash))
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def _upsert_json(table: str, user_id: int, payload) -> None:
    conn = get_db()
    try:
        conn.execute(
            f"""INSERT INTO {table} (user_id, cards_json, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id) DO UPDATE SET
                    cards_json = excluded.cards_json, updated_at = CURRENT_TIMESTAMP""",
            (user_id, json.dumps(payload)),
        )
        conn.commit()
    finally:
        conn.close()


def _load_json(table: str, user_id: int, default):
    conn = get_db()
    try:
        row = conn.execute(f"SELECT cards_json, updated_at FROM {table} WHERE user_id = ?", (user_id,)).fetchone()
    finally:
        conn.close()
    if not row:
        return default, None
    return json.loads(row["cards_json"]), row["updated_at"]


def save_collection(user_id: int, cards: dict) -> None:
    _upsert_json("user_collections", user_id, cards)


def load_collection(user_id: int) -> tuple[dict, Optional[str]]:
    return _load_json("user_collections", user_id, {})


def save_favorites(user_id: int, cards: list) -> None:
    _upsert_json("user_favorites", user_id, cards)


def load_favorites(user_id: int) -> tuple[list, Optional[str]]:
    return _load_json("user_favorites", user_id, [])


def save_decks(user_id: int, decks: dict) -> None:
    """Replace all of a user's decks."""
    conn = get_db()
    try:
        conn.execute("DELETE FROM user_decks WHERE user_id = ?", (user_id,))
        conn.executemany(
            """INSERT INTO user_decks (user_id, deck_id, name, commander, cards_json, updated_at)
               VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)""",
            [(user_id, deck_id, d.get("name", ""), d.get("commander", ""), json.dumps(d.get("cards", {})))
             for deck_id, d in decks.items()],
        )
        conn.commit()
    finally:
        conn.close()


def load_decks(user_id: int) -> dict:
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT deck_id, name, commander, cards_json FROM user_decks WHERE user_id = ?", (user_id,)
        ).fetchall()
    finally:
        conn.close()
    return {
        r["deck_id"]: {"id": r["deck_id"], "name": r["name"], "commander": r["commander"],
                       "cards": json.loads(r["cards_json"])}
        for r in rows
    }
