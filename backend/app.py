import csv
import io
import json
import os
import re
import time
import logging
import unicodedata
import sqlite3
import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Optional
from datetime import datetime, timedelta

import requests
import bcrypt
import jwt
from fastapi import FastAPI, UploadFile, File, HTTPException, Request, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

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

# Thread pool for CPU-bound operations (bcrypt)
password_executor = ThreadPoolExecutor(max_workers=2)

# --- Environment config ---
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")
REDIS_URL = os.environ.get("REDIS_URL", "")
RATE_LIMIT = os.environ.get("RATE_LIMIT", "30/minute")
JWT_SECRET = os.environ.get("JWT_SECRET", "mtg-collection-secret-change-in-production")
DATABASE_PATH = os.environ.get("DATABASE_PATH", "mtg_collection.db")

if JWT_SECRET == "mtg-collection-secret-change-in-production":
    logger.warning("JWT_SECRET is not set; using the insecure default. Set JWT_SECRET in production.")

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

    # User favorites - one list per user
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_favorites (
            user_id INTEGER PRIMARY KEY,
            cards_json TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    # Migration: decks saved before partner support have no partner column
    try:
        cursor.execute("ALTER TABLE user_decks ADD COLUMN partner TEXT NOT NULL DEFAULT ''")
    except sqlite3.OperationalError:
        pass  # column already exists

    conn.commit()
    conn.close()
    logger.info(f"Database initialized at {DATABASE_PATH}")


# --- Auth utilities ---
security = HTTPBearer(auto_error=False)


def _hash_password_sync(password: str) -> str:
    """Synchronous password hashing."""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt(rounds=8)).decode('utf-8')


def _verify_password_sync(password: str, password_hash: str) -> bool:
    """Synchronous password verification."""
    return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))


async def hash_password(password: str) -> str:
    """Hash a password using bcrypt in a thread pool (non-blocking)."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(password_executor, _hash_password_sync, password)


async def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its hash in a thread pool (non-blocking)."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(password_executor, _verify_password_sync, password, password_hash)


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
    _load_card_data_from_disk()
    _load_edhrec_cache_from_disk()


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
    password_hash = await hash_password(password)
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

    if not row:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if not await verify_password(password, row["password_hash"]):
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
            INSERT INTO user_decks (user_id, deck_id, name, commander, partner, cards_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (
            user_id,
            deck_id,
            deck.get("name", ""),
            deck.get("commander", ""),
            deck.get("partner", "") or "",
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
        SELECT deck_id, name, commander, partner, cards_json, updated_at
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
            "partner": row["partner"],
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
        SELECT deck_id, name, commander, partner, cards_json
        FROM user_decks WHERE user_id = ?
    """, (user_id,))
    deck_rows = cursor.fetchall()

    # Get favorites
    cursor.execute("SELECT cards_json FROM user_favorites WHERE user_id = ?", (user_id,))
    fav_row = cursor.fetchone()
    favorites = json.loads(fav_row["cards_json"]) if fav_row else []

    conn.close()

    decks = {}
    for row in deck_rows:
        decks[row["deck_id"]] = {
            "id": row["deck_id"],
            "name": row["name"],
            "commander": row["commander"],
            "partner": row["partner"],
            "cards": json.loads(row["cards_json"]),
        }

    return {
        "collection": {"cards": cards, "count": len(cards)},
        "decks": {"decks": decks, "count": len(decks)},
        "favorites": {"cards": favorites, "count": len(favorites)},
    }


