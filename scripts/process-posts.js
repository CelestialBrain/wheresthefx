import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Validate environment
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  process.exit(1);
}
if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY must be set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Configuration
const BATCH_SIZE = 25;
const RATE_LIMIT_DELAY_MS = 2000;
const SHORT_CAPTION_THRESHOLD = 100;
const MAX_ADDITIONAL_CAROUSEL_IMAGES = 3;

// Account cache to reduce DB lookups
const accountCache = new Map();

// Results tracking
const results = {
  processed: 0,
  saved: 0,
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
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const mimeType = contentType.split(';')[0].trim();
  
  return { base64, mimeType };
}

/**
 * Extract event data using Gemini Vision API
 */
async function extractWithGeminiVision(imageUrl, caption, postTimestamp) {
  const { base64, mimeType } = await fetchImageAsBase64(imageUrl);
  
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  
  // Calculate dates for context
  const now = new Date();
  const currentYear = now.getFullYear();
  const today = now.toISOString().split('T')[0];
  const postDate = postTimestamp ? new Date(postTimestamp).toISOString().split('T')[0] : null;
  
  const prompt = `Analyze this Instagram event poster image AND the caption.

TODAY'S DATE: ${today}
${postDate ? `POST TIMESTAMP: ${postDate}` : ''}

Caption: ${caption || '(no caption)'}

Extract ALL text visible in the image, then determine:
1. Is this an event announcement? (true/false)
2. Event title (from image or caption)
3. Event date (YYYY-MM-DD format)
4. Event end date if multi-day (YYYY-MM-DD format)
5. Event time (HH:MM:SS 24hr format)
6. End time if available (HH:MM:SS 24hr format)
7. Venue name (location where event happens)
8. Venue address if visible
9. Ticket price (number, 0 if free)
10. Category: nightlife, music, art_culture, markets, food, workshops, community, comedy, or other

IMPORTANT: Many Filipino event posters use stylized text. Look carefully for:
- Dates in format "DEC 15", "December 15", "12/15"
- Times like "8PM", "9:00 PM", "DOORS OPEN 7PM"
- Venue names often at bottom of poster
- Prices like "₱500", "PHP 500", "FREE ENTRY"

DATE EXTRACTION PRIORITY:
1. EXPLICIT date in image (highest priority) - e.g., "Nov 29", "December 7"
2. EXPLICIT date in caption
3. RELATIVE words calculated from POST TIMESTAMP${postDate ? ` (${postDate})` : ''}:
   - "tomorrow" = post_date + 1 day
   - "tonight" = post_date
   - "this weekend" = next Sat/Sun from post_date

YEAR INFERENCE:
- If month/day has already passed this year → assume next year
- "Jan 5" posted in December ${currentYear} → January 5, ${currentYear + 1}

NOT AN EVENT - Set isEvent: false if:
- Contains operating hours pattern: "6PM — Tues to Sat", "Open Mon-Fri"
- Says "Every [day]" without a specific date
- Generic promo language with no specific date

Respond in JSON only (no markdown):
{
  "ocrText": "all text extracted from image",
  "isEvent": true,
  "eventTitle": "...",
  "eventDate": "2025-12-15",
  "eventEndDate": null,
  "eventTime": "20:00:00",
  "endTime": null,
  "venueName": "...",
  "venueAddress": "...",
  "price": 0,
  "isFree": true,
  "category": "nightlife",
  "confidence": 0.85,
  "reasoning": "brief explanation"
}`;

  const result = await model.generateContent([
    { text: prompt },
    {
      inlineData: {
        mimeType,
        data: base64,
      },
    },
  ]);
  
  const response = await result.response;
  let text = response.text().trim();
  
  // Clean up response
  if (text.startsWith('```json')) text = text.slice(7);
  if (text.startsWith('```')) text = text.slice(3);
  if (text.endsWith('```')) text = text.slice(0, -3);
  text = text.trim();
  
  // Extract JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in Gemini response');
  }
  
  return JSON.parse(jsonMatch[0]);
}

