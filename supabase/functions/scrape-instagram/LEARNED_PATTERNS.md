# Learned Pattern System Documentation

## Overview

The learned pattern system allows the Instagram scraper to adaptively improve its extraction accuracy over time using database-backed regex patterns. This system is fully rule-based (no ML/AI dependencies) and designed to learn from admin corrections.

## Architecture

### Core Files

- **patternFetcher.ts**: Core pattern matching logic with priority-based selection and automatic stats tracking
- **extractionUtils.ts**: Extraction functions (price, date, time, venue, vendor) integrated with learned patterns
- **feedbackLoop.ts**: Legacy feedback functions (kept for compatibility)
- **logger.ts**: Enhanced to capture pattern IDs for debugging and analytics

### Database Schema

#### extraction_patterns Table

Required columns (must exist in database):
```sql
CREATE TABLE IF NOT EXISTS public.extraction_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type text NOT NULL,  -- 'price' | 'date' | 'time' | 'venue' | 'vendor'
  pattern_regex text NOT NULL,
  pattern_description text,
  confidence_score numeric DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  success_count integer DEFAULT 0 CHECK (success_count >= 0),
  failure_count integer DEFAULT 0 CHECK (failure_count >= 0),
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true,
  source text DEFAULT 'learned' CHECK (source IN ('default', 'learned', 'manual')),
  priority integer DEFAULT 100  -- Lower number = higher priority
);

CREATE INDEX idx_extraction_patterns_type ON extraction_patterns(pattern_type);
CREATE INDEX idx_extraction_patterns_priority ON extraction_patterns(priority ASC);
CREATE INDEX idx_extraction_patterns_active ON extraction_patterns(is_active) WHERE is_active = true;
```

**TODO**: Add the `priority` column if it doesn't exist:
```sql
ALTER TABLE public.extraction_patterns ADD COLUMN IF NOT EXISTS priority integer DEFAULT 100;
CREATE INDEX IF NOT EXISTS idx_extraction_patterns_priority ON public.extraction_patterns(priority ASC);
```

#### extraction_feedback Table (Recommended)

This table enables tracking admin corrections for pattern learning:

```sql
CREATE TABLE IF NOT EXISTS public.extraction_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.instagram_posts(id) ON DELETE CASCADE,
  field text NOT NULL,  -- 'price' | 'date' | 'time' | 'venue' | 'vendor' | 'event'
  raw_text text NOT NULL,
  correct_value text,  -- nullable for vendor/event classification
  used_pattern_id uuid REFERENCES public.extraction_patterns(id) ON DELETE SET NULL,
  is_correct boolean NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_extraction_feedback_field ON extraction_feedback(field);
CREATE INDEX idx_extraction_feedback_post ON extraction_feedback(post_id);
CREATE INDEX idx_extraction_feedback_created ON extraction_feedback(created_at DESC);
```

## How It Works

### 1. Pattern Selection

When extracting data (e.g., price, date, venue):

1. **Fetch patterns** from database for the given type, ordered by:
   - `priority ASC` (lower number = higher priority)
   - `confidence_score DESC` (higher confidence as tiebreaker)
2. **Try each pattern** in order until one matches
3. **Extract value** from regex group 1 (if present) or full match
4. **Update stats** asynchronously:
   - Increment `success_count` and update `last_used_at` on match
   - Increment `failure_count` on no match (for highest priority pattern only)

### 2. Priority-Based Matching

```typescript
// Example: Multiple patterns for price extraction
// Pattern with priority=5 will be tried before priority=10
{
  id: 'pattern-peso',
  pattern_type: 'price',
  pattern_regex: '₱\\s*(\\d+)',
  priority: 5,  // Higher priority
  confidence_score: 0.9
}

{
  id: 'pattern-dollar',
  pattern_type: 'price',
  pattern_regex: '\\$\\s*(\\d+)',
  priority: 10,  // Lower priority
  confidence_score: 0.95
}
```

### 3. Automatic Stats Tracking

Every pattern use updates its statistics:

- **Success**: When pattern matches, `success_count++` and `last_used_at` updated
- **Failure**: When no patterns match, `failure_count++` for first valid pattern
- **Invalid regex**: Skipped safely without affecting stats

These stats can be used to:
- Calculate quality metrics (e.g., `success_count / (success_count + failure_count)`)
- Identify underperforming patterns
- Auto-disable patterns with low success rates

### 4. Safe Learning

The system is designed to be safe and conservative:

- **No auto-enable**: New patterns created from corrections are `is_active = false` by default
- **No auto-deletion**: Bad patterns are only deactivated, not deleted
- **Human oversight**: Admin must manually review and enable learned patterns
- **Graceful degradation**: Falls back to hardcoded patterns if learned patterns fail

## Usage

### In Extraction Functions

All extraction functions now support learned patterns:

```typescript
// Price extraction with learned patterns
const priceInfo = await extractPrice(text, supabase);
console.log(priceInfo.amount);        // Extracted amount
console.log(priceInfo.patternId);     // ID of pattern that matched

// Date extraction with learned patterns
const dateInfo = await extractDate(text, supabase);
console.log(dateInfo.eventDate);      // ISO date string
console.log(dateInfo.patternId);      // ID of pattern that matched

// Time extraction with learned patterns
const timeInfo = await extractTime(text, supabase);
console.log(timeInfo.startTime);      // 24h format time
console.log(timeInfo.patternId);      // ID of pattern that matched

// Venue extraction with learned patterns
const venueInfo = await extractVenue(text, locationName, supabase);
console.log(venueInfo.venueName);     // Venue name
console.log(venueInfo.patternId);     // ID of pattern that matched

// Vendor detection with learned patterns
const vendorCheck = await isVendorPost(text, supabase);
console.log(vendorCheck.isVendor);    // true/false
console.log(vendorCheck.patternId);   // ID of pattern that matched
```

