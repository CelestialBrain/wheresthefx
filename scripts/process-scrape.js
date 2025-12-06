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

IMPORTANT: Many Filipino event posters use stylized text. Look carefully for:
- Dates in format "DEC 15", "December 15", "12/15"
- Times like "8PM", "9:00 PM", "DOORS OPEN 7PM"
- Venue names often at bottom of poster
- Prices like "₱500", "PHP 500", "FREE ENTRY"

Respond in JSON only:
{
  "ocrText": "all text extracted from image",
  "isEvent": true,
  "eventTitle": "...",
  "eventDate": "2025-12-15",
  "eventTime": "20:00",
  "endTime": null,
  "venueName": "...",
  "venueAddress": "...",
  "price": 0,
  "isFree": true,
  "category": "nightlife",
  "confidence": 0.85
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
