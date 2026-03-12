# Ingest Pipeline: blead → WheresTheFX

## Overview

The ingest pipeline synchronizes data from **blead** (Instagram scraper running on VPS) into the WheresTheFX PostgreSQL database. It's designed to run periodically (every 6 hours) or manually.

## Data Flow

```
blead SQLite (ig-events.db)
  │
  ├─ known_venue   ──→  PostgreSQL venue
  ├─ ig_account    ──→  PostgreSQL source_account
  ├─ ig_post       ──→  PostgreSQL source_post
  ├─ ig_event      ──→  PostgreSQL event
  └─ sub_event     ──→  PostgreSQL sub_event
```

## Deduplication Strategy

Each table uses a **natural key** for dedup (not blead's internal auto-increment IDs):

| Table          | Natural Key  | Strategy                      |
| -------------- | ------------ | ----------------------------- |
| venue          | `name`       | ON CONFLICT DO UPDATE         |
| source_account | `username`   | ON CONFLICT DO UPDATE         |
| source_post    | `shortcode`  | ON CONFLICT DO UPDATE         |
| event          | `event_hash` | ON CONFLICT DO UPDATE         |
| sub_event      | (none)       | DELETE + re-insert per parent |

### Why no dependency on blead IDs?

blead's auto-increment IDs can change if the SQLite database is rebuilt. By matching on natural keys (venue name, IG username, post shortcode, event content hash), the ingest pipeline is resilient to blead database resets.

### event_hash

The `event_hash` is a SHA256 computed by blead from:

- Normalized event title (lowercased, trimmed)
- Event date
- Venue name (lowercased, trimmed)

Two events with the same title, date, and venue are considered duplicates. When a conflict occurs, the record is updated with fresh data.

## Running the Ingest

### Manual (local development)

```bash
cd server
BLEAD_DB_PATH=../blead/data/ig-events.db \
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wheresthefx \
npx tsx src/scripts/ingest-from-blead.ts
```

### Cron (production VPS)

```bash
# Every 6 hours
0 */6 * * * cd /path/to/wheresthefx/server && \
  npx tsx src/scripts/ingest-from-blead.ts >> /var/log/wheresthefx-ingest.log 2>&1
```

### Via npm script

```bash
cd server
npm run ingest
```

## Sync Logging

Every ingest run is logged to the `sync_log` table:

```sql
SELECT * FROM sync_log ORDER BY started_at DESC LIMIT 1;
```

| Column            | Description                         |
| ----------------- | ----------------------------------- |
| started_at        | When the sync started               |
| completed_at      | When it finished                    |
| status            | `running`, `completed`, or `failed` |
| venues_synced     | Number of venues processed          |
| accounts_synced   | Number of accounts processed        |
| posts_synced      | Number of posts processed           |
| events_synced     | Number of events processed          |
| sub_events_synced | Number of sub-events processed      |
| error_message     | Error details if status is `failed` |

## Performance

Typical sync times:

- **118 venues**: ~0.1s
- **157 accounts**: ~0.2s
- **1317 posts**: ~1.5s
- **230 events**: ~0.5s
- **178 sub-events**: ~0.2s
- **Total**: ~3s

## Error Handling

- Each table syncs independently — if posts fail, venues and accounts are preserved
- Failed syncs are logged with the error message
- The script exits with code 1 on failure (for cron monitoring)
- SQLite is opened in read-only mode (cannot corrupt blead's data)

## Image Handling

Images are **not** copied during ingest. Instead:

1. Events store Instagram CDN URLs (`image_url`)
2. The API has an image proxy endpoint (`/api/images/proxy`)
3. The proxy first tries the CDN URL
4. If expired (403/410), falls back to blead's local cache (`BLEAD_IMAGE_DIR/{shortcode}/`)

This avoids duplicating image storage while ensuring images remain accessible even after CDN URLs expire.

## Conventions

- All database columns use `snake_case` — see `docs/CONVENTIONS.md`
- API responses are auto-converted to `snake_case` by `snakeCaseResponse` middleware
