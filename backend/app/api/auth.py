from fastapi import APIRouter, Depends, HTTPException

from ..auth import create_token, hash_password, require_user, verify_password
from ..services import users

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register")
async def register(body: dict):
    username = body.get("username", "").strip().lower()
    password = body.get("password", "")
    if not username or len(username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if not password or len(password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
    if not username.isalnum():
        raise HTTPException(status_code=400, detail="Username must be alphanumeric")
    if users.find_user_by_name(username):
        raise HTTPException(status_code=400, detail="Username already taken")

    user_id = users.create_user(username, await hash_password(password))
    return {"token": create_token(user_id, username), "user": {"id": user_id, "username": username}}


@router.post("/login")
async def login(body: dict):
    username = body.get("username", "").strip().lower()
    password = body.get("password", "")
    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password required")

    user = users.find_user_by_name(username)
    if not user or not await verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return {"token": create_token(user["id"], user["username"]),
            "user": {"id": user["id"], "username": user["username"]}}


@router.get("/me")
async def get_me(user: dict = Depends(require_user)):
    return {"user": {"id": user["user_id"], "username": user["username"]}}
