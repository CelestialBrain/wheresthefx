---
description: How to set up and run the WheresTheFX development environment
---

# WheresTheFX Dev Setup

## Prerequisites

- Node.js 18+
- PostgreSQL running locally (OrbStack recommended)
- blead repo at `../blead` with `data/ig-events.db`

## Steps

// turbo-all

1. Create the PostgreSQL database:

```bash
/opt/homebrew/Cellar/postgresql@15/15.15_1/bin/psql postgresql://postgres:postgres@localhost:5432 -c "CREATE DATABASE wheresthefx;"
```

2. Install server dependencies:

```bash
cd /Users/angelonrevelo/Antigravity/wheresthefx/server && npm install
```

3. Push database schema:

```bash
cd /Users/angelonrevelo/Antigravity/wheresthefx/server && ./node_modules/.bin/drizzle-kit push
```

4. Run the ingest script to populate data from blead:

```bash
cd /Users/angelonrevelo/Antigravity/wheresthefx/server && BLEAD_DB_PATH=/Users/angelonrevelo/Antigravity/blead/data/ig-events.db DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wheresthefx npx tsx src/scripts/ingest-from-blead.ts
```

5. Start the Express server (port 3001):

```bash
cd /Users/angelonrevelo/Antigravity/wheresthefx/server && npx tsx src/index.ts
```

6. In a separate terminal, install frontend dependencies:

```bash
cd /Users/angelonrevelo/Antigravity/wheresthefx && npm install
```

7. Start the Vite dev server (port 5173):

```bash
cd /Users/angelonrevelo/Antigravity/wheresthefx && npm run dev
```

8. Open http://localhost:5173 in the browser

## Production Deployment

9. Deploy API to VPS:

```bash
rsync -avz --delete --exclude='node_modules' --exclude='.env' --exclude='drizzle' /Users/angelonrevelo/Antigravity/wheresthefx/server/ root@217.216.72.28:/root/wheresthefx-api/ && ssh root@217.216.72.28 "pm2 restart wheresthefx-api"
```

10. Deploy frontend to Vercel:

```bash
cd /Users/angelonrevelo/Antigravity/wheresthefx && vercel --prod --yes
```

## Related

- API: `https://api.wheresthefx.com`
- Frontend: `https://www.wheresthefx.com`
- Conventions: `docs/CONVENTIONS.md`
