"""Who owns the data a request touches: a logged-in user, or an anonymous browser session."""
import re
from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .auth import verify_token

SESSION_HEADER = "X-Session-Id"
_SESSION_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
_security = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class Owner:
    key: str                    # "user:<id>" or "anon:<session id>"
    user: Optional[dict] = None  # token payload when logged in

    @property
    def is_user(self) -> bool:
        return self.user is not None


def session_key(request: Request) -> Optional[str]:
    sid = request.headers.get(SESSION_HEADER, "")
    return f"anon:{sid}" if _SESSION_RE.match(sid) else None


def user_key(user_id: int) -> str:
    return f"user:{user_id}"


async def get_owner(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(_security),
) -> Owner:
    """A valid bearer token wins; otherwise the session header; otherwise 401."""
    if credentials:
        payload = verify_token(credentials.credentials)
        if payload:
            return Owner(user_key(payload["user_id"]), payload)
    key = session_key(request)
    if key:
        return Owner(key)
    raise HTTPException(status_code=401, detail=f"Missing {SESSION_HEADER} header or bearer token")
