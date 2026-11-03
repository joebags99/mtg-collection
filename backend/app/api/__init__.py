from fastapi import APIRouter

from . import auth, collection, commanders, decks, recommendations, user

router = APIRouter(prefix="/api")
router.include_router(auth.router)
router.include_router(user.router)
router.include_router(collection.router)
router.include_router(decks.router)
router.include_router(commanders.router)
router.include_router(recommendations.router)
