"""MTG Commander Recommender backend.

Layout:
    api/       thin FastAPI routers, one per resource
    services/  Scryfall and EDHREC clients, user persistence, analysis
    domain/    pure functions: names, parsing, partners, classification
    state.py   the working collection and deck lists
    cache.py   process-local caches for external data

`backend.app:app` remains the uvicorn entrypoint.
"""
from .main import app, create_app

__all__ = ["app", "create_app"]
