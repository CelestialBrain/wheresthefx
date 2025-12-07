import { GoogleGenerativeAI } from '@google/generative-ai';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Environment variables (only 3 needed!)
const SUPABASE_URL = process.env.SUPABASE_URL;
const DATA_INGEST_TOKEN = process.env.DATA_INGEST_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const BATCH_SIZE = 10;
const DELAY_BETWEEN_BATCHES_MS = 2000;
const IMAGE_FETCH_TIMEOUT_MS = 15000;
const IMAGE_FETCH_RETRIES = 2;

// Initialize Gemini
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

// Results tracking
const results = {
  total: 0,
  processed: 0,
  events: 0,
  notEvents: 0,
  failed: 0,
  errors: [],
};

/**
 * Fetch image with timeout and retry
 */
async function fetchImageWithRetry(imageUrl, retries = IMAGE_FETCH_RETRIES) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
      
      const response = await fetch(imageUrl, { 
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      clearTimeout(timeout);
      
      if (response.ok) {
        return response;
      }
      
      if (attempt < retries - 1) {
        console.log(`    ⚠️ Image fetch attempt ${attempt + 1} failed (${response.status}), retrying...`);
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (err) {
      if (attempt < retries - 1) {
        console.log(`    ⚠️ Image fetch attempt ${attempt + 1} failed (${err.message}), retrying...`);
        await new Promise(r => setTimeout(r, 1000));
      } else {
        throw err;
      }
    }
  }
  throw new Error(`Failed to fetch image after ${retries} attempts`);
}

/**
 * Parse JSON with cleanup for common AI response issues
 */
function parseJSONWithCleanup(text) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  
  let jsonStr = jsonMatch[0];
  
  // First attempt: direct parse
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // Cleanup common JSON issues
    let cleaned = jsonStr
      // Remove control characters (ASCII 0-31 except newlines/tabs)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
      // Fix unescaped newlines in strings
      .replace(/(?<!\\)\n/g, '\\n')
      // Remove trailing commas before } or ]
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')
      // Fix single quotes to double quotes (careful with apostrophes)
      .replace(/:\s*'([^']*)'/g, ':"$1"')
      // Fix unquoted keys
      .replace(/(\{|,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
    
    try {
      return JSON.parse(cleaned);
    } catch (e2) {
      // Last resort: try to extract key fields manually
      console.log(`    ⚠️ JSON cleanup failed: ${e2.message}`);
      return null;
    }
  }
}

/**
 * Extract event data from image using Gemini Vision
 */
async function extractWithGeminiVision(imageUrl, caption, post = {}) {
  try {
    const imageResponse = await fetchImageWithRetry(imageUrl);
    
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString('base64');
    
    // Get today's date for context
    const today = new Date().toISOString().split('T')[0];
    const currentYear = new Date().getFullYear();
    
    // Calculate post age to detect historical posts
    const postTimestamp = post?.timestamp;
    const postDate = postTimestamp ? new Date(postTimestamp) : new Date();
    const postAgeInDays = Math.floor((Date.now() - postDate.getTime()) / (1000 * 60 * 60 * 24));
    const isOldPost = postAgeInDays > 30;
    
    const prompt = `You are an expert at extracting event information from Filipino Instagram event posters.

TODAY'S DATE: ${today}
INSTAGRAM POST DATE: ${postDate.toISOString().split('T')[0]} (${postAgeInDays} days ago)${isOldPost ? ' ⚠️ OLD POST - likely historical' : ''}

INSTAGRAM CAPTION:
"""
${caption || '(no caption)'}
"""

Extract ALL text visible in the image, then determine if this is an event announcement.

⚠️ CRITICAL: HISTORICAL POST DETECTION
- This post was made ${postAgeInDays} days ago
- If the extracted event date is BEFORE the post date, this is a HISTORICAL POST about a past event
- DO NOT increment the year! A "May 3" post from May 2025 is NOT a May 2026 event
- If the event date has already passed, set isEvent: false and note "Historical post - event already occurred"

CRITICAL VALIDATION RULES:
1. eventDate MUST be on or after the POST date (${postDate.toISOString().split('T')[0]}), not today
2. If an event date is in the past relative to TODAY (${today}), it's already passed - set isEvent: false
3. DO NOT auto-increment year for past dates! "May 3" in a May 5 post means May 3 (already passed), NOT next year
4. eventDate year MUST be ${currentYear} or ${currentYear + 1}
5. If you see past dates, check if it's a recurring event - if so, calculate the NEXT occurrence
6. DO NOT extract phone numbers as prices (e.g., 09171234567 is NOT a price)
7. DO NOT extract years as times (e.g., 2025 is NOT a time)
8. Times should be in HH:MM format (24-hour)
9. Prices in Philippines are typically ₱100-₱5000 for events

⚠️ NOT AN EVENT - Set isEvent: false if:
- This is a THANK YOU / RECAP post (contains "thank you", "merci", "what a night", "until next time")
- This is a THROWBACK post (contains "#tbt", "#throwback", "look back", "memories")
- This is a VENUE PROMO (contains "host your events", "book our space", "private events", "for bookings")
- This is a PRODUCT/MENU post (contains "new on the menu", "now serving", "try our", "limited edition")
- This is a CALL FOR APPLICATIONS (contains "calling all vendors", "now accepting applications", "apply now")
- Contains operating hours: "6PM — Tues to Sat", "Open Mon-Fri"
- Says "Every [day]" without a specific date
- Generic promo: "Visit us", "Come check out", "Be in the loop"
- Describes regular venue operations, not a unique event

⚠️ RECURRING VS MULTI-DAY - CRITICAL DISTINCTION:
- MULTI-DAY EVENT (is_recurring: false): "Nov 8-9", "Dec 27-30", "This weekend"
  These are ONE-TIME events that span multiple consecutive days
  → Set eventDate to first day, eventEndDate to last day
- RECURRING EVENT (is_recurring: true): ONLY if explicit pattern language exists:
  ✅ "Every Friday"
  ✅ "Weekly"
  ✅ "Monthly"
  ✅ "First Saturday of every month"
  ❌ "Friday and Saturday" (NOT recurring - just two days)
  ❌ "Nov 8-9" (NOT recurring - one-time multi-day)
  ❌ "This weekend" (NOT recurring - one-time)
- If eventDate and eventEndDate are just 2-3 days apart, is_recurring MUST be false

CONFIDENCE GUIDELINES:
- Set confidence >= 0.9 ONLY if all core fields (date, time, venue) are clearly visible in BOTH image AND caption
- Set confidence 0.8-0.89 if fields are clear in either image OR caption
- Set confidence 0.6-0.79 if you're interpreting date formats or inferring AM/PM
- Set confidence < 0.6 if you're making educated guesses - consider setting field to null instead

DATE EXTRACTION - ⚠️ CAREFUL WITH FORMATS:
- European/Philippine format: 05.12.2025 = December 5 (day.month.year), NOT May 12
- Validate extracted date against expected day-of-week: "Freaky Friday" must result in a Friday
- Look for: "DEC 15", "December 15", "12/15", "Dec 6-7" (multi-day)
- For relative dates ("tomorrow", "this Friday"), calculate from post date, not today
- If month has passed this year, assume next year ONLY if post is recent (within 7 days)
- ⚠️ RSVP DEADLINE detection: "RSVP by Dec 16" or "Register before Dec 10" - extract as rsvpDeadline, NOT eventDate

TIME EXTRACTION:
- Look for: "8PM", "9:00 PM", "DOORS OPEN 7PM", "21:00"
- "12MN", "12 midnight", "12 mn" = "00:00" (midnight)
- TIME AMBIGUITY - Infer AM/PM from context:
  * Bar/club/party/concert: 8, 9, 10 → PM (20:00, 21:00, 22:00)
  * Market/fair/yoga/run: 7, 8, 9 → AM (07:00, 08:00, 09:00)

VENUE/LOCATION - ⚠️ STRICT RULES:
- Extract the ACTUAL venue name from the post content
- DO NOT use @mentions as venues (those are usually performers/sponsors)
- DO NOT use the posting account username as venue
- DO NOT guess or make up venue names - if unclear, set to null
- Vague venues should be flagged: "TBA", "DM for details", "secret location", "my bar", "the venue"
- If venue is just a generic word like "cafe" or "bar", set to null

PRICE EXTRACTION (ENHANCED):
- Single price: "₱500", "P500", "Php500" → price: 500, priceMin: 500, priceMax: 500
- Range: "₱300-500" → priceMin: 300, priceMax: 500, price: 300
- Tiered pricing: "₱500 GA / ₱1500 VIP" → priceMin: 500, priceMax: 1500, priceNotes: "GA ₱500, VIP ₱1500"
- Conditional: "Free before 10PM, ₱300 after" → priceMin: 0, priceMax: 300, priceNotes: "Free before 10PM, ₱300 after", isFree: true
- "FREE", "LIBRE", "Walang bayad" → isFree: true, price: 0, priceMin: 0, priceMax: 0
- ⚠️ is_free rules:
  - ONLY set isFree: true if explicit free language found: "FREE", "LIBRE", "Free entry", "No cover"
  - If you see prices, tickets, presale, door charge → isFree: false
  - If unsure, default to isFree: false

Categories: nightlife, music, art_culture, markets, food, workshops, community, comedy, other

Respond in JSON only:
{
  "ocrText": "all text extracted from image",
  "isEvent": true,
  "eventTitle": "...",
  "eventDate": "YYYY-MM-DD",
  "eventEndDate": "YYYY-MM-DD or null for multi-day",
  "eventTime": "HH:MM",
  "endTime": "HH:MM or null",
  "venueName": "venue name only, or null if unclear",
  "venueAddress": "full address if visible",
  "price": 0,
  "priceMin": 0,
  "priceMax": 0,
  "priceNotes": "tier details or null",
  "isFree": false,
  "category": "nightlife",
  "confidence": 0.85,
  "isRecurring": false,
  "recurrencePattern": "weekly:friday or null",
  "rsvpDeadline": "YYYY-MM-DD if RSVP deadline mentioned, null otherwise",
  "isHistoricalPost": false,
  "reasoning": "Explain what indicators you found (date, time, venue, event-type words) or why this is NOT an event. If historical, explain why."
}`;

    const result = await model.generateContent([
      { text: prompt },
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Image,
        },
      },
    ]);

    const text = result.response.text();
    const parsed = parseJSONWithCleanup(text);
    
    if (parsed) {
      return parsed;
    }
    
    console.log(`    ⚠️ Could not parse JSON from vision response`);
  } catch (err) {
    console.log(`    ⚠️ Vision extraction failed: ${err.message}`);
  }
  
  return null;
}

