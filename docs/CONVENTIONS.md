# Database & Code Conventions

Rules for writing consistent, refactorable code in the WheresTheFX codebase.
Modeled after [sisia-app CONVENTIONS.md](../../../sisia-app/docs/CONVENTIONS.md).

## Database

| Convention             | Rule                                                         | Example                                       |
| ---------------------- | ------------------------------------------------------------ | --------------------------------------------- |
| **Column naming**      | `snake_case`, never camelCase                                | `event_date`, `venue_name`                    |
| **Table naming**       | Singular noun, no reserved words (sisia convention)          | `event`, `venue`, `source_account`, `account` |
| **Timestamps**         | Every table gets `created_at TIMESTAMPTZ DEFAULT NOW()`      | —                                             |
| **Constrained values** | Named Postgres ENUMs                                         | `CREATE TYPE event_category AS ENUM (...)`    |
| **Indexes**            | `idx_{table}_{column}`                                       | `idx_event_date`, `idx_event_category`        |
| **Primary keys**       | `id SERIAL` (current), `{table}_id` preferred for new tables | `event.id` (existing)                         |

> [!NOTE]
> Tables now use singular names following sisia convention. `users` was renamed to
> `account` to avoid PostgreSQL reserved word. `user_preferences` → `account_preference`.

## TypeScript

| Convention             | Rule                                        | Example                                     |
| ---------------------- | ------------------------------------------- | ------------------------------------------- |
| **Variables**          | camelCase in TS, snake_case only in SQL/API | `const eventDate = row.event_date`          |
| **Imports**            | `.js` extension for local ESM imports       | `import { event } from '../db/schema.js'`   |
| **Row types**          | `{Entity}Data` with snake_case fields       | `EventData { event_date, venue_name, ... }` |
| **API response types** | Match the snake_case API contract exactly   | `{ is_free: true, price_notes: '...' }`     |

## API Response Format

All API responses use **snake_case** keys. The `snakeCaseResponse` middleware
in `server/src/middleware/snakeCase.ts` auto-converts Drizzle's camelCase output
to snake_case before sending. Route handlers don't need to worry about casing.

### Example response

```json
{
  "data": [
    {
      "id": 864,
      "title": "Live Music @ 70s Bistro",
      "event_date": "2026-03-15",
      "event_time": "20:00",
      "venue_name": "70s Bistro",
      "venue_lat": 14.630706,
      "venue_lng": 121.06137,
      "is_free": false,
      "price": 350,
      "category": "music",
      "image_url": "https://...",
      "source_username": "70sbistro"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 230,
    "total_pages": 12
  }
}
```

### Envelope shape

| Endpoint              | Response shape                       |
| --------------------- | ------------------------------------ |
| `GET /api/events`     | `{ data: [...], pagination: {...} }` |
| `GET /api/events/map` | `{ data: [...] }`                    |
| `GET /api/events/:id` | `{ id, title, ... }` (flat)          |
| `GET /api/venues`     | `{ data: [...] }`                    |
| `GET /api/categories` | `{ data: [...] }`                    |
| Error responses       | `{ error: "message" }`               |

## File Organization

```
server/
├── src/
│   ├── db/            ← Schema + connection (Drizzle ORM)
│   ├── routes/        ← HTTP handlers
│   ├── middleware/     ← Auth, CORS, snake_case transform
│   └── scripts/       ← Ingest, geocoding, one-off scripts
src/
├── api/               ← API client (fetch wrapper, types)
├── hooks/             ← React Query hooks (useEventMarkers, etc.)
├── components/        ← UI components
├── pages/             ← Route pages
└── utils/             ← Shared utilities
```

## Future Improvements

These are tracked but deferred:

- [x] Rename tables to singular (`event` instead of `events`) — ✅ Done
- [x] Rename `users` → `account` (sisia reserved-word convention) — ✅ Done
- [ ] Rename PKs to `{table}_id` (`event_id` instead of `id`)
- [ ] Add DAL layer (no raw Drizzle in routes)
- [ ] Add `{Entity}Row` and `{Entity}Safe` shared types
