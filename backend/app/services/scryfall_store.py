"""Scryfall data on disk, so a restart does not re-crawl the API."""
import json
import logging
import time

from .. import cache
from ..config import PRICE_TTL
from ..db import get_db

logger = logging.getLogger(__name__)


def load_catalog() -> tuple[list[dict], float] | None:
    conn = get_db()
    try:
        row = conn.execute("SELECT commanders_json, fetched_at FROM scryfall_catalog WHERE id = 1").fetchone()
    finally:
        conn.close()
    if not row:
        return None
    return json.loads(row["commanders_json"]), float(row["fetched_at"])


def save_catalog(commanders: list[dict], fetched_at: float) -> None:
    conn = get_db()
    try:
        conn.execute(
            """INSERT INTO scryfall_catalog (id, commanders_json, fetched_at) VALUES (1, ?, ?)
               ON CONFLICT(id) DO UPDATE SET commanders_json = excluded.commanders_json, fetched_at = excluded.fetched_at""",
            (json.dumps(commanders), fetched_at),
        )
        conn.commit()
    finally:
        conn.close()


def save_card_facts(names: list[str]) -> None:
    """Write the in-memory facts for these normalized names."""
    rows = [
        (n, cache.card_types.get(n, "Other"), cache.oracle_text.get(n, ""),
         float(cache.mana.get(n, {}).get("cmc", 0) or 0), cache.mana.get(n, {}).get("mana_cost", ""))
        for n in names if n
    ]
    if not rows:
        return
    conn = get_db()
    try:
        conn.executemany(
            "INSERT OR REPLACE INTO card_facts (name, card_type, oracle, cmc, mana_cost) VALUES (?, ?, ?, ?, ?)", rows,
        )
        conn.commit()
    finally:
        conn.close()


def save_prices(prices: dict[str, float]) -> None:
    if not prices:
        return
    now = time.time()
    conn = get_db()
    try:
        conn.executemany(
            "INSERT OR REPLACE INTO card_prices (name, usd, stored_at) VALUES (?, ?, ?)",
            [(n, usd, now) for n, usd in prices.items()],
        )
        conn.commit()
    finally:
        conn.close()


def warm_caches() -> None:
    """Fill the in-memory caches from disk. Called once at startup."""
    conn = get_db()
    try:
        facts = conn.execute("SELECT name, card_type, oracle, cmc, mana_cost FROM card_facts").fetchall()
        prices = conn.execute("SELECT name, usd, stored_at FROM card_prices WHERE stored_at > ?", (time.time() - PRICE_TTL,)).fetchall()
    finally:
        conn.close()
    for r in facts:
        cache.card_types.setdefault(r["name"], r["card_type"])
        cache.oracle_text.setdefault(r["name"], r["oracle"])
        cache.mana.setdefault(r["name"], {"cmc": r["cmc"], "mana_cost": r["mana_cost"]})
    for r in prices:
        cache.prices.set(r["name"], float(r["usd"]))
    if facts or prices:
        logger.info("Loaded %d card facts and %d prices from disk", len(facts), len(prices))
