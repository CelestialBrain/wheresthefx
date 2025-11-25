# Implementation Summary - Learned Pattern System

## What Was Done

This PR implements a fully functional learned pattern system for the Instagram scraper that:

1. **Prioritizes patterns intelligently** - Patterns are tried in order of priority (lower number = higher priority) then confidence score
2. **Tracks pattern performance** - Success/failure counts and last_used_at are automatically updated
3. **Supports all extraction types** - price, date, time, venue, and vendor detection all use learned patterns
4. **Maintains pattern IDs** - All extraction results include the pattern ID used for debugging/analytics
5. **Enables feedback recording** - Admin corrections can be saved for future pattern learning

## Files Modified

- `supabase/functions/scrape-instagram/patternFetcher.ts` - Core pattern engine
- `supabase/functions/scrape-instagram/extractionUtils.ts` - Extended venue/vendor to use patterns
- `supabase/functions/scrape-instagram/logger.ts` - Added pattern ID logging
- `supabase/functions/scrape-instagram/index.ts` - Updated async calls and pattern ID propagation

## Files Created

- `supabase/functions/scrape-instagram/patternFetcher.test.ts` - 7 comprehensive tests (all passing)
- `supabase/functions/scrape-instagram/LEARNED_PATTERNS.md` - Complete documentation
- `supabase/functions/scrape-instagram/IMPLEMENTATION_SUMMARY.md` - This file

## Required Database Changes

You MUST run these migrations for the system to work properly:

### 1. Add Priority Field (REQUIRED)

```sql
ALTER TABLE public.extraction_patterns 
ADD COLUMN IF NOT EXISTS priority integer DEFAULT 100;

CREATE INDEX IF NOT EXISTS idx_extraction_patterns_priority 
ON public.extraction_patterns(priority ASC);
```

### 2. Create Feedback Table (RECOMMENDED)

```sql
CREATE TABLE IF NOT EXISTS public.extraction_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.instagram_posts(id) ON DELETE CASCADE,
  field text NOT NULL,
  raw_text text NOT NULL,
  correct_value text,
  used_pattern_id uuid REFERENCES public.extraction_patterns(id) ON DELETE SET NULL,
  is_correct boolean NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_extraction_feedback_field ON extraction_feedback(field);
CREATE INDEX idx_extraction_feedback_post ON extraction_feedback(post_id);
CREATE INDEX idx_extraction_feedback_created ON extraction_feedback(created_at DESC);
```

## How to Test

### 1. Run Deno Tests

```bash
cd supabase/functions/scrape-instagram
deno test --allow-env patternFetcher.test.ts
```

All 7 tests should pass.

### 2. Test Pattern Extraction

Create a test pattern in your database:

```sql
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
  'ticket:\\s*₱(\\d+)',
  'Filipino ticket price',
  5,
  0.9,
  'manual',
  true
);
```

Then run the scraper and check the logs - you should see the pattern ID in the scraper_logs table.

### 3. Monitor Pattern Performance

```sql
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

## How It Works

### Pattern Selection Flow

1. User calls `extractPrice(text, supabase)` or similar function
2. Function calls `extractWithLearnedPatterns(supabase, text, 'price')`
3. Patterns are fetched from database ordered by priority ASC, confidence DESC
4. Each pattern is tried in order until one matches
5. On match:
   - Value is extracted from regex group 1 (or full match if no group)
   - Pattern ID is returned with the value
   - Success count is incremented asynchronously
6. On no match:
   - Failure count is incremented for first valid pattern
   - Hardcoded fallback patterns are tried
   - Returns null values

### Stats Tracking

Stats are updated asynchronously (fire-and-forget) to avoid blocking:

```typescript
// Inside extractWithLearnedPatterns
if (match) {
  updatePatternStats(supabase, pattern.id, true);  // success
  return { value, patternId: pattern.id };
}

// If no patterns matched
updatePatternStats(supabase, firstValidPattern, false);  // failure
```

This means stats updates never slow down the scraper.

## Best Practices

### Creating Patterns

1. **Use capture groups** for extracting specific parts:
   ```regex
   ₱\\s*(\\d+)     ✓ Good - captures just the number
   ₱\\s*\\d+       ✗ Bad - would capture ₱500 instead of 500
   ```

2. **Set appropriate priority**:
   - High priority (1-10): Critical, highly specific patterns
   - Medium priority (11-50): General purpose patterns
   - Low priority (51-100): Fallback patterns

3. **Test before enabling**:
   ```sql
   -- Create with is_active = false
   INSERT INTO extraction_patterns (...) VALUES (..., false);
   
   -- Test manually, then enable
   UPDATE extraction_patterns SET is_active = true WHERE id = 'uuid';
   ```

### Recording Feedback

When an admin corrects an extraction:

```typescript
import { recordExtractionFeedback } from './patternFetcher.ts';

// User corrected price from 500 to 550
await recordExtractionFeedback(supabase, {
  postId: post.id,
  field: 'price',
  rawText: post.caption,
  correctValue: '550',
  usedPatternId: '...', // from extraction result
  isCorrect: false
});
```

This data can later be used to:
- Identify failing patterns
- Generate new patterns automatically
- Calculate pattern accuracy

## Common Issues

### Pattern Not Matching

1. Check `is_active = true`
2. Check `confidence_score >= 0.3`
3. Test regex separately
4. Check priority - a higher priority pattern may match first

### Stats Not Updating

Stats update asynchronously, so:
1. Check Supabase connection
2. Look for errors in function logs
3. Verify `last_used_at` updates (simpler than counts)

### Tests Failing

Tests are self-contained and don't need network access. If they fail:
1. Check Deno is installed: `deno --version`
2. Run with: `deno test --allow-env patternFetcher.test.ts`
3. Check for syntax errors in patternFetcher.ts

## Future Enhancements

### Recommended Next Steps

1. **Build Admin UI** for pattern management:
   - View all patterns
   - Test patterns against sample text
   - Enable/disable patterns
   - View performance metrics

2. **Auto-pattern generation**:
   - Analyze extraction_feedback table
   - Generate new patterns from corrections
   - Mark as `is_active = false` for review

3. **Pattern quality metrics**:
   - Auto-disable patterns with success rate < 30% after 20+ uses
   - Highlight patterns needing review
   - Send alerts for failing patterns

4. **A/B testing**:
   - Test new patterns against old ones
   - Compare success rates before enabling

## Support

For questions or issues:

1. Check `LEARNED_PATTERNS.md` for detailed documentation
2. Review test cases in `patternFetcher.test.ts`
3. Look at example patterns in the migrations
4. Check scraper_logs for pattern IDs and debugging info

## Security

✅ CodeQL scan passed - no security vulnerabilities found
✅ All tests passing
✅ No auto-enabling of patterns (admin approval required)
✅ Safe regex handling (invalid patterns skipped)
✅ Async stats updates (non-blocking)
