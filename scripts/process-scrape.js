import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Environment variables (only 3 needed!)
const SUPABASE_URL = process.env.SUPABASE_URL;
const DATA_INGEST_TOKEN = process.env.DATA_INGEST_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Performance tuning - increased for concurrency
const BATCH_SIZE = 25; // Increased from 10
const CONCURRENT_REQUESTS = 5; // Process 5 posts concurrently within each batch
const DELAY_BETWEEN_BATCHES_MS = 1500; // Reduced delay
const IMAGE_FETCH_TIMEOUT_MS = 15000;
const IMAGE_FETCH_RETRIES = 2;
const MIN_CAPTION_LENGTH_FOR_EXTRACTION = 100;

// Timeout handling for GitHub Actions (3 hours = 180 minutes)
const WORKFLOW_TIMEOUT_MS = 180 * 60 * 1000; // 3 hours
const SAFETY_BUFFER_MS = 5 * 60 * 1000; // Exit 5 minutes before timeout
const startTime = Date.now();

// Progress file for resume capability
const RESULTS_DIR = path.join(process.cwd(), 'results');
const PROGRESS_FILE = path.join(RESULTS_DIR, 'progress.json');

// Known venues list - will be populated from database
let KNOWN_VENUES = [];

// JSON Schema for Gemini Structured Output
const eventExtractionSchema = {
  type: SchemaType.OBJECT,
  properties: {
    ocrText: { type: SchemaType.STRING, nullable: true, description: "All text extracted from image" },
    isEvent: { type: SchemaType.BOOLEAN, description: "Whether this is an event announcement" },
    eventTitle: { type: SchemaType.STRING, nullable: true, description: "Event title/name" },
    eventDate: { type: SchemaType.STRING, nullable: true, description: "Event date (first/next date) in YYYY-MM-DD format" },
    eventEndDate: { type: SchemaType.STRING, nullable: true, description: "End date for multi-day CONTINUOUS events in YYYY-MM-DD format" },
    allEventDates: { 
      type: SchemaType.ARRAY, 
      items: { type: SchemaType.STRING }, 
      nullable: true, 
      description: "All event dates for non-continuous multi-date events (e.g., Dec 7, 13, 14, 20, 21) in YYYY-MM-DD format. Use this for scattered dates, not continuous ranges." 
    },
    eventTime: { type: SchemaType.STRING, nullable: true, description: "Event start time in HH:MM format (24-hour)" },
    endTime: { type: SchemaType.STRING, nullable: true, description: "Event end time in HH:MM format (24-hour) - CRITICAL: Always extract when available" },
    venueName: { type: SchemaType.STRING, nullable: true, description: "Venue name" },
    venueAddress: { type: SchemaType.STRING, nullable: true, description: "Full venue address" },
    price: { type: SchemaType.NUMBER, nullable: true, description: "Single price or starting price" },
    priceMin: { type: SchemaType.NUMBER, nullable: true, description: "Minimum price for tiered pricing" },
    priceMax: { type: SchemaType.NUMBER, nullable: true, description: "Maximum price for tiered pricing" },
    priceNotes: { type: SchemaType.STRING, nullable: true, description: "Price tier details" },
    isFree: { type: SchemaType.BOOLEAN, nullable: true, description: "Whether the event is free" },
    signupUrl: { type: SchemaType.STRING, nullable: true, description: "Registration/ticket URL - CRITICAL: Extract any bit.ly, forms.gle, lnk.to, or https:// links" },
    urlType: { type: SchemaType.STRING, nullable: true, description: "Type of URL: tickets, registration, rsvp, info, link_in_bio" },
    category: { type: SchemaType.STRING, description: "Event category: nightlife, music, art_culture, markets, food, workshops, community, comedy, other" },
    confidence: { type: SchemaType.NUMBER, description: "Confidence score 0-1" },
    isRecurring: { type: SchemaType.BOOLEAN, description: "Whether this is a recurring event" },
    recurrencePattern: { type: SchemaType.STRING, nullable: true, description: "Recurrence pattern e.g. weekly:friday" },
    rsvpDeadline: { type: SchemaType.STRING, nullable: true, description: "RSVP deadline in YYYY-MM-DD format" },
    isHistoricalPost: { type: SchemaType.BOOLEAN, description: "Whether this is about a past event" },
    reasoning: { type: SchemaType.STRING, description: "Explanation of extraction decisions" },
    subEvents: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          title: { type: SchemaType.STRING, description: "Sub-event title (movie name, artist name, workshop title, activity name)" },
          date: { type: SchemaType.STRING, nullable: true, description: "Specific date for this sub-event in YYYY-MM-DD" },
          time: { type: SchemaType.STRING, nullable: true, description: "Start time in HH:MM format" },
          endTime: { type: SchemaType.STRING, nullable: true, description: "End time in HH:MM format" },
          description: { type: SchemaType.STRING, nullable: true, description: "Additional details like director, performer" }
        },
        required: ["title"]
      },
      nullable: true,
      description: "CRITICAL: Multiple events/activities within same post - film screenings with times, workshop schedules, different artists performing"
    }
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
 * Load progress from checkpoint file for resume capability
 */
function loadProgress(datasetUrl) {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
      if (progress.datasetUrl === datasetUrl) {
        console.log(`📂 Found checkpoint from ${progress.lastUpdated}`);
        console.log(`   Last completed batch: ${progress.lastCompletedBatch}/${progress.totalBatches}`);
        console.log(`   Already processed: ${progress.processedPostIds?.length || 0} posts`);
        return progress;
      }
      console.log(`⚠️ Checkpoint exists but for different dataset - starting fresh`);
    }
  } catch (err) {
    console.log(`⚠️ Could not load progress file: ${err.message}`);
  }
  return null;
}

/**
 * Save progress checkpoint after each batch
 */
function saveProgress(progress) {
  try {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
    console.log(`   💾 Progress saved (batch ${progress.lastCompletedBatch}/${progress.totalBatches})`);
  } catch (err) {
    console.log(`   ⚠️ Could not save progress: ${err.message}`);
  }
}

/**
 * Check if approaching workflow timeout - exit gracefully to allow resume
 */
