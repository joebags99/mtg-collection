from fastapi import APIRouter

from . import auth, collection, commanders, decks, favorites, recommendations

router = APIRouter(prefix="/api")
router.include_router(auth.router)
router.include_router(favorites.router)
router.include_router(collection.router)
router.include_router(decks.router)
router.include_router(commanders.router)
router.include_router(recommendations.router)
