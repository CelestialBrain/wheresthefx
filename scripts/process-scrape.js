import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
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
// Minimum caption length for caption-only extraction
// Below this threshold, captions lack enough context for reliable event extraction
const MIN_CAPTION_LENGTH_FOR_EXTRACTION = 100;

// Known venues list for venue matching (fetched from database or hardcoded fallback)
const KNOWN_VENUES = [
  "123 Block", "19 East", "225 Lounge", "3 Torre Lorenzo", "5G Coffee House",
  "70's Bistro", "A.bode Space", "Alabang Town Center", "Alveo Central Plaza",
  "Apotheka Manila", "Araneta City", "Artinformal Makati", "Ayala Malls Manila Bay",
  "Ayala Malls Nuvali", "Ayala Malls TriNoma", "Ayala Triangle", "B-Side",
  "Baked Studios", "Balcony Music House", "Bank Bar", "BAR IX", "Beat The Bar",
  "Bench Tower", "Blackbox Katipunan", "Bonifacio Global City", "BGC",
  "Burgos Circle Park", "Cafe 32nd St", "Capitol Commons", "Cine Adarna",
  "Cinema 76", "City of Dreams Manila", "Clubhouse at The Palace", "Commune",
  "Cubao Expo", "Draft Restaurant & Brewery", "East Wing Atrium", "Eastwood City",
  "Estancia Mall", "Evia Lifestyle Center", "Festival Mall", "Finale Art File",
  "Fireside", "Forbes Town Center", "Fred's Revolucion", "Galerie Stephanie",
  "Gateway Mall", "Glorietta", "Gravity Art Space", "Greenbelt", "Gyud Food",
  "Handlebar Bar and Grill", "Heyday Cafe", "INT.Bar / EXT.Cafe", "Intramuros",
  "Jess & Pats", "K:ITA Cafe", "Kampai", "La Fuerza Plaza", "Lan Kwai Speakeasy",
  "Legazpi Active Park", "Legazpi Sunday Market", "M Bakery", "Mall of Asia Arena",
  "MOA Arena", "Mandala Park", "Market! Market!", "Matheus Bldg",
  "Metrotent Convention Center", "Molito Lifestyle Center", "Mow's Bar",
  "New Frontier Theater", "Newport Performing Arts Theater", "NoKal Manila",
  "Odd Cafe", "Okada Manila", "Paseo Center", "Petite Bakery", "Philippine Arena",
  "Playlist Cafe Antipolo", "Poblacion", "Power Plant Mall", "Quezon Club",
  "Radius Katipunan", "Red Room", "Revel at The Palace", "Rizal Park",
  "Robinsons Magnolia", "Rockwell", "SaGuijo Café + Bar", "Salcedo Market",
  "Salcedo Park", "Samsung Hall", "Samsung Performing Arts Theater", "Silverlens",
  "SINE POP", "SM City North EDSA", "SM Mall of Asia", "SM Megamall", "SM Southmall",
  "Smart Araneta Coliseum", "Social House BGC", "Spruce Gallery", "Tago Jazz Cafe",
  "The Fifth at Rockwell", "The Palace Manila", "The Pop Up Katipunan",
  "Tipple and Slaw", "Ugly Duck", "UP Town Center", "Valkyrie at The Palace",
  "Venice Grand Canal Mall", "Victor Bridgetowne", "Whisky Park", "XX XX", "Xylo"
];

