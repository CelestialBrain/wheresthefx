# WheresTheFX

**Metro Manila Event Discovery Platform** — Find parties, thrift markets, live music, food events, and more on an interactive map.

**Production:** [www.wheresthefx.com](https://www.wheresthefx.com) | **API:** [api.wheresthefx.com](https://api.wheresthefx.com/api/events/map)

## Architecture

```
┌─────────────────────────────────────────────────┐
│                    blead (VPS)                   │
│  Playwright + Gemini AI → SQLite (ig-events.db)  │
│  Scrapes ~157 Instagram accounts daily           │
└─────────────────┬───────────────────────────────┘
                  │ ingest script (every 6hrs)
                  ▼
┌─────────────────────────────────────────────────┐
│              WheresTheFX Server                  │
│  Express.js + Drizzle ORM + PostgreSQL           │
│  REST API: /api/events, /api/venues, etc.        │
│  Image proxy for Instagram CDN fallback          │
│  JWT auth                                        │
│  Port: 3001                                      │
└─────────────────┬───────────────────────────────┘
                  │ fetch API
                  ▼
┌─────────────────────────────────────────────────┐
│              WheresTheFX Client                  │
│  React + Vite + TypeScript + Tailwind            │
│  Leaflet dark-themed map                         │
│  Category filters, search, date/price filters    │
│  Math verification landing page                  │
│  Port: 5173                                      │
└─────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL (OrbStack or local)
- blead repo at `../blead` (for ingest)

### Setup

```bash
# 1. Create PostgreSQL database
psql -c "CREATE DATABASE wheresthefx;"

# 2. Install server deps + push schema
cd server
npm install
./node_modules/.bin/drizzle-kit push

# 3. Run ingest from blead
BLEAD_DB_PATH=../blead/data/ig-events.db \
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wheresthefx \
npx tsx src/scripts/ingest-from-blead.ts

# 4. Start server
npx tsx src/index.ts

# 5. Install frontend deps + start
cd ..
npm install
npm run dev
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable          | Description                     | Default                                                     |
| ----------------- | ------------------------------- | ----------------------------------------------------------- |
| `DATABASE_URL`    | PostgreSQL connection string    | `postgresql://postgres:postgres@localhost:5432/wheresthefx` |
| `JWT_SECRET`      | Secret for JWT token signing    | `your-secret-key-change-in-production`                      |
| `BLEAD_DB_PATH`   | Path to blead's SQLite database | `../blead/data/ig-events.db`                                |
| `BLEAD_IMAGE_DIR` | Path to blead's cached images   | `../blead/data/ig-images`                                   |
| `PORT`            | Server port                     | `3001`                                                      |
| `CORS_ORIGIN`     | Allowed CORS origin             | `http://localhost:5173`                                     |
| `VITE_API_URL`    | API base URL (frontend)         | `http://localhost:3001`                                     |

## Project Structure

```
wheresthefx/
├── docs/                       # Documentation
│   ├── CONVENTIONS.md           # Code/database/API conventions
│   ├── api.md                   # API reference
│   ├── schema.md                # Database schema reference
│   └── ingest.md                # Ingest pipeline docs
├── server/                      # Express.js backend
│   ├── src/
│   │   ├── db/
│   │   │   ├── schema.ts        # Drizzle ORM schema (9 tables)
│   │   │   ├── connection.ts    # PostgreSQL connection
│   │   │   └── migrate.ts       # Migration runner
│   │   ├── middleware/
│   │   │   ├── auth.ts          # JWT auth middleware
│   │   │   └── snakeCase.ts     # camelCase → snake_case response transform
│   │   ├── routes/
│   │   │   ├── auth.ts          # Register, login, me
│   │   │   ├── events.ts        # Event CRUD + map/upcoming
│   │   │   ├── venues.ts        # Venue directory
│   │   │   ├── categories.ts    # Category metadata
│   │   │   └── users.ts         # Saved events, preferences
│   │   ├── scripts/
│   │   │   ├── ingest-from-blead.ts   # SQLite → PG sync
│   │   │   └── geocode-venues.ts      # Venue geocoding
│   │   └── index.ts             # Express server entry
│   ├── drizzle.config.ts
│   └── package.json
├── src/                         # React frontend (Vite)
│   ├── api/
│   │   └── client.ts            # API client (snake_case types)
│   ├── components/              # React components
│   │   ├── EventMap.tsx          # Leaflet map
│   │   ├── EventSidebar.tsx      # Sidebar with nearby events
│   │   ├── EventPopup.tsx        # Mobile event popup
│   │   ├── EventSidePanel.tsx    # Desktop event panel
│   │   ├── MapFilters.tsx        # Search, date, price filters
│   │   ├── CategoryFilter.tsx    # Category chip filters
│   │   └── ui/                   # shadcn/ui components
│   ├── hooks/                    # React hooks
│   │   ├── useEventMarkers.ts    # Fetch + cluster events
│   │   ├── useSavedEvents.ts     # User's saved events
│   │   └── useUserPreferences.ts
│   ├── pages/
│   │   ├── Index.tsx             # Landing + map view
│   │   ├── Auth.tsx              # Login/register
│   │   └── Admin.tsx             # Admin dashboard
│   └── utils/
│       └── markerUtils.ts        # Map marker clustering
├── .agents/workflows/            # Agent workflow definitions
├── .env.example
└── package.json
```

## Data Pipeline

### Source: blead

blead is a separate system that scrapes Instagram daily:

- **157 accounts** tracked (venues, promoters, organizers in Metro Manila)
- **Playwright** headless browser extracts posts
- **Gemini AI** classifies posts as events and extracts structured data
- Stores everything in SQLite at `data/ig-events.db`

### Ingest: SQLite → PostgreSQL

The `ingest-from-blead.ts` script syncs data:

1. **Venues** — matched by `name` (UNIQUE)
2. **Accounts** — matched by `username` (UNIQUE)
3. **Posts** — matched by `shortcode` (UNIQUE)
4. **Events** — matched by `event_hash` (SHA256 of title+date+venue)
5. **Sub-events** — delete + re-insert per parent event

Run every 6 hours via cron on the VPS:

```bash
0 */6 * * * cd /path/to/wheresthefx/server && npx tsx src/scripts/ingest-from-blead.ts
```

### Current Data Stats (March 2026)

| Table      | Count |
| ---------- | ----- |
| Venues     | 118   |
| Accounts   | 157   |
| Posts      | 1317  |
| Events     | 230   |
| Sub-events | 178   |
| Geocoded   | 194   |

## API Reference

All endpoints are prefixed with `/api`. All responses use **snake_case** keys.
See [docs/api.md](api.md) for full reference.

### Auth

| Method | Path             | Description    | Auth |
| ------ | ---------------- | -------------- | ---- |
| `POST` | `/auth/register` | Create account | No   |
| `POST` | `/auth/login`    | Login, get JWT | No   |
| `GET`  | `/auth/me`       | Current user   | Yes  |

### Events

| Method | Path               | Description             | Auth     |
| ------ | ------------------ | ----------------------- | -------- |
| `GET`  | `/events`          | List events (paginated) | Optional |
| `GET`  | `/events/upcoming` | Future events           | No       |
| `GET`  | `/events/map`      | Events with geocoding   | No       |
| `GET`  | `/events/:id`      | Event detail            | Optional |

Query params: `category`, `search`, `is_free`, `date_from`, `date_to`, `page`, `limit`

### Venues

| Method | Path                 | Description     | Auth |
| ------ | -------------------- | --------------- | ---- |
| `GET`  | `/venues`            | All venues      | No   |
| `GET`  | `/venues/:id`        | Venue detail    | No   |
| `GET`  | `/venues/:id/events` | Events at venue | No   |

### Categories

| Method | Path          | Description            | Auth |
| ------ | ------------- | ---------------------- | ---- |
| `GET`  | `/categories` | Categories with counts | No   |

### User

| Method | Path                    | Description        | Auth |
| ------ | ----------------------- | ------------------ | ---- |
| `GET`  | `/users/me/saved`       | Saved events       | Yes  |
| `POST` | `/users/me/saved`       | Toggle save event  | Yes  |
| `GET`  | `/users/me/preferences` | Get preferences    | Yes  |
| `PUT`  | `/users/me/preferences` | Update preferences | Yes  |

### Image Proxy

| Method | Path                                  | Description            |
| ------ | ------------------------------------- | ---------------------- |
| `GET`  | `/images/proxy?url=...&shortcode=...` | Proxy Instagram images |

## Database Schema

9 tables connected via foreign keys:

- **venue** — Canonical venue directory with geocoding
- **source_account** — Instagram accounts being tracked
- **source_post** — Raw IG posts with AI extraction data
- **event** — Core event data with `event_hash` dedup
- **sub_event** — Multi-act lineups and schedules
- **account** — Platform user accounts (bcrypt passwords)
- **saved_event** — User bookmarks (many-to-many)
- **account_preference** — Preferred categories
- **sync_log** — Ingest run tracking

Key design decisions:

- No dependency on blead's internal IDs
- `event_hash` (SHA256) for deduplication
- Denormalized `venue_name`/`source_username` for query performance
- JSONB arrays for `artists`
- API responses auto-converted to snake_case by `snakeCaseResponse` middleware

## Deployment

### VPS (Express API)

```bash
# Sync server code to VPS
rsync -avz --delete --exclude='node_modules' --exclude='.env' --exclude='drizzle' \
  server/ root@217.216.72.28:/root/wheresthefx-api/

# Restart on VPS
ssh root@217.216.72.28 "pm2 restart wheresthefx-api"
```

- API: `https://api.wheresthefx.com` (port 3001 behind Caddy reverse proxy)
- SSL: Let's Encrypt via Caddy
- Process manager: PM2

### Vercel (Frontend)

```bash
# Deploy to production
vercel --prod --yes
```

- Frontend: `https://www.wheresthefx.com`
- Env: `VITE_API_URL=https://api.wheresthefx.com`
- DNS: Namecheap BasicDNS → Vercel

## Tech Stack

| Layer         | Technology                               |
| ------------- | ---------------------------------------- |
| Frontend      | React 18, Vite, TypeScript, Tailwind CSS |
| UI Components | shadcn/ui (Radix primitives)             |
| Map           | Leaflet with custom markers              |
| Backend       | Express.js, TypeScript                   |
| ORM           | Drizzle ORM                              |
| Database      | PostgreSQL (OrbStack)                    |
| Auth          | JWT (jsonwebtoken + bcryptjs)            |
| Data Source   | blead (Playwright + Gemini AI → SQLite)  |