@app.post("/api/user/favorites/save")
async def save_user_favorites(body: dict, user: dict = Depends(require_user)):
    """Save user's favorite cards to database."""
    cards = body.get("cards", [])
    user_id = user["user_id"]

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO user_favorites (user_id, cards_json, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
            cards_json = excluded.cards_json,
            updated_at = CURRENT_TIMESTAMP
    """, (user_id, json.dumps(cards)))
    conn.commit()
    conn.close()

    return {"success": True, "count": len(cards)}


@app.get("/api/user/favorites")
async def get_user_favorites(user: dict = Depends(require_user)):
    """Load user's favorite cards from database."""
    user_id = user["user_id"]
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT cards_json, updated_at FROM user_favorites WHERE user_id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return {"cards": [], "count": 0}

    cards = json.loads(row["cards_json"])
    return {"cards": cards, "count": len(cards), "updated_at": row["updated_at"]}


# --- EDHREC ---
# EDHREC has no public API. Its site reads plain JSON from json.edhrec.com, one file per
# page (https://json.edhrec.com/pages/<page path>.json), and that is what we read too.
# The pyedhrec library used Next.js data routes that disappeared in EDHREC's October 2026
# redesign. There are no published limits, so requests are spaced out and results cached.
EDHREC_JSON_BASE = "https://json.edhrec.com/pages"
EDHREC_MIN_INTERVAL = 0.25
_edhrec_session = requests.Session()
_edhrec_session.headers.update({
    # json.edhrec.com answered the probe with a browser User-Agent; keep the same shape
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Accept": "application/json",
})
_edhrec_lock = threading.Lock()
_edhrec_last_request = 0.0


class EdhrecNotFound(Exception):
    """EDHREC has no page at this path (e.g. a commander with no decks yet)."""


def edhrec_fetch_page(path: str) -> dict:
    """Fetch one EDHREC page's JSON, e.g. 'commanders/fire-lord-zuko' or
    'average-decks/atraxa-praetors-voice/counters/budget'."""
    global _edhrec_last_request
    with _edhrec_lock:
        wait = _edhrec_last_request + EDHREC_MIN_INTERVAL - time.time()
        if wait > 0:
            time.sleep(wait)
        _edhrec_last_request = time.time()
    url = f"{EDHREC_JSON_BASE}/{path}.json"
    resp = _edhrec_session.get(url, timeout=30)
    if resp.status_code in (403, 404):
        raise EdhrecNotFound(f"EDHREC has no page at {url} (HTTP {resp.status_code})")
    resp.raise_for_status()
    data = resp.json()
    if not isinstance(data, dict):
        raise ValueError(f"Unexpected EDHREC response at {url}: {type(data).__name__}")
    return data


def edhrec_average_deck(slug: str, theme: str = None, budget: str = None) -> dict:
    """The average deck for a commander: {"commander_v2": [[name, qty]], "cards": {type: [[name, qty]]}}."""
    path = f"average-decks/{slug}"
    if theme:
        path += f"/{theme}"
    if budget in ("budget", "expensive"):
        path += f"/{budget}"
    data = edhrec_fetch_page(path)
    deck = data.get("deck")
    if not deck:
        raise ValueError(f"EDHREC average deck page for {path} has no 'deck' entry (keys: {sorted(data)[:12]})")
    return deck


_edhrec_page_memo: dict[str, tuple[float, dict]] = {}


def edhrec_commander_page(slug: str) -> dict:
    """A commander's page JSON (card lists, theme links, deck counts). Memoized for the
    process lifetime since the average-deck and synergy lookups both need it."""
    cached = _edhrec_page_memo.get(slug)
    if cached and time.time() - cached[0] < CACHE_TTL:
        return cached[1]
    data = edhrec_fetch_page(f"commanders/{slug}")
    _edhrec_page_memo[slug] = (time.time(), data)
    return data


# Our list keys -> the EDHREC cardlist tags that hold them. EDHREC renamed "synergy" to
# "lift" in October 2026, so accept either spelling for the high-synergy list.
EDHREC_CARDLIST_TAGS = {
    "high_synergy": ("highsynergycards", "highliftcards", "liftcards", "synergycards"),
    "new_cards": ("newcards",),
    "top_creatures": ("creatures",),
    "top_instants": ("instants",),
    "top_sorceries": ("sorceries",),
    "top_enchantments": ("enchantments",),
    "top_artifacts": ("utilityartifacts", "artifacts"),
    "top_mana_artifacts": ("manaartifacts",),
    "top_planeswalkers": ("planeswalkers",),
    "top_lands": ("lands",),
    "top_utility_lands": ("utilitylands",),
}


# Fallback when tags don't match: recognise a list by words in its visible heading.
# Order matters: "mana artifacts" must win over "artifacts", "utility lands" over "lands".
EDHREC_HEADER_HINTS = [
    ("top_mana_artifacts", ("mana artifact", "mana rock")),
    ("top_utility_lands", ("utility land",)),
    ("high_synergy", ("synergy", "lift")),
    ("new_cards", ("new card",)),
    ("top_creatures", ("creature",)),
    ("top_instants", ("instant",)),
    ("top_sorceries", ("sorcer",)),
    ("top_enchantments", ("enchantment",)),
    ("top_artifacts", ("artifact",)),
    ("top_planeswalkers", ("planeswalker",)),
    ("top_lands", ("land",)),
]
_logged_cardlist_shapes: set[str] = set()


def edhrec_cardlists(page: dict) -> dict[str, list]:
    """Pull the typed card lists out of a commander page: {our key: [cardview, ...]}."""
    json_dict = (page.get("container") or {}).get("json_dict") or {}
    lists = json_dict.get("cardlists") or page.get("cardlists") or []
    lists = [cl for cl in lists if isinstance(cl, dict)]
    result = {key: [] for key in EDHREC_CARDLIST_TAGS}

    by_tag = {}
    for cl in lists:
        by_tag.setdefault(str(cl.get("tag", "")).lower().replace(" ", ""), cl)
    claimed = set()
    for key, tags in EDHREC_CARDLIST_TAGS.items():
        for tag in tags:
            if tag in by_tag and id(by_tag[tag]) not in claimed:
                result[key] = by_tag[tag].get("cardviews") or []
                claimed.add(id(by_tag[tag]))
                break
    # Anything the tags didn't place: go by the heading text
    for cl in lists:
        if id(cl) in claimed:
            continue
        header = str(cl.get("header", "")).lower()
        for key, hints in EDHREC_HEADER_HINTS:
            if not result[key] and any(h in header for h in hints):
                result[key] = cl.get("cardviews") or []
                claimed.add(id(cl))
                break

    # Log the page's list names once per shape so a future rename is visible in the server log
    shape = " | ".join(f"{cl.get('header')}[{cl.get('tag')}]" for cl in lists) or "(no cardlists)"
    if shape not in _logged_cardlist_shapes:
        _logged_cardlist_shapes.add(shape)
        matched = [k for k, v in result.items() if v]
        logger.info(f"EDHREC commander page lists: {shape} -> matched {matched}")
        if lists and not matched:
            logger.warning("EDHREC card lists found but none recognised; see the names above")
        if not lists:
            logger.warning(f"EDHREC commander page has no card lists; json_dict keys: {list(json_dict)[:20]}, page keys: {list(page)[:20]}")
    return result


def edhrec_num_decks(page: dict) -> int:
    """Deck count for a commander; the page has carried it in a few places."""
    json_dict = (page.get("container") or {}).get("json_dict") or {}
    for value in (page.get("num_decks"), (json_dict.get("card") or {}).get("num_decks"), json_dict.get("num_decks")):
        if isinstance(value, (int, float)) and value > 0:
            return int(value)
    for counts_key in ("budget_counts", "bracket_counts"):
        counts = page.get(counts_key)
        if isinstance(counts, dict) and counts:
            return int(sum(v for v in counts.values() if isinstance(v, (int, float))))
    return 0

# Scryfall rejects requests that use an HTTP library's default User-Agent (HTTP 400),
# and requires an Accept header: https://scryfall.com/docs/api
scryfall = requests.Session()
scryfall.headers.update({
    "User-Agent": "MTGCommanderRecommender/1.0",
    "Accept": "application/json;q=0.9,*/*;q=0.8",
})


def _log_scryfall_failure(resp, *args, **kwargs):
    # Several batch lookups skip non-200 responses, so make every rejection visible
    if resp.status_code >= 400:
        logger.error(f"Scryfall {resp.request.method} {resp.url} -> {resp.status_code}: {resp.text[:300]}")


scryfall.hooks["response"].append(_log_scryfall_failure)

SCRYFALL_COLLECTION_URL = "https://api.scryfall.com/cards/collection"
SCRYFALL_SEARCH_URL = "https://api.scryfall.com/cards/search"
# Search and collection lookups are limited to about 2 requests/second
SCRYFALL_MIN_INTERVAL = 0.55
SCRYFALL_DEFAULT_COOLDOWN = 60
_scryfall_lock = threading.Lock()
_scryfall_last_request = 0.0
_scryfall_blocked_until = 0.0


class ScryfallUnavailable(Exception):
    """Raised instead of sending a request while Scryfall has us rate limited."""


def scryfall_request(method: str, url: str, **kwargs) -> requests.Response:
    """Send every Scryfall API request through here.

    Requests are spaced out to stay under Scryfall's limits. After a 429 nothing is
    sent until the cooldown passes: Scryfall says retrying rate-limited requests can
    get the client blocked (https://scryfall.com/docs/faqs/i-m-having-trouble-accessing-the-scryfall-api-or-i-m-blocked-17).
    """
    global _scryfall_last_request, _scryfall_blocked_until
    with _scryfall_lock:  # held while waiting, so concurrent callers queue up in order
        now = time.time()
        if now < _scryfall_blocked_until:
            raise ScryfallUnavailable(f"Scryfall rate limit: pausing requests for {int(_scryfall_blocked_until - now)}s more")
        wait = _scryfall_last_request + SCRYFALL_MIN_INTERVAL - now
        if wait > 0:
            time.sleep(wait)
        _scryfall_last_request = time.time()
    kwargs.setdefault("timeout", 30)
    resp = scryfall.request(method, url, **kwargs)
    if resp.status_code == 429:
        retry_after = resp.headers.get("Retry-After", "")
        delay = int(retry_after) if retry_after.isdigit() else SCRYFALL_DEFAULT_COOLDOWN
        with _scryfall_lock:
            _scryfall_blocked_until = time.time() + delay
        logger.warning(f"Scryfall rate limit hit; sending no Scryfall requests for {delay}s")
        raise ScryfallUnavailable(f"Scryfall rate limit: pausing requests for {delay}s")
    return resp


# --- Disk cache: keeps Scryfall data across restarts so a restart doesn't re-download it ---
CACHE_DIR = os.environ.get("CACHE_DIR") or os.path.join(os.path.dirname(os.path.abspath(DATABASE_PATH)), "cache")


def _load_json_cache(name: str):
    try:
        with open(os.path.join(CACHE_DIR, name), encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return None
    except Exception as e:
        logger.warning(f"Ignoring unreadable cache file {name}: {e}")
        return None


def _save_json_cache(name: str, data) -> None:
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        path = os.path.join(CACHE_DIR, name)
        tmp = f"{path}.tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f)
        os.replace(tmp, path)  # atomic, so a crash never leaves a half-written cache
    except Exception as e:
        logger.warning(f"Couldn't write cache file {name}: {e}")


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
CACHE_TTL = 86400  # EDHREC average decks change slowly; a day matches pyedhrec's own cache
ERROR_CACHE_TTL = 1800  # remember EDHREC failures (e.g. no page for a commander) for 30 minutes
EDHREC_CACHE_FILE = "edhrec.json"

# Synergy/type card cache
synergy_cache: dict[str, dict] = {}


def _load_edhrec_cache_from_disk() -> None:
    cached = _load_json_cache(EDHREC_CACHE_FILE)
    if not cached:
        return
    now = time.time()
    for store, key in ((commander_cache, "commanders"), (synergy_cache, "synergy")):
        for name, entry in cached.get(key, {}).items():
            if now - entry.get("timestamp", 0) < CACHE_TTL:
                store.setdefault(name, entry)
    logger.info(f"Loaded EDHREC data for {len(commander_cache)} commanders from cache")


def _save_edhrec_cache_to_disk() -> None:
    """Persist successful EDHREC lookups (failures are retried, so they're left out)."""
    now = time.time()
    fresh = lambda store: {k: v for k, v in store.items()
                           if now - v.get("timestamp", 0) < CACHE_TTL and not v.get("data", {}).get("error")}
    _save_json_cache(EDHREC_CACHE_FILE, {"commanders": fresh(commander_cache), "synergy": fresh(synergy_cache)})


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


# Section headers used by Moxfield, Archidekt and MTG Arena text exports
_SECTION_HEADERS = {
    "commander", "commanders", "companion", "deck", "decklist", "main", "mainboard",
    "sideboard", "maybeboard", "considering", "tokens",
}


def parse_card_line(line: str) -> Optional[tuple[str, int]]:
    """Parse one decklist line into (normalized_name, qty), or None for blank/header lines.
    Handles '1 Sol Ring', '1x Sol Ring', and export decorations such as set codes,
    collector numbers, foil markers and Archidekt categories:
    '1 Sol Ring (CMR) 472 *F*', '1x Sol Ring (cmr) 472 [Ramp]'.
    """
    line = line.strip()
    if not line or line.startswith(("//", "#")):
        return None
    if line.endswith(":") or line.lower() in _SECTION_HEADERS:
        return None
    match = re.match(r"^(\d+)x?\s+(.+)", line, re.IGNORECASE)
    if match:
        qty = int(match.group(1))
        name = match.group(2)
    else:
        qty = 1
        name = line
    name = re.sub(r"\s*\[[^\]]*\]\s*$", "", name)          # Archidekt [Category]
    name = re.sub(r"\s+\*[A-Za-z]+\*", "", name)              # *F* / *E* foil markers
    name = re.sub(r"\s+\([A-Za-z0-9]{2,6}\)(\s+\S+)?\s*$", "", name)  # (SET) 123
    name = normalize_card_name(name)
    if not name:
        return None
    return name, qty


def parse_card_lines(content: str) -> dict[str, int]:
    """Parse a multi-line card list. Returns dict of normalized card name -> quantity."""
    cards: dict[str, int] = {}
    for line in content.strip().splitlines():
        parsed = parse_card_line(line)
        if parsed:
            name, qty = parsed
            cards[name] = cards.get(name, 0) + qty
    return cards


def parse_text_collection(content: str) -> dict[str, int]:
    """Parse text format: '1 Card Name' or just 'Card Name' per line. Returns dict name -> qty."""
    return parse_card_lines(content)


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


def _commander_entry(card: dict, partner_type: str) -> dict:
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
    return entry


def _card_oracle(card: dict) -> str:
    oracle = card.get("oracle_text", "")
    if not oracle and card.get("card_faces"):
        oracle = " ".join(f.get("oracle_text", "") for f in card["card_faces"])
    return oracle.lower()


def _search_all_pages(query: str, on_card) -> bool:
    """Run a Scryfall search, calling on_card for every result. Returns False if any page failed."""
    url, params = SCRYFALL_SEARCH_URL, {"q": query, "order": "edhrec", "unique": "cards"}
    while url:
        try:
            resp = scryfall_request("GET", url, params=params)
        except (ScryfallUnavailable, requests.RequestException) as e:
            logger.error(f"Scryfall search '{query}' stopped: {e}")
            return False
        if resp.status_code != 200:
            return False
        data = resp.json()
        for card in data.get("data", []):
            on_card(card)
        url, params = (data.get("next_page"), {}) if data.get("has_more") else (None, None)
    return True


def get_all_commanders() -> tuple[list[dict], dict[str, str], bool]:
    """Fetch all legal commanders (plus Backgrounds) from Scryfall.
    Returns (commanders, oracle text by normalized name, whether every page loaded)."""
    commanders: list[dict] = []
    oracle: dict[str, str] = {}
    seen: set[str] = set()

    def add(card: dict, partner_type: str):
        entry = _commander_entry(card, partner_type)
        if entry["name_normalized"] in seen:
            return
        seen.add(entry["name_normalized"])
        commanders.append(entry)
        oracle[entry["name_normalized"]] = _card_oracle(card)

    complete = _search_all_pages("is:commander f:commander", lambda c: add(c, _detect_partner_type(c)))
    if complete:
        # Backgrounds aren't "is:commander" but pair with "Choose a Background" commanders
        complete = _search_all_pages("t:background t:legendary t:enchantment f:commander", lambda c: add(c, "background"))
    return commanders, oracle, complete


COMMANDER_LIST_TTL = 86400          # a full commander list is good for a day
INCOMPLETE_COMMANDER_LIST_TTL = 300  # a partial one is retried after 5 minutes
COMMANDERS_CACHE_FILE = "commanders.json"
_all_commanders: list[dict] = []
_commanders_expires_at: float = 0
_commanders_lock = threading.Lock()


def require_commanders() -> list[dict]:
    """Commander list for endpoints that are useless without it: fail loudly when
    Scryfall couldn't be reached, rather than returning an empty result."""
    commanders = get_cached_commanders()
    if not commanders:
        if time.time() < _scryfall_blocked_until:
            raise HTTPException(
                status_code=503,
                detail="Scryfall is rate limiting requests right now. Wait a minute, then try again.",
            )
        raise HTTPException(
            status_code=502,
            detail="Couldn't load the commander list from Scryfall. Check the server log for details and try again.",
        )
    return commanders


def standalone_commanders() -> list[dict]:
    """Commanders that can lead a deck on their own. Backgrounds only pair with a
    'Choose a Background' commander, and EDHREC has no average deck for them."""
    return [c for c in require_commanders() if c.get("partner_type") != "background"]


def _load_commanders_from_disk() -> bool:
    global _all_commanders, _commanders_expires_at
    cached = _load_json_cache(COMMANDERS_CACHE_FILE)
    if not cached or time.time() - cached.get("fetched_at", 0) > COMMANDER_LIST_TTL:
        return False
    _all_commanders = cached["commanders"]
    scryfall_oracle_cache.update(cached.get("oracle", {}))
    _commanders_expires_at = cached["fetched_at"] + COMMANDER_LIST_TTL
    logger.info(f"Loaded {len(_all_commanders)} commanders from cache")
    return True


def get_cached_commanders() -> list[dict]:
    global _all_commanders, _commanders_expires_at
    if _all_commanders and time.time() < _commanders_expires_at:
        return _all_commanders
    # Endpoints run in a thread pool; make concurrent cold-start requests share one fetch
    with _commanders_lock:
        if _all_commanders and time.time() < _commanders_expires_at:
            return _all_commanders
        if not _all_commanders and _load_commanders_from_disk():
            return _all_commanders
        logger.info("Fetching all commanders from Scryfall...")
        commanders, oracle, complete = get_all_commanders()
        scryfall_oracle_cache.update(oracle)
        if complete:
            _all_commanders = commanders
            _commanders_expires_at = time.time() + COMMANDER_LIST_TTL
            _save_json_cache(COMMANDERS_CACHE_FILE, {"fetched_at": time.time(), "commanders": commanders, "oracle": oracle})
            logger.info(f"Fetched {len(commanders)} commanders")
        else:
            # Keep whatever we have (a partial list beats none) but retry soon, and never save it
            if len(commanders) > len(_all_commanders):
                _all_commanders = commanders
            _commanders_expires_at = time.time() + INCOMPLETE_COMMANDER_LIST_TTL
            logger.warning(f"Commander list incomplete ({len(commanders)} loaded); retrying in {INCOMPLETE_COMMANDER_LIST_TTL // 60} minutes")
    return _all_commanders


# --- Card data: one Scryfall lookup per card covers type, mana, rules text, colors, price and image ---
CARD_DATA_TTL = 86400  # prices change daily
CARD_DATA_CACHE_FILE = "card_data.json"
# normalized name -> {"found", "fetched_at", and when found: "type", "cmc", "mana_cost",
#                     "oracle", "color_identity", "price", "image", "image_small"}
card_data: dict[str, dict] = {}


def _card_data_entry(card: dict) -> dict:
    faces = card.get("card_faces") or []
    image_uris = card.get("image_uris") or (faces[0].get("image_uris") if faces else None) or {}
    mana_cost = card.get("mana_cost") or (faces[0].get("mana_cost", "") if faces else "")
    prices = card.get("prices") or {}
    usd = prices.get("usd") or prices.get("usd_foil")
    return {
        "found": True,
        "fetched_at": time.time(),
        "type": _parse_type_line(card.get("type_line", "")),
        "cmc": card.get("cmc", 0),
        "mana_cost": mana_cost,
        "oracle": _card_oracle(card),
        "color_identity": card.get("color_identity", []),
        "price": float(usd) if usd else None,
        "image": image_uris.get("normal", ""),
        "image_small": image_uris.get("small", ""),
    }


def ensure_card_data(card_names: list[str]) -> dict[str, dict]:
    """Return {normalized name: card data} for the given names, fetching only missing or
    stale cards from Scryfall (75 per request). Names Scryfall doesn't know are
    remembered too, so they aren't requested again until the entry expires."""
    now = time.time()
    lookup: dict[str, str] = {}  # normalized -> name to send to Scryfall
    for name in card_names:
        norm = normalize_card_name(name)
        if norm:
            lookup.setdefault(norm, name.split("//")[0].strip())
    stale = [n for n in lookup if n not in card_data or now - card_data[n]["fetched_at"] > CARD_DATA_TTL]

    fetched = False
    for i in range(0, len(stale), 75):
        batch = stale[i:i + 75]
        try:
            resp = scryfall_request("POST", SCRYFALL_COLLECTION_URL, json={"identifiers": [{"name": lookup[n]} for n in batch]})
        except ScryfallUnavailable as e:
            logger.warning(f"Skipping remaining card lookups: {e}")
            break
        except requests.RequestException as e:
            logger.error(f"Scryfall card lookup failed: {e}")
            continue
        if resp.status_code != 200:
            continue
        data = resp.json()
        for card in data.get("data", []):
            entry = _card_data_entry(card)
            norm = normalize_card_name(card.get("name", ""))
            card_data[norm] = entry
            scryfall_oracle_cache[norm] = entry["oracle"]
        for missing in data.get("not_found", []):
            card_data[normalize_card_name(missing.get("name", ""))] = {"found": False, "fetched_at": now}
        fetched = True

    if fetched:
        _save_json_cache(CARD_DATA_CACHE_FILE, card_data)
    return {n: card_data[n] for n in lookup if n in card_data}


def _load_card_data_from_disk() -> None:
    cached = _load_json_cache(CARD_DATA_CACHE_FILE)
    if not cached:
        return
    card_data.update(cached)
    for norm, entry in cached.items():
        if entry.get("found"):
            scryfall_oracle_cache.setdefault(norm, entry.get("oracle", ""))
    logger.info(f"Loaded data for {len(cached)} cards from cache")


def fetch_prices_bulk(card_names: list[str]) -> dict[str, float]:
    """USD price by normalized name (cards without a price are omitted)."""
    return {n: e["price"] for n, e in ensure_card_data(card_names).items() if e.get("found") and e.get("price") is not None}


def fetch_card_types_bulk(card_names: list[str]) -> dict[str, str]:
    """Card type category (Creature, Instant, ...) by normalized name."""
    return {n: e["type"] for n, e in ensure_card_data(card_names).items() if e.get("found")}


def fetch_card_mana_bulk(card_names: list[str]) -> dict[str, dict]:
    """{"cmc", "mana_cost"} by normalized name."""
    return {n: {"cmc": e["cmc"], "mana_cost": e["mana_cost"]}
            for n, e in ensure_card_data(card_names).items() if e.get("found")}


def fetch_color_identities(card_names: list) -> set:
    """Union of the color identities of the given cards."""
    colors = set()
    for entry in ensure_card_data(card_names).values():
        if entry.get("found"):
            colors.update(entry.get("color_identity", []))
    return colors


def extract_cardview_names(cardviews) -> list[dict]:
    """Extract card info from EDHREC cardview objects."""
    results = []
    if not cardviews:
        return results
    for cv in cardviews:
        if isinstance(cv, dict):
            name = cv.get("name", "")
            if name:
                score_type = "synergy"
                score = cv.get("synergy")
                if score is None and cv.get("lift") is not None:
                    score, score_type = cv.get("lift"), "lift"
                score = score or 0
                if score_type == "synergy" and abs(score) <= 1:
                    score = round(score * 100, 1)  # fraction -> percent
                inclusion = cv.get("inclusion") or 0
                potential = cv.get("potential_decks") or 0
                if potential and inclusion <= potential:
                    inclusion = round(inclusion / potential * 100, 1)  # deck count -> percent
                results.append({
                    "name": name,
                    "name_normalized": normalize_card_name(name),
                    "synergy": score,
                    "score_type": score_type,
                    "inclusion": inclusion,
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

    # All the lists come from the commander's one page
    try:
        page = edhrec_commander_page(formatted)
    except Exception as e:
        logger.error(f"Error fetching EDHREC page for {commander_name}: {e}")
        synergy_cache[cache_key] = {"data": result, "timestamp": time.time() - CACHE_TTL + ERROR_CACHE_TTL}
        return result

    for key, cardviews in edhrec_cardlists(page).items():
        result[key] = extract_cardview_names(cardviews)

    synergy_cache[cache_key] = {"data": result, "timestamp": time.time()}
    return result


scryfall_oracle_cache: dict[str, str] = {}  # normalized name -> lowercased oracle text


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


def classify_functional_category(
    card_name_normalized: str,
    card_type: str,
    type_data: dict,
) -> str:
    """Classify a card into a functional deck-building category using card type,
    EDHREC source lists, and oracle text analysis.

    Categories: lands, ramp, cardDraw, removal, synergy, utility
    """
    # 1. Lands are straightforward
    if card_type == "Land":
        return "lands"

    # 2. Check EDHREC mana artifacts list -> ramp
    mana_art_names = {c.get("name_normalized") for c in type_data.get("top_mana_artifacts", [])}
    if card_name_normalized in mana_art_names:
        return "ramp"

    # 3. Use oracle text for functional classification
    oracle = scryfall_oracle_cache.get(card_name_normalized, "").lower()

    # Ramp: produces mana or fetches lands
    ramp_patterns = [
        "add {",                          # Mana production
        "add one mana",
        "add two mana",
        "add three mana",
        "adds one mana",
        "search your library for a basic land",
        "search your library for a land",
        "put that card onto the battlefield",  # land fetch to battlefield
    ]
    if any(p in oracle for p in ramp_patterns):
        # Exclude cards that are primarily something else (e.g. Solemn Simulacrum draws too)
        # but ramp is the primary function if it fetches/produces mana
        return "ramp"

    # Card draw: draws cards
    draw_patterns = [
        "draw a card",
        "draw cards",
        "draw two",
        "draw three",
        "draws a card",
        "draw x card",
        "draw that many",
    ]
    # Exclude "when ~ dies, draw" type secondary effects for creatures
    # by checking if draw is a primary ability (appears early in oracle text)
    if any(p in oracle for p in draw_patterns):
        # If it's a noncreature spell or the draw is the main effect, classify as cardDraw
        if card_type in ("Instant", "Sorcery", "Enchantment"):
            return "cardDraw"
        # For creatures/artifacts, only classify as draw if oracle text leads with draw
        first_ability = oracle.split("\n")[0] if oracle else ""
        if any(p in first_ability for p in draw_patterns):
            return "cardDraw"

    # Removal: destroys, exiles, counters, or bounces
    removal_patterns = [
        "destroy target",
        "destroy all",
        "exile target",
        "exile all",
        "counter target spell",
        "return target",    # bounce
        "deals damage to any target",
        "deals damage to target",
        "fight",            # creature-based removal
        "-x/-x",
        "gets -",
    ]
    if any(p in oracle for p in removal_patterns):
        if card_type in ("Instant", "Sorcery"):
            return "removal"
        # For permanents, check if removal is their primary purpose
        first_ability = oracle.split("\n")[0] if oracle else ""
        if any(p in first_ability for p in removal_patterns):
            return "removal"

    # Utility: tutors, protection, recursion, graveyard, general value
    utility_patterns = [
        "search your library",      # tutors (non-land, those caught by ramp above)
        "hexproof",
        "indestructible",
        "protection from",
        "shroud",
        "return target card from your graveyard",
        "return target creature card from your graveyard",
        "put target card from a graveyard",
        "can't be countered",
        "flash",
        "copy target",
        "create a token",
        "create a copy",
        "whenever a creature enters",
        "whenever a nontoken creature",
        "whenever you cast",
        "at the beginning of your upkeep",
        "sacrifice a creature",
        "each opponent",
        "whenever an opponent",
    ]
    if any(p in oracle for p in utility_patterns):
        # Only classify as utility if NOT already caught by ramp/draw patterns
        return "utility"

    # High synergy cards (from EDHREC synergy list) -> synergy
    synergy_names = {c.get("name_normalized") for c in type_data.get("high_synergy", [])}
    if card_name_normalized in synergy_names:
        return "synergy"

    # Cards that appear in any EDHREC top-card list for this commander are synergy picks
    all_top_names = set()
    for top_key in ["top_creatures", "top_instants", "top_sorceries", "top_enchantments",
                     "top_artifacts", "top_planeswalkers", "top_lands", "top_utility_lands"]:
        for c in type_data.get(top_key, []):
            all_top_names.add(c.get("name_normalized"))
    # Exclude mana artifacts (already classified as ramp above)
    if card_name_normalized in all_top_names:
        return "synergy"

    # Default: utility (generic goodstuff not tied to this commander)
    return "utility"


def is_commander_data_cached(commander_name: str) -> bool:
    """True if the default avg deck and synergy data for a commander are both fresh in cache."""
    now = time.time()
    avg = commander_cache.get(f"{commander_name}||")
    syn = synergy_cache.get(commander_name)
    return bool(avg and now - avg["timestamp"] < CACHE_TTL and syn and now - syn["timestamp"] < CACHE_TTL)


def _deck_entry(name: str, qty: int = 1, category: str = "", **extra) -> dict:
    return {"name": name, "name_normalized": normalize_card_name(name), "qty": qty, "category": category, **extra}


def parse_avg_decklist(raw) -> list[dict]:
    """Normalize an EDHREC average deck into [{name, name_normalized, qty, category, ...}].

    Current format (grouped by card type, commander listed separately):
        {"commander_v2": [["Atraxa, Praetors' Voice", 1]],
         "cards": {"Artifact": [["Sol Ring", 1], ...], "Land": [["Forest", 4], ...]}}
    Older format: a list of "1 Sol Ring" strings or {"name": ...} dicts.
    Raises ValueError on anything else, so a format change is reported instead of
    silently producing decks that match nothing.
    """
    if not raw:
        return []
    entries = []
    if isinstance(raw, dict):
        if not isinstance(raw.get("cards"), dict):
            raise ValueError(f"Unrecognized EDHREC average deck format (keys: {sorted(raw)[:10]})")
        commanders = raw.get("commander_v2") or [[n, 1] for n in raw.get("commander") or []]
        for name, qty in commanders:
            entries.append(_deck_entry(name, qty))  # card type is looked up later
        for type_name, cards in raw["cards"].items():
            category = _parse_type_line(type_name)
            for card in cards:
                if isinstance(card, (list, tuple)) and card:
                    entries.append(_deck_entry(card[0], int(card[1]) if len(card) > 1 else 1, category))
                elif isinstance(card, str):
                    entries.append(_deck_entry(card, 1, category))
                elif isinstance(card, dict) and card.get("name"):
                    entries.append(_deck_entry(card["name"], int(card.get("qty", 1)), category))
    elif isinstance(raw, list):
        for card in raw:
            if isinstance(card, str):
                match = re.match(r"^(\d+)x?\s+(.+)", card.strip())
                if match:
                    entries.append(_deck_entry(match.group(2), int(match.group(1))))
                else:
                    entries.append(_deck_entry(card.strip()))
            elif isinstance(card, dict) and card.get("name"):
                entries.append(_deck_entry(
                    card["name"], 1, card.get("type", card.get("category", "")),
                    inclusion=card.get("inclusion", 0), synergy=card.get("synergy", 0),
                ))
    else:
        raise ValueError(f"Unrecognized EDHREC average deck format ({type(raw).__name__})")

    # One entry per card, summing quantities if a name appears twice
    merged: dict[str, dict] = {}
    for entry in entries:
        if entry["name_normalized"] in merged:
            merged[entry["name_normalized"]]["qty"] += entry["qty"]
        else:
            merged[entry["name_normalized"]] = entry
    return list(merged.values())


def _extract_themes(cmd_data) -> list[dict]:
    """Theme links from an EDHREC commander page. The page JSON has carried these in
    different places, so check each and normalize to {name, slug, count}."""
    if not cmd_data:
        return []
    candidates = []
    container = cmd_data.get("container") or {}
    json_dict = container.get("json_dict") or {}
    candidates.extend(json_dict.get("themes") or [])
    panels = cmd_data.get("panels") or {}
    for links_key in ("tribelinks", "taglinks"):
        links = panels.get(links_key) or {}
        if isinstance(links, list):
            candidates.extend(links)
        elif isinstance(links, dict):
            for group in links.values():
                if isinstance(group, list):
                    candidates.extend(group)
    themes, seen = [], set()
    for t in candidates:
        if not isinstance(t, dict):
            continue
        name = t.get("name") or t.get("value") or ""
        slug = t.get("slug") or ""
        if not slug:
            href = t.get("href-suffix") or t.get("href") or ""
            slug = href.rstrip("/").split("/")[-1] if href else edhrec_slug(name)
        if name and slug and slug not in seen:
            seen.add(slug)
            themes.append({"name": name, "slug": slug, "count": t.get("count", 0)})
    return themes


def get_commander_avg_deck(commander_name: str, budget: str = None, theme: str = None) -> dict:
    """Get average deck for a commander from EDHREC, with caching."""
    cache_key = f"{commander_name}|{budget or ''}|{theme or ''}"

    cached = commander_cache.get(cache_key)
    if cached and (time.time() - cached["timestamp"] < CACHE_TTL):
        return cached["data"]

    try:
        name_for_edhrec = commander_name.split("//")[0].strip()
        formatted = edhrec_slug(name_for_edhrec)

        theme_applied = False
        raw_deck = None
        if theme:
            # Fall back to the plain average deck if EDHREC has no page for that theme, and say so
            try:
                raw_deck = edhrec_average_deck(formatted, theme=theme, budget=budget)
                theme_applied = True
            except Exception as e:
                logger.warning(f"No EDHREC average deck for {formatted} / theme '{theme}': {e}")
        if raw_deck is None:
            raw_deck = edhrec_average_deck(formatted, budget=budget)

        try:
            cmd_page = edhrec_commander_page(formatted)
        except Exception as e:
            # Partner pairs have an average deck but not always a commander page; carry on without it
            logger.warning(f"No EDHREC commander page for {formatted}: {e}")
            cmd_page = {}

        themes = _extract_themes(cmd_page)
        decklist = parse_avg_decklist(raw_deck)
        deck_cards = {c["name_normalized"] for c in decklist}
        num_decks = edhrec_num_decks(cmd_page)

        result = {
            "commander": commander_name,
            "num_decks": num_decks,
            "themes": themes,
            "theme_applied": theme_applied,
            "decklist": decklist,
            "deck_card_names": list(deck_cards),
        }

        commander_cache[cache_key] = {"data": result, "timestamp": time.time()}
        return result
    except Exception as e:
        logger.error(f"Error fetching EDHREC data for {commander_name}: {e}")
        result = {
            "commander": commander_name,
            "num_decks": 0,
            "themes": [],
            "decklist": [],
            "deck_card_names": [],
            "error": str(e),
        }
        # Cache the failure briefly (backdated timestamp = shorter TTL) so repeated
        # recommendation runs don't refetch a commander EDHREC doesn't have
        commander_cache[cache_key] = {"data": result, "timestamp": time.time() - CACHE_TTL + ERROR_CACHE_TTL}
        return result


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
    # An empty list/dict clears the collection
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
def list_decks():
    result = [_enrich_deck_response(deck) for deck in deck_lists.values()]
    return {"decks": result}


@app.post("/api/decks")
def create_deck(body: dict):
    name = body.get("name", "").strip()
    commander = body.get("commander", "").strip()
    partner = body.get("partner", "").strip()
    cards_text = body.get("cards_text", "")
    if not name:
        raise HTTPException(status_code=400, detail="Deck name is required")

    deck_id = f"deck_{int(time.time() * 1000)}"

    cards = parse_card_lines(cards_text) if cards_text else {}

    deck_lists[deck_id] = {
        "id": deck_id,
        "name": name,
        "commander": commander,
        "partner": partner,
        "cards": cards,
    }
    return _enrich_deck_response(deck_lists[deck_id])


@app.get("/api/decks/{deck_id}")
def get_deck(deck_id: str):
    if deck_id not in deck_lists:
        raise HTTPException(status_code=404, detail="Deck not found")
    return _enrich_deck_response(deck_lists[deck_id])


@app.put("/api/decks/{deck_id}")
def update_deck(deck_id: str, body: dict):
    if deck_id not in deck_lists:
        raise HTTPException(status_code=404, detail="Deck not found")

    deck = deck_lists[deck_id]
    if "name" in body:
        deck["name"] = body["name"].strip()
    if "commander" in body:
        deck["commander"] = body["commander"].strip()
    if "partner" in body:
        deck["partner"] = body["partner"].strip() if body["partner"] else ""
    if "cards_text" in body:
        deck["cards"] = parse_card_lines(body["cards_text"])
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
    loop = asyncio.get_event_loop()

    # Fetch types, mana, and prices in bulk - run in thread pool to avoid blocking
    # The bulk fetch functions handle batching (75 cards at a time) and caching internally
    # First load may be slow but subsequent loads will use cached data
    try:
        types = await loop.run_in_executor(None, fetch_card_types_bulk, card_names)
    except Exception as e:
        logger.error(f"Failed to fetch types: {e}")
        types = {}

    try:
        mana = await loop.run_in_executor(None, fetch_card_mana_bulk, card_names)
    except Exception as e:
        logger.error(f"Failed to fetch mana data: {e}")
        mana = {}

    try:
        prices = await loop.run_in_executor(None, fetch_prices_bulk, card_names)
    except Exception as e:
        logger.error(f"Failed to fetch prices: {e}")
        prices = {}

    # Without card data every card would show as a 0-mana colorless "Other";
    # report the failure instead of presenting that as real stats
    if not types and not mana:
        raise HTTPException(
            status_code=502,
            detail="Couldn't load card data from Scryfall. Check the server log for details and try again.",
        )

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
def list_commanders(color: Optional[str] = None, search: Optional[str] = None):
    commanders = standalone_commanders()
    results = commanders

    if color:
        color_set = set(color.upper())
        results = [c for c in results if set(c["color_identity"]) == color_set]

    if search:
        search_lower = search.lower()
        results = [c for c in results if search_lower in c["name"].lower()]

    return {"count": len(results), "commanders": results[:200]}


@app.get("/api/commanders/search_autocomplete")
def search_commanders_autocomplete(q: str = ""):
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
    partner_name = deck.get("partner", "")
    cmd_data = cmd_lookup.get(normalize_card_name(commander_name), {}) if commander_name else {}
    partner_data = cmd_lookup.get(normalize_card_name(partner_name), {}) if partner_name else {}

    # Combine color identities from both commanders
    color_order = ["W", "U", "B", "R", "G"]
    combined_colors = set(cmd_data.get("color_identity", []))
    if partner_data:
        combined_colors.update(partner_data.get("color_identity", []))
    # Sort colors in WUBRG order
    color_identity = [c for c in color_order if c in combined_colors]

    result = {
        "id": deck["id"],
        "name": deck.get("name", ""),
        "commander": commander_name,
        "cards": deck.get("cards", {}),
        "card_count": sum(deck.get("cards", {}).values()),
        "color_identity": color_identity,
        "image_uri": cmd_data.get("image_uri", ""),
        "art_crop": cmd_data.get("art_crop", ""),
        "partner_type": cmd_data.get("partner_type", ""),
    }

    # Include partner info if present
    if partner_name and partner_data:
        result["partner"] = partner_name
        result["partner_image_uri"] = partner_data.get("image_uri", "")
        result["partner_color_identity"] = partner_data.get("color_identity", [])

    return result


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
def get_commander_partners(commander_name: str):
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
def validate_cards(body: dict):
    """Validate a list of card names against Scryfall. Returns recognized and unrecognized cards."""
    card_names = body.get("cards", [])
    if not card_names:
        return {"valid": [], "invalid": []}

    # Uses the shared card cache, so cards already seen elsewhere cost no Scryfall request.
    # Cards that couldn't be checked (Scryfall unreachable) are treated as valid rather than blocking the save.
    known = ensure_card_data(card_names)
    valid, invalid = [], []
    for name in card_names:
        entry = known.get(normalize_card_name(name))
        (invalid if entry is not None and not entry.get("found") else valid).append(name)
    return {"valid": valid, "invalid": invalid}


@app.get("/api/card-image")
def card_image(name: str, version: str = "normal"):
    """Redirect to a card's image on Scryfall's image servers (not rate limited).

    The browser used to load images through api.scryfall.com/cards/named, one API
    request per hover or Gallery card, which is how a page full of cards trips
    Scryfall's rate limit. Here the image URL comes from the shared card cache,
    usually already filled by the page that listed the card.
    """
    entry = ensure_card_data([name]).get(normalize_card_name(name))
    if not entry or not entry.get("found"):
        raise HTTPException(status_code=404, detail="Card image not found")
    url = entry.get("image_small" if version == "small" else "image") or entry.get("image")
    if not url:
        raise HTTPException(status_code=404, detail="Card has no image")
    return RedirectResponse(url, status_code=302, headers={"Cache-Control": "public, max-age=86400"})


@app.get("/api/commanders/popular")
def popular_commanders():
    commanders = standalone_commanders()
    top = sorted(commanders, key=lambda c: c["edhrec_rank"])[:50]
    return {"commanders": top}


@app.get("/api/commander/{commander_name:path}")
@rate_limit(RATE_LIMIT)
def get_commander_detail(
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
            if not card["card_type"]:
                # Lookup by normalized name since fetch_card_types_bulk returns normalized keys
                card_type = scryfall_types.get(card["name_normalized"], scryfall_types.get(card["name"]))
                if card_type:
                    card["card_type"] = card_type

    # Fetch mana data (cmc, mana_cost) for all cards
    all_card_names = [card["name"] for card in all_cards]
    mana_data = fetch_card_mana_bulk(all_card_names)
    for card in all_cards:
        # Lookup by normalized name since fetch_card_mana_bulk normalizes keys
        minfo = mana_data.get(card["name_normalized"], mana_data.get(card["name"], {}))
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
                    "score_type": card.get("score_type", "synergy"),
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
                    "score_type": card.get("score_type", "synergy"),
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
            if not r["card_type"] and r["name_normalized"] in rec_types:
                r["card_type"] = rec_types[r["name_normalized"]]

    # Fetch mana data (cmc, mana_cost) for recommendations
    rec_names = [r["name"] for r in recommendations]
    if rec_names:
        rec_mana = fetch_card_mana_bulk(rec_names)
        for r in recommendations:
            minfo = rec_mana.get(r["name_normalized"], rec_mana.get(r["name"], {}))
            r["cmc"] = minfo.get("cmc", 0)
            r["mana_cost"] = minfo.get("mana_cost", "")

    # --- Functional category classification ---
    # Apply to owned + missing (the average deck cards)
    for card in owned + missing:
        card["functional_category"] = classify_functional_category(
            card["name_normalized"], card["card_type"], type_data,
        )

    # Apply to recommendations
    for r in recommendations:
        r["functional_category"] = classify_functional_category(
            r["name_normalized"], r.get("card_type", ""), type_data,
        )

    # Sort recommendations by synergy descending
    recommendations.sort(key=lambda r: r.get("synergy", 0), reverse=True)
    _save_edhrec_cache_to_disk()

    return {
        "commander": data["commander"],
        "num_decks": data.get("num_decks", 0),
        "themes": data.get("themes", []),
        "theme_applied": data.get("theme_applied", False),
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


# Functional tag patterns for oracle-text-based scoring of cards EDHREC hasn't indexed.
# Each tag maps to a list of regex patterns checked against lowercased oracle text.
FUNCTIONAL_TAGS = {
    "ramp":         [r"add \{", r"search your library for a.*land", r"put.*land.*onto the battlefield"],
    "draw":         [r"draw a card", r"draw \w+ cards", r"draws? \w+ card"],
    "removal":      [r"destroy target", r"exile target", r"return target.*to.*hand"],
    "wipe":         [r"destroy all", r"exile all", r"each player sacrifices", r"deals \d+ damage to each creature"],
    "tokens":       [r"create.*token", r"put.*token.*onto the battlefield"],
    "sacrifice":    [r"sacrifice a", r"sacrifice an", r"when.*is put into a graveyard"],
    "graveyard":    [r"from your graveyard", r"from a graveyard", r"put.*into your graveyard"],
    "counters":     [r"put \w+ \+1/\+1 counter", r"proliferate", r"add a counter"],
    "copy":         [r"copy target", r"create a copy of", r"copy of that spell"],
    "etb":          [r"when.*enters( the battlefield)?", r"enters the battlefield"],
    "lifegain":     [r"you gain \d+ life", r"gain \d+ life", r"lifelink"],
    "reanimator":   [r"return target.*from.*graveyard.*battlefield", r"return.*creature.*graveyard.*play"],
    "storm":        [r"storm", r"whenever you cast.*instant or sorcery", r"magecraft"],
    "tribal":       [r"other \w+ you control get", r"of the chosen type", r"share a creature type"],
    "flicker":      [r"exile.*then return.*to the battlefield", r"blink"],
    "combat":       [r"double strike", r"trample", r"whenever.*attacks", r"combat damage"],
}


def _derive_functional_tags(oracle_text: str) -> set:
    """Return the set of functional tags matching patterns in oracle_text (lowercased input expected)."""
    matched = set()
    oracle_text = oracle_text.lower()  # oracle cache entries aren't consistently lowercased
    for tag, patterns in FUNCTIONAL_TAGS.items():
        for pat in patterns:
            if re.search(pat, oracle_text):
                matched.add(tag)
                break
    return matched


@app.post("/api/recommendations/from-favorites")
@rate_limit(RATE_LIMIT)
def recommendations_from_favorites(request: Request, body: dict):
    """Find commanders that synergize with a list of favorite cards."""
    card_names = body.get("card_names", [])
    limit = body.get("limit", 40)

    if not card_names:
        raise HTTPException(status_code=400, detail="No card names provided")
    if len(card_names) > 100:
        raise HTTPException(status_code=400, detail="Too many cards (max 100)")

    # Detect color identity union from the favorites
    detected_colors = fetch_color_identities(card_names)

    # Get all commanders and filter to those whose color identity is a superset of detected colors
    commanders = standalone_commanders()
    if detected_colors:
        commanders = [
            c for c in commanders
            if detected_colors.issubset(set(c["color_identity"]))
        ]

    # Score most-popular commanders first (better cache hit rate, faster results)
    commanders = sorted(commanders, key=lambda c: c["edhrec_rank"])[:150]

    favorites_normalized = {normalize_card_name(n) for n in card_names}
    norm_to_display = {normalize_card_name(n): n for n in card_names}

    results = []
    for cmd in commanders:
        was_cached = is_commander_data_cached(cmd["name"])
        avg_data = get_commander_avg_deck(cmd["name"])
        synergy_data = get_commander_synergy_cards(cmd["name"])
        if not was_cached:
            time.sleep(0.05)  # be polite to EDHREC only when we actually hit it

        # --- Build weighted card pool ---
        # Maps normalized_name -> (weight 0.0–1.0, display_name, category)
        card_pool = {}

        # 1. Avg deck cards — weight by inclusion rate (default 0.55 if unknown, since avg deck ≥50%)
        for card in avg_data.get("decklist", []):
            n = card["name_normalized"]
            inclusion_pct = card.get("inclusion", 0)
            weight = (inclusion_pct / 100.0) if inclusion_pct > 0 else 0.55
            card_pool[n] = (weight, card["name"], card.get("category", ""))

        # 2. High synergy + top-type cards — covers cards with 10–45% inclusion that are
        #    uniquely synergistic (invisible to avg-deck-only matching)
        for section in ["high_synergy", "top_creatures", "top_instants", "top_sorceries",
                         "top_enchantments", "top_artifacts", "top_planeswalkers",
                         "top_lands", "top_utility_lands", "top_mana_artifacts"]:
            for card in synergy_data.get(section, []):
                n = card["name_normalized"]
                if n in card_pool:
                    continue
                inclusion_pct = card.get("inclusion", 0)
                synergy_score = card.get("synergy", 0)
                base = inclusion_pct / 100.0
                bonus = max(0.0, synergy_score / 100.0) * 0.3
                weight = min(base + bonus, 0.95)
                if weight > 0.05:
                    cat = "Synergy" if section == "high_synergy" else section.replace("top_", "").replace("_", " ").title()
                    card_pool[n] = (weight, card["name"], cat)

        # 3. New cards — recently released, so inclusion is artificially low; use higher synergy bonus
        for card in synergy_data.get("new_cards", []):
            n = card["name_normalized"]
            if n in card_pool:
                continue
            inclusion_pct = card.get("inclusion", 0)
            synergy_score = card.get("synergy", 0)
            base = inclusion_pct / 100.0
            # Higher bonus (0.6 vs 0.3) to compensate for artificially low inclusion rate
            bonus = max(0.0, synergy_score / 100.0) * 0.6
            weight = min(base + bonus, 0.85)
            if weight > 0.02:
                card_pool[n] = (weight, card["name"], "New")

        if not card_pool:
            continue

        # Pre-compute commander's functional tags for oracle fallback scoring
        cmd_norm = normalize_card_name(cmd["name"])
        cmd_oracle = scryfall_oracle_cache.get(cmd_norm, "")
        cmd_tags = _derive_functional_tags(cmd_oracle) if cmd_oracle else set()

        # --- Score favorites against the pool ---
        total_score = 0.0
        matched_normalized = set()

        for norm in favorites_normalized:
            if norm in card_pool:
                weight, _, _ = card_pool[norm]
                total_score += weight
                matched_normalized.add(norm)
            else:
                # Oracle tag fallback: for cards EDHREC hasn't indexed, check functional overlap
                # with the commander's own abilities (e.g., a new token spell vs a token commander)
                fav_oracle = scryfall_oracle_cache.get(norm, "")
                if fav_oracle and cmd_tags:
                    fav_tags = _derive_functional_tags(fav_oracle)
                    overlap = fav_tags & cmd_tags
                    if overlap:
                        bonus = min(len(overlap) * 0.15, 0.3)
                        total_score += bonus
                        matched_normalized.add(norm)

        if not matched_normalized:
            continue

        max_score = float(len(favorites_normalized))
        match_pct = round((total_score / max_score) * 100.0, 1)
        match_count = len(matched_normalized)
        matched_display = sorted([norm_to_display[n] for n in matched_normalized if n in norm_to_display])

        # --- Build expand preview ---
        # Matched favorites first (gold), then top non-land pool cards by weight
        preview_cards = []
        seen_preview = set()

        # Sort matched favorites: pool cards by weight first, oracle-tag-only matches last
        def _fav_sort_key(n):
            if n in card_pool:
                return card_pool[n][0]
            return 0.0  # oracle-tag fallback matches go after pool matches

        for norm in sorted(matched_normalized, key=_fav_sort_key, reverse=True):
            if norm == cmd_norm:
                continue
            if norm in card_pool:
                weight, name, cat = card_pool[norm]
            else:
                # Oracle-tag matched — card isn't in EDHREC's pool yet
                weight = 0.15
                name = norm_to_display.get(norm, norm)
                cat = "Functional"
            preview_cards.append({
                "name": norm_to_display.get(norm, name),
                "category": cat,
                "is_favorite": True,
                "inclusion": round(weight * 100),
            })
            seen_preview.add(norm)

        top_pool = sorted(
            [(n, w, nm, c) for n, (w, nm, c) in card_pool.items()
             if n not in seen_preview and n != cmd_norm and (c or "").lower() not in ("land", "lands")],
            key=lambda x: x[1],
            reverse=True,
        )
        for norm, weight, name, cat in top_pool:
            preview_cards.append({
                "name": name,
                "category": cat,
                "is_favorite": False,
                "inclusion": round(weight * 100),
            })
            if len(preview_cards) >= 15:
                break

        results.append({
            "name": cmd["name"],
            "color_identity": cmd["color_identity"],
            "image_uri": cmd["image_uri"],
            "edhrec_rank": cmd["edhrec_rank"],
            "num_decks": avg_data.get("num_decks", 0),
            "match_count": match_count,
            "total_favorites": len(favorites_normalized),
            "match_percentage": match_pct,
            "matched_cards": matched_display,
            "preview_cards": preview_cards,
        })

    # Sort by weighted match % descending, EDHREC rank ascending on ties
    results.sort(key=lambda r: (r["match_percentage"], -r["edhrec_rank"]), reverse=True)

    _save_edhrec_cache_to_disk()
    return {
        "results": results[:limit],
        "detected_colors": sorted(list(detected_colors)),
        "total_commanders_checked": len(commanders),
    }


@app.post("/api/recommendations")
@rate_limit(RATE_LIMIT)
def get_recommendations(
    request: Request,
    color: Optional[str] = None,
    search: Optional[str] = None,
    min_owned: int = 20,
    limit: int = 50,
    exclude_in_decks: bool = False,
    color_counts: Optional[str] = None,
):
    if not collection:
        raise HTTPException(status_code=400, detail="No collection uploaded. Upload your collection first.")

    available = get_available_collection(exclude_in_decks)

    commanders = standalone_commanders()

    if color:
        color_set = set(color.upper())
        commanders = [c for c in commanders if set(c["color_identity"]) == color_set]

    # Number of colors in the identity, e.g. "3" or "3,4" (0 = colorless). Applied before
    # the popularity cut below, so it yields the top commanders *of that size*.
    if color_counts:
        try:
            wanted = {int(n) for n in color_counts.split(",") if n.strip()}
        except ValueError:
            raise HTTPException(status_code=400, detail="color_counts must be numbers from 0 to 5, e.g. 3,4")
        commanders = [c for c in commanders if len(c["color_identity"]) in wanted]

    if search:
        search_lower = search.lower()
        commanders = [c for c in commanders if search_lower in c["name"].lower()]

    commanders = sorted(commanders, key=lambda c: c["edhrec_rank"])[:200]

    results = []
    no_deck_data = 0
    for cmd in commanders:
        cache_entry = commander_cache.get(f"{cmd['name']}||")
        was_cached = bool(cache_entry and time.time() - cache_entry["timestamp"] < CACHE_TTL)
        data = get_commander_avg_deck(cmd["name"])
        if not was_cached:
            time.sleep(0.1)  # be polite to EDHREC only when we actually hit it
        deck_cards = set(data.get("deck_card_names", []))
        if not deck_cards:
            no_deck_data += 1
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
    _save_edhrec_cache_to_disk()
    logger.info(
        f"Recommendations: checked {len(commanders)} commanders, {no_deck_data} had no EDHREC deck data, "
        f"{len(results)} with {min_owned}+ owned cards (collection: {len(available)} available cards)"
    )
    return {
        "results": results[:limit],
        "checked": len(commanders),
        "no_deck_data": no_deck_data,
        "available_cards": len(available),
    }


@app.post("/api/compare")
@rate_limit(RATE_LIMIT)
async def compare_commanders(request: Request, body: dict):
    """Compare 2-3 commanders side by side."""
    names = body.get("commanders", [])
    if len(names) < 2 or len(names) > 3:
        raise HTTPException(status_code=400, detail="Provide 2-3 commander names")

    loop = asyncio.get_event_loop()
    collection_set = set(collection.keys())  # Convert dict keys to set for operations
    results = []
    for name in names:
        front_face = name.split("//")[0].strip()
        # Run blocking EDHREC fetch in thread pool
        data = await loop.run_in_executor(None, get_commander_avg_deck, front_face)
        deck_cards = set(data.get("deck_card_names", []))
        owned_cards = deck_cards & collection_set
        owned_count = len(owned_cards)
        total = len(deck_cards)

        missing_names = [
            card["name"] for card in data.get("decklist", [])
            if card["name_normalized"] not in collection
        ]

        # Prices - run in thread pool
        total_price = 0
        if missing_names:
            prices = await loop.run_in_executor(None, fetch_prices_bulk, missing_names)
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
            "owned_cards": sorted(owned_cards),
            "missing_cards": sorted(deck_cards - collection_set),
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
