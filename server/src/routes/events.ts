/**
 * Events Routes — Core event discovery API
 *
 * The main API surface for WheresTheFX. Provides endpoints for
 * listing, filtering, searching, and viewing events.
 *
 * ## Filtering
 * Events can be filtered by:
 * - category (nightlife, music, art_culture, etc.)
 * - date range (date_from, date_to)
 * - free events (is_free=true)
 * - venue (venue_id)
 * - search text (searches title, description, venue)
 *
 * ## Pagination
 * All list endpoints support page/limit pagination.
 * Default: page=1, limit=20, max limit=100.
 *
 * ## Saved Events
 * When authenticated, events include an `isSaved` boolean
 * indicating whether the current user has saved the event.
 */

import { Router, Request, Response } from 'express';
import { db } from '../db/connection.js';
import { event, subEvent, venue, sourcePost, sourceAccount, savedEvent } from '../db/schema.js';
import { eq, gte, lte, and, or, ilike, desc, asc, sql, count } from 'drizzle-orm';
import { optionalAuth, authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/events
 *
 * List events with filtering, search, and pagination.
 *
 * Query params:
 * - category: string (event category)
 * - date_from: string (YYYY-MM-DD)
 * - date_to: string (YYYY-MM-DD)
 * - is_free: "true" | "false"
 * - search: string (searches title, description, venue_name)
 * - venue_id: number
 * - status: string (default: "confirmed")
 * - page: number (default: 1)
 * - limit: number (default: 20, max: 100)
 */
router.get('/', optionalAuth, async (req: Request, res: Response) => {
  try {
    const {
      category,
      date_from,
      date_to,
      is_free,
      search,
      venue_id,
      status = 'confirmed',
      page = '1',
      limit = '20',
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions: any[] = [];

    if (status) {
      conditions.push(eq(event.eventStatus, status as any));
    }
    if (category) {
      conditions.push(eq(event.category, category as any));
    }
    if (date_from) {
      conditions.push(gte(event.eventDate, date_from));
    }
    if (date_to) {
      conditions.push(lte(event.eventDate, date_to));
    }
    if (is_free === 'true') {
      conditions.push(eq(event.isFree, true));
    } else if (is_free === 'false') {
      conditions.push(eq(event.isFree, false));
    }
    if (venue_id) {
      conditions.push(eq(event.venueId, parseInt(venue_id)));
    }
    if (search) {
      const term = `%${search}%`;
      conditions.push(
        or(
          ilike(event.title, term),
          ilike(event.description, term),
          ilike(event.venueName, term),
        )
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [{ total }] = await db
      .select({ total: count() })
      .from(event)
      .where(where);

    // Get events
    const results = await db.query.event.findMany({
      where,
      with: {
        venue: true,
        sourceAccount: {
          columns: { username: true, fullName: true },
        },
        subEvent: true,
      },
      orderBy: [asc(event.eventDate), asc(event.eventTime)],
      limit: limitNum,
      offset,
    });

    // Check saved status if authenticated
    let savedEventIds = new Set<number>();
    if (req.user) {
      const saved = await db
        .select({ eventId: savedEvent.eventId })
        .from(savedEvent)
        .where(eq(savedEvent.accountId, req.user.userId));
      savedEventIds = new Set(saved.map(s => s.eventId));
    }

    const data = results.map(e => ({
      ...e,
      isSaved: savedEventIds.has(e.id),
    }));

    res.json({
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / limitNum),
      },
    });
  } catch (err) {
    console.error('Events list error:', err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

/**
 * GET /api/events/upcoming
 *
 * Events from today forward, ordered by date.
 * Shortcut for GET /api/events?date_from=today&status=confirmed
 */
router.get('/upcoming', optionalAuth, async (req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);

    const results = await db.query.event.findMany({
      where: and(
        gte(event.eventDate, today),
        eq(event.eventStatus, 'confirmed'),
      ),
      with: {
        venue: true,
        subEvent: true,
      },
      orderBy: [asc(event.eventDate), asc(event.eventTime)],
      limit,
    });

    // Check saved status
    let savedEventIds = new Set<number>();
    if (req.user) {
      const saved = await db
        .select({ eventId: savedEvent.eventId })
        .from(savedEvent)
        .where(eq(savedEvent.accountId, req.user.userId));
      savedEventIds = new Set(saved.map(s => s.eventId));
    }

    res.json({
      data: results.map(e => ({
        ...e,
        isSaved: savedEventIds.has(e.id),
      })),
    });
  } catch (err) {
    console.error('Upcoming events error:', err);
    res.status(500).json({ error: 'Failed to fetch upcoming events' });
  }
});

/**
 * GET /api/events/map
 *
 * Events with lat/lng for map markers. Returns a lightweight payload
 * optimized for rendering map pins (no descriptions, no sub-events).
 * Only includes events that have geocoding data.
 */
router.get('/map', async (req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { category, date_from, date_to } = req.query as Record<string, string>;

    const conditions: any[] = [
      sql`${event.venueLat} IS NOT NULL`,
      gte(event.eventDate, today),
      eq(event.eventStatus, 'confirmed'),
    ];

    if (category) {
      conditions.push(eq(event.category, category as any));
    }
    if (date_to) {
      conditions.push(lte(event.eventDate, date_to));
    }

    const results = await db
      .select({
        id: event.id,
        title: event.title,
        eventDate: event.eventDate,
        eventEndDate: event.eventEndDate,
        eventTime: event.eventTime,
        endTime: event.endTime,
        venueName: event.venueName,
        venueAddress: event.venueAddress,
        venueLat: event.venueLat,
        venueLng: event.venueLng,
        category: event.category,
        isFree: event.isFree,
        price: event.price,
        imageUrl: event.imageUrl,
        sourceUsername: event.sourceUsername,
        priceNotes: event.priceNotes,
        signupUrl: event.signupUrl,
        eventStatus: event.eventStatus,
        availabilityStatus: event.availabilityStatus,
        isRecurring: event.isRecurring,
        recurrencePattern: event.recurrencePattern,
        priceMin: event.priceMin,
        priceMax: event.priceMax,
      })
      .from(event)
      .where(and(...conditions))
      .orderBy(asc(event.eventDate));

    res.json({ data: results });
  } catch (err) {
    console.error('Map events error:', err);
    res.status(500).json({ error: 'Failed to fetch map events' });
  }
});

/**
 * GET /api/events/:id
 *
 * Single event with full details including sub-events, venue, and source info.
 */
router.get('/:id', optionalAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid event ID' });
      return;
    }

    const result = await db.query.event.findFirst({
      where: eq(event.id, id),
      with: {
        venue: true,
        sourcePost: true,
        sourceAccount: {
          columns: { username: true, fullName: true },
        },
        subEvent: true,
      },
    });

    if (!result) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    // Check if saved by current user
    let isSaved = false;
    if (req.user) {
      const saved = await db.query.savedEvent.findFirst({
        where: and(
          eq(savedEvent.accountId, req.user.userId),
          eq(savedEvent.eventId, id),
        ),
      });
      isSaved = !!saved;
    }

    res.json({ ...result, isSaved });
  } catch (err) {
    console.error('Event detail error:', err);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

export default router;