/**
 * Extract event using text-only AI (for long captions)
 */
async function extractWithGeminiText(caption, postTimestamp) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  
  const now = new Date();
  const currentYear = now.getFullYear();
  const today = now.toISOString().split('T')[0];
  const postDate = postTimestamp ? new Date(postTimestamp).toISOString().split('T')[0] : null;
  
  const prompt = `Extract event information from this Instagram caption.

TODAY'S DATE: ${today}
${postDate ? `POST TIMESTAMP: ${postDate}` : ''}

Caption:
"""
${caption}
"""

DATE EXTRACTION PRIORITY:
1. EXPLICIT date (highest priority) - "December 7th", "Nov 29"
2. RELATIVE words calculated from POST TIMESTAMP${postDate ? ` (${postDate})` : ''}:
   - "tomorrow" = post_date + 1 day
   - "tonight" = post_date
   - "bukas" (Filipino) = post_date + 1 day

YEAR INFERENCE:
- If month/day has already passed → assume next year

NOT AN EVENT if:
- Operating hours pattern: "6PM — Tues to Sat"
- "Every [day]" without specific date
- Generic promo language

Return JSON only:
{
  "isEvent": boolean,
  "eventTitle": "string or null",
  "eventDate": "YYYY-MM-DD or null",
  "eventEndDate": "YYYY-MM-DD or null",
  "eventTime": "HH:MM:SS or null",
  "endTime": "HH:MM:SS or null",
  "venueName": "string or null",
  "venueAddress": "string or null",
  "price": number or null,
  "isFree": boolean,
  "category": "string",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
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
 * Get or create Instagram account
 */
async function getOrCreateAccount(username, displayName) {
  if (accountCache.has(username)) {
    return accountCache.get(username);
  }
  
  // Check if account exists
  let { data: account } = await supabase
    .from('instagram_accounts')
    .select('id, default_category')
    .eq('username', username)
    .maybeSingle();
  
  if (!account) {
    // Create new account
    const { data: newAccount, error } = await supabase
      .from('instagram_accounts')
      .insert({
        username,
        display_name: displayName,
        is_active: true,
        last_scraped_at: new Date().toISOString(),
      })
      .select('id, default_category')
      .single();
    
    if (error) throw error;
    account = newAccount;
  } else {
    // Update last_scraped_at
    await supabase
      .from('instagram_accounts')
      .update({
        display_name: displayName,
        last_scraped_at: new Date().toISOString(),
      })
      .eq('id', account.id);
  }
  
  accountCache.set(username, account);
  return account;
}

/**
 * Extract additional images from carousel posts
 */
function extractCarouselImages(item) {
  if (item.type !== 'Sidecar' || !item.childPosts || item.childPosts.length === 0) {
    return [];
  }
  
  const additionalImages = [];
  const maxIndex = Math.min(item.childPosts.length, MAX_ADDITIONAL_CAROUSEL_IMAGES + 1);
  
  for (let i = 1; i < maxIndex; i++) {
    const child = item.childPosts[i];
    const imageUrl = child.displayUrl || child.imageUrl;
    
    if (imageUrl && child.type !== 'Video') {
      additionalImages.push(imageUrl);
    }
  }
  
  return additionalImages;
}

/**
 * Check if event has ended
 */
function isEventInPast(eventDate, eventEndDate, eventTime) {
  if (!eventDate) return false;
  
  const now = new Date();
  const checkDate = eventEndDate || eventDate;
  
  let eventDateTime;
  if (eventTime) {
    eventDateTime = new Date(`${checkDate}T${eventTime}+08:00`);
  } else {
    eventDateTime = new Date(`${checkDate}T23:59:59+08:00`);
  }
  
  return eventDateTime < now;
}

/**
 * Validate and format date
 */
function validateDate(dateStr) {
  if (!dateStr) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  
  return dateStr;
}

/**
 * Validate and format time
 */
function validateTime(timeStr) {
  if (!timeStr) return null;
  
  // Handle HH:MM format
  if (/^\d{2}:\d{2}$/.test(timeStr)) {
    return timeStr + ':00';
  }
  
  // Validate HH:MM:SS format
  if (!/^\d{2}:\d{2}:\d{2}$/.test(timeStr)) return null;
  
  const [hour, minute] = timeStr.split(':').map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  
  return timeStr;
}

/**
 * Process a single post
 */
async function processPost(item, index, total) {
  const postId = item.id || item.shortCode || `unknown-${index}`;
  
  console.log(`\n[${index + 1}/${total}] Processing: ${postId}`);
  
  // Skip error items
  if (item.error || item.errorDescription) {
    console.log(`  ⏭️ Skipping error item`);
    results.skipped++;
    return;
  }
  
  // Get username
  let username = item.ownerUsername?.trim().toLowerCase();
  if (!username && item.inputUrl) {
    const match = item.inputUrl.match(/instagram\.com\/([^/?]+)/);
    if (match) username = decodeURIComponent(match[1]).toLowerCase();
  }
  
  if (!username) {
    console.log(`  ⏭️ Skipping: no username`);
    results.skipped++;
    return;
  }
  
  // Check timestamp
  if (!item.timestamp) {
    console.log(`  ⏭️ Skipping: no timestamp`);
    results.skipped++;
    return;
  }
  
  // Check if already exists
  const { data: existingPost } = await supabase
    .from('instagram_posts')
    .select('id')
    .eq('post_id', postId)
    .maybeSingle();
  
  if (existingPost) {
    console.log(`  ⏭️ Skipping: already exists`);
    results.skipped++;
    return;
  }
  
  // Check if previously rejected
  const { data: rejection } = await supabase
    .from('post_rejections')
    .select('id')
    .eq('post_id', postId)
    .maybeSingle();
  
  if (rejection) {
    console.log(`  ⏭️ Skipping: previously rejected`);
    results.skipped++;
    return;
  }
  
  try {
    // Get or create account
    const account = await getOrCreateAccount(username, item.ownerFullName);
    
    // Extract image URL
    const imageUrl = item.displayUrl || item.imageUrl;
    const caption = item.caption || '';
    
    // Choose extraction method based on caption length and image availability
    let extraction;
    let extractionMethod;
    
    if (imageUrl && caption.length < SHORT_CAPTION_THRESHOLD) {
      // Use vision for short captions (details likely in image)
      console.log(`  🔍 Using Gemini Vision (short caption: ${caption.length} chars)`);
      extraction = await extractWithGeminiVision(imageUrl, caption, item.timestamp);
      extractionMethod = 'vision';
    } else if (imageUrl && !caption) {
      // Use vision for posts without captions
      console.log(`  🔍 Using Gemini Vision (no caption)`);
      extraction = await extractWithGeminiVision(imageUrl, '', item.timestamp);
      extractionMethod = 'vision';
    } else {
      // Use text-only for long captions
      console.log(`  📝 Using Gemini Text (caption: ${caption.length} chars)`);
      extraction = await extractWithGeminiText(caption, item.timestamp);
      extractionMethod = 'ai';
    }
    
    // Check if it's an event
    if (!extraction.isEvent) {
      console.log(`  ⏭️ Not an event (confidence: ${extraction.confidence})`);
      results.skipped++;
      return;
    }
    
    // Validate dates and times
    const eventDate = validateDate(extraction.eventDate);
    const eventEndDate = validateDate(extraction.eventEndDate);
    const eventTime = validateTime(extraction.eventTime);
    const endTime = validateTime(extraction.endTime);
    
    // Skip past events
    if (eventDate && isEventInPast(eventDate, eventEndDate, eventTime)) {
      console.log(`  ⏭️ Event has ended: ${eventDate}`);
      results.skipped++;
      return;
    }
    
    // Determine category (use extraction or fallback to account default)
    const category = extraction.category || account.default_category || 'other';
    
    // Extract additional carousel images
    const additionalImages = extractCarouselImages(item);
    
    // Prepare insert data
    const insertData = {
      post_id: postId,
      instagram_account_id: account.id,
      caption: caption,
      post_url: item.url || `https://www.instagram.com/p/${item.shortCode}/`,
      image_url: imageUrl,
      posted_at: item.timestamp,
      likes_count: (item.likesCount === -1 || !item.likesCount) ? 0 : item.likesCount,
      comments_count: item.commentsCount || 0,
      hashtags: item.hashtags || [],
      mentions: item.mentions || [],
      is_event: true,
      event_title: extraction.eventTitle,
      event_date: eventDate,
      event_end_date: eventEndDate,
      event_time: eventTime,
      end_time: endTime,
      location_name: extraction.venueName,
      location_address: extraction.venueAddress,
      price: extraction.price,
      is_free: extraction.isFree ?? (extraction.price === 0 || extraction.price === null),
      category: category,
      needs_review: !eventDate || !eventTime || !extraction.venueName || extraction.confidence < 0.7,
      extraction_method: extractionMethod,
      ai_confidence: extraction.confidence,
      ai_reasoning: extraction.reasoning,
      ocr_text: extraction.ocrText || null,
      ocr_processed: extractionMethod === 'vision',
    };
    
    // Add additional carousel images if available
    if (additionalImages.length > 0) {
      insertData.additional_images = additionalImages;
    }
    
    // Insert post
    const { error: insertError } = await supabase
      .from('instagram_posts')
      .insert(insertData);
    
    if (insertError) {
      throw insertError;
    }
    
    console.log(`  ✅ Saved: ${extraction.eventTitle || 'Untitled'} (${eventDate || 'TBD'}, ${extraction.venueName || 'Unknown venue'})`);
    results.saved++;
    
  } catch (err) {
    console.error(`  ❌ Error: ${err.message}`);
    results.errors.push({ postId, error: err.message });
  }
  
  results.processed++;
}