function checkTimeout(currentProgress) {
  const elapsed = Date.now() - startTime;
  const remaining = WORKFLOW_TIMEOUT_MS - elapsed;
  
  if (remaining < SAFETY_BUFFER_MS) {
    console.log('\n⏰ Approaching workflow timeout - saving progress for resume...');
    saveProgress(currentProgress);
    console.log('📂 Progress saved. Re-run workflow with resume=true to continue.');
    console.log(`✅ Completed ${currentProgress.lastCompletedBatch}/${currentProgress.totalBatches} batches`);
    process.exit(0); // Clean exit so artifacts are uploaded
  }
  
  // Log remaining time every 30 minutes
  const elapsedMinutes = Math.floor(elapsed / 60000);
  if (elapsedMinutes > 0 && elapsedMinutes % 30 === 0) {
    console.log(`⏱️ Time remaining: ${Math.floor(remaining / 60000)} minutes`);
  }
}

/**
 * Fetch known venues from database
 */
async function fetchKnownVenuesFromDatabase() {
  try {
    console.log('📍 Fetching known venues from database...');
    const response = await fetch(`${SUPABASE_URL}/rest/v1/known_venues?select=name,aliases`, {
      headers: {
        'Authorization': `Bearer ${DATA_INGEST_TOKEN}`,
        'apikey': DATA_INGEST_TOKEN,
      }
    });
    
    if (!response.ok) {
      console.log('⚠️ Failed to fetch venues from database, using fallback list');
      return getFallbackVenues();
    }
    
    const venues = await response.json();
    const venueNames = new Set();
    
    for (const venue of venues) {
      venueNames.add(venue.name);
      if (venue.aliases && Array.isArray(venue.aliases)) {
        venue.aliases.forEach(alias => venueNames.add(alias));
      }
    }
    
    const venueList = Array.from(venueNames);
    console.log(`✅ Loaded ${venueList.length} venue names from database`);
    return venueList;
  } catch (err) {
    console.log(`⚠️ Error fetching venues: ${err.message}, using fallback list`);
    return getFallbackVenues();
  }
}

/**
 * Fallback venue list if database fetch fails
 */
function getFallbackVenues() {
  return [
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
    "Venice Grand Canal Mall", "Victor Bridgetowne", "Whisky Park", "XX XX", "Xylo",
    // New venues added
    "Drawing Room Manila", "UPFI Film Center", "Cinematheque Centre Manila",
    "Lost and Found Makati", "Mercato Centrale", "SMX Aura", "SMX Convention Center",
    "The Beach House Taft", "Sanctuary Manila", "Jungle Base Cafe", "HUB Make Lab",
    "Le Pavillon", "Fusebox Lifestyle Complex", "White Rabbit Building", "BosCoffee",
    "Sundeck Party Zhostel", "The Corner House", "Cafe Agapita", "Route 196",
    "Sev's Cafe", "Coffee Architect", "Pintô Art Museum", "Vargas Museum",
    "The Mind Museum", "UP Amphitheater", "UP Sunken Garden", "CCP Main Theater",
    "Tanghalang Nicanor Abelardo", "Metropolitan Theater", "Aliw Theater"
  ];
}

/**
 * Extract URLs from text using regex (fallback)
 */
function extractUrlsFromText(text) {
  if (!text) return null;
  
  // URL patterns to look for
  const patterns = [
    // Full URLs
    /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi,
    // Short URL services
    /bit\.ly\/[a-zA-Z0-9_-]+/gi,
    /forms\.gle\/[a-zA-Z0-9_-]+/gi,
    /lnk\.to\/[a-zA-Z0-9_-]+/gi,
    /tinyurl\.com\/[a-zA-Z0-9_-]+/gi,
    /linktr\.ee\/[a-zA-Z0-9_-]+/gi,
    /goo\.gl\/[a-zA-Z0-9_-]+/gi,
    /fb\.me\/[a-zA-Z0-9_-]+/gi,
    /eventbrite\.[a-z]+\/[^\s]+/gi,
    /ticketmaster\.[a-z]+\/[^\s]+/gi,
  ];
  
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      let url = matches[0];
      // Add https:// if missing
      if (!url.startsWith('http')) {
        url = 'https://' + url;
      }
      return url;
    }
  }
  
  // Check for "link in bio" mentions
  const linkInBioPatterns = [
    /link\s*in\s*bio/i,
    /check\s*bio/i,
    /see\s*bio/i,
    /bio\s*link/i,
  ];
  
  for (const pattern of linkInBioPatterns) {
    if (pattern.test(text)) {
      return 'link_in_bio';
    }
  }
  
  // Check for DM for slots/reservations
  const dmPatterns = [
    /dm\s*(?:for|to)\s*(?:slots?|reserv|book|rsvp)/i,
    /message\s*(?:for|to)\s*(?:slots?|reserv|book)/i,
  ];
  
  for (const pattern of dmPatterns) {
    if (pattern.test(text)) {
      return 'dm_for_slots';
    }
  }
  
  return null;
}

/**
 * Extract time from caption using regex (fallback)
 */
function extractTimeFromCaption(caption) {
  if (!caption) return null;
  
  // Time patterns - most specific first
  const patterns = [
    // Standard time formats: 7PM, 7:00PM, 7:00 PM
    /\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)\b/i,
    // 24-hour format: 19:00, 14:30
    /\b([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*(?:AM|PM))/i,
    // Filipino: alas-7, alas 8
    /alas[- ]?(\d{1,2})/i,
    // Doors open at X, starts at X
    /(?:doors?\s*(?:open|at)|starts?\s*at|begins?\s*at)\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/i,
  ];
  
  for (const pattern of patterns) {
    const match = caption.match(pattern);
    if (match) {
      let hour = parseInt(match[1]);
      let minute = match[2] ? parseInt(match[2]) : 0;
      const meridiem = match[3]?.toUpperCase();
      
      // Convert to 24-hour format
      if (meridiem === 'PM' && hour !== 12) {
        hour += 12;
      } else if (meridiem === 'AM' && hour === 12) {
        hour = 0;
      } else if (!meridiem && hour >= 1 && hour <= 6) {
        // Assume PM for evening events if no meridiem specified
        // Check context for evening keywords
        const eveningKeywords = /night|evening|gabi|dinner|cocktail/i;
        if (eveningKeywords.test(caption)) {
          hour += 12;
        }
      }
      
      // Validate hour
      if (hour >= 0 && hour <= 23) {
        return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      }
    }
  }
  
  return null;
}

/**
 * Extract sub-events from caption using regex (fallback)
 */
