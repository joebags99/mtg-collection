import csv
import io
import json
import os
import re
import time
import logging
import unicodedata
import sqlite3
from typing import Optional
from datetime import datetime, timedelta

import requests
import bcrypt
import jwt
from fastapi import FastAPI, UploadFile, File, HTTPException, Request, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pyedhrec import EDHRec

try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded
    HAS_SLOWAPI = True
except ImportError:
    HAS_SLOWAPI = False

try:
    import redis as redis_lib
    HAS_REDIS = True
except ImportError:
    HAS_REDIS = False

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Environment config ---
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")
REDIS_URL = os.environ.get("REDIS_URL", "")
RATE_LIMIT = os.environ.get("RATE_LIMIT", "30/minute")
JWT_SECRET = os.environ.get("JWT_SECRET", "mtg-collection-secret-change-in-production")
DATABASE_PATH = os.environ.get("DATABASE_PATH", "mtg_collection.db")

# --- Database setup ---
def get_db():
    """Get a database connection."""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize database tables."""
    conn = get_db()
    cursor = conn.cursor()

    # Users table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # User collections - one per user, replaced on update
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_collections (
            user_id INTEGER PRIMARY KEY,
            cards_json TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    # User decks - multiple per user, updated in place
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_decks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            deck_id TEXT NOT NULL,
            name TEXT NOT NULL,
            commander TEXT NOT NULL,
            cards_json TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, deck_id)
        )
    """)

    conn.commit()
    conn.close()
    logger.info(f"Database initialized at {DATABASE_PATH}")


# --- Auth utilities ---
security = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    """Hash a password using bcrypt. Using rounds=8 for faster hashing."""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt(rounds=8)).decode('utf-8')


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its hash."""
    return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))


def create_token(user_id: int, username: str) -> str:
    """Create a JWT token for a user."""
    payload = {
        "user_id": user_id,
        "username": username,
        "exp": datetime.utcnow() + timedelta(days=30)  # 30 day expiry
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def verify_token(token: str) -> Optional[dict]:
    """Verify a JWT token and return the payload."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Optional[dict]:
    """Dependency to get the current user from the Authorization header."""
    if not credentials:
        return None
    payload = verify_token(credentials.credentials)
    return payload


async def require_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Dependency that requires a valid user."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = verify_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload


# --- Redis setup (optional) ---
redis_client = None
if HAS_REDIS and REDIS_URL:
    try:
        redis_client = redis_lib.from_url(REDIS_URL, decode_responses=True)
        redis_client.ping()
        logger.info(f"Connected to Redis at {REDIS_URL}")
    except Exception as e:
        logger.warning(f"Redis connection failed, using in-memory cache: {e}")
        redis_client = None

app = FastAPI(title="MTG Commander Recommender")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Rate limiting (optional) ---
if HAS_SLOWAPI:
    limiter = Limiter(key_func=get_remote_address)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
else:
    limiter = None


def rate_limit(limit_string):
    """Decorator that applies rate limiting if slowapi is available."""
    def decorator(func):
        if limiter:
            return limiter.limit(limit_string)(func)
        return func
    return decorator


# Initialize database on startup
@app.on_event("startup")
async def startup_event():
    init_db()


# --- Auth endpoints ---
@app.post("/api/auth/register")
async def register(body: dict):
    """Register a new user."""
    username = body.get("username", "").strip().lower()
    password = body.get("password", "")

    if not username or len(username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if not password or len(password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
    if not username.isalnum():
        raise HTTPException(status_code=400, detail="Username must be alphanumeric")

    conn = get_db()
    cursor = conn.cursor()

    # Check if username exists
    cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="Username already taken")

    # Create user
    password_hash = hash_password(password)
    cursor.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (username, password_hash)
    )
    conn.commit()
    user_id = cursor.lastrowid
    conn.close()

    token = create_token(user_id, username)
    return {"token": token, "user": {"id": user_id, "username": username}}


