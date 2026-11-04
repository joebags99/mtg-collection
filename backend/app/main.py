"""FastAPI application factory."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import ratelimit
from .api import router
from .config import CORS_ORIGINS
from .db import init_db
from .services import scryfall_store

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    scryfall_store.warm_caches()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="MTG Commander Recommender", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])
    ratelimit.install(app)
    app.include_router(router)
    return app


app = create_app()
