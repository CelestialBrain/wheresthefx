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
 * Extract event data from image using Gemini Vision
 */
async function extractWithGeminiVision(imageUrl, caption) {
  try {
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      console.log(`    ⚠️ Failed to fetch image: ${imageResponse.status}`);
      return null;
    }
    
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString('base64');
    
    // Get today's date for context
    const today = new Date().toISOString().split('T')[0];
    const currentYear = new Date().getFullYear();
    
    const prompt = `You are an expert at extracting event information from Filipino Instagram event posters.

TODAY'S DATE: ${today}

INSTAGRAM CAPTION:
"""
${caption || '(no caption)'}
"""

Extract ALL text visible in the image, then determine if this is an event announcement.

CRITICAL VALIDATION RULES:
1. eventDate MUST be on or after today (${today})
2. eventDate MUST be within 6 months of today
3. eventDate year MUST be ${currentYear} or ${currentYear + 1}
4. If you see past dates, check if it's a recurring event - if so, calculate the NEXT occurrence
5. DO NOT extract phone numbers as prices (e.g., 09171234567 is NOT a price)
6. DO NOT extract years as times (e.g., 2025 is NOT a time)
7. Times should be in HH:MM format (24-hour)
8. Prices in Philippines are typically ₱100-₱5000 for events

CONFIDENCE GUIDELINES:
- Set confidence >= 0.9 ONLY if all core fields (date, time, venue) are clearly visible
- Set confidence 0.7-0.89 if most fields are clear but some are inferred
- Set confidence 0.5-0.69 if you're making educated guesses
- Set confidence < 0.5 if you're very uncertain

DATE EXTRACTION:
- Look for: "DEC 15", "December 15", "12/15", "Dec 6-7" (multi-day)
- For relative dates ("tomorrow", "this Friday"), calculate from today: ${today}
- If month has passed this year, assume next year (e.g., "Jan 5" in December → ${currentYear + 1}-01-05)

TIME EXTRACTION:
- Look for: "8PM", "9:00 PM", "DOORS OPEN 7PM", "21:00"
- TIME AMBIGUITY - Infer AM/PM from context:
  * Bar/club/party/concert: 8, 9, 10 → PM (20:00, 21:00, 22:00)
  * Market/fair/yoga/run: 7, 8, 9 → AM (07:00, 08:00, 09:00)

VENUE/LOCATION:
- Look for venue names, addresses, 📍 symbols
- DO NOT use @mentions as venues (those are usually performers/sponsors)
- DO NOT use the posting account username as venue

PRICE:
- "₱500", "P500", "Php500", "PHP 500" → 500
- "₱300-500" → 300 (use minimum/presale)
- "FREE", "LIBRE", "Walang bayad" → isFree: true, price: 0

NOT AN EVENT - Set isEvent: false if:
- Contains operating hours: "6PM — Tues to Sat", "Open Mon-Fri"
- Says "Every [day]" without a specific date
- Generic promo: "Visit us", "Come check out", "Be in the loop"
- Describes regular venue operations, not a unique event

COMMON MISTAKES TO AVOID:
- "@photographer_name" is NOT a venue
- "DM for reservations" numbers are NOT prices
- Sponsor logos/handles are NOT venue names

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
  "venueName": "venue name only",
  "venueAddress": "full address if visible",
  "price": 0,
  "isFree": true,
  "category": "nightlife",
  "confidence": 0.85,
  "reasoning": "Explain what indicators you found (date, time, venue, event-type words) or why this is NOT an event."
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
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    console.log(`    ⚠️ Vision extraction failed: ${err.message}`);
  }
  
  return null;
}

/**
 * Send batch of processed posts to Edge Function
 */
async function sendBatchToEdgeFunction(posts, runId, batchNumber, totalBatches) {
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
  let aiResult = null;
  if (imageUrl) {
    aiResult = await extractWithGeminiVision(imageUrl, caption);
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
  
  results.total = posts.length;
  console.log(`✅ Fetched ${posts.length} posts\n`);
  
  // Generate a single run ID for all batches
  const runId = crypto.randomUUID();
  console.log(`📋 Run ID: ${runId}`);
  
  // Process in batches
  const totalBatches = Math.ceil(posts.length / BATCH_SIZE);
  
  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = posts.slice(i, i + BATCH_SIZE);
    
    console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} posts)`);
    console.log('─'.repeat(50));
    
    // Process each post with Gemini Vision
    const processedPosts = [];
    for (const post of batch) {
      try {
        console.log(`  🔍 Processing: ${post.shortCode || post.id}`);
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
      const response = await sendBatchToEdgeFunction(processedPosts, runId, batchNum, totalBatches);
      console.log(`  ✅ Batch saved: ${response.saved || 0} posts`);
    } catch (err) {
      console.log(`  ❌ Edge function error: ${err.message}`);
      results.errors.push({ batch: batchNum, error: err.message });
    }
    
    // Progress summary
    console.log(`\n📊 Progress: ${results.processed}/${results.total}`);
    
    // Delay between batches (except last)
    if (i + BATCH_SIZE < posts.length) {
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
