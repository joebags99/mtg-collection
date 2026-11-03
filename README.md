# MTG Commander Recommender

Upload your Magic: The Gathering collection, see which Commander decks you can
already build most of, and track the decks you own.

## Running it

Backend (FastAPI):

```bash
pip install -r backend/requirements.txt
python -m uvicorn backend.app:app --reload
```

Frontend (React with Vite and TypeScript, on port 3000, talking to the backend on 8000):

```bash
npm install
npm run dev
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

## Data model

Everything a visitor builds lives on the server, keyed by an owner string. A browser
without an account sends a random session id in the `X-Session-Id` header and owns
`anon:<id>`; a logged-in user sends a bearer token and owns `user:<id>`. Logging in or
registering folds the browser session's collection, decks, and favorites into the account
when the account has none of its own. Logging out starts a new anonymous session.

The frontend keeps only the session id and auth token in the browser. Server data flows
through TanStack Query (`src/lib/queries.ts`), so screens share one cache and mutations
invalidate by key instead of hand-syncing state.

## Frontend layout

```
src/
  main.tsx         entry point
  App.tsx          router: routes map to the surfaces below
  app/             app-wide state (AppContext), Discover filter state, the rail shell, the compare drawer, route components
  features/        one folder per screen: collection, commanders, deckbuilder, decks, favorites, auth
  pages/           static pages (About, Guides)
  components/ui/   shared primitives: mana symbols, badges, cards, pickers, hero, headers
  lib/             API client, session id, query cache and keys, color and card-grouping helpers
  types/           API response types and the Tab union
  styles/          design tokens (tokens.css)
```

## Surfaces and URLs

| Surface | URL | What it holds |
| --- | --- | --- |
| Collection | `/collection`, `/collection/stats` | upload or paste a list; statistics |
| Discover | `/discover`, `/discover/search`, `/discover/favorites` | recommendations, search, and Find My Commander |
| Commander | `/commander/:name` | one commander's average deck against your collection |
| Build | `/commander/:name/build` | the deck builder for that commander |
| Decks | `/decks` | your saved deck lists |

Compare opens as a drawer from the rail once two or three commanders are selected.

## Design system

Every color, font, radius, and duration is a CSS custom property in `src/styles/tokens.css`,
exposed to Tailwind through `tailwind.config.js`. Components use token utilities such as
`bg-surface-2`, `text-ink-muted`, `border-line`, and `text-accent` rather than raw palette
colors. Commander views re-point `--accent` at the commander's color identity, so panels and
highlights take on that identity automatically. Headings use Fraunces, body text IBM Plex Sans,
and numbers IBM Plex Mono via the `num` class.

## Tests

Backend:

```bash
pip install -r backend/requirements-dev.txt
cd backend && python -m pytest
```

Frontend:

```bash
npm test
npm run typecheck
```

Both suites stub the network, so they run offline.
