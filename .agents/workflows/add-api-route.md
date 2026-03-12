---
description: How to add a new API route to the WheresTheFX Express backend
---

# Add API Route

## Steps

1. Create a new route file at `server/src/routes/<name>.ts`:

```typescript
import { Router, Request, Response } from "express";
import { db } from "../db/connection.js";
import { authenticate, optionalAuth } from "../middleware/auth.js";
import * as schema from "../db/schema.js";

const router = Router();

// Public endpoint — response keys are auto-converted to snake_case by middleware
router.get("/", async (req: Request, res: Response) => {
  const data = await db.select().from(schema.tableName);
  res.json({ data });
});

// Protected endpoint
router.post("/", authenticate, async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  // ... handle request
});

export default router;
```

2. Mount the route in `server/src/index.ts`:

```typescript
import newRoutes from "./routes/<name>.js";
// ...
app.use("/api/<name>", newRoutes);
```

3. If you need new database tables, update `server/src/db/schema.ts` and run:

```bash
cd server && ./node_modules/.bin/drizzle-kit push
```

## Key Patterns

### Authentication

- `authenticate` — Required JWT token. Sets `req.user.userId`
- `optionalAuth` — Optional JWT. Sets `req.user` if token present, null otherwise

### Database Queries (Drizzle ORM)

```typescript
import { eq, gte, like, and, desc, sql } from "drizzle-orm";

// Simple select
const events = await db
  .select()
  .from(schema.events)
  .where(eq(schema.events.category, "music"));

// With joins
const eventsWithVenues = await db.query.events.findMany({
  with: { venue: true, subEvents: true },
  where: eq(schema.events.category, "music"),
});

// Aggregation
const counts = await db
  .select({
    category: schema.events.category,
    count: sql<number>`count(*)`,
  })
  .from(schema.events)
  .groupBy(schema.events.category);
```

### Pagination Pattern

```typescript
const page = parseInt(req.query.page as string) || 1;
const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
const offset = (page - 1) * limit;

const [data, [{ total }]] = await Promise.all([
  db.select().from(schema.events).limit(limit).offset(offset),
  db.select({ total: sql<number>`count(*)` }).from(schema.events),
]);

res.json({
  data,
  pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
});
```

## Related Files

- Schema: `server/src/db/schema.ts`
- Connection: `server/src/db/connection.ts`
- Auth middleware: `server/src/middleware/auth.ts`
- Snake case middleware: `server/src/middleware/snakeCase.ts`
- Existing routes: `server/src/routes/`
- Conventions: `docs/CONVENTIONS.md`
