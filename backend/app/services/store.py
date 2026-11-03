"""Persistence: accounts, and each owner's collection, decks, and favorites."""
import json
from typing import Optional

from ..db import get_db
from ..state import WorkingState


# --- accounts ---

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


# --- single-document tables (collection, favorites) ---

def _get_doc(table: str, owner: str, default):
    conn = get_db()
    try:
        row = conn.execute(f"SELECT cards_json FROM {table} WHERE owner = ?", (owner,)).fetchone()
    finally:
        conn.close()
    return json.loads(row["cards_json"]) if row else default


def _set_doc(table: str, owner: str, payload) -> None:
    conn = get_db()
    try:
        conn.execute(
            f"""INSERT INTO {table} (owner, cards_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(owner) DO UPDATE SET cards_json = excluded.cards_json, updated_at = CURRENT_TIMESTAMP""",
            (owner, json.dumps(payload)),
        )
        conn.commit()
    finally:
        conn.close()


def _delete_doc(table: str, owner: str) -> None:
    conn = get_db()
    try:
        conn.execute(f"DELETE FROM {table} WHERE owner = ?", (owner,))
        conn.commit()
    finally:
        conn.close()


def get_collection(owner: str) -> dict[str, int]:
    return _get_doc("collections", owner, {})


def set_collection(owner: str, cards: dict[str, int]) -> None:
    _set_doc("collections", owner, cards)


def clear_collection(owner: str) -> None:
    _delete_doc("collections", owner)


def get_favorites(owner: str) -> list[str]:
    return _get_doc("favorites", owner, [])


def set_favorites(owner: str, cards: list[str]) -> None:
    _set_doc("favorites", owner, cards)


# --- decks ---

def _row_to_deck(row) -> dict:
    return {"id": row["deck_id"], "name": row["name"], "commander": row["commander"],
            "partner": row["partner"], "cards": json.loads(row["cards_json"])}


def list_decks(owner: str) -> dict[str, dict]:
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT deck_id, name, commander, partner, cards_json FROM decks WHERE owner = ? ORDER BY created_at",
            (owner,),
        ).fetchall()
    finally:
        conn.close()
    return {r["deck_id"]: _row_to_deck(r) for r in rows}


def get_deck(owner: str, deck_id: str) -> Optional[dict]:
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT deck_id, name, commander, partner, cards_json FROM decks WHERE owner = ? AND deck_id = ?",
            (owner, deck_id),
        ).fetchone()
    finally:
        conn.close()
    return _row_to_deck(row) if row else None


def save_deck(owner: str, deck: dict) -> None:
    conn = get_db()
    try:
        conn.execute(
            """INSERT INTO decks (owner, deck_id, name, commander, partner, cards_json, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT(owner, deck_id) DO UPDATE SET
                   name = excluded.name, commander = excluded.commander, partner = excluded.partner,
                   cards_json = excluded.cards_json, updated_at = CURRENT_TIMESTAMP""",
            (owner, deck["id"], deck.get("name", ""), deck.get("commander", ""), deck.get("partner", ""),
             json.dumps(deck.get("cards", {}))),
        )
        conn.commit()
    finally:
        conn.close()


def delete_deck(owner: str, deck_id: str) -> bool:
    conn = get_db()
    try:
        cur = conn.execute("DELETE FROM decks WHERE owner = ? AND deck_id = ?", (owner, deck_id))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


# --- composite ---

def load_state(owner: str) -> WorkingState:
    """Everything the analysis needs about an owner, read fresh for this request."""
    return WorkingState(get_collection(owner), list_decks(owner))


def claim_anonymous(anon: str, user: str) -> None:
    """Move an anonymous session's data to an account that has none of its own, then forget the session."""
    conn = get_db()
    try:
        for table in ("collections", "favorites"):
            has_own = conn.execute(f"SELECT 1 FROM {table} WHERE owner = ?", (user,)).fetchone()
            if not has_own:
                conn.execute(f"UPDATE {table} SET owner = ? WHERE owner = ?", (user, anon))
        has_decks = conn.execute("SELECT 1 FROM decks WHERE owner = ? LIMIT 1", (user,)).fetchone()
        if not has_decks:
            conn.execute("UPDATE decks SET owner = ? WHERE owner = ?", (user, anon))
        for table in ("collections", "favorites", "decks"):
            conn.execute(f"DELETE FROM {table} WHERE owner = ?", (anon,))
        conn.commit()
    finally:
        conn.close()