### Recording Feedback

When an admin corrects an extracted value, record feedback:

```typescript
import { recordExtractionFeedback } from './patternFetcher.ts';

await recordExtractionFeedback(supabase, {
  postId: 'uuid-of-instagram-post',
  field: 'price',
  rawText: 'Full post caption text',
  correctValue: '500',
  usedPatternId: 'pattern-id-that-was-used',  // nullable
  isCorrect: false  // The pattern was wrong
});
```

### Creating New Patterns

Add patterns manually via SQL:

```sql
-- Add a high-priority pattern for Filipino price format
INSERT INTO extraction_patterns (
  pattern_type, 
  pattern_regex, 
  pattern_description, 
  priority,
  confidence_score, 
  source,
  is_active
) VALUES (
  'price',
  '(?:presyo|halaga):\\s*₱(\\d+)',
  'Filipino price with label',
  5,  -- High priority
  0.8,
  'manual',
  true
);
```

## Pattern Types

### Supported Pattern Types

| Type | Description | Example Regex |
|------|-------------|---------------|
| `price` | Price/cost extraction | `₱\\s*(\\d+)` |
| `date` | Event date extraction | `(\\d{4}-\\d{2}-\\d{2})` |
| `time` | Event time extraction | `(\\d{1,2}:\\d{2})\\s*(am\|pm)` |
| `venue` | Venue/location extraction | `@([a-zA-Z0-9_]+)` |
| `vendor` | Vendor post detection | `vendor\\s+booth` |

### Pattern Best Practices

1. **Use capture groups**: Group 1 should contain the value to extract
   ```regex
   ₱\\s*(\\d+)  ✓ (captures just the number)
   ₱\\s*\\d+    ✗ (would capture entire match including ₱)
   ```

2. **Be specific**: Narrow patterns reduce false positives
   ```regex
   entrance fee:\\s*₱(\\d+)  ✓ (specific context)
   ₱(\\d+)                   ✗ (too broad, matches any peso amount)
   ```

3. **Test thoroughly**: Validate patterns against real captions before enabling

4. **Set appropriate priority**: Critical patterns should have lower priority numbers

## Monitoring & Maintenance

### View Pattern Performance

```sql
-- Top performing patterns by type
SELECT 
  pattern_type,
  pattern_description,
  success_count,
  failure_count,
  ROUND(success_count::numeric / NULLIF(success_count + failure_count, 0), 2) as success_rate,
  last_used_at
FROM extraction_patterns
WHERE is_active = true
ORDER BY pattern_type, success_count DESC;
```

### Identify Underperforming Patterns

```sql
-- Patterns with low success rate (after sufficient usage)
SELECT 
  id,
  pattern_type,
  pattern_description,
  pattern_regex,
  success_count,
  failure_count,
  ROUND(success_count::numeric / NULLIF(success_count + failure_count, 0), 2) as success_rate
FROM extraction_patterns
WHERE 
  is_active = true 
  AND (success_count + failure_count) > 10
  AND success_count::numeric / NULLIF(success_count + failure_count, 0) < 0.5
ORDER BY success_rate ASC;
```

### Deactivate Bad Patterns

```sql
-- Disable patterns with success rate below 30% after 20+ uses
UPDATE extraction_patterns
SET is_active = false
WHERE 
  (success_count + failure_count) > 20
  AND success_count::numeric / NULLIF(success_count + failure_count, 0) < 0.3;
```

## Future Enhancements

### Pattern Learning Pipeline

The `learn-patterns` edge function can analyze `extraction_feedback` to:

1. Group corrections by field type
2. Identify common value patterns
3. Generate new regex patterns (marked `is_active = false`)
4. Present patterns to admin for review/approval

### Pattern Quality Metrics

Add computed column for pattern quality:

```sql
ALTER TABLE extraction_patterns 
ADD COLUMN quality_score numeric GENERATED ALWAYS AS (
  CASE 
    WHEN (success_count + failure_count) = 0 THEN 0.5
    ELSE success_count::numeric / (success_count + failure_count)
  END
) STORED;
```

### Pattern Testing Interface

Build admin UI to:
- View all patterns by type
- Test patterns against sample text
- Enable/disable patterns
- View pattern performance metrics
- Approve auto-generated patterns

## Troubleshooting

### Pattern Not Matching

1. Check pattern is active: `is_active = true`
2. Check pattern type matches extraction function
3. Check confidence score >= 0.3 (minimum threshold)
4. Test regex in isolation to verify syntax
5. Check priority - higher priority patterns may match first

### Stats Not Updating

Stats updates are asynchronous (fire-and-forget). Check:
- Supabase connection is valid
- No errors in Deno function logs
- `last_used_at` should update even if counts don't (connection test)

### Performance Issues

- Limit patterns per type to ~20 (via `LIMIT` in fetchLearnedPatterns)
- Disable unused patterns regularly
- Add indexes on `pattern_type`, `priority`, and `is_active`

## Testing

Run pattern selection tests:

```bash
cd supabase/functions/scrape-instagram
deno test --allow-env patternFetcher.test.ts
```

All tests should pass, validating:
- Priority-based pattern selection
- Invalid regex handling
- Capture group extraction
- Empty pattern list handling