/**
 * Send batch of processed posts to Edge Function
 */
async function sendBatchToEdgeFunction(posts, runId, batchNumber, totalBatches, preFilterRejections = []) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/scrape-instagram`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DATA_INGEST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mode: 'ingest',
      posts: posts,
      runId: runId,
      isFirstBatch: batchNumber === 1,
      isLastBatch: batchNumber === totalBatches,
      batchNumber: batchNumber,
      totalBatches: totalBatches,
      // Only include pre-filter rejections on first batch
      ...(batchNumber === 1 && preFilterRejections.length > 0 && { preFilterRejections }),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Edge function error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

/**
 * Process a single post with Gemini Vision
 */
async function processPost(post) {
  const caption = post.caption || '';
  const imageUrl = post.displayUrl || post.imageUrl;
  
  // Use Gemini Vision for image text extraction
  // Pass full post context for historical post detection
  let aiResult = null;
  if (imageUrl) {
    aiResult = await extractWithGeminiVision(imageUrl, caption, post);
  }
  
  // Post-process AI result for historical posts
  if (aiResult) {
    // If AI marked as historical, mark as not an event
    if (aiResult.isHistoricalPost) {
      aiResult.isEvent = false;
      console.log(`    📜 Historical post detected - marking as not event`);
    }
    
    // Smart historical detection using eventEndDate for multi-day events
    if (aiResult.eventDate && post.timestamp) {
      const eventDate = new Date(aiResult.eventDate);
      // Use eventEndDate if available (for multi-day events), otherwise use eventDate
      const effectiveEndDate = aiResult.eventEndDate 
        ? new Date(aiResult.eventEndDate) 
        : eventDate;
      const postDate = new Date(post.timestamp);
      const today = new Date();
      today.setHours(23, 59, 59, 999); // End of today for fair comparison
      
      const postAgeInDays = Math.floor((Date.now() - postDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Only mark as historical if the event has COMPLETELY ENDED (using effectiveEndDate)
      // AND the event end date is before TODAY (not before post date - same-day posts are valid!)
      if (effectiveEndDate < today && effectiveEndDate < postDate) {
        // Event ended before the post was made - this is definitely a recap/historical post
        aiResult.isEvent = false;
        aiResult.isHistoricalPost = true;
        aiResult.reasoning = (aiResult.reasoning || '') + ' [Auto-detected: Event ended before post date = historical recap]';
        console.log(`    📜 Event end date (${aiResult.eventEndDate || aiResult.eventDate}) before post date - marking as historical`);
      }
      
      // Safety net: If post is OLD (>30 days) AND event has completely passed, it's historical
      if (postAgeInDays > 30 && effectiveEndDate < today) {
        aiResult.isEvent = false;
        aiResult.isHistoricalPost = true;
        aiResult.reasoning = (aiResult.reasoning || '') + ` [Auto-detected: Old post (${postAgeInDays} days) with completed event = historical]`;
        console.log(`    📜 Old post with past event date - marking as historical`);
      }
    }
  }
  
  return {
    postId: post.id || post.shortCode,
    shortCode: post.shortCode,
    caption: caption,
    imageUrl: imageUrl,
    ownerUsername: post.ownerUsername,
    timestamp: post.timestamp,
    locationName: post.locationName,
    likesCount: post.likesCount,
    commentsCount: post.commentsCount,
    aiExtraction: aiResult,
  };
}

/**
 * Main function
 */
async function main() {
  const datasetUrl = process.argv[2];
  
  if (!datasetUrl) {
    console.error('❌ Dataset URL required.');
    console.error('Usage: node process-scrape.js <dataset_url>');
    console.error('Example: node process-scrape.js "https://api.apify.com/v2/datasets/ABC123/items?format=json"');
    process.exit(1);
  }

  // Validate environment variables
  if (!SUPABASE_URL) {
    console.error('❌ SUPABASE_URL not set');
    process.exit(1);
  }
  if (!DATA_INGEST_TOKEN) {
    console.error('❌ DATA_INGEST_TOKEN not set');
    process.exit(1);
  }
  if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY not set');
    process.exit(1);
  }

  console.log('🚀 Starting Instagram scrape processing...\n');
  console.log(`📊 Dataset URL: ${datasetUrl}`);
  
  // Fetch posts directly from Apify URL (no API key needed!)
  console.log('\n📥 Fetching posts from Apify...');
  
  let posts;
  try {
    const response = await fetch(datasetUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }
    posts = await response.json();
  } catch (err) {
    console.error(`❌ Failed to fetch dataset: ${err.message}`);
    process.exit(1);
  }
  
  if (!Array.isArray(posts)) {
    console.error('❌ Dataset did not return an array of posts');
    process.exit(1);
  }
  
  // Filter out posts without valid identifiers or images, and collect rejections
  const preFilterRejections = [];
  const validPosts = posts.filter(post => {
    const hasIdentifier = post.shortCode || post.id;
    const hasImage = post.displayUrl || post.imageUrl;
    
    if (!hasIdentifier || !hasImage) {
      const reason = !hasIdentifier ? 'MISSING_IDENTIFIER' : 'MISSING_IMAGE';
      console.log(`  ⚠️ Skipping post: ${reason}`);
      
      // Collect rejection data for database logging
      preFilterRejections.push({
        reason: reason,
        rawData: {
          availableKeys: Object.keys(post).slice(0, 15), // First 15 keys for context
          shortCode: post.shortCode || null,
          id: post.id || null,
          hasDisplayUrl: !!post.displayUrl,
          hasImageUrl: !!post.imageUrl,
          ownerUsername: post.ownerUsername || null,
          type: post.type || null,
        }
      });
      return false;
    }
    return true;
  });
  
  const skippedCount = preFilterRejections.length;
  if (skippedCount > 0) {
    console.log(`  ⚠️ Skipped ${skippedCount} posts without valid identifier or image`);
  }
  
  results.total = validPosts.length;
  console.log(`✅ Fetched ${posts.length} posts (${validPosts.length} valid)\n`);
  
  // Generate a single run ID for all batches
  const runId = crypto.randomUUID();
  console.log(`📋 Run ID: ${runId}`);
  
  // Process in batches
  const totalBatches = Math.ceil(validPosts.length / BATCH_SIZE);
  
  for (let i = 0; i < validPosts.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = validPosts.slice(i, i + BATCH_SIZE);
    
    console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} posts)`);
    console.log('─'.repeat(50));
    
    // Process each post with Gemini Vision
    const processedPosts = [];
    for (const post of batch) {
      try {
        const postIdentifier = post.shortCode || post.id || `unknown-${Date.now()}`;
        console.log(`  🔍 Processing: ${postIdentifier}`);
        const processed = await processPost(post);
        processedPosts.push(processed);
        
        if (processed.aiExtraction?.isEvent) {
          results.events++;
          console.log(`     ✅ Event: ${processed.aiExtraction.eventTitle || 'Untitled'}`);
        } else {
          results.notEvents++;
          console.log(`     📝 Not an event`);
        }
        results.processed++;
      } catch (err) {
        console.log(`     ❌ Failed: ${err.message}`);
        results.failed++;
        results.errors.push({ postId: post.id || post.shortCode, error: err.message });
      }
    }
    
    // Send batch to Edge Function for database storage
    try {
      console.log(`\n  📤 Sending batch ${batchNum}/${totalBatches} to Edge Function...`);
      // Pass preFilterRejections only on first batch
      const response = await sendBatchToEdgeFunction(processedPosts, runId, batchNum, totalBatches, preFilterRejections);
      console.log(`  ✅ Batch saved: ${response.saved || 0} posts`);
    } catch (err) {
      console.log(`  ❌ Edge function error: ${err.message}`);
      results.errors.push({ batch: batchNum, error: err.message });
    }
    
    // Progress summary
    console.log(`\n📊 Progress: ${results.processed}/${results.total}`);
    
    // Delay between batches (except last)
    if (i + BATCH_SIZE < validPosts.length) {
      console.log(`⏳ Waiting ${DELAY_BETWEEN_BATCHES_MS / 1000}s before next batch...`);
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
    }
  }
  
  // Save results to file
  const resultsDir = path.join(process.cwd(), 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(
    path.join(resultsDir, 'summary.json'),
    JSON.stringify({ ...results, completedAt: new Date().toISOString() }, null, 2)
  );
  
  // Final summary
  console.log('\n' + '═'.repeat(50));
  console.log('🎉 PROCESSING COMPLETE!');
  console.log('═'.repeat(50));
  console.log(`📊 Total:      ${results.total}`);
  console.log(`✅ Processed:  ${results.processed}`);
  console.log(`📅 Events:     ${results.events}`);
  console.log(`📝 Not Events: ${results.notEvents}`);
  console.log(`❌ Failed:     ${results.failed}`);
  console.log('═'.repeat(50));
  
  if (results.failed > 0) {
    console.log('\n⚠️ Failed items:');
    results.errors.slice(0, 10).forEach(e => {
      console.log(`   - ${e.postId || `Batch ${e.batch}`}: ${e.error}`);
    });
  }
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