/**
 * Main processing function
 */
async function main() {
  console.log('🚀 Starting post processing...\n');
  
  // Read posts from data file
  const dataPath = path.join(process.cwd(), 'data', 'posts.json');
  
  if (!fs.existsSync(dataPath)) {
    console.error('❌ No data file found. Run fetch-dataset.js first.');
    process.exit(1);
  }
  
  const posts = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  console.log(`📊 Found ${posts.length} posts to process\n`);
  
  // Process in batches
  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(posts.length / BATCH_SIZE);
    
    console.log(`\n${'='.repeat(50)}`);
    console.log(`📦 Batch ${batchNum}/${totalBatches} (posts ${i + 1}-${Math.min(i + BATCH_SIZE, posts.length)})`);
    console.log(`${'='.repeat(50)}`);
    
    // Process batch sequentially to avoid rate limits
    for (let j = 0; j < batch.length; j++) {
      await processPost(batch[j], i + j, posts.length);
    }
    
    // Rate limit delay between batches
    if (i + BATCH_SIZE < posts.length) {
      console.log(`\n⏳ Waiting ${RATE_LIMIT_DELAY_MS / 1000}s before next batch...`);
      await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY_MS));
    }
  }
  
  // Save results
  results.endTime = new Date().toISOString();
  
  const resultsDir = path.join(process.cwd(), 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  
  const resultsPath = path.join(resultsDir, `results-${Date.now()}.json`);
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  
  // Print summary
  console.log(`\n${'='.repeat(50)}`);
  console.log('📊 PROCESSING COMPLETE');
  console.log(`${'='.repeat(50)}`);
  console.log(`  Total processed: ${results.processed}`);
  console.log(`  Saved: ${results.saved}`);
  console.log(`  Skipped: ${results.skipped}`);
  console.log(`  Errors: ${results.errors.length}`);
  console.log(`  Results saved to: ${resultsPath}`);
  
  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    results.errors.slice(0, 10).forEach(e => {
      console.log(`  - ${e.postId}: ${e.error}`);
    });
    if (results.errors.length > 10) {
      console.log(`  ... and ${results.errors.length - 10} more`);
    }
  }
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
