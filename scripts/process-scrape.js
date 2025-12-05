import { ApifyClient } from 'apify-client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const GITHUB_INGEST_TOKEN = process.env.GITHUB_INGEST_TOKEN;
const APIFY_API_KEY = process.env.APIFY_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Validate environment
if (!SUPABASE_URL) {
  console.error('❌ SUPABASE_URL must be set');
  process.exit(1);
}
if (!GITHUB_INGEST_TOKEN) {
  console.error('❌ GITHUB_INGEST_TOKEN must be set');
  process.exit(1);
}
if (!APIFY_API_KEY) {
  console.error('❌ APIFY_API_KEY must be set');
  process.exit(1);
}
if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY must be set');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Configuration
const BATCH_SIZE = 10;
const DELAY_MS = 2000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

// Results tracking
const results = {
  processed: 0,
  saved: 0,
  failed: 0,
  skipped: 0,
  errors: [],
  startTime: new Date().toISOString(),
};

/**
 * Fetch image and convert to base64
 */
async function fetchImageAsBase64(imageUrl) {
  const response = await fetch(imageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    signal: AbortSignal.timeout(30000),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer).toString('base64');
}

/**
 * Extract event data using Gemini Vision API
 */
async function extractWithGeminiVision(imageUrl, caption) {
  const base64Image = await fetchImageAsBase64(imageUrl);
  
  // Calculate dates for context
  const now = new Date();
  const currentYear = now.getFullYear();
  const today = now.toISOString().split('T')[0];
  
  const prompt = `Analyze this Instagram event poster image AND the caption.

Caption: ${caption || '(no caption)'}

Extract ALL text visible in the image, then determine:
1. Is this an event announcement? (true/false)
2. Event title
3. Event date (YYYY-MM-DD format)
4. Event time (HH:MM 24hr format)
5. Venue name
6. Venue address
7. Ticket price (number, 0 if free)
8. Category: nightlife, music, art_culture, markets, food, workshops, community, comedy, or other

TODAY'S DATE: ${today}

Filipino event posters often have stylized text. Look for:
- Dates: "DEC 15", "December 15", "12/15"
- Times: "8PM", "9:00 PM", "DOORS OPEN 7PM"
- Prices: "₱500", "PHP 500", "FREE ENTRY"

YEAR INFERENCE:
- If month/day has already passed this year → assume next year
- "Jan 5" posted in December ${currentYear} → January 5, ${currentYear + 1}

Respond in JSON only:
{
  "ocrText": "all text from image",
  "isEvent": true,
  "eventTitle": "...",
  "eventDate": "2025-12-15",
  "eventTime": "20:00",
  "venueName": "...",
  "venueAddress": "...",
  "price": 0,
  "isFree": true,
  "category": "nightlife",
  "confidence": 0.85
}`;

  const result = await model.generateContent([
    { text: prompt },
    { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
  ]);

  const response = result.response;
  let text = response.text().trim();
  
  // Clean up response
  if (text.startsWith('```json')) text = text.slice(7);
  if (text.startsWith('```')) text = text.slice(3);
  if (text.endsWith('```')) text = text.slice(0, -3);
  text = text.trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in Gemini response');
  }
  
  return JSON.parse(jsonMatch[0]);
}

/**
 * Send batch of posts to Edge Function
 */
async function sendBatchToEdgeFunction(posts) {
  let lastError;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/scrape-instagram`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_INGEST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode: 'ingest', posts }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Edge function error: ${response.status} - ${errorText}`);
      }
      
      return response.json();
    } catch (err) {
      lastError = err;
      console.error(`  ⚠️ Batch send attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
      
      if (attempt < MAX_RETRIES) {
        console.log(`  ⏳ Retrying in ${RETRY_DELAY_MS / 1000}s...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }
  
  throw lastError;
}

/**
 * Test connection to Edge Function
 */
