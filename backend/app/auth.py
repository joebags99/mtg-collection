"""Password hashing, JWT tokens, and FastAPI auth dependencies."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import JWT_SECRET

TOKEN_LIFETIME = timedelta(days=30)

_security = HTTPBearer(auto_error=False)
_password_executor = ThreadPoolExecutor(max_workers=2)


def _hash_password_sync(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=8)).decode("utf-8")


def _verify_password_sync(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


async def hash_password(password: str) -> str:
    """bcrypt is CPU-bound, so run it off the event loop."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_password_executor, _hash_password_sync, password)


async def verify_password(password: str, password_hash: str) -> bool:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_password_executor, _verify_password_sync, password, password_hash)


def create_token(user_id: int, username: str) -> str:
    payload = {"user_id": user_id, "username": username, "exp": datetime.utcnow() + TOKEN_LIFETIME}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def verify_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        return None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_security),
) -> Optional[dict]:
    """Optional auth: returns the token payload or None."""
    if not credentials:
        return None
    return verify_token(credentials.credentials)


async def require_user(credentials: HTTPAuthorizationCredentials = Depends(_security)) -> dict:
    """Required auth: raises 401 without a valid token."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = verify_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload
