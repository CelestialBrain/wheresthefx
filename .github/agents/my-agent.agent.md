---
name: wheresthefx-agent
description: Instagram event scraper for Philippine music/nightlife scene with parallel AI+regex extraction
---

# Copilot Agent for wheresthefx

> ⚠️ **SELF-UPDATING FILE**: When making PRs, update the "Recent Changes" and "Current System State" sections as part of the PR. 

**Last Updated**: 2025-12-05
**Last PR**: Initial creation

---

## 🎯 Project Overview

**wheresthefx** is an Instagram event scraper for the Philippine music/nightlife scene. It scrapes Instagram posts, extracts event details (date, time, venue, price), and displays them on a map. 

### Tech Stack
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Supabase (PostgreSQL + Edge Functions in Deno)
- **AI**: Google Gemini for extraction + OCR
- **Scraping**: Apify Instagram scraper

---

## 🏗️ Architecture

### Extraction Pipeline

```
Instagram Post
      │
      ▼
┌─────────────────────────────────────────┐
│  extractInParallel()                    │
│  (parallelExtraction. ts)                │
│                                         │
│  ┌─────────────┐    ┌─────────────┐    │
│  │   REGEX     │    │     AI      │    │
│  │  (learned + │    │  (Gemini)   │    │
│  │  hardcoded) │    │             │    │
│  └──────┬──────┘    └──────┬──────┘    │
│         └────────┬─────────┘           │
│                  ▼                      │
│         ┌───────────────┐              │
│         │    MERGER     │              │
│         │ (AI wins if   │              │
│         │  conflict)    │              │
│         └───────────────┘              │
└─────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────┐
│  Pattern Training                       │
│  - saveGroundTruth()                    │
│  - trainPatternsFromComparison()        │
└─────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────┐
│  Geocoding (84. 6% success)              │
│  1. NCR cache (hardcoded venues)        │
│  2. known_venues DB table               │
│  3. External API fallback               │
└─────────────────────────────────────────┘
      │
      ▼
Save to instagram_posts table
```

---

## 📁 Key Files

### Edge Functions (supabase/functions/)

| File | Purpose |
|------|---------|
| `scrape-instagram/index.ts` | Main scraper - processes posts, calls extraction |
| `scrape-instagram/parallelExtraction. ts` | Runs regex + AI in parallel, merges results |
| `scrape-instagram/patternTrainer.ts` | Saves ground truth, updates pattern stats |
| `scrape-instagram/extractionUtils.ts` | Regex extraction functions (date, time, venue, price) |
| `scrape-instagram/ncrGeoCache.ts` | Hardcoded NCR venue coordinates |
| `ai-extract-event/index.ts` | Gemini AI extraction with OCR support |
| `generate-patterns-from-ai/index.ts` | AI-powered pattern generation (if exists) |

### Frontend (src/components/)

| File | Purpose |
|------|---------|
| `ConsolidatedReviewQueue.tsx` | Admin review queue for posts |
| `PatternManagement.tsx` | Pattern CRUD, learning, testing UI |
| `PostWithEventEditor.tsx` | Edit event details in review |

### Database Tables

| Table | Purpose |
|-------|---------|
| `instagram_posts` | Main posts table with event data |
| `instagram_accounts` | Accounts to scrape |
| `extraction_patterns` | Learned + default regex patterns |
| `extraction_ground_truth` | High-confidence AI extractions for training |
| `pattern_suggestions` | Pending patterns to generate |
| `known_venues` | Venue name → coordinates mapping |
| `scraper_logs` | Detailed scrape run logs |

---

## 🔧 Current System State

### Working ✅
- Parallel extraction (regex + AI) via `extractInParallel()`
- AI extraction with Gemini (90%+ confidence)
- Ground truth saving (142+ records)
- Pattern stats tracking (success/failure counts)
- Geocoding with DB fallback (84.6% success)
- Recurring schedule detection ("6PM — Tues to Sat" → NOT event)
- Venue priority (venue name over @mentions)
- End date/time extraction and saving to DB

