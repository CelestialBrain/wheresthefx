/**
 * Categories Routes — Event category metadata
 *
 * Returns the list of event categories with counts and display labels.
 * Used by the frontend to render category filter chips.
 *
 * ## Category Mapping (blead → WheresTheFX)
 * | Value       | Label              | Emoji |
 * |-------------|--------------------|-------|
 * | nightlife   | Nightlife          | 🌙    |
 * | music       | Live Music         | 🎵    |
 * | art_culture | Art & Culture      | 🎨    |
 * | markets     | Markets & Fairs    | 🛍️    |
 * | food        | Food & Drinks      | 🍜    |
 * | community   | Community          | 🤝    |
 * | workshops   | Workshops          | 🎓    |
 * | comedy      | Comedy             | 😂    |
 * | other       | Other              | 📌    |
 */

import { Router, Request, Response } from 'express';
import { db } from '../db/connection.js';
import { event } from '../db/schema.js';
import { eq, gte, and, count, sql } from 'drizzle-orm';

const router = Router();

/** Display metadata for each category */
const CATEGORY_META: Record<string, { label: string; emoji: string }> = {
  nightlife: { label: 'Nightlife', emoji: '🌙' },
  music: { label: 'Live Music', emoji: '🎵' },
  art_culture: { label: 'Art & Culture', emoji: '🎨' },
  markets: { label: 'Markets & Fairs', emoji: '🛍️' },
  food: { label: 'Food & Drinks', emoji: '🍜' },
  community: { label: 'Community', emoji: '🤝' },
  workshops: { label: 'Workshops', emoji: '🎓' },
  comedy: { label: 'Comedy', emoji: '😂' },
  other: { label: 'Other', emoji: '📌' },
};

/**
 * GET /api/categories
 *
 * Returns all categories with their upcoming event counts
 * and display metadata (label, emoji).
 *
 * Response: { data: [{ value, label, emoji, count }] }
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Count upcoming confirmed events per category
    const counts = await db
      .select({
        category: event.category,
        count: count(),
      })
      .from(event)
      .where(and(
        gte(event.eventDate, today),
        eq(event.eventStatus, 'confirmed'),
      ))
      .groupBy(event.category);

    // Build response with all categories (even those with 0 events)
    const countMap = new Map(counts.map(c => [c.category, Number(c.count)]));

    const data = Object.entries(CATEGORY_META).map(([value, meta]) => ({
      value,
      label: meta.label,
      emoji: meta.emoji,
      count: countMap.get(value) || 0,
    }));

    // Sort by count descending (most popular first)
    data.sort((a, b) => b.count - a.count);

    res.json({ data });
  } catch (err) {
    console.error('Categories error:', err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

export default router;
