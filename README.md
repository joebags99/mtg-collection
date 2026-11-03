# MTG Commander Recommender

Upload your Magic: The Gathering collection, see which Commander decks you can
already build most of, and track the decks you own.

## Running it

Backend (FastAPI):

```bash
pip install -r backend/requirements.txt
python -m uvicorn backend.app:app --reload
```

Frontend (React, served on port 3000 and proxied to the backend on 8000):

```bash
npm install
npm start
```

Or everything at once with Docker:

```bash
docker compose up --build
```

Configuration is read from the environment; see `.env.example`.

## Backend layout

```
backend/app/
  main.py          FastAPI app factory and startup
  config.py        environment settings and cache lifetimes
  api/             one thin router per resource (auth, user, collection, decks, commanders, recommendations)
  services/        Scryfall and EDHREC clients, user persistence, and the analysis built on them
  domain/          pure functions: name normalization, list parsing, partner rules, card classification
  state.py         the working collection and deck lists
  cache.py         process-local caches for external data
  auth.py          password hashing, JWT, auth dependencies
  db.py            SQLite connection and schema
```

Routes stay thin: they validate input, call a service, and return its result.
External calls that block run in a thread pool so they do not stall the event loop.

## Tests

```bash
pip install -r backend/requirements-dev.txt
cd backend && python -m pytest
```

The suite stubs Scryfall and EDHREC, so it runs offline.
