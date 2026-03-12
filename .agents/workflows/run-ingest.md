---
description: How to run the blead-to-PostgreSQL ingest pipeline to sync event data
---

# Run Ingest Pipeline

Syncs event data from blead's SQLite database into WheresTheFX PostgreSQL.

## Prerequisites

- PostgreSQL `wheresthefx` database exists with schema pushed
- blead repo at `../blead` with `data/ig-events.db`
- Server dependencies installed

## Steps

// turbo-all

1. Run the ingest script:

```bash
cd /Users/angelonrevelo/Antigravity/wheresthefx/server && BLEAD_DB_PATH=/Users/angelonrevelo/Antigravity/blead/data/ig-events.db DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wheresthefx npx tsx src/scripts/ingest-from-blead.ts
```

2. Verify the sync log:

```bash
/opt/homebrew/Cellar/postgresql@15/15.15_1/bin/psql postgresql://postgres:postgres@localhost:5432/wheresthefx -c "SELECT * FROM sync_log ORDER BY started_at DESC LIMIT 1;"
```

## Expected Output

```
🔄 Starting blead → WheresTheFX sync...
📍 Syncing venues...       ✅ 118 venues
👤 Syncing accounts...     ✅ 157 accounts
📸 Syncing posts...        ✅ 1317 posts
🎉 Syncing events...       ✅ 230 events
🎤 Syncing sub-events...   ✅ 178 sub-events
✅ Sync completed in ~2s
```

## Troubleshooting

- If `BLEAD_DB_PATH` error: Ensure the blead repo has `data/ig-events.db`
- If connection refused: Ensure PostgreSQL is running (OrbStack)
- If table errors: Run `drizzle-kit push` first to create schema
