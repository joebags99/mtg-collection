# MTG Commander Recommender

Find the Commander decks you're closest to building from your Magic: The Gathering
collection, track which cards are committed to your decks, and build new ones with
EDHREC and Scryfall data.

## Start it

```
python run.py
```

That's it. The app opens at http://localhost:8000. Press Ctrl+C to stop it.

The first run installs the Python and Node packages and builds the frontend, which
takes a few minutes. Later runs start in seconds, and the frontend is only rebuilt
when its code has changed.

Requirements: Python 3.10+ and Node.js 18+ (`python` and `npm` on your PATH).

### Options

| Command | What it does |
| --- | --- |
| `python run.py --dev` | Hot-reloading dev servers while editing code: app on http://localhost:3000, API on :8000 |
| `python run.py --port 9000` | Use a different port |
| `python run.py --no-browser` | Don't open a browser tab |

## Settings

Copy `.env.example` to `.env` to change settings. `run.py` reads it automatically.

- `JWT_SECRET`: secret for signing logins. Set a long random value if anyone else can reach the app.
- `DATABASE_PATH`: SQLite file with accounts and synced data. By default `run.py` keeps
  using an existing `mtg_collection.db` in this folder or in `backend/`.

## Docker

```
docker compose up --build
```

Serves the app on http://localhost:8000 with the database stored in a Docker volume.