@app.post("/api/auth/login")
async def login(body: dict):
    """Login and get a token."""
    username = body.get("username", "").strip().lower()
    password = body.get("password", "")

    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password required")

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, password_hash FROM users WHERE username = ?", (username,))
    row = cursor.fetchone()
    conn.close()

    if not row or not verify_password(password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = create_token(row["id"], row["username"])
    return {"token": token, "user": {"id": row["id"], "username": row["username"]}}


@app.get("/api/auth/me")
async def get_me(user: dict = Depends(require_user)):
    """Get current user info."""
    return {"user": {"id": user["user_id"], "username": user["username"]}}


# --- User data sync endpoints ---
@app.post("/api/user/collection/save")
async def save_user_collection(body: dict, user: dict = Depends(require_user)):
    """Save user's collection to database. Replaces existing data."""
    cards = body.get("cards", {})
    user_id = user["user_id"]

    conn = get_db()
    cursor = conn.cursor()

    # Upsert - replace if exists, insert if not
    cursor.execute("""
        INSERT INTO user_collections (user_id, cards_json, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
            cards_json = excluded.cards_json,
            updated_at = CURRENT_TIMESTAMP
    """, (user_id, json.dumps(cards)))

    conn.commit()
    conn.close()

    return {"success": True, "count": len(cards)}


@app.get("/api/user/collection")
async def get_user_collection(user: dict = Depends(require_user)):
    """Load user's collection from database."""
    user_id = user["user_id"]

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT cards_json, updated_at FROM user_collections WHERE user_id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return {"cards": {}, "count": 0}

    cards = json.loads(row["cards_json"])
    return {"cards": cards, "count": len(cards), "updated_at": row["updated_at"]}


@app.post("/api/user/decks/save")
async def save_user_decks(body: dict, user: dict = Depends(require_user)):
    """Save user's decks to database. Replaces all existing decks."""
    decks = body.get("decks", {})
    user_id = user["user_id"]

    conn = get_db()
    cursor = conn.cursor()

    # Delete all existing decks for this user
    cursor.execute("DELETE FROM user_decks WHERE user_id = ?", (user_id,))

    # Insert new decks
    for deck_id, deck in decks.items():
        cursor.execute("""
            INSERT INTO user_decks (user_id, deck_id, name, commander, cards_json, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (
            user_id,
            deck_id,
            deck.get("name", ""),
            deck.get("commander", ""),
            json.dumps(deck.get("cards", {}))
        ))

    conn.commit()
    conn.close()

    return {"success": True, "count": len(decks)}


@app.get("/api/user/decks")
async def get_user_decks(user: dict = Depends(require_user)):
    """Load user's decks from database."""
    user_id = user["user_id"]

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT deck_id, name, commander, cards_json, updated_at
        FROM user_decks WHERE user_id = ?
    """, (user_id,))
    rows = cursor.fetchall()
    conn.close()

    decks = {}
    for row in rows:
        decks[row["deck_id"]] = {
            "id": row["deck_id"],
            "name": row["name"],
            "commander": row["commander"],
            "cards": json.loads(row["cards_json"]),
        }

    return {"decks": decks, "count": len(decks)}


@app.get("/api/user/data")
async def get_all_user_data(user: dict = Depends(require_user)):
    """Load all user data (collection + decks) in one call."""
    user_id = user["user_id"]

    conn = get_db()
    cursor = conn.cursor()

    # Get collection
    cursor.execute("SELECT cards_json FROM user_collections WHERE user_id = ?", (user_id,))
    coll_row = cursor.fetchone()
    cards = json.loads(coll_row["cards_json"]) if coll_row else {}

    # Get decks
    cursor.execute("""
        SELECT deck_id, name, commander, cards_json
        FROM user_decks WHERE user_id = ?
    """, (user_id,))
    deck_rows = cursor.fetchall()
    conn.close()

    decks = {}
    for row in deck_rows:
        decks[row["deck_id"]] = {
            "id": row["deck_id"],
            "name": row["name"],
            "commander": row["commander"],
            "cards": json.loads(row["cards_json"]),
        }

    return {
        "collection": {"cards": cards, "count": len(cards)},
        "decks": {"decks": decks, "count": len(decks)}
    }


edhrec = EDHRec()


def edhrec_slug(name: str) -> str:
    """Convert a card name to the EDHREC URL slug format.
    Strips punctuation, normalizes unicode accents, lowercases, and joins with hyphens.
    E.g. "Mr. House, President and CEO" -> "mr-house-president-and-ceo"
         "Altaïr Ibn-La'Ahad" -> "altair-ibn-laahad"
         "Bartolomé del Presidio" -> "bartolome-del-presidio"
    """
    # Normalize unicode: decompose accented chars, then strip combining marks
    s = unicodedata.normalize("NFD", name)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower()
    # Replace hyphens with spaces so they become single hyphens later
    s = s.replace("-", " ")
    # Strip all non-alphanumeric, non-space characters (periods, commas, apostrophes, colons, etc.)
    s = re.sub(r"[^a-z0-9\s]", "", s)
    # Collapse whitespace and join with hyphens
    s = re.sub(r"\s+", "-", s.strip())
    return s


# In-memory state
collection: dict[str, int] = {}  # normalized_name -> quantity owned
deck_lists: dict[str, dict] = {}  # deck_id -> {id, name, commander, cards: {normalized_name: qty}}
# Cache: commander_name -> {avg_deck, commander_data, timestamp}
commander_cache: dict[str, dict] = {}
CACHE_TTL = 3600  # 1 hour

# Price cache: normalized card name -> price in USD
price_cache: dict[str, float] = {}
PRICE_CACHE_TTL = 86400  # 24 hours
_price_cache_time: float = 0

# Synergy/type card cache
synergy_cache: dict[str, dict] = {}


def normalize_card_name(name: str) -> str:
    """Normalize card name for comparison: lowercase, strip whitespace."""
    name = name.strip().lower()
    if "//" in name:
        name = name.split("//")[0].strip()
    return name


def parse_csv_collection(content: str) -> dict[str, int]:
    """Parse CSV from Archidekt or Moxfield export. Returns dict of normalized card name -> quantity."""
    cards: dict[str, int] = {}
    reader = csv.DictReader(io.StringIO(content))
    name_columns = ["Name", "name", "Card", "card", "Card Name", "card_name"]
    qty_columns = ["Quantity", "quantity", "Qty", "qty", "Count", "count"]

    for row in reader:
        name = None
        for col in name_columns:
            if col in row and row[col]:
                name = normalize_card_name(row[col])
                break
        if not name:
            first_val = next(iter(row.values()), None)
            if first_val:
                name = normalize_card_name(first_val)

        if name:
            qty = 1
            for col in qty_columns:
                if col in row and row[col]:
                    try:
                        qty = int(row[col])
                    except ValueError:
                        pass
                    break
            cards[name] = cards.get(name, 0) + qty

    return cards


def parse_text_collection(content: str) -> dict[str, int]:
    """Parse text format: '1 Card Name' or just 'Card Name' per line. Returns dict name -> qty."""
    cards: dict[str, int] = {}
    for line in content.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        match = re.match(r"^(\d+)x?\s+(.+)", line)
        if match:
            qty = int(match.group(1))
            name = normalize_card_name(match.group(2))
        else:
            qty = 1
            name = normalize_card_name(line)
        cards[name] = cards.get(name, 0) + qty
    return cards


def get_cards_in_decks() -> dict[str, dict]:
    """Get usage info for all cards across deck lists.
    Returns: {normalized_name: {total_in_decks: int, decks: [{id, name}]}}
    """
    usage: dict[str, dict] = {}
    for deck_id, deck in deck_lists.items():
        for card_name, qty in deck.get("cards", {}).items():
            if card_name not in usage:
                usage[card_name] = {"total_in_decks": 0, "decks": []}
            usage[card_name]["total_in_decks"] += qty
            usage[card_name]["decks"].append({"id": deck_id, "name": deck.get("name", "")})
    return usage


def get_available_collection(exclude_in_decks: bool = False) -> set[str]:
    """Get the set of card names available (owned and optionally not fully committed to decks)."""
    if not exclude_in_decks:
        return set(collection.keys())
    usage = get_cards_in_decks()
    available = set()
    for name, qty in collection.items():
        used = usage.get(name, {}).get("total_in_decks", 0)
        if qty > used:
            available.add(name)
    return available


def _detect_partner_type(card: dict) -> str:
    """Detect what type of partner mechanic a commander has from Scryfall data.
    Returns one of: 'partner', 'partner_with', 'choose_a_background', 'background',
    'friends_forever', 'doctors_companion', 'doctor', 'partner_variant', or '' (none).
    """
    keywords = [k.lower() for k in card.get("keywords", [])]
    oracle = card.get("oracle_text", "")
    # Check card faces too for DFCs
    for face in card.get("card_faces", []):
        oracle += " " + face.get("oracle_text", "")
    oracle_lower = oracle.lower()
    type_line = card.get("type_line", "").lower()

    if "partner with" in oracle_lower:
        return "partner_with"
    # Detect custom partner variants like "Partner—Father & Son", "Partner—Friends", etc.
    # These use an em-dash followed by a label and only pair with cards sharing the same label.
    partner_variant = _extract_partner_variant_label(card)
    if partner_variant:
        return "partner_variant"
    if "choose a background" in oracle_lower:
        return "choose_a_background"
    if "background" in type_line and "legendary" in type_line and "enchantment" in type_line:
        return "background"
    if "friends forever" in keywords or "friends forever" in oracle_lower:
        return "friends_forever"
    if "doctor's companion" in keywords or "doctor's companion" in oracle_lower:
        return "doctors_companion"
    if "time lord" in type_line and "doctor" in type_line:
        return "doctor"
    if "partner" in keywords:
        return "partner"
    return ""


def _extract_partner_variant_label(card: dict) -> str:
    """Extract custom partner variant label from oracle text (e.g. 'Father & Son' from 'Partner—Father & Son')."""
    oracle = card.get("oracle_text", "")
    for face in card.get("card_faces", []):
        oracle += "\n" + face.get("oracle_text", "")
    # Match "Partner—<label>" patterns (em-dash variant mechanics)
    # but NOT "Partner with" which is a different mechanic
    match = re.search(r'[Pp]artner\s*[—\u2014]\s*([^\n(]+)', oracle)
    if match:
        return match.group(1).strip()
    return ""


def _extract_partner_with_name(card: dict) -> str:
    """Extract the specific partner name from 'Partner with X' oracle text."""
    oracle = card.get("oracle_text", "")
    for face in card.get("card_faces", []):
        oracle += "\n" + face.get("oracle_text", "")
    match = re.search(r"[Pp]artner with ([^\n(]+)", oracle)
    if match:
        return match.group(1).strip()
    return ""


def get_all_commanders() -> list[dict]:
    """Fetch all legal commanders from Scryfall bulk search, including partner info."""
    commanders = []
    url = "https://api.scryfall.com/cards/search"
    params = {
        "q": "is:commander f:commander",
        "order": "edhrec",
        "unique": "cards",
    }

    while url:
        resp = requests.get(url, params=params)
        if resp.status_code != 200:
            logger.error(f"Scryfall error: {resp.status_code}")
            break
        data = resp.json()
        for card in data.get("data", []):
            partner_type = _detect_partner_type(card)
            image_uris = card.get("image_uris") or (card.get("card_faces", [{}])[0].get("image_uris") or {})
            entry = {
                "name": card["name"],
                "name_normalized": normalize_card_name(card["name"]),
                "color_identity": card.get("color_identity", []),
                "image_uri": image_uris.get("normal", ""),
                "art_crop": image_uris.get("art_crop", ""),
                "edhrec_rank": card.get("edhrec_rank", 999999),
                "partner_type": partner_type,
                "type_line": card.get("type_line", ""),
            }
            if partner_type == "partner_with":
                entry["partner_with"] = _extract_partner_with_name(card)
            if partner_type == "partner_variant":
                entry["partner_variant_label"] = _extract_partner_variant_label(card)
            commanders.append(entry)

        if data.get("has_more"):
            url = data.get("next_page")
            params = {}
            time.sleep(0.1)
        else:
            url = None

    # Second pass: fetch backgrounds (legendary enchantments with Background subtype)
    bg_url = "https://api.scryfall.com/cards/search"
    bg_params = {"q": "t:background t:legendary t:enchantment f:commander", "order": "edhrec", "unique": "cards"}
    existing_names = {c["name_normalized"] for c in commanders}
    while bg_url:
        resp = requests.get(bg_url, params=bg_params)
        if resp.status_code != 200:
            break
        data = resp.json()
        for card in data.get("data", []):
            if normalize_card_name(card["name"]) not in existing_names:
                bg_image_uris = card.get("image_uris") or (card.get("card_faces", [{}])[0].get("image_uris") or {})
                commanders.append({
                    "name": card["name"],
                    "name_normalized": normalize_card_name(card["name"]),
                    "color_identity": card.get("color_identity", []),
                    "image_uri": bg_image_uris.get("normal", ""),
                    "art_crop": bg_image_uris.get("art_crop", ""),
                    "edhrec_rank": card.get("edhrec_rank", 999999),
                    "partner_type": "background",
                    "type_line": card.get("type_line", ""),
                })
                existing_names.add(normalize_card_name(card["name"]))
        if data.get("has_more"):
            bg_url = data.get("next_page")
            bg_params = {}
            time.sleep(0.1)
        else:
            bg_url = None

    return commanders


_all_commanders: list[dict] = []
_commanders_fetched_at: float = 0


def get_cached_commanders() -> list[dict]:
    global _all_commanders, _commanders_fetched_at
    if not _all_commanders or (time.time() - _commanders_fetched_at > 86400):
        logger.info("Fetching all commanders from Scryfall...")
        _all_commanders = get_all_commanders()
        _commanders_fetched_at = time.time()
        logger.info(f"Fetched {len(_all_commanders)} commanders")
    return _all_commanders


def fetch_prices_bulk(card_names: list[str]) -> dict[str, float]:
    """Fetch prices for multiple cards using Scryfall collection endpoint."""
    global _price_cache_time
    prices = {}
    uncached = []

    for name in card_names:
        normalized = normalize_card_name(name)
        if normalized in price_cache and (time.time() - _price_cache_time < PRICE_CACHE_TTL):
            prices[normalized] = price_cache[normalized]
        else:
            uncached.append(name)

    for i in range(0, len(uncached), 75):
        batch = uncached[i:i+75]
        identifiers = [{"name": name} for name in batch]
        try:
            resp = requests.post(
                "https://api.scryfall.com/cards/collection",
                json={"identifiers": identifiers},
                timeout=15,
            )
            if resp.status_code == 200:
                data = resp.json()
                for card in data.get("data", []):
                    card_prices = card.get("prices", {})
                    usd = card_prices.get("usd") or card_prices.get("usd_foil")
                    if usd:
                        normalized = normalize_card_name(card["name"])
                        price_val = float(usd)
                        price_cache[normalized] = price_val
                        prices[normalized] = price_val
                _price_cache_time = time.time()
            time.sleep(0.1)
        except Exception as e:
            logger.error(f"Error fetching bulk prices: {e}")

    return prices


def extract_cardview_names(cardviews) -> list[dict]:
    """Extract card info from EDHREC cardview objects."""
    results = []
    if not cardviews:
        return results
    for cv in cardviews:
        if isinstance(cv, dict):
            name = cv.get("name", "")
            if name:
                results.append({
                    "name": name,
                    "name_normalized": normalize_card_name(name),
                    "synergy": cv.get("synergy", 0),
                    "inclusion": cv.get("inclusion", 0),
                    "label": cv.get("label", ""),
                })
        elif isinstance(cv, str):
            results.append({
                "name": cv,
                "name_normalized": normalize_card_name(cv),
                "synergy": 0,
                "inclusion": 0,
                "label": "",
            })
    return results


def get_commander_synergy_cards(commander_name: str) -> dict:
    """Get high synergy cards, new cards, and type-specific top cards from EDHREC."""
    cache_key = commander_name
    if cache_key in synergy_cache and (time.time() - synergy_cache[cache_key].get("timestamp", 0) < CACHE_TTL):
        return synergy_cache[cache_key]["data"]

    name_for_edhrec = commander_name.split("//")[0].strip()
    formatted = edhrec_slug(name_for_edhrec)

    result = {
        "high_synergy": [],
        "new_cards": [],
        "top_creatures": [],
        "top_instants": [],
        "top_sorceries": [],
        "top_enchantments": [],
        "top_artifacts": [],
        "top_lands": [],
        "top_planeswalkers": [],
        "top_utility_lands": [],
        "top_mana_artifacts": [],
    }

    method_map = {
        "high_synergy": edhrec.get_high_synergy_cards,
        "new_cards": edhrec.get_new_cards,
        "top_creatures": edhrec.get_top_creatures,
        "top_instants": edhrec.get_top_instants,
        "top_sorceries": edhrec.get_top_sorceries,
        "top_enchantments": edhrec.get_top_enchantments,
        "top_artifacts": edhrec.get_top_artifacts,
        "top_lands": edhrec.get_top_lands,
        "top_planeswalkers": edhrec.get_top_planeswalkers,
        "top_utility_lands": edhrec.get_top_utility_lands,
        "top_mana_artifacts": edhrec.get_top_mana_artifacts,
    }

    for key, method in method_map.items():
        try:
            raw = method(formatted)
            # raw is a dict like {"Header": [cardviews...]}
            if isinstance(raw, dict):
                for header, cards in raw.items():
                    result[key] = extract_cardview_names(cards)
        except Exception as e:
            logger.error(f"Error fetching {key} for {commander_name}: {e}")

    synergy_cache[cache_key] = {"data": result, "timestamp": time.time()}
    return result


scryfall_type_cache = {}
scryfall_mana_cache = {}  # {card_name: {"cmc": float, "mana_cost": str}}


def fetch_card_mana_bulk(card_names: list[str]) -> dict[str, dict]:
    """Fetch cmc and mana_cost from Scryfall collection endpoint."""
    result = {}
    uncached = [n for n in card_names if n not in scryfall_mana_cache]
    for n in card_names:
        if n in scryfall_mana_cache:
            result[n] = scryfall_mana_cache[n]

    for i in range(0, len(uncached), 75):
        batch = uncached[i:i+75]
        identifiers = [{"name": n} for n in batch]
        try:
            resp = requests.post(
                "https://api.scryfall.com/cards/collection",
                json={"identifiers": identifiers},
                timeout=15,
            )
            if resp.status_code == 200:
                for card in resp.json().get("data", []):
                    name = card.get("name", "")
                    cmc = card.get("cmc", 0)
                    mana_cost = card.get("mana_cost", "")
                    # For DFCs, use front face mana cost
                    if not mana_cost and card.get("card_faces"):
                        mana_cost = card["card_faces"][0].get("mana_cost", "")
                        cmc = card.get("cmc", 0)
                    entry = {"cmc": cmc, "mana_cost": mana_cost}
                    scryfall_mana_cache[name] = entry
                    result[name] = entry
            time.sleep(0.1)
        except Exception as e:
            logger.error(f"Scryfall mana fetch error: {e}")

    return result


def fetch_card_types_bulk(card_names: list[str]) -> dict[str, str]:
    """Fetch card types from Scryfall collection endpoint for cards we can't classify locally."""
    result = {}
    uncached = [n for n in card_names if n not in scryfall_type_cache]
    # Return cached results first
    for n in card_names:
        if n in scryfall_type_cache:
            result[n] = scryfall_type_cache[n]

    # Batch fetch uncached cards from Scryfall
    for i in range(0, len(uncached), 75):
        batch = uncached[i:i+75]
        identifiers = [{"name": n} for n in batch]
        try:
            resp = requests.post(
                "https://api.scryfall.com/cards/collection",
                json={"identifiers": identifiers},
                timeout=15,
            )
            if resp.status_code == 200:
                for card in resp.json().get("data", []):
                    name = card.get("name", "")
                    type_line = card.get("type_line", "")
                    card_type = _parse_type_line(type_line)
                    scryfall_type_cache[name] = card_type
                    result[name] = card_type
            time.sleep(0.1)
        except Exception as e:
            logger.error(f"Scryfall type fetch error: {e}")

    return result


def _parse_type_line(type_line: str) -> str:
    """Parse a Scryfall type_line into our categories."""
    # Use the front face only for DFCs
    front = type_line.split("//")[0].strip().lower()
    if "creature" in front:
        return "Creature"
    if "planeswalker" in front:
        return "Planeswalker"
    if "instant" in front:
        return "Instant"
    if "sorcery" in front:
        return "Sorcery"
    if "enchantment" in front:
        return "Enchantment"
    if "artifact" in front:
        return "Artifact"
    if "land" in front:
        return "Land"
    return "Other"


def classify_card_type(card_name: str, type_data: dict) -> str:
    """Determine card type from the type-specific lists."""
    normalized = normalize_card_name(card_name)
    type_map = [
        ("Creature", "top_creatures"),
        ("Instant", "top_instants"),
        ("Sorcery", "top_sorceries"),
        ("Enchantment", "top_enchantments"),
        ("Artifact", "top_artifacts"),
        ("Artifact", "top_mana_artifacts"),
        ("Planeswalker", "top_planeswalkers"),
        ("Land", "top_lands"),
        ("Land", "top_utility_lands"),
    ]
    for type_name, key in type_map:
        for card in type_data.get(key, []):
            if card.get("name_normalized") == normalized:
                return type_name
    return ""


def get_commander_avg_deck(commander_name: str, budget: str = None, theme: str = None) -> dict:
    """Get average deck for a commander from EDHREC, with caching."""
    cache_key = f"{commander_name}|{budget or ''}|{theme or ''}"

    cached = commander_cache.get(cache_key)
    if cached and (time.time() - cached["timestamp"] < CACHE_TTL):
        return cached["data"]

    try:
        name_for_edhrec = commander_name.split("//")[0].strip()
        formatted = edhrec_slug(name_for_edhrec)

        avg_deck = edhrec.get_commanders_average_deck(formatted, budget)
        cmd_data = edhrec.get_commander_data(formatted)

        # Extract themes
        themes = []
        if cmd_data:
            container = cmd_data.get("container", {})
            json_dict = container.get("json_dict", {})
            theme_links = json_dict.get("themes", [])
            for t in (theme_links or []):
                if isinstance(t, dict):
                    themes.append({
                        "name": t.get("name", ""),
                        "slug": t.get("slug", ""),
                        "count": t.get("count", 0),
                    })

        # Extract card names from average deck
        deck_cards = set()
        decklist = []
        if avg_deck and avg_deck.get("decklist"):
            for card in avg_deck["decklist"]:
                if isinstance(card, str):
                    card_raw = card.strip()
                    qty_match = re.match(r"^\d+x?\s+(.+)", card_raw)
                    card_name = qty_match.group(1) if qty_match else card_raw
                    deck_cards.add(normalize_card_name(card_name))
                    decklist.append({
                        "name": card_name,
                        "name_normalized": normalize_card_name(card_name),
                        "category": "",
                    })
                elif isinstance(card, dict):
                    card_name = card.get("name", "")
                    if card_name:
                        deck_cards.add(normalize_card_name(card_name))
                        decklist.append({
                            "name": card_name,
                            "name_normalized": normalize_card_name(card_name),
                            "category": card.get("type", card.get("category", "")),
                        })

        num_decks = 0
        if cmd_data:
            num_decks = cmd_data.get("num_decks", 0)

        result = {
            "commander": commander_name,
            "num_decks": num_decks,
            "themes": themes,
            "decklist": decklist,
            "deck_card_names": list(deck_cards),
        }

        commander_cache[cache_key] = {"data": result, "timestamp": time.time()}
        return result
    except Exception as e:
        logger.error(f"Error fetching EDHREC data for {commander_name}: {e}")
        return {
            "commander": commander_name,
            "num_decks": 0,
            "themes": [],
            "decklist": [],
            "deck_card_names": [],
            "error": str(e),
        }


# --- API Endpoints ---

@app.post("/api/collection/upload")
async def upload_collection(file: UploadFile = File(...)):
    content = await file.read()
    text = content.decode("utf-8")

    if file.filename and file.filename.endswith(".csv"):
        cards = parse_csv_collection(text)
    else:
        cards = parse_text_collection(text)

    if not cards:
        raise HTTPException(status_code=400, detail="No cards found in uploaded file")

    collection.clear()
    collection.update(cards)
    return {
        "count": len(collection),
        "total_cards": sum(collection.values()),
        "cards": {name: qty for name, qty in sorted(collection.items())},
    }


@app.post("/api/collection/text")
async def upload_text_collection(body: dict):
    text = body.get("text", "")
    if not text.strip():
        raise HTTPException(status_code=400, detail="No text provided")

    if "," in text.splitlines()[0] and len(text.splitlines()[0].split(",")) > 2:
        cards = parse_csv_collection(text)
    else:
        cards = parse_text_collection(text)

    if not cards:
        raise HTTPException(status_code=400, detail="No cards found")

    collection.clear()
    collection.update(cards)
    return {
        "count": len(collection),
        "total_cards": sum(collection.values()),
        "cards": {name: qty for name, qty in sorted(collection.items())},
    }


@app.get("/api/collection")
async def get_collection():
    return {
        "count": len(collection),
        "total_cards": sum(collection.values()),
        "cards": {name: qty for name, qty in sorted(collection.items())},
    }


@app.post("/api/collection/restore")
async def restore_collection(body: dict):
    cards = body.get("cards", {})
    if not cards:
        raise HTTPException(status_code=400, detail="No cards provided")

    collection.clear()
    # Support both old format (list of strings) and new format (dict name->qty)
    if isinstance(cards, list):
        for card in cards:
            name = normalize_card_name(card)
            collection[name] = collection.get(name, 0) + 1
    elif isinstance(cards, dict):
        for name, qty in cards.items():
            collection[normalize_card_name(name)] = int(qty)
    return {
        "count": len(collection),
        "total_cards": sum(collection.values()),
        "cards": {name: qty for name, qty in sorted(collection.items())},
    }


# --- Deck List Management ---
@app.get("/api/decks")
async def list_decks():
    result = [_enrich_deck_response(deck) for deck in deck_lists.values()]
    return {"decks": result}


@app.post("/api/decks")
async def create_deck(body: dict):
    name = body.get("name", "").strip()
    commander = body.get("commander", "").strip()
    cards_text = body.get("cards_text", "")
    if not name:
        raise HTTPException(status_code=400, detail="Deck name is required")

    deck_id = f"deck_{int(time.time() * 1000)}"

    # Parse card list
    cards: dict[str, int] = {}
    if cards_text:
        for line in cards_text.strip().splitlines():
            line = line.strip()
            if not line:
                continue
            match = re.match(r"^(\d+)x?\s+(.+)", line)
            if match:
                qty = int(match.group(1))
                card_name = normalize_card_name(match.group(2))
            else:
                qty = 1
                card_name = normalize_card_name(line)
            cards[card_name] = cards.get(card_name, 0) + qty

    deck_lists[deck_id] = {
        "id": deck_id,
        "name": name,
        "commander": commander,
        "cards": cards,
    }
    return _enrich_deck_response(deck_lists[deck_id])


@app.get("/api/decks/{deck_id}")
async def get_deck(deck_id: str):
    if deck_id not in deck_lists:
        raise HTTPException(status_code=404, detail="Deck not found")
    return _enrich_deck_response(deck_lists[deck_id])


@app.put("/api/decks/{deck_id}")
async def update_deck(deck_id: str, body: dict):
    if deck_id not in deck_lists:
        raise HTTPException(status_code=404, detail="Deck not found")

    deck = deck_lists[deck_id]
    if "name" in body:
        deck["name"] = body["name"].strip()
    if "commander" in body:
        deck["commander"] = body["commander"].strip()
    if "cards_text" in body:
        cards: dict[str, int] = {}
        for line in body["cards_text"].strip().splitlines():
            line = line.strip()
            if not line:
                continue
            match = re.match(r"^(\d+)x?\s+(.+)", line)
            if match:
                qty = int(match.group(1))
                card_name = normalize_card_name(match.group(2))
            else:
                qty = 1
                card_name = normalize_card_name(line)
            cards[card_name] = cards.get(card_name, 0) + qty
        deck["cards"] = cards
    return _enrich_deck_response(deck)


@app.delete("/api/decks/{deck_id}")
async def delete_deck(deck_id: str):
    if deck_id not in deck_lists:
        raise HTTPException(status_code=404, detail="Deck not found")
    del deck_lists[deck_id]
    return {"ok": True}


@app.post("/api/decks/restore")
async def restore_decks(body: dict):
    """Restore deck lists from localStorage data."""
    decks = body.get("decks", {})
    deck_lists.clear()
    for deck_id, deck in decks.items():
        deck_lists[deck_id] = deck
    return {"count": len(deck_lists)}


@app.get("/api/collection/availability")
async def get_collection_availability():
    """Get availability info for all cards: owned qty, in-deck qty, available qty."""
    usage = get_cards_in_decks()
    result = {}
    for name, qty in collection.items():
        used = usage.get(name, {}).get("total_in_decks", 0)
        decks = usage.get(name, {}).get("decks", [])
        result[name] = {
            "owned": qty,
            "in_decks": used,
            "available": max(0, qty - used),
            "decks": decks,
        }
    return result


@app.get("/api/collection/stats")
async def get_collection_stats():
    """Get detailed statistics for the entire collection: prices, types, mana data."""
    if not collection:
        return {"error": "No collection loaded", "total_unique": 0}

    card_names = list(collection.keys())

    # Fetch types, mana, and prices in bulk - with error handling for timeouts
    # For large collections, limit API calls to avoid Scryfall rate limits/timeouts
    MAX_CARDS_FOR_API = 500  # Only fetch detailed data for first 500 cards
    api_card_names = card_names[:MAX_CARDS_FOR_API] if len(card_names) > MAX_CARDS_FOR_API else card_names

    try:
        types = fetch_card_types_bulk(api_card_names)
    except Exception as e:
        logger.error(f"Failed to fetch types: {e}")
        types = {}

    try:
        mana = fetch_card_mana_bulk(api_card_names)
    except Exception as e:
        logger.error(f"Failed to fetch mana data: {e}")
        mana = {}

    try:
        prices = fetch_prices_bulk(api_card_names)
    except Exception as e:
        logger.error(f"Failed to fetch prices: {e}")
        prices = {}

    cards = []
    total_value = 0
    type_counts = {}
    color_counts = {"W": 0, "U": 0, "B": 0, "R": 0, "G": 0, "C": 0}
    rarity_counts = {}
    cmc_distribution = {}

    for name, qty in collection.items():
        card_type = types.get(name, "Other")
        mana_info = mana.get(name, {})
        price = prices.get(name)
        cmc = mana_info.get("cmc", 0)
        mana_cost = mana_info.get("mana_cost", "")

        card_entry = {
            "name": name,
            "qty": qty,
            "card_type": card_type,
            "cmc": cmc,
            "mana_cost": mana_cost,
            "price": price,
        }
        cards.append(card_entry)

        if price:
            total_value += price * qty

        type_counts[card_type] = type_counts.get(card_type, 0) + qty

        # Color identity from mana cost
        has_color = False
        for color in ["W", "U", "B", "R", "G"]:
            if "{" + color + "}" in mana_cost or "/" + color in mana_cost or color + "/" in mana_cost:
                color_counts[color] += qty
                has_color = True
        if not has_color and card_type != "Land":
            color_counts["C"] += qty

        cmc_bucket = str(min(int(cmc), 7)) if cmc else "0"
        cmc_distribution[cmc_bucket] = cmc_distribution.get(cmc_bucket, 0) + qty

    # Top 10 most valuable cards
    priced = [c for c in cards if c["price"]]
    priced.sort(key=lambda c: (c["price"] or 0), reverse=True)
    top_valuable = priced[:10]

    usage = get_cards_in_decks()
    total_in_decks = sum(u.get("total_in_decks", 0) for u in usage.values())

    return {
        "total_unique": len(collection),
        "total_cards": sum(collection.values()),
        "total_value": round(total_value, 2),
        "total_in_decks": total_in_decks,
        "type_counts": type_counts,
        "color_counts": color_counts,
        "cmc_distribution": cmc_distribution,
        "top_valuable": top_valuable,
    }


@app.get("/api/commanders")
async def list_commanders(color: Optional[str] = None, search: Optional[str] = None):
    commanders = get_cached_commanders()
    results = commanders

    if color:
        color_set = set(color.upper())
        results = [c for c in results if set(c["color_identity"]) == color_set]

    if search:
        search_lower = search.lower()
        results = [c for c in results if search_lower in c["name"].lower()]

    return {"count": len(results), "commanders": results[:200]}


@app.get("/api/commanders/search_autocomplete")
async def search_commanders_autocomplete(q: str = ""):
    """Fast autocomplete search for commander names."""
    if len(q) < 2:
        return {"results": []}
    commanders = get_cached_commanders()
    q_lower = q.lower()
    # Exact prefix match first, then contains
    prefix_matches = []
    contains_matches = []
    for c in commanders:
        name_lower = c["name"].lower()
        if name_lower.startswith(q_lower):
            prefix_matches.append(c)
        elif q_lower in name_lower:
            contains_matches.append(c)
    results = (prefix_matches + contains_matches)[:20]
    return {"results": results}


def _enrich_deck_response(deck: dict) -> dict:
    """Add commander metadata to a deck response."""
    commanders = get_cached_commanders()
    cmd_lookup = {c["name_normalized"]: c for c in commanders}
    commander_name = deck.get("commander", "")
    cmd_data = cmd_lookup.get(normalize_card_name(commander_name), {}) if commander_name else {}
    return {
        "id": deck["id"],
        "name": deck.get("name", ""),
        "commander": commander_name,
        "cards": deck.get("cards", {}),
        "card_count": sum(deck.get("cards", {}).values()),
        "color_identity": cmd_data.get("color_identity", []),
        "image_uri": cmd_data.get("image_uri", ""),
        "art_crop": cmd_data.get("art_crop", ""),
        "partner_type": cmd_data.get("partner_type", ""),
    }


def _get_compatible_partners(commander: dict) -> list[dict]:
    """Get list of commanders that can be paired with the given commander."""
    pt = commander.get("partner_type", "")
    if not pt:
        return []

    all_cmds = get_cached_commanders()

    if pt == "partner_variant":
        # Custom partner variant (e.g. Partner—Father & Son) pairs only with
        # other commanders that share the exact same variant label
        label = commander.get("partner_variant_label", "")
        if label:
            return [c for c in all_cmds
                    if c.get("partner_type") == "partner_variant"
                    and c.get("partner_variant_label", "") == label
                    and c["name_normalized"] != commander["name_normalized"]]
        return []
    elif pt == "partner":
        # Generic Partner can pair with any other generic Partner
        return [c for c in all_cmds if c.get("partner_type") == "partner"
                and c["name_normalized"] != commander["name_normalized"]]
    elif pt == "partner_with":
        # Partner with a specific card
        partner_name = commander.get("partner_with", "")
        if partner_name:
            normalized = normalize_card_name(partner_name)
            return [c for c in all_cmds if c["name_normalized"] == normalized]
        return []
    elif pt == "choose_a_background":
        # Can pair with any Background enchantment
        return [c for c in all_cmds if c.get("partner_type") == "background"]
    elif pt == "background":
        # Can pair with any "Choose a Background" commander
        return [c for c in all_cmds if c.get("partner_type") == "choose_a_background"]
    elif pt == "friends_forever":
        # Friends Forever pairs with any other Friends Forever
        return [c for c in all_cmds if c.get("partner_type") == "friends_forever"
                and c["name_normalized"] != commander["name_normalized"]]
    elif pt == "doctors_companion":
        # Doctor's Companion pairs with any Doctor (Time Lord Doctor creature)
        return [c for c in all_cmds if c.get("partner_type") == "doctor"]
    elif pt == "doctor":
        # Doctor pairs with Doctor's Companion
        return [c for c in all_cmds if c.get("partner_type") == "doctors_companion"]
    return []


@app.get("/api/commander/{commander_name:path}/partners")
async def get_commander_partners(commander_name: str):
    """Get compatible partner commanders for a given commander."""
    commanders = get_cached_commanders()
    front_face = commander_name.split("//")[0].strip()
    normalized = normalize_card_name(front_face)

    commander = None
    for c in commanders:
        if c["name_normalized"] == normalized:
            commander = c
            break

    if not commander:
        return {"partner_type": "", "partners": []}

    partners = _get_compatible_partners(commander)
    return {
        "partner_type": commander.get("partner_type", ""),
        "partner_with": commander.get("partner_with", ""),
        "partners": partners[:100],
    }


@app.post("/api/cards/validate")
async def validate_cards(body: dict):
    """Validate a list of card names against Scryfall. Returns recognized and unrecognized cards."""
    card_names = body.get("cards", [])
    if not card_names:
        return {"valid": [], "invalid": []}

    valid = []
    invalid = []

    # Batch check via Scryfall collection endpoint (75 per batch)
    # For DFCs like "Etali, Primal Conqueror // Etali, Primal Sickness", use front face only
    cleaned_batch_map = {}  # cleaned_name -> [original_names]
    for name in card_names:
        front = name.split("//")[0].strip() if "//" in name else name
        cleaned_batch_map.setdefault(front, []).append(name)

    cleaned_names = list(cleaned_batch_map.keys())

    for i in range(0, len(cleaned_names), 75):
        batch = cleaned_names[i:i+75]
        identifiers = [{"name": name} for name in batch]
        try:
            resp = requests.post(
                "https://api.scryfall.com/cards/collection",
                json={"identifiers": identifiers},
                timeout=15,
            )
            if resp.status_code == 200:
                data = resp.json()
                found_names = set()
                for card in data.get("data", []):
                    found_names.add(normalize_card_name(card["name"]))
                for cleaned in batch:
                    originals = cleaned_batch_map.get(cleaned, [cleaned])
                    if normalize_card_name(cleaned) in found_names:
                        valid.extend(originals)
                    else:
                        invalid.extend(originals)
            else:
                # If Scryfall fails, don't block — treat all as valid
                for cleaned in batch:
                    valid.extend(cleaned_batch_map.get(cleaned, [cleaned]))
            time.sleep(0.1)
        except Exception as e:
            logger.error(f"Card validation error: {e}")
            for cleaned in batch:
                valid.extend(cleaned_batch_map.get(cleaned, [cleaned]))

    return {"valid": valid, "invalid": invalid}


@app.get("/api/commanders/popular")
async def popular_commanders():
    commanders = get_cached_commanders()
    top = sorted(commanders, key=lambda c: c["edhrec_rank"])[:50]
    return {"commanders": top}


@app.get("/api/commander/{commander_name:path}")
@rate_limit(RATE_LIMIT)
async def get_commander_detail(
    request: Request,
    commander_name: str,
    budget: Optional[str] = None,
    theme: Optional[str] = None,
    include_prices: bool = True,
    exclude_in_decks: bool = False,
    partner: Optional[str] = None,
):
    """Get commander average deck from EDHREC, compare with collection, categorize by type."""
    # For DFCs, use only the front face name for EDHREC lookups
    front_face = commander_name.split("//")[0].strip()

    # If partner provided, try combined EDHREC lookup first
    lookup_name = front_face
    if partner:
        partner_front = partner.split("//")[0].strip()
        # EDHREC uses alphabetical order for partner pair slugs
        slugs = sorted([edhrec_slug(front_face), edhrec_slug(partner_front)])
        combined_slug = "-".join(slugs)
        # Try the combined lookup
        try:
            combined_data = get_commander_avg_deck(combined_slug, budget=budget, theme=theme)
            if combined_data.get("decklist") and not combined_data.get("error"):
                combined_data["commander"] = f"{front_face} // {partner_front}"
                data = combined_data
            else:
                data = get_commander_avg_deck(front_face, budget=budget, theme=theme)
        except Exception:
            data = get_commander_avg_deck(front_face, budget=budget, theme=theme)
    else:
        data = get_commander_avg_deck(front_face, budget=budget, theme=theme)

    # Get type-specific data for categorization
    type_data = {}
    try:
        type_data = get_commander_synergy_cards(front_face)
    except Exception as e:
        logger.error(f"Error fetching type data for {front_face}: {e}")

    # Build a set of all cards in the avg deck
    avg_deck_names = set(c["name_normalized"] for c in data.get("decklist", []))

    # First pass: classify what we can from EDHREC type data
    all_cards = []
    unclassified_names = []
    for card in data.get("decklist", []):
        card_type = card.get("category", "") or classify_card_type(card["name"], type_data)
        all_cards.append({**card, "card_type": card_type})
        if not card_type:
            unclassified_names.append(card["name"])

    # Fallback: fetch types from Scryfall for unclassified cards
    if unclassified_names:
        scryfall_types = fetch_card_types_bulk(unclassified_names)
        for card in all_cards:
            if not card["card_type"] and card["name"] in scryfall_types:
                card["card_type"] = scryfall_types[card["name"]]

    # Fetch mana data (cmc, mana_cost) for all cards
    all_card_names = [card["name"] for card in all_cards]
    mana_data = fetch_card_mana_bulk(all_card_names)
    for card in all_cards:
        minfo = mana_data.get(card["name"], {})
        card["cmc"] = minfo.get("cmc", 0)
        card["mana_cost"] = minfo.get("mana_cost", "")

    # Split into owned/missing
    available = get_available_collection(exclude_in_decks)
    usage = get_cards_in_decks()
    owned = []
    missing = []
    missing_names = []
    for card in all_cards:
        card_usage = usage.get(card["name_normalized"], {})
        deck_info = card_usage.get("decks", [])
        qty_owned = collection.get(card["name_normalized"], 0)
        qty_in_decks = card_usage.get("total_in_decks", 0)

        if card["name_normalized"] in available:
            owned.append({
                **card, "owned": True,
                "qty_owned": qty_owned, "qty_in_decks": qty_in_decks,
                "in_decks": deck_info,
            })
        else:
            missing.append({
                **card, "owned": False,
                "qty_owned": qty_owned, "qty_in_decks": qty_in_decks,
                "in_decks": deck_info,
            })
            missing_names.append(card["name"])

    # Fetch prices for missing cards
    total_missing_price = 0
    if include_prices and missing_names:
        prices = fetch_prices_bulk(missing_names)
        for card in missing:
            price = prices.get(card["name_normalized"])
            card["price"] = price
            if price:
                total_missing_price += price

    # Build recommendations: synergy/new/top cards not in avg deck (both owned and not)
    # Map type keys to card_type labels
    type_key_to_label = {
        "top_creatures": "Creature", "top_instants": "Instant", "top_sorceries": "Sorcery",
        "top_enchantments": "Enchantment", "top_artifacts": "Artifact",
        "top_mana_artifacts": "Artifact", "top_planeswalkers": "Planeswalker",
        "top_lands": "Land", "top_utility_lands": "Land",
    }

    # Pre-build a lookup: normalized name -> card_type from type-specific lists
    rec_type_lookup = {}
    for key, label in type_key_to_label.items():
        for card in type_data.get(key, []):
            rec_type_lookup[card["name_normalized"]] = label

    recommendations = []
    seen_recs = set()
    for key in ["high_synergy", "new_cards"]:
        for card in type_data.get(key, []):
            normalized = card["name_normalized"]
            if normalized not in avg_deck_names and normalized not in seen_recs:
                seen_recs.add(normalized)
                recommendations.append({
                    "name": card["name"],
                    "name_normalized": normalized,
                    "synergy": card.get("synergy", 0),
                    "inclusion": card.get("inclusion", 0),
                    "source": "High Synergy" if key == "high_synergy" else "New Card",
                    "owned": normalized in collection,
                    "card_type": rec_type_lookup.get(normalized, ""),
                })

    # Also check all type-specific top cards
    for key in ["top_creatures", "top_instants", "top_sorceries", "top_enchantments",
                "top_artifacts", "top_lands", "top_planeswalkers", "top_utility_lands",
                "top_mana_artifacts"]:
        type_label = type_key_to_label[key]
        for card in type_data.get(key, []):
            normalized = card["name_normalized"]
            if normalized not in avg_deck_names and normalized not in seen_recs:
                seen_recs.add(normalized)
                source_label = key.replace("top_", "").replace("_", " ").title()
                recommendations.append({
                    "name": card["name"],
                    "name_normalized": normalized,
                    "synergy": card.get("synergy", 0),
                    "inclusion": card.get("inclusion", 0),
                    "source": f"Top {source_label}",
                    "owned": normalized in collection,
                    "card_type": type_label,
                })

    # Scryfall fallback for recs with no card_type
    untyped_rec_names = [r["name"] for r in recommendations if not r["card_type"]]
    if untyped_rec_names:
        rec_types = fetch_card_types_bulk(untyped_rec_names)
        for r in recommendations:
            if not r["card_type"] and r["name"] in rec_types:
                r["card_type"] = rec_types[r["name"]]

    # Sort recommendations by synergy descending
    recommendations.sort(key=lambda r: r.get("synergy", 0), reverse=True)

    return {
        "commander": data["commander"],
        "num_decks": data.get("num_decks", 0),
        "themes": data.get("themes", []),
        "total_cards": len(data.get("decklist", [])),
        "owned_count": len(owned),
        "missing_count": len(missing),
        "match_percentage": round(len(owned) / max(len(data.get("decklist", [])), 1) * 100, 1),
        "total_missing_price": round(total_missing_price, 2),
        "owned_cards": owned,
        "missing_cards": missing,
        "recommendations": recommendations,
        "error": data.get("error"),
    }


@app.post("/api/recommendations")
@rate_limit(RATE_LIMIT)
async def get_recommendations(
    request: Request,
    color: Optional[str] = None,
    search: Optional[str] = None,
    min_owned: int = 20,
    limit: int = 50,
    exclude_in_decks: bool = False,
):
    if not collection:
        raise HTTPException(status_code=400, detail="No collection uploaded. Upload your collection first.")

    available = get_available_collection(exclude_in_decks)

    commanders = get_cached_commanders()

    if color:
        color_set = set(color.upper())
        commanders = [c for c in commanders if set(c["color_identity"]) == color_set]

    if search:
        search_lower = search.lower()
        commanders = [c for c in commanders if search_lower in c["name"].lower()]

    commanders = sorted(commanders, key=lambda c: c["edhrec_rank"])[:200]

    results = []
    for cmd in commanders:
        data = get_commander_avg_deck(cmd["name"])
        deck_cards = set(data.get("deck_card_names", []))
        if not deck_cards:
            continue

        owned_count = len(deck_cards & available)
        missing_count = len(deck_cards) - owned_count
        total = len(deck_cards)

        if owned_count >= min_owned:
            missing_names = [
                card["name"] for card in data.get("decklist", [])
                if card["name_normalized"] not in available
            ]

            results.append({
                "name": cmd["name"],
                "color_identity": cmd["color_identity"],
                "image_uri": cmd["image_uri"],
                "edhrec_rank": cmd["edhrec_rank"],
                "num_decks": data.get("num_decks", 0),
                "total_cards": total,
                "owned_count": owned_count,
                "missing_count": missing_count,
                "match_percentage": round(owned_count / max(total, 1) * 100, 1),
                "_missing_names": missing_names,
            })

        time.sleep(0.1)

    # Fetch prices for all missing cards across all results
    all_missing = set()
    for r in results:
        all_missing.update(r.get("_missing_names", []))
    if all_missing:
        prices = fetch_prices_bulk(list(all_missing))
        for r in results:
            total_price = 0
            for name in r.pop("_missing_names", []):
                p = prices.get(normalize_card_name(name))
                if p:
                    total_price += p
            r["missing_price"] = round(total_price, 2)
    else:
        for r in results:
            r.pop("_missing_names", None)
            r["missing_price"] = 0

    results.sort(key=lambda r: r["match_percentage"], reverse=True)
    return {"results": results[:limit]}


@app.post("/api/compare")
@rate_limit(RATE_LIMIT)
async def compare_commanders(request: Request, body: dict):
    """Compare 2-3 commanders side by side."""
    names = body.get("commanders", [])
    if len(names) < 2 or len(names) > 3:
        raise HTTPException(status_code=400, detail="Provide 2-3 commander names")

    results = []
    for name in names:
        front_face = name.split("//")[0].strip()
        data = get_commander_avg_deck(front_face)
        deck_cards = set(data.get("deck_card_names", []))
        owned_count = len(deck_cards & collection)
        total = len(deck_cards)

        missing_names = [
            card["name"] for card in data.get("decklist", [])
            if card["name_normalized"] not in collection
        ]

        # Prices
        total_price = 0
        if missing_names:
            prices = fetch_prices_bulk(missing_names)
            for mn in missing_names:
                p = prices.get(normalize_card_name(mn))
                if p:
                    total_price += p

        results.append({
            "name": name,
            "num_decks": data.get("num_decks", 0),
            "total_cards": total,
            "owned_count": owned_count,
            "missing_count": total - owned_count,
            "match_percentage": round(owned_count / max(total, 1) * 100, 1),
            "missing_price": round(total_price, 2),
            "deck_card_names": list(deck_cards),
            "owned_cards": sorted(deck_cards & collection),
            "missing_cards": sorted(deck_cards - collection),
        })

    # Compute overlap/unique
    all_deck_sets = [set(r["deck_card_names"]) for r in results]
    shared_across_all = set.intersection(*all_deck_sets) if all_deck_sets else set()
    for r in results:
        this_set = set(r["deck_card_names"])
        others = [s for s in all_deck_sets if s != this_set]
        r["unique_cards"] = sorted(set(r["deck_card_names"]) - set.union(*others) if others else set(r["deck_card_names"]))
        r["shared_cards"] = sorted(shared_across_all)
        del r["deck_card_names"]  # Don't send the full set

    return {"commanders": results, "shared_count": len(shared_across_all)}


@app.get("/api/health")
async def health():
    return {"status": "ok", "collection_size": len(collection)}