function extractSubEventsFromCaption(caption) {
  if (!caption) return [];
  
  const subEvents = [];
  
  // Pattern: TIME - TITLE or TIME TITLE
  const timeSlotPattern = /(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)\s*[-–—:]\s*([A-Z][^\n\r,;]+?)(?=\n|\r|$|(?:\d{1,2}(?::\d{2})?\s*(?:AM|PM)))/gi;
  
  let match;
  while ((match = timeSlotPattern.exec(caption)) !== null) {
    const timeStr = match[1].trim();
    const title = match[2].trim();
    
    // Skip if title is too short or looks like a generic phrase
    if (title.length < 3 || /^(and|with|at|in|on|the|for)$/i.test(title)) {
      continue;
    }
    
    // Parse time to 24-hour format
    const timeMatch = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/i);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1]);
      const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const meridiem = timeMatch[3]?.toUpperCase();
      
      if (meridiem === 'PM' && hour !== 12) hour += 12;
      if (meridiem === 'AM' && hour === 12) hour = 0;
      
      if (hour >= 0 && hour <= 23) {
        subEvents.push({
          title: title,
          time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
        });
      }
    }
  }
  
  return subEvents;
}

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
  const today = new Date().toISOString().split('T')[0];
  const currentYear = new Date().getFullYear();
  
  const postTimestamp = post?.timestamp;
  const postDate = postTimestamp ? new Date(postTimestamp) : new Date();
  const postAgeInDays = Math.floor((Date.now() - postDate.getTime()) / (1000 * 60 * 60 * 24));
  const isOldPost = postAgeInDays > 30;
  
  // Use database venues, limit to reasonable size for prompt
  const venueContext = KNOWN_VENUES.length > 0 ? `
═══════════════════════════════════════════════════════════════
KNOWN VENUES DATABASE (${KNOWN_VENUES.length} venues - use EXACT spelling if match found):
═══════════════════════════════════════════════════════════════
${KNOWN_VENUES.slice(0, 120).join(', ')}
${KNOWN_VENUES.length > 120 ? `... and ${KNOWN_VENUES.length - 120} more.` : ''}

⚠️ VENUE MATCHING RULE: If the venue in the post matches ANY of these known venues (even partial match), use the EXACT spelling from this list!` : '';

  return `You are an expert at extracting event information from Filipino Instagram event posters.
Your job is to be ACCURATE and PRECISE. When uncertain, set the field to null rather than guess.

═══════════════════════════════════════════════════════════════
📅 TEMPORAL CONTEXT
═══════════════════════════════════════════════════════════════
TODAY'S DATE: ${today}
CURRENT YEAR: ${currentYear}
INSTAGRAM POST DATE: ${postDate.toISOString().split('T')[0]} (${postAgeInDays} days ago)${isOldPost ? ' ⚠️ OLD POST - likely historical' : ''}

═══════════════════════════════════════════════════════════════
📝 INSTAGRAM CAPTION
═══════════════════════════════════════════════════════════════
"""
${caption || '(no caption)'}
"""

${venueContext}

${hasImage ? '🖼️ IMAGE AVAILABLE: Extract ALL text visible in the image FIRST, then analyze for event information.' : '⚠️ NO IMAGE: Extract information from caption text only. Be more conservative with confidence.'}

═══════════════════════════════════════════════════════════════
🎯 STEP 1: IS THIS AN EVENT? (CRITICAL FIRST DECISION)
═══════════════════════════════════════════════════════════════

✅ SET isEvent: true ONLY if this is a REAL, SPECIFIC, UPCOMING event with:
- A specific date (or dates) for the event
- An actual activity happening at a specific time
- A physical location where people will gather

❌ SET isEvent: false for ANY of these:
SOCIAL MEDIA CONTESTS:
  - "GIVEAWAY", "raffle", "win a", "winners announced", "lucky winner"
  - "tag 2 friends", "follow this page", "like & share", "how to enter"
  → These are ONLINE PROMOTIONS, not physical events!

PAST EVENT CONTENT:
  - "thank you", "merci", "what a night", "until next time", "see you again"
  - "#tbt", "#throwback", "look back", "memories", "last night was"
  - Event date is BEFORE post date (${postDate.toISOString().split('T')[0]})

PROMOTIONAL/MARKETING:
  - "host your events", "book our space", "private events", "for bookings"
  - "new on the menu", "now serving", "try our", "limited edition"
  - "calling all vendors", "now accepting applications", "apply now"
  - "Visit us", "Come check out", "Be in the loop", "We're open"

VENUE HOURS ONLY:
  - Just announcing operating hours without a specific event
  - "Open Mon-Sat 6PM-2AM" without event details

VAGUE/RECURRING WITHOUT DATE:
  - "Every Friday" without a specific upcoming Friday date
  - "Weekly jam sessions" without next session date

═══════════════════════════════════════════════════════════════
📅 STEP 2: DATE EXTRACTION (IF isEvent: true)
═══════════════════════════════════════════════════════════════

CRITICAL DATE RULES:
1. eventDate MUST be on or after POST date (${postDate.toISOString().split('T')[0]})
2. eventDate year MUST be ${currentYear} or ${currentYear + 1} ONLY
3. If date is BEFORE today (${today}), set isEvent: false (already passed)
4. NEVER auto-increment year! "May 3" in a May 5 post = PAST event, not next year!

FILIPINO DATE PATTERNS:
- "Dis 15" / "Disyembre 15" = December 15
- "Enero 3" = January 3
- "ngayong Sabado" = this Saturday (calculate from post date)
- "sa Biyernes" = on Friday (calculate next Friday from post date)

DATE RANGE vs NON-CONTINUOUS DATES:
- CONTINUOUS: "Dec 12-15" → eventDate: first day, eventEndDate: last day, create subEvents for each day
- NON-CONTINUOUS: "Dec 7, 13, 14, 20" → eventDate: first, allEventDates: [all dates as YYYY-MM-DD]

═══════════════════════════════════════════════════════════════
⏰ STEP 3: TIME EXTRACTION (CRITICAL - ALWAYS EXTRACT BOTH START AND END)
═══════════════════════════════════════════════════════════════

⚠️ MANDATORY: ALWAYS look for BOTH eventTime (start) AND endTime (end)!
⚠️ THIS IS THE #1 MISSED FIELD - PAY CLOSE ATTENTION!

TIME FORMAT PATTERNS TO RECOGNIZE:
- "7PM" → "19:00"
- "7:30PM" → "19:30"
- "19:00" → "19:00" (already 24-hour)
- "12NN" / "12 noon" → "12:00"
- "12MN" / "midnight" → "00:00"
- "alas-7 ng gabi" → "19:00" (Filipino: 7 PM)
- "alas-10 ng umaga" → "10:00" (Filipino: 10 AM)

TIME RANGES - EXTRACT BOTH START AND END (CRITICAL!):
- "6PM - 1AM" → eventTime: "18:00", endTime: "01:00"
- "10:00 AM - 6:00 PM" → eventTime: "10:00", endTime: "18:00"
- "11AM - 7PM" → eventTime: "11:00", endTime: "19:00"
- "Doors 7PM, Show 8PM until 12MN" → eventTime: "19:00", endTime: "00:00"

ESTIMATE END TIME WHEN NOT EXPLICIT:
- "6PM onwards" → eventTime: "18:00", endTime: "23:00" (nightlife estimate)
- "Doors open 8PM" → eventTime: "20:00", endTime: "02:00" (nightlife estimate)
- "3PM" (market/fair) → eventTime: "15:00", endTime: "21:00" (day event estimate)
- Workshop with no end time → add 2-3 hours to start time

⚠️ DIFFERENT TIMES FOR DIFFERENT DAYS (CRITICAL FOR SUB-EVENTS):
When multi-day event has DIFFERENT times per day, capture in subEvents:
- "Dec 13, Sat | 11AM - 7PM" → subEvent: {date: "2025-12-13", time: "11:00", endTime: "19:00"}
- "Dec 14, Sun | 12NN - 7PM" → subEvent: {date: "2025-12-14", time: "12:00", endTime: "19:00"}
Each day MUST have its own time and endTime extracted independently!

DIFFERENT HOURS FOR WEEKDAYS VS WEEKENDS:
- "6PM-1AM weekdays, 6PM-3AM weekends" →
  Main event: eventTime: "18:00", endTime: "01:00"
  PLUS create subEvents with different endTime for weekend days

⚠️ NEVER CONFUSE THESE AS TIMES:
- Years: "2025", "2024" are NOT times
- Phone numbers: "09171234567" is NOT a time
- Prices: "500" alone is NOT a time
- Addresses: "Unit 205" is NOT a time

═══════════════════════════════════════════════════════════════
💰 STEP 4: PRICE EXTRACTION (ACCURATE PESO AMOUNTS)
═══════════════════════════════════════════════════════════════

⚠️ PRICE IS OFTEN MISSED - SEARCH CAREFULLY FOR THESE PATTERNS!

PRICE PATTERNS TO RECOGNIZE (SCAN ENTIRE CAPTION!):
- "₱500" / "PHP 500" / "Php500" / "P500" / "500 pesos" → price: 500
- "₱499 each" / "₱500/head" / "PHP 300 per person" → price: 499, 500, 300
- "₱250 only" / "only ₱250" / "just P300" → price: 250, 300
- "consumable" / "₱500 consumable" → price: 500, priceNotes: "consumable"
- "entrance ₱200" / "door ₱350" / "cover ₱400" → extract the amount
- "Free" / "Libre" / "Free admission" / "No cover" / "Free entry" → isFree: true, price: null
- "PWYC" / "Pay what you can" → isFree: false, priceNotes: "PWYC"
- "Donation based" → isFree: false, priceNotes: "Donation based"

PRICE RANGES (extract BOTH min AND max):
- "₱300-500" / "₱300 - ₱500" → priceMin: 300, priceMax: 500, price: 300
- "₱500 to ₱1000" / "₱500-1000" → priceMin: 500, priceMax: 1000, price: 500
- "starts at ₱350" / "from ₱350" → priceMin: 350, price: 350
- "up to ₱2000" → priceMax: 2000

TIERED PRICING (extract all tiers in priceNotes):
- "₱500 GA / ₱1500 VIP" → priceMin: 500, priceMax: 1500, price: 500, priceNotes: "GA ₱500, VIP ₱1500"
- "Early bird ₱800, Regular ₱1000, Door ₱1200" → priceMin: 800, priceMax: 1200, price: 800, priceNotes: "Early bird ₱800, Regular ₱1000, Door ₱1200"
- "Gen Ad ₱350 | VIP ₱500" → priceMin: 350, priceMax: 500, price: 350

⚠️ PRICE VALIDATION:
- Philippine event prices typically ₱100 - ₱5000
- If price > ₱10,000, likely a phone number - set to null
- "0917...", "0915...", "09XX" patterns are phone numbers, NOT prices!
- If isFree: true, then price MUST be null (never 0)
- Never set price: 0 - use isFree: true instead

USD PRICES (may indicate international event):
- "$12-$28" → priceNotes: "USD pricing - $12-$28"
  ⚠️ Dollar pricing may indicate international event - check location!

═══════════════════════════════════════════════════════════════
📍 STEP 5: VENUE/LOCATION EXTRACTION (ACCURATE VENUE NAME)
═══════════════════════════════════════════════════════════════

VENUE EXTRACTION PRIORITY ORDER:
1. 📍 emoji followed by venue name (HIGHEST PRIORITY)
2. "Location:", "Venue:", "Where:", "at:" labels
3. Known venue names mentioned in caption
4. Address-like text (street, building names)

⚠️ CRITICAL VENUE RULES:
- If venue matches a KNOWN VENUE from the database, use EXACT spelling
- NEVER extract venue from @mentions (those are usually photographers/sponsors)
- NEVER use hashtags as venue names
- If venue is "TBA", "TBD", "check bio", "DM for location" → set venueName: null

VENUE NAME CLEANING:
- Remove trailing details: "Cinema '76, Anonas" → "Cinema '76"
- Keep identifying numbers: "225 Lounge" (keep the 225)
- Remove time/date info accidentally included

⚠️ VAGUE VENUE INDICATORS (set venueName to null):
- "TBA", "TBD", "To be announced"
- "Check bio", "DM for location", "Message for details"
- "Secret location", "Location reveal soon"

═══════════════════════════════════════════════════════════════
🔗 STEP 6: URL EXTRACTION (DO NOT SKIP!)
═══════════════════════════════════════════════════════════════

SCAN CAPTION AND IMAGE FOR URLS:
- bit.ly/xxxxx → signupUrl: "https://bit.ly/xxxxx"
- forms.gle/xxxxx → signupUrl: "https://forms.gle/xxxxx"
- lnk.to/xxxxx → signupUrl: "https://lnk.to/xxxxx"
- linktr.ee/xxxxx → signupUrl: "https://linktr.ee/xxxxx"
- eventbrite.com/... → signupUrl: full URL
- Any https:// or http:// URL

SPECIAL URL INDICATORS:
- "link in bio", "check bio" → signupUrl: "link_in_bio", urlType: "link_in_bio"
- "DM for slots", "DM to register" → signupUrl: "dm_for_slots", urlType: "dm"
- "RSVP via", "Register at" → extract the URL that follows

═══════════════════════════════════════════════════════════════
📋 STEP 7: SUB-EVENTS EXTRACTION (MULTI-ACTIVITY POSTS)
═══════════════════════════════════════════════════════════════

⚠️ THIS IS CRITICAL FOR MULTI-DAY EVENTS WITH DIFFERENT TIMES!

CREATE subEvents WHEN POST HAS:
- Multiple screenings/shows with different times
- Different performers with set times  
- Workshop schedule with multiple sessions
- Market with different vendor time slots
- Multi-day event with DIFFERENT TIMES each day

⚠️ DATE RANGE WITH DIFFERENT TIMES PER DAY (CRITICAL!):
When each day has its own time listed, capture them SEPARATELY:

Example: "Dec 13, Sat | 11AM - 7PM / Dec 14, Sun | 12NN - 7PM"
→ subEvents: [
  {"title": "Saturday Session", "date": "2025-12-13", "time": "11:00", "endTime": "19:00"},
  {"title": "Sunday Session", "date": "2025-12-14", "time": "12:00", "endTime": "19:00"}
]

Example: "Sat 11AM-7PM, Sun 12PM-7PM"  
→ subEvents: [
  {"title": "Saturday", "date": "...", "time": "11:00", "endTime": "19:00"},
  {"title": "Sunday", "date": "...", "time": "12:00", "endTime": "19:00"}
]

⚠️ DATE RANGE EXPANSION (SAME TIME EACH DAY):
"Dec 12-14, 6PM-11PM" → 3 subEvents with SAME time:
[
  {"title": "Event Name", "date": "2025-12-12", "time": "18:00", "endTime": "23:00"},
  {"title": "Event Name", "date": "2025-12-13", "time": "18:00", "endTime": "23:00"},
  {"title": "Event Name", "date": "2025-12-14", "time": "18:00", "endTime": "23:00"}
]

⚠️ INHERIT TIMES FROM MAIN EVENT WHEN NOT SPECIFIED:
If main event is "11:00 AM - 6:00 PM" and has multiple days:
Each subEvent MUST have time: "11:00" and endTime: "18:00"

FILM/SCREENING SCHEDULE (ALWAYS INCLUDE endTime - estimate 2hrs for films):
"""
Dec 12 (Fri): 4PM Padamlagan | 6:30PM Bloom
Dec 13 (Sat): 1:30PM Mang Serapio | 4PM May Araw Pa
"""
→ subEvents: [
  {"title": "Padamlagan", "date": "2025-12-12", "time": "16:00", "endTime": "18:00"},
  {"title": "Bloom", "date": "2025-12-12", "time": "18:30", "endTime": "20:30"},
  {"title": "Mang Serapio", "date": "2025-12-13", "time": "13:30", "endTime": "15:30"},
  {"title": "May Araw Pa", "date": "2025-12-13", "time": "16:00", "endTime": "18:00"}
]

PERFORMERS/LINEUP EXTRACTION (CRITICAL - ALWAYS EXTRACT ALL ARTISTS):
Look for patterns: "featuring:", "with:", "lineup:", "performers:", "w/", "ft.", "starring:", "guests:"

"w/ Project Goo, Rock Town Asia, Rainy Weekend"
→ subEvents: [
  {"title": "Project Goo", "description": "performer"},
  {"title": "Rock Town Asia", "description": "performer"},
  {"title": "Rainy Weekend", "description": "performer"}
]

"lineup: Maybe Later, The Semi Circles, Turnout, No ID No Entry"
→ subEvents: [
  {"title": "Maybe Later", "description": "performer"},
  {"title": "The Semi Circles", "description": "performer"},
  {"title": "Turnout", "description": "performer"},
  {"title": "No ID No Entry", "description": "performer"}
]

⚠️ IMPORTANT: Performers WITHOUT specific times don't need dates - they perform at main event time
⚠️ Always use description: "performer" for artists/bands/DJs listed without times

DJ SETS (estimate 1-1.5 hour sets):
"8PM DJ Rico, 10PM DJ Mia"
→ subEvents: [
  {"title": "DJ Rico", "time": "20:00", "endTime": "22:00"},
  {"title": "DJ Mia", "time": "22:00", "endTime": "23:30"}
]

═══════════════════════════════════════════════════════════════
🌏 STEP 8: GEOGRAPHIC FILTERING (NCR ONLY)
═══════════════════════════════════════════════════════════════

This app covers METRO MANILA (NCR) PHILIPPINES ONLY!

SET isEvent: false and category: "outside_service_area" if you detect:
- US phone area codes: 541-, 212-, 310-, 415-, etc.
- US address formats: "W Olive Street", "123 Main St"
- International domains: .org (non-PH), .com.au, .co.uk
- Explicit non-NCR locations: "Pampanga", "Cavite", "Laguna", "Bulacan", "Batangas"
- International locations: "Oregon", "California", "Japan", "Singapore"

═══════════════════════════════════════════════════════════════
🔄 STEP 9: RECURRING vs MULTI-DAY DISTINCTION
═══════════════════════════════════════════════════════════════

MULTI-DAY EVENT (isRecurring: false):
- "Nov 8-9", "Dec 27-30", "This weekend"
- Set eventDate to first day, eventEndDate to last day
- Create subEvents for each day with times

RECURRING EVENT (isRecurring: true) - ONLY with explicit pattern:
✅ "Every Friday", "Weekly", "Monthly", "First Saturday of every month"
✅ recurrencePattern format: "weekly:friday", "monthly:first-saturday"

❌ NOT RECURRING:
- "Friday and Saturday" (just 2 specific days)
- "Nov 8-9" (date range, not pattern)
- "This weekend" (specific weekend, not recurring)

═══════════════════════════════════════════════════════════════
📊 CONFIDENCE SCORING
═══════════════════════════════════════════════════════════════
${hasImage ? `
0.90-1.00: ALL core fields clearly visible in BOTH image AND caption
0.80-0.89: Core fields clear in either image OR caption, minor inference needed
0.70-0.79: Some interpretation needed (AM/PM inference, date format parsing)
0.60-0.69: Multiple fields inferred, some uncertainty
< 0.60: High uncertainty - consider setting uncertain fields to null` : 
`0.60-0.80: Caption-only extraction with clear information
0.40-0.60: Caption has partial information, some inference
< 0.40: Very limited caption information`}

═══════════════════════════════════════════════════════════════
✨ FINAL REMINDERS
═══════════════════════════════════════════════════════════════
1. signupUrl - ALWAYS check for URLs, don't skip this field!
2. endTime - ALWAYS extract when time range is given!
3. subEvents - ALWAYS expand date ranges and extract multi-activity schedules!
4. venueName - Use EXACT spelling from known venues database!
5. When uncertain, set field to null - don't guess!
6. Include your reasoning in the "reasoning" field!`;
}