// JSON Schema for Gemini Structured Output (eliminates JSON parsing issues)
const eventExtractionSchema = {
  type: SchemaType.OBJECT,
  properties: {
    ocrText: { type: SchemaType.STRING, nullable: true, description: "All text extracted from image" },
    isEvent: { type: SchemaType.BOOLEAN, description: "Whether this is an event announcement" },
    eventTitle: { type: SchemaType.STRING, nullable: true, description: "Event title/name" },
    eventDate: { type: SchemaType.STRING, nullable: true, description: "Event date in YYYY-MM-DD format" },
    eventEndDate: { type: SchemaType.STRING, nullable: true, description: "End date for multi-day events in YYYY-MM-DD format" },
    eventTime: { type: SchemaType.STRING, nullable: true, description: "Event start time in HH:MM format (24-hour)" },
    endTime: { type: SchemaType.STRING, nullable: true, description: "Event end time in HH:MM format (24-hour)" },
    venueName: { type: SchemaType.STRING, nullable: true, description: "Venue name" },
    venueAddress: { type: SchemaType.STRING, nullable: true, description: "Full venue address" },
    price: { type: SchemaType.NUMBER, nullable: true, description: "Single price or starting price" },
    priceMin: { type: SchemaType.NUMBER, nullable: true, description: "Minimum price for tiered pricing" },
    priceMax: { type: SchemaType.NUMBER, nullable: true, description: "Maximum price for tiered pricing" },
    priceNotes: { type: SchemaType.STRING, nullable: true, description: "Price tier details" },
    isFree: { type: SchemaType.BOOLEAN, nullable: true, description: "Whether the event is free" },
    signupUrl: { type: SchemaType.STRING, nullable: true, description: "Registration/ticket URL" },
    urlType: { type: SchemaType.STRING, nullable: true, description: "Type of URL: tickets, registration, rsvp, info, link_in_bio" },
    category: { type: SchemaType.STRING, description: "Event category: nightlife, music, art_culture, markets, food, workshops, community, comedy, other" },
    confidence: { type: SchemaType.NUMBER, description: "Confidence score 0-1" },
    isRecurring: { type: SchemaType.BOOLEAN, description: "Whether this is a recurring event" },
    recurrencePattern: { type: SchemaType.STRING, nullable: true, description: "Recurrence pattern e.g. weekly:friday" },
    rsvpDeadline: { type: SchemaType.STRING, nullable: true, description: "RSVP deadline in YYYY-MM-DD format" },
    isHistoricalPost: { type: SchemaType.BOOLEAN, description: "Whether this is about a past event" },
    reasoning: { type: SchemaType.STRING, description: "Explanation of extraction decisions" }
  },
  required: ["isEvent", "category", "confidence", "isRecurring", "isHistoricalPost", "reasoning"]
};

// Initialize Gemini with JSON Schema mode
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
  model: 'gemini-2.0-flash',
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: eventExtractionSchema
  }
});

// Fallback model without schema (for caption-only)
const modelCaptionOnly = genAI.getGenerativeModel({ 
  model: 'gemini-2.0-flash',
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: eventExtractionSchema
  }
});

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
 * Build the extraction prompt with all context
 */
function buildExtractionPrompt(caption, post, hasImage = true) {
  // Get today's date for context
  const today = new Date().toISOString().split('T')[0];
  const currentYear = new Date().getFullYear();
  
  // Calculate post age to detect historical posts
  const postTimestamp = post?.timestamp;
  const postDate = postTimestamp ? new Date(postTimestamp) : new Date();
  const postAgeInDays = Math.floor((Date.now() - postDate.getTime()) / (1000 * 60 * 60 * 24));
  const isOldPost = postAgeInDays > 30;
  
  // Build known venues context
  const venueContext = `
KNOWN VENUES (use exact spelling if venue matches one of these):
${KNOWN_VENUES.slice(0, 60).join(', ')}
... and more. If venue matches a known venue, use the exact spelling from this list.`;

  return `You are an expert at extracting event information from Filipino Instagram event posters.

TODAY'S DATE: ${today}
INSTAGRAM POST DATE: ${postDate.toISOString().split('T')[0]} (${postAgeInDays} days ago)${isOldPost ? ' ⚠️ OLD POST - likely historical' : ''}

INSTAGRAM CAPTION:
"""
${caption || '(no caption)'}
"""

${venueContext}

${hasImage ? 'Extract ALL text visible in the image, then determine if this is an event announcement.' : '⚠️ NOTE: No image is available - extract information from caption text only.'}

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

MULTI-DAY EVENT TIME HANDLING:
- For multi-day events (festivals, markets, conventions, fairs), the schedule usually REPEATS each day
- eventTime = daily opening/start time
- endTime = daily closing/end time  
- If you see multiple times (e.g., "4PM" and "6:30PM"), these are likely:
  ✅ Daily hours: opens 4PM, last session at 6:30PM
  ✅ Multiple sessions/screenings per day (both times apply to ALL days)
  ❌ NOT different hours on different days (rare - only if explicitly stated like "Fri 4PM, Sat 6PM")

Example interpretations:
- "Dec 12-13, 4PM-9PM" → eventTime: "16:00", endTime: "21:00" (SAME schedule both days)
- "Film festival Dec 12-13, screenings at 4PM and 6:30PM" → eventTime: "16:00", endTime: null, priceNotes: "Screenings at 4PM and 6:30PM daily"
- "Friday 8PM, Saturday 2PM" → DIFFERENT times per day (explicit), note in priceNotes

⚠️ COMMON MISTAKE:
When you see two times in a multi-day event post, do NOT assign them to different days unless the post EXPLICITLY says "Friday at X, Saturday at Y"

⚠️ NIGHTLIFE MIDNIGHT RULE:
- In nightlife context (clubs, bars, parties, DJ events), times from 12MN to 4AM belong to the NIGHT of the previous date
- "Dec 5 at 12MN" in nightlife context = night of Dec 5 (technically Dec 6 00:00), the party starts late on Dec 5
- "2AM" for a party = the party runs INTO 2AM (it started the previous evening)
- DO NOT create a new event date for 12MN-4AM times - they're part of the same night event
- If you see "Party starts 10PM" and "Until 4AM", eventTime: "22:00", endTime: "04:00" (same event)

CONFIDENCE GUIDELINES:
${hasImage ? `- Set confidence >= 0.9 ONLY if all core fields (date, time, venue) are clearly visible in BOTH image AND caption
- Set confidence 0.8-0.89 if fields are clear in either image OR caption
- Set confidence 0.6-0.79 if you're interpreting date formats or inferring AM/PM
- Set confidence < 0.6 if you're making educated guesses - consider setting field to null instead` : 
`- Set confidence 0.5-0.7 for caption-only extraction (no image available)
- Lower confidence if date, time, or venue is unclear`}

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

