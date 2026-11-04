"""Process-local caches for external API data.

Everything here is a plain dict guarded by a TTL where staleness matters.
Redis is connected if configured so a later step can move these caches there,
but nothing reads from it yet.
"""
import logging
import time
from typing import Generic, Optional, TypeVar

from .config import EDHREC_TTL, PRICE_TTL, REDIS_URL

logger = logging.getLogger(__name__)

T = TypeVar("T")


class TTLCache(Generic[T]):
    """A dict whose entries expire `ttl` seconds after being set."""

    def __init__(self, ttl: float):
        self.ttl = ttl
        self._data: dict[str, tuple[T, float]] = {}

    def get(self, key: str) -> Optional[T]:
        entry = self._data.get(key)
        if entry is None:
            return None
        value, stored_at = entry
        if time.time() - stored_at > self.ttl:
            return None
        return value

    def set(self, key: str, value: T) -> None:
        self._data[key] = (value, time.time())

    def __contains__(self, key: str) -> bool:
        return self.get(key) is not None


# EDHREC: commander slug -> raw commander page JSON (shared by the synergy lists and the average deck)
commander_pages: TTLCache[dict] = TTLCache(EDHREC_TTL)
# EDHREC: commander name (or budget/theme-qualified key) -> average deck payload
commander_decks: TTLCache[dict] = TTLCache(EDHREC_TTL)
# EDHREC: commander name -> synergy / top-card lists
commander_synergy: TTLCache[dict] = TTLCache(EDHREC_TTL)
# Scryfall: normalized name -> USD price
prices: TTLCache[float] = TTLCache(PRICE_TTL)

# Scryfall card facts never change, so these never expire.
card_types: dict[str, str] = {}            # normalized name -> "Creature" | "Land" | ...
oracle_text: dict[str, str] = {}           # normalized name -> lowercased oracle text
mana: dict[str, dict] = {}                 # normalized name -> {"cmc": float, "mana_cost": str}


def remember_oracle(normalized: str, card: dict) -> None:
    """Store a Scryfall card's oracle text (front face for double-faced cards) if not already known."""
    if not normalized or normalized in oracle_text:
        return
    text = card.get("oracle_text", "")
    if not text and card.get("card_faces"):
        text = " ".join(f.get("oracle_text", "") for f in card["card_faces"])
    oracle_text[normalized] = text.lower()


def connect_redis():
    """Return a Redis client if REDIS_URL is set and reachable, else None."""
    if not REDIS_URL:
        return None
    try:
        import redis as redis_lib
    except ImportError:
        return None
    try:
        client = redis_lib.from_url(REDIS_URL, decode_responses=True)
        client.ping()
        logger.info("Connected to Redis at %s", REDIS_URL)
        return client
    except Exception as e:  # noqa: BLE001
        logger.warning("Redis connection failed, using in-memory cache: %s", e)
        return None


redis_client = connect_redis()