/**
 * Extract event data from image + caption using Gemini Vision
 */
async function extractWithGeminiVision(imageUrl, caption, post = {}) {
  try {
    const imageResponse = await fetchImageWithRetry(imageUrl);
    const imageBuffer = await imageResponse.arrayBuffer();
    const imageBase64 = Buffer.from(imageBuffer).toString('base64');
    const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';
    
    const prompt = buildExtractionPrompt(caption, post, true);
    
    const result = await model.generateContent([
      {
        inlineData: {
          data: imageBase64,
          mimeType: mimeType
        }
      },
      prompt
    ]);
    
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
 * Extract event data from caption only (fallback)
 */
async function extractFromCaptionOnly(caption, post = {}) {
  try {
    const prompt = buildExtractionPrompt(caption, post, false);

    const result = await modelCaptionOnly.generateContent(prompt);
    const text = result.response.text();
    
    try {
      const parsed = JSON.parse(text);
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
  
  let aiResult = null;
  if (imageUrl) {
    aiResult = await extractWithGeminiVision(imageUrl, caption, post);
  }
  
  // Caption-only fallback
  if (!aiResult && !imageUrl && caption && caption.length > MIN_CAPTION_LENGTH_FOR_EXTRACTION) {
    console.log(`    🔄 No image available, attempting caption-only extraction...`);
    aiResult = await extractFromCaptionOnly(caption, post);
  } else if (!aiResult && imageUrl && caption && caption.length > MIN_CAPTION_LENGTH_FOR_EXTRACTION) {
    console.log(`    🔄 Image extraction failed, attempting caption-only fallback...`);
    aiResult = await extractFromCaptionOnly(caption, post);
  }
  
  // Post-process AI result
  if (aiResult) {
    // ═══════════════════════════════════════════════════════════════
    // URL EXTRACTION FALLBACK - CRITICAL FIX
    // ═══════════════════════════════════════════════════════════════
    if (!aiResult.signupUrl || aiResult.signupUrl === null || aiResult.signupUrl === '') {
      const regexUrl = extractUrlsFromText(caption);
      if (regexUrl) {
        aiResult.signupUrl = regexUrl;
        // Determine URL type
        if (regexUrl === 'link_in_bio') {
          aiResult.urlType = 'link_in_bio';
        } else if (regexUrl === 'dm_for_slots') {
          aiResult.urlType = 'dm';
        } else if (regexUrl.includes('bit.ly') || regexUrl.includes('lnk.to')) {
          aiResult.urlType = 'shortened_url';
        } else if (regexUrl.includes('forms.gle') || regexUrl.includes('google.com/forms')) {
          aiResult.urlType = 'registration';
        } else if (regexUrl.includes('eventbrite') || regexUrl.includes('ticket')) {
          aiResult.urlType = 'tickets';
        } else {
          aiResult.urlType = 'extracted_url';
        }
        console.log(`    🔗 URL extracted via regex: ${regexUrl.substring(0, 50)}... (${aiResult.urlType})`);
      }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // TIME EXTRACTION FALLBACK
    // ═══════════════════════════════════════════════════════════════
    if (!aiResult.eventTime && caption) {
      const regexTime = extractTimeFromCaption(caption);
      if (regexTime) {
        aiResult.eventTime = regexTime;
        console.log(`    ⏰ Time extracted via regex: ${regexTime}`);
      }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // SUB-EVENTS EXTRACTION FALLBACK
    // ═══════════════════════════════════════════════════════════════
    if ((!aiResult.subEvents || aiResult.subEvents.length === 0) && caption) {
      // Check for time slot patterns
      const timeSlotPatterns = [
        /\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)\s*[-–—]\s*[A-Z]/i,
        /\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)\s+[A-Z][a-z]/i,
        /(?:session|workshop|class|set|slot)\s*\d/i,
      ];
      
      const hasTimeSlots = timeSlotPatterns.some(p => p.test(caption));
      if (hasTimeSlots) {
        const regexSubEvents = extractSubEventsFromCaption(caption);
        if (regexSubEvents.length > 0) {
          aiResult.subEvents = regexSubEvents;
          console.log(`    📋 ${regexSubEvents.length} sub-events extracted via regex`);
        } else {
          console.log(`    ⚠️ Caption has time slots but regex couldn't extract - may need manual review`);
        }
      }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // SUB-EVENTS DATE INHERITANCE - CRITICAL FIX
    // ═══════════════════════════════════════════════════════════════
    if (aiResult.subEvents && aiResult.subEvents.length > 0 && aiResult.eventDate) {
      aiResult.subEvents = aiResult.subEvents.map(se => ({
        ...se,
        date: se.date || aiResult.eventDate  // Inherit parent date if null
      }));
      console.log(`    📅 Applied date inheritance to ${aiResult.subEvents.length} sub-events`);
    }
    
    // ═══════════════════════════════════════════════════════════════
    // IS_FREE / PRICE CONSISTENCY FIX
    // ═══════════════════════════════════════════════════════════════
    if (aiResult.isFree === true && (aiResult.price > 0 || aiResult.priceMin > 0 || aiResult.priceMax > 0)) {
      aiResult.isFree = false;
      console.log(`    💰 Fixed is_free inconsistency: has price but was marked free`);
    }
    
    // Check caption for price indicators if marked as free
    if (aiResult.isFree === true && caption) {
      const priceIndicators = /(?:₱|PHP|P)\s*\d{2,}|(?:entrance|door|ticket)\s*(?:fee|price|:)/i;
      if (priceIndicators.test(caption)) {
        // Double-check - don't flip if it says "FREE" explicitly
        const freeIndicators = /\bfree\s*(?:entrance|entry|admission)\b|no\s*(?:entrance|cover)\s*fee|\blibre\b/i;
        if (!freeIndicators.test(caption)) {
          aiResult.isFree = false;
          console.log(`    💰 Fixed is_free: caption has price indicators but was marked free`);
        }
      }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // NCR SERVICE AREA FILTERING - Detect non-Metro Manila venues
    // ═══════════════════════════════════════════════════════════════
    const NON_NCR_KEYWORDS = [
      // Philippine provinces outside NCR
      'pampanga', 'angeles city', 'san fernando pampanga', 'clark', 'clark freeport',
      'bulacan', 'malolos', 'meycauayan bulacan', 'san jose del monte',
      'cavite', 'tagaytay', 'silang cavite', 'dasmarinas cavite', 'imus cavite',
      'general trias', 'kawit cavite', 'rosario cavite',
      'laguna', 'los banos', 'los baños', 'san pablo laguna', 'sta. rosa laguna',
      'calamba laguna', 'binan laguna', 'nuvali', 'solenad',
      'batangas', 'lipa batangas', 'tanauan batangas', 'batangas city',
      'rizal province', 'antipolo rizal', 'taytay rizal', 'binangonan rizal',
      'tanay rizal', 'angono rizal', 'morong rizal',
      'nueva ecija', 'tarlac', 'zambales', 'pangasinan', 'quezon province',
      'cebu', 'baguio', 'subic', 'la union', 'iloilo', 'davao', 'cagayan de oro',
      // International locations
      'oregon', 'usa', 'california', 'new york', 'texas', 'florida', 'washington',
      'canada', 'uk', 'united kingdom', 'australia', 'japan', 'korea', 'singapore',
      'hong kong', 'europe', 'coastarts.org', 'newport, or',
    ];
    
    const captionLower = (caption || '').toLowerCase();
    const venueNameLower = (aiResult.venueName || '').toLowerCase();
    const venueAddressLower = (aiResult.venueAddress || '').toLowerCase();
    
    let detectedProvince = null;
    for (const keyword of NON_NCR_KEYWORDS) {
      const pattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (pattern.test(captionLower) || pattern.test(venueNameLower) || pattern.test(venueAddressLower)) {
        detectedProvince = keyword;
        break;
      }
    }
    
    if (detectedProvince) {
      aiResult.isOutsideNCR = true;
      aiResult.detectedProvince = detectedProvince;
      aiResult.locationStatus = 'outside_service_area';
      console.log(`    🌍 Non-NCR location detected: "${detectedProvince}" - marking as outside service area`);
    }
    
    // ═══════════════════════════════════════════════════════════════
    // HISTORICAL POST DETECTION
    // ═══════════════════════════════════════════════════════════════
    if (aiResult.isHistoricalPost) {
      aiResult.isEvent = false;
      console.log(`    📜 Historical post detected - marking as not event`);
    }
    
    // Smart historical detection using eventEndDate for multi-day events
    if (aiResult.eventDate && post.timestamp) {
      const eventDate = new Date(aiResult.eventDate);
      const effectiveEndDate = aiResult.eventEndDate 
        ? new Date(aiResult.eventEndDate) 
        : eventDate;
      const postDate = new Date(post.timestamp);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      
      const postAgeInDays = Math.floor((Date.now() - postDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (effectiveEndDate < today && effectiveEndDate < postDate) {
        aiResult.isEvent = false;
        aiResult.isHistoricalPost = true;
        aiResult.reasoning = (aiResult.reasoning || '') + ' [Auto-detected: Event ended before post date = historical recap]';
        console.log(`    📜 Event end date (${aiResult.eventEndDate || aiResult.eventDate}) before post date - marking as historical`);
      }
      
      if (postAgeInDays > 30 && effectiveEndDate < today) {
        aiResult.isEvent = false;
        aiResult.isHistoricalPost = true;
        aiResult.reasoning = (aiResult.reasoning || '') + ` [Auto-detected: Old post (${postAgeInDays} days) with completed event = historical]`;
        console.log(`    📜 Old post with past event date - marking as historical`);
      }
    }
  }
    
  
  // ═══════════════════════════════════════════════════════════════
  // MENTIONS EXTRACTION - Extract @handles from caption
  // ═══════════════════════════════════════════════════════════════
  const mentions = [];
  if (caption) {
    const mentionRegex = /@([a-zA-Z0-9._]+)/g;
    let match;
    while ((match = mentionRegex.exec(caption)) !== null) {
      const handle = match[1].toLowerCase();
      // Filter out common false positives
      if (handle.length > 2 && !mentions.includes(handle)) {
        mentions.push(handle);
      }
    }
    if (mentions.length > 0) {
      console.log(`    👥 Extracted ${mentions.length} mentions: @${mentions.slice(0, 3).join(', @')}${mentions.length > 3 ? '...' : ''}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // HASHTAGS EXTRACTION - Extract #hashtags from caption
  // ═══════════════════════════════════════════════════════════════
  const hashtags = [];
  if (caption) {
    const hashtagRegex = /#([a-zA-Z0-9_]+)/g;
    let match;
    while ((match = hashtagRegex.exec(caption)) !== null) {
      const tag = match[1].toLowerCase();
      if (tag.length > 2 && !hashtags.includes(tag)) {
        hashtags.push(tag);
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
    mentions: mentions,
    hashtags: hashtags,
    aiExtraction: aiResult,
  };
}

/**
 * Process multiple posts concurrently
 */
async function processPostsConcurrently(posts, concurrency = CONCURRENT_REQUESTS) {
  const results = [];
  
  for (let i = 0; i < posts.length; i += concurrency) {
    const batch = posts.slice(i, i + concurrency);
    const batchPromises = batch.map(async (post) => {
      const postIdentifier = post.shortCode || post.id || `unknown-${Date.now()}`;
      console.log(`  🔍 Processing: ${postIdentifier}`);
      try {
        const processed = await processPost(post);
        if (processed.aiExtraction?.isEvent) {
          console.log(`     ✅ Event: ${processed.aiExtraction.eventTitle || 'Untitled'}${processed.aiExtraction.signupUrl ? ' 🔗' : ''}${processed.aiExtraction.subEvents?.length ? ` (${processed.aiExtraction.subEvents.length} sub-events)` : ''}`);
        } else {
          console.log(`     📝 Not an event`);
        }
        return { success: true, data: processed };
      } catch (err) {
        console.log(`     ❌ Failed: ${err.message}`);
        return { success: false, error: err.message, postId: postIdentifier };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Small delay between concurrent batches to avoid rate limiting
    if (i + concurrency < posts.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  
  return results;
}

/**
 * Main function with resume capability
 */
async function main() {
  const datasetUrl = process.argv[2];
  
  if (!datasetUrl) {
    console.error('❌ Dataset URL required.');
    console.error('Usage: node process-scrape.js <dataset_url>');
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
  console.log(`⚡ Batch size: ${BATCH_SIZE}, Concurrency: ${CONCURRENT_REQUESTS}`);
  
  // Load existing progress if resuming
  const existingProgress = loadProgress(datasetUrl);
  const runId = existingProgress?.runId || crypto.randomUUID();
  const processedPostIds = new Set(existingProgress?.processedPostIds || []);
  const startBatch = existingProgress ? existingProgress.lastCompletedBatch : 0;
  
  // Restore results from previous run
  if (existingProgress?.results) {
    Object.assign(results, existingProgress.results);
    console.log(`📊 Restored progress: ${results.processed} processed, ${results.events} events`);
  }
  
  // Fetch known venues from database
  KNOWN_VENUES = await fetchKnownVenuesFromDatabase();
  console.log(`📍 Using ${KNOWN_VENUES.length} known venues for matching\n`);
  
  // Fetch posts from Apify
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
  
  // Filter out invalid posts
  const preFilterRejections = [];
  const validPosts = posts.filter(post => {
    const hasIdentifier = post.shortCode || post.id;
    const hasImage = post.displayUrl || post.imageUrl;
    
    if (!hasIdentifier || !hasImage) {
      const reason = !hasIdentifier ? 'MISSING_IDENTIFIER' : 'MISSING_IMAGE';
      console.log(`  ⚠️ Skipping post: ${reason}`);
      preFilterRejections.push({
        reason: reason,
        rawData: {
          availableKeys: Object.keys(post).slice(0, 15),
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
  
  // Filter out already processed posts (for resume)
  const remainingPosts = validPosts.filter(post => {
    const postId = post.shortCode || post.id;
    return !processedPostIds.has(postId);
  });
  
  results.total = validPosts.length;
  const totalBatches = Math.ceil(validPosts.length / BATCH_SIZE);
  const remainingBatches = Math.ceil(remainingPosts.length / BATCH_SIZE);
  
  console.log(`✅ Fetched ${posts.length} posts (${validPosts.length} valid)`);
  
  if (remainingPosts.length < validPosts.length) {
    console.log(`⏩ Resuming: ${remainingPosts.length} posts remaining (${validPosts.length - remainingPosts.length} already processed)`);
    console.log(`📦 Starting from batch ${startBatch + 1}/${totalBatches}`);
  }
  
  const estimatedTime = Math.ceil((remainingPosts.length / BATCH_SIZE) * (BATCH_SIZE / CONCURRENT_REQUESTS) * 3 / 60);
  console.log(`⏱️ Estimated time for remaining: ~${estimatedTime} minutes\n`);
  
  console.log(`📋 Run ID: ${runId}`);
  
  // Current progress object for checkpointing
  let currentProgress = {
    datasetUrl,
    runId,
    lastCompletedBatch: startBatch,
    processedPostIds: Array.from(processedPostIds),
    totalBatches,
    results: { ...results },
    lastUpdated: new Date().toISOString()
  };
  
  // Process remaining posts in batches with concurrency
  for (let i = 0; i < remainingPosts.length; i += BATCH_SIZE) {
    // Check timeout before each batch
    checkTimeout(currentProgress);
    
    const batchNum = startBatch + Math.floor(i / BATCH_SIZE) + 1;
    const batch = remainingPosts.slice(i, i + BATCH_SIZE);
    
    console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} posts, ${CONCURRENT_REQUESTS} concurrent)`);
    console.log('─'.repeat(50));
    
    // Process posts concurrently
    const batchResults = await processPostsConcurrently(batch);
    
    const processedPosts = [];
    for (const result of batchResults) {
      if (result.success) {
        processedPosts.push(result.data);
        // Track processed post IDs for resume
        const postId = result.data.postId || result.data.shortCode;
        if (postId) {
          processedPostIds.add(postId);
        }
        if (result.data.aiExtraction?.isEvent) {
          results.events++;
        } else {
          results.notEvents++;
        }
        results.processed++;
      } else {
        results.failed++;
        results.errors.push({ postId: result.postId, error: result.error });
      }
    }
    
    // Send batch to Edge Function
    try {
      console.log(`\n  📤 Sending batch ${batchNum}/${totalBatches} to Edge Function...`);
      const response = await sendBatchToEdgeFunction(processedPosts, runId, batchNum, totalBatches, preFilterRejections);
      console.log(`  ✅ Batch saved: ${response.saved || 0} posts`);
    } catch (err) {
      console.log(`  ❌ Edge function error: ${err.message}`);
      results.errors.push({ batch: batchNum, error: err.message });
    }
    
    // Update and save progress checkpoint
    currentProgress = {
      datasetUrl,
      runId,
      lastCompletedBatch: batchNum,
      processedPostIds: Array.from(processedPostIds),
      totalBatches,
      results: { ...results },
      lastUpdated: new Date().toISOString()
    };
    saveProgress(currentProgress);
    
    // Progress summary
    const progress = ((results.processed / results.total) * 100).toFixed(1);
    console.log(`\n📊 Progress: ${results.processed}/${results.total} (${progress}%)`);
    
    // Delay between batches
    if (i + BATCH_SIZE < remainingPosts.length) {
      console.log(`⏳ Waiting ${DELAY_BETWEEN_BATCHES_MS / 1000}s before next batch...`);
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
    }
  }
  
  // Clean up progress file on successful completion
  if (fs.existsSync(PROGRESS_FILE)) {
    fs.unlinkSync(PROGRESS_FILE);
    console.log('🧹 Cleaned up progress file (completed successfully)');
  }
  
  // Save final results
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(RESULTS_DIR, 'summary.json'),
    JSON.stringify({ ...results, runId, completedAt: new Date().toISOString() }, null, 2)
  );
  
  // Final summary
  console.log('\n' + '═'.repeat(50));
  console.log('🎉 PROCESSING COMPLETE!');
  console.log('═'.repeat(50));
  console.log(`📋 Run ID:     ${runId}`);
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