END TIME EXTRACTION:
- Always try to extract end time if visible in the image or caption
- If not visible, infer based on event type:
  * Film screening: ~2-3 hours after start (e.g., 4PM start → 6:30PM or 7PM end)
  * Concert/gig: ~3-4 hours after start (e.g., 8PM start → 11PM or midnight end)
  * Market/fair: typically until 9-10 PM if afternoon/evening event
  * Workshop: ~2-3 hours after start
- If inferring end time, set confidence lower and add note to reasoning
- Format: "HH:MM" (24-hour)
- For multi-day events, endTime represents the daily closing time, NOT the last day's time

VENUE/LOCATION - ⚠️ STRICT RULES:
- Extract the ACTUAL venue name from the post content
- If venue matches a KNOWN VENUE from the list above, use that EXACT spelling
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
  - If price information is unclear or ambiguous, set isFree: null and add priceNotes: "Price not specified"

URL/LINK EXTRACTION:
- Look for registration, ticket, or RSVP links in BOTH caption AND image
- Extract formats: "https://...", "bit.ly/...", "tinyurl.com/...", "tickelo.com/...", "eventbrite.com/...", "lnk.to/...", "forms.gle/..."
- If "link in bio" mentioned but no URL visible, set urlType to "link_in_bio"
- Priority: ticket purchase > registration > general info
- DO NOT extract @mentions, sponsor URLs, or the Instagram post URL itself
- DO NOT extract venue websites unless they're specifically for registration/tickets

Categories: nightlife, music, art_culture, markets, food, workshops, community, comedy, other

Extract the event information following the JSON schema provided.`;
}

/**
 * Extract event data from image using Gemini Vision with JSON Schema mode
 */
async function extractWithGeminiVision(imageUrl, caption, post = {}) {
  try {
    const imageResponse = await fetchImageWithRetry(imageUrl);
    
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString('base64');
    
    const prompt = buildExtractionPrompt(caption, post, true);

    const result = await model.generateContent([
      { text: prompt },
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Image,
        },
      },
    ]);

    // With JSON Schema mode, response is guaranteed valid JSON
    const text = result.response.text();
    try {
      const parsed = JSON.parse(text);
      return parsed;
    } catch (parseErr) {
      console.log(`    ⚠️ JSON parse failed despite schema mode: ${parseErr.message}`);
      return null;
    }
  } catch (err) {
    console.log(`    ⚠️ Vision extraction failed: ${err.message}`);
  }
  
  return null;
}

/**
 * Extract event data from caption only (fallback when image fetch fails)
 */
async function extractFromCaptionOnly(caption, post = {}) {
  try {
    const prompt = buildExtractionPrompt(caption, post, false);

    const result = await modelCaptionOnly.generateContent(prompt);
    const text = result.response.text();
    
    try {
      const parsed = JSON.parse(text);
      // Mark that this was caption-only extraction
      parsed.captionOnlyExtraction = true;
      return parsed;
    } catch (parseErr) {
      console.log(`    ⚠️ Caption-only JSON parse failed: ${parseErr.message}`);
      return null;
    }
  } catch (err) {
    console.log(`    ⚠️ Caption-only extraction failed: ${err.message}`);
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
  
  // Caption-only fallback: If image fetch failed but caption is substantial, try caption-only extraction
  if (!aiResult && !imageUrl && caption && caption.length > MIN_CAPTION_LENGTH_FOR_EXTRACTION) {
    console.log(`    🔄 No image available, attempting caption-only extraction...`);
    aiResult = await extractFromCaptionOnly(caption, post);
  } else if (!aiResult && imageUrl && caption && caption.length > MIN_CAPTION_LENGTH_FOR_EXTRACTION) {
    console.log(`    🔄 Image extraction failed, attempting caption-only fallback...`);
    aiResult = await extractFromCaptionOnly(caption, post);
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
  console.log(`🏠 Using ${KNOWN_VENUES.length} known venues for matching\n`);
  
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