async function testConnection() {
  console.log('🔗 Testing connection to Edge Function...');
  
  const response = await fetch(`${SUPABASE_URL}/functions/v1/scrape-instagram`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GITHUB_INGEST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mode: 'ping' }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Connection test failed: ${response.status} - ${errorText}`);
  }
  
  const result = await response.json();
  if (result.success && result.message === 'pong') {
    console.log('✅ Connection successful\n');
    return true;
  }
  
  throw new Error('Unexpected ping response');
}

/**
 * Process a single post with Gemini Vision
 */
async function processPost(post, index, total) {
  const postId = post.id || post.shortCode || `unknown-${index}`;
  
  console.log(`  [${index + 1}/${total}] Processing: ${postId}`);
  
  // Skip error items
  if (post.error || post.errorDescription) {
    console.log(`    ⏭️ Skipping error item`);
    results.skipped++;
    return null;
  }
  
  // Get username
  let username = post.ownerUsername?.trim().toLowerCase();
  if (!username && post.inputUrl) {
    const match = post.inputUrl.match(/instagram\.com\/([^/?]+)/);
    if (match) username = decodeURIComponent(match[1]).toLowerCase();
  }
  
  if (!username) {
    console.log(`    ⏭️ Skipping: no username`);
    results.skipped++;
    return null;
  }
  
  // Get image URL
  const imageUrl = post.displayUrl || post.imageUrl;
  if (!imageUrl) {
    console.log(`    ⏭️ Skipping: no image URL`);
    results.skipped++;
    return null;
  }
  
  try {
    // Extract with Gemini Vision
    const aiResult = await extractWithGeminiVision(imageUrl, post.caption);
    
    // Skip non-events
    if (!aiResult.isEvent) {
      console.log(`    ⏭️ Not an event (confidence: ${aiResult.confidence})`);
      results.skipped++;
      return null;
    }
    
    console.log(`    ✅ Event: ${aiResult.eventTitle || 'Untitled'} (${aiResult.eventDate || 'TBD'})`);
    
    return {
      postId: postId,
      shortCode: post.shortCode,
      caption: post.caption,
      imageUrl: imageUrl,
      ownerUsername: username,
      timestamp: post.timestamp,
      locationName: post.locationName,
      aiExtraction: aiResult,
    };
  } catch (err) {
    console.error(`    ❌ Error: ${err.message}`);
    results.errors.push({ postId, error: err.message });
    results.failed++;
    return null;
  }
}

/**
 * Main processing function
 */
async function main() {
  const datasetId = process.argv[2];
  
  if (!datasetId) {
    console.error('❌ Dataset ID required');
    console.error('Usage: node process-scrape.js <dataset_id>');
    process.exit(1);
  }
  
  console.log('🚀 Starting Instagram post processing...\n');
  
  // Test connection first
  await testConnection();
  
  // Fetch from Apify
  console.log(`📥 Fetching dataset: ${datasetId}`);
  const apifyClient = new ApifyClient({ token: APIFY_API_KEY });
  const { items: posts } = await apifyClient.dataset(datasetId).listItems();
  
  console.log(`📊 Found ${posts.length} posts to process\n`);
  
  // Process in batches
  const totalBatches = Math.ceil(posts.length / BATCH_SIZE);
  
  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = posts.slice(i, i + BATCH_SIZE);
    
    console.log(`\n${'='.repeat(50)}`);
    console.log(`📦 Batch ${batchNum}/${totalBatches} (posts ${i + 1}-${Math.min(i + BATCH_SIZE, posts.length)})`);
    console.log(`${'='.repeat(50)}`);
    
    // Process each post with Gemini Vision
    const processed = [];
    for (let j = 0; j < batch.length; j++) {
      const result = await processPost(batch[j], i + j, posts.length);
      if (result) {
        processed.push(result);
      }
      results.processed++;
    }
    
    // Send batch to Edge Function if we have any processed posts
    if (processed.length > 0) {
      console.log(`\n  📤 Sending ${processed.length} posts to Edge Function...`);
      
      try {
        const response = await sendBatchToEdgeFunction(processed);
        console.log(`  ✅ Saved: ${response.saved}, Failed: ${response.failed}`);
        results.saved += response.saved;
        results.failed += response.failed;
      } catch (err) {
        console.error(`  ❌ Batch send failed: ${err.message}`);
        results.errors.push({ batch: batchNum, error: err.message });
        results.failed += processed.length;
      }
    } else {
      console.log(`\n  ℹ️ No events found in this batch`);
    }
    
    // Delay between batches
    if (i + BATCH_SIZE < posts.length) {
      console.log(`\n⏳ Waiting ${DELAY_MS / 1000}s before next batch...`);
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }
  
  // Save results
  results.endTime = new Date().toISOString();
  
  const resultsDir = path.join(process.cwd(), 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  
  const resultsPath = path.join(resultsDir, `results-${Date.now()}.json`);
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  
  // Also save a summary file
  const summaryPath = path.join(resultsDir, 'summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));
  
  // Print summary
  console.log(`\n${'='.repeat(50)}`);
  console.log('📊 PROCESSING COMPLETE');
  console.log(`${'='.repeat(50)}`);
  console.log(`  Total processed: ${results.processed}`);
  console.log(`  Saved: ${results.saved}`);
  console.log(`  Skipped: ${results.skipped}`);
  console.log(`  Failed: ${results.failed}`);
  console.log(`  Errors: ${results.errors.length}`);
  console.log(`  Results saved to: ${resultsPath}`);
  
  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    results.errors.slice(0, 10).forEach(e => {
      console.log(`  - ${e.postId || `Batch ${e.batch}`}: ${e.error}`);
    });
    if (results.errors.length > 10) {
      console.log(`  ... and ${results.errors.length - 10} more`);
    }
  }
  
  // Exit with error if too many failures
  if (results.failed > results.saved && results.processed > 0) {
    console.error('\n❌ More failures than successes, exiting with error');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