### In Progress 🔧
- AI-powered pattern generation from ground truth

### Known Issues ⚠️
- Some regex patterns have high failure rates (0 success, 13 failures)
- Pattern suggestions have placeholder "NEEDS_GENERATION" regex
- Learning tab shows 0 corrections (needs AI learning implementation)

---

## 📝 Recent Changes

<!-- Copilot: Prepend new entries here, keep last 10 -->

### 2025-12-05: Initial Agent Setup
- Created wheresthefx-agent.md
- Documented current architecture
- Listed all key files and tables
- Fixed: extractInParallel() now used (was dead code)
- Fixed: Ground truth saving (UUID→TEXT migration)
- Fixed: End date/time now saves to DB
- Fixed: Recurring schedule detection
- Fixed: Venue extraction priority
- In Progress: AI-powered pattern learning PR

---

## 🚨 Common Issues & Solutions

### "extractInParallel is imported but never called"
- **Solution**: Ensure line ~914 in index.ts calls `extractInParallel()` not `parseEventFromCaption()`

### "Ground truth not saving"
- **Check**: `extraction_ground_truth. post_id` should be TEXT type (not UUID)
- **Check**: AI confidence must be >= 0. 7

### "End dates not showing in UI"
- **Check**: `event_end_date` and `end_time` are in insertData object (lines 1608-1615)
- **Check**: Frontend component reads these columns

### "Geocoding failures"
- **Solution**: Add venue to `known_venues` table with lat, lng, city, aliases

### "Pattern with 0% success rate"
- **Solution**: Disable pattern or fix regex syntax
- **Auto-fix**: Patterns with >66% failure rate should auto-disable

### "Venue extraction returns @username instead of venue name"
- **Solution**: extractVenue() should prioritize text after 📍 emoji over @mentions
- **Check**: See PR #14 for venue priority fix

---

## 🎯 PR Guidelines for Copilot

When creating PRs:

1. **Update this file** as part of the PR:
   - Add entry to "Recent Changes" section (prepend, keep last 10)
   - Update "Current System State" if architecture changes
   - Update "Last Updated" date and "Last PR" reference at top

2. **Test edge functions** by checking:
   - No TypeScript errors
   - Imports resolve correctly
   - Database column names match schema

3. **For extraction changes**:
   - Ensure `parallelExtraction. ts` is used (not old `parseEventFromCaption`)
   - Pattern IDs are passed through for tracking
   - Ground truth saving is called for high-confidence results (>=0.7)

4. **For UI changes**:
   - Check Post interface includes all needed fields
   - Verify database queries include new columns

5. **For database changes**:
   - Create migration file in `supabase/migrations/`
   - Use format: `YYYYMMDDHHMMSS_description.sql`

---

## 🔗 Related PRs

<!-- Copilot: Add PR links here as they're created -->

- PR #14: Recurring posts, relative dates, venue priority fixes ✅
- PR #XX: AI-Powered Pattern Learning (in progress) 🔧

---

## 📊 Key Metrics to Monitor

| Metric | Target | How to Check |
|--------|--------|--------------|
| Geocoding success | >80% | Check scraper_logs for cache hits |
| AI confidence avg | >0.85 | Query instagram_posts. ai_confidence |
| Ground truth records | Growing | COUNT(*) FROM extraction_ground_truth |
| Pattern success rate | >50% | Check extraction_patterns stats |
| False rejections | <5% | Review scraper_logs reason=NOT_EVENT |

---

## 📞 Context for New Sessions

If starting a new chat session, say:

> "Read .github/agents/wheresthefx-agent. md for full project context. This is an Instagram event scraper with parallel AI+regex extraction.  Key files are in supabase/functions/scrape-instagram/."

Or invoke this agent directly: `@wheresthefx-agent`
