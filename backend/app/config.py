"""Environment-driven settings. Read once at import time."""
import os


def _csv(value: str) -> list[str]:
    return [v.strip() for v in value.split(",") if v.strip()]


CORS_ORIGINS: list[str] = _csv(os.environ.get("CORS_ORIGINS", "*"))
REDIS_URL: str = os.environ.get("REDIS_URL", "")
RATE_LIMIT: str = os.environ.get("RATE_LIMIT", "30/minute")
JWT_SECRET: str = os.environ.get("JWT_SECRET", "mtg-collection-secret-change-in-production")
DATABASE_PATH: str = os.environ.get("DATABASE_PATH", "mtg_collection.db")

# Cache lifetimes, in seconds.
COMMANDER_LIST_TTL = 86400      # Scryfall commander list
EDHREC_TTL = 3600               # average decks and synergy lists
PRICE_TTL = 86400               # Scryfall prices

# Polite delay between consecutive calls to the same external API.
EXTERNAL_API_DELAY = 0.1
