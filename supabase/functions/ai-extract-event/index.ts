/**
 * AI-Powered Event Extraction using Google's Gemini API
 * 
 * This function intelligently extracts event information from Instagram captions,
 * handling Filipino/English mixed content, multi-venue events, and complex date formats.
 * 
 * Enhanced with Smart Context System to learn from past corrections and known venue data.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { buildAIContext, AIContext } from './contextBuilder.ts';

// Caption length threshold - captions shorter than this may have details in image
const SHORT_CAPTION_THRESHOLD = 100;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Additional date/venue information for multi-venue events
 */
interface AdditionalDate {
  date: string;
  venue: string;
  time?: string;
}

/**
 * AI extraction result structure
 */
interface AIExtractionResult {
  eventTitle: string | null;
  eventDate: string | null;
  eventEndDate: string | null;
  eventTime: string | null;
  endTime: string | null;
  locationName: string | null;
  locationAddress: string | null;
  isEvent: boolean;
  confidence: number;
  reasoning: string;
  additionalDates?: AdditionalDate[];
  isFree?: boolean;
  price?: number;
  signupUrl?: string;
  // OCR metadata (added when OCR extraction is used)
  ocrTextExtracted?: string[];
  ocrConfidence?: number;
  extractionMethod?: 'ai' | 'ocr_ai' | 'vision';
  sourceBreakdown?: {
    fromCaption: string[];
    fromImage: string[];
  };
  // Event update tracking fields
  isUpdate?: boolean;
  updateType?: 'reschedule' | 'cancel' | 'venue_change' | 'time_change' | null;
  originalDate?: string | null;
  reason?: string | null;
  // Availability status
  availabilityStatus?: 'available' | 'sold_out' | 'waitlist' | 'limited' | 'few_left';
  // Price range support
  priceMin?: number | null;
  priceMax?: number | null;
  priceNotes?: string | null;
  // Location status
  locationStatus?: 'confirmed' | 'tba' | 'secret' | 'dm_for_details';
}

/**
 * OCR extraction result from ocr-extract edge function
 */
interface OCRExtractResult {
  success: boolean;
  textLines: string[];
  fullText: string;
  confidence: number;
  error?: string;
}

// OCR confidence and text length thresholds for triggering vision fallback
const OCR_CONFIDENCE_THRESHOLD = 0.5;
const OCR_MIN_TEXT_LENGTH = 20;

// Timeout for image fetch in milliseconds
const IMAGE_FETCH_TIMEOUT_MS = 30000;

/**
 * Fetch an image and convert it to base64 encoding
 * Returns both the base64 data and the detected MIME type
 */
async function fetchImageAsBase64(imageUrl: string): Promise<{ base64: string; mimeType: string }> {
  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
  
  try {
    const response = await fetch(imageUrl, { signal: controller.signal });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    
    // Detect MIME type from response headers, default to image/jpeg
    const contentType = response.headers.get('content-type');
    let mimeType = 'image/jpeg';
    if (contentType) {
      // Extract just the mime type, ignore charset etc
      const mimeMatch = contentType.match(/^(image\/[a-z]+)/i);
      if (mimeMatch) {
        mimeType = mimeMatch[1].toLowerCase();
      }
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Convert to base64 using chunked approach for better memory efficiency
    const CHUNK_SIZE = 32768; // 32KB chunks
    let binary = '';
    for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
      const chunk = uint8Array.subarray(i, Math.min(i + CHUNK_SIZE, uint8Array.length));
      binary += String.fromCharCode.apply(null, [...chunk]);
    }
    
    return { base64: btoa(binary), mimeType };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Extract event data using Gemini Vision API
 * This function sends the image directly to Gemini for visual understanding,
 * which is better at reading stylized/artistic text than OCR.
 */
async function extractWithGeminiVision(
  imageUrl: string,
  caption: string,
  context: AIContext,
  apiKey: string,
  postTimestamp?: string | null
): Promise<AIExtractionResult> {
  
  // Fetch image and convert to base64
  const { base64: base64Image, mimeType } = await fetchImageAsBase64(imageUrl);
  
  // Use Philippine timezone (UTC+8) for consistent date handling
  const philippineTime = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const currentYear = philippineTime.getUTCFullYear();
  const today = philippineTime.toISOString().split('T')[0];
  
  // Parse post timestamp for relative date calculations
  const postDate = postTimestamp ? new Date(postTimestamp).toISOString().split('T')[0] : null;
  
  const cleanedCaption = cleanCaptionForExtraction(caption);
  
  let prompt = `You are an expert at extracting event information from Filipino Instagram event posters.

TODAY'S DATE: ${today}
${postDate ? `POST TIMESTAMP: ${postDate}` : ''}

INSTAGRAM CAPTION (may be incomplete):
"""
${cleanedCaption || '(No caption provided)'}
"""

The attached image is an event poster. Extract ALL event details directly from the image.

DATE EXTRACTION PRIORITY (CRITICAL):
1. EXPLICIT date in image (highest priority) - e.g., "Nov 29", "December 7", "DEC 04"
2. EXPLICIT date in caption - e.g., "December 7th", "on the 15th"
3. RELATIVE words calculated from POST TIMESTAMP${postDate ? ` (${postDate})` : ''} (not today):
   - "tomorrow" = post_date + 1 day
   - "tonight" = post_date
   - "this weekend" = next Sat/Sun from post_date
   - "bukas" (Filipino) = post_date + 1 day
   - "mamaya" (Filipino) = later today (post_date)

IMPORTANT: If caption says "tomorrow" BUT image shows "Nov 29" → USE "Nov 29"
Relative words just confirm the date, they don't override explicit dates.

YEAR INFERENCE:
- If month/day has already passed this year → assume next year
- "Jan 5" posted in December ${currentYear} → January 5, ${currentYear + 1}
- Always prefer future dates over past dates

MULTI-DAY EVENTS (CRITICAL - always extract eventEndDate for multi-day events):
- "Dec 6-7" or "December 6-7" → eventDate: first date, eventEndDate: last date
- "Dec 12 Fri and Dec 13 Sat" → eventDate: 2025-12-12, eventEndDate: 2025-12-13
- "Friday & Saturday" → calculate both dates, eventEndDate is the Saturday
- "3-day event Dec 12-14" → eventDate: Dec 12, eventEndDate: Dec 14
- "DEC 12-13, 2025" in poster → eventDate: 2025-12-12, eventEndDate: 2025-12-13
- If event spans multiple calendar days → ALWAYS set eventEndDate to the final day

TIME EXTRACTION RULES:
- Look for "PM", "AM", time formats, "doors open"
- TIME AMBIGUITY: Infer AM/PM from context:
  * Bar/club/party/concert events: single-digit hours = PM (9 → 21:00)
  * Market/fair/yoga/run events: morning activities = AM (9 → 09:00)
  * "Doors open 8" at a club → 20:00
  * "Yoga class 7" → 07:00

MIDNIGHT CROSSING:
- If end time is LESS than start time, event crosses midnight
- "10PM - 4AM" on Dec 7 → eventTime: 22:00, endTime: 04:00, eventEndDate: Dec 8
- "11PM - 3AM" → end date is next day

VENUE/LOCATION:
- Look for addresses, venue names, 📍 symbols
- Extract ONLY the venue name, not descriptions or dates
- Stop extracting at: dates, times, hashtags, URLs, sponsor text
- Handle Instagram handles: "@radius_katipunan" → "Radius Katipunan"
- Split venue and address when possible

VENUE EXTRACTION PRIORITY:
1. Physical address from image text (e.g., "5857 Alfonso, Poblacion, Makati")
2. Venue/establishment name from image (e.g., "Red Room", "Radius")
3. 📍 or 📌 emoji followed by location name
4. "at [Place Name]" or "sa [Place Name]" patterns
5. Instagram location tag if provided

DO NOT use as venue:
- @mentions - these are usually artists, DJs, or other accounts
- Generic words after "with" or "featuring" - these are performers
- Account username of the post

PRICE FORMATS TO RECOGNIZE:
- "₱500", "P500", "Php500", "PHP 500" → 500
- "500 pesos", "500php" → 500
- "₱300-500" or "₱300 to ₱500" → 300 (use minimum/presale)
- "₱300 presale / ₱500 door" → 300 (use presale price)
- "FREE", "LIBRE", "Walang bayad", "No cover" → isFree: true, price: null

PRICE EXTRACTION (enhanced):
- Single price: "₱500" → price: 500, priceMin: 500, priceMax: 500
- Range: "₱500-1000" → priceMin: 500, priceMax: 1000
- Tiers: "₱500 GA / ₱1500 VIP" → priceMin: 500, priceMax: 1500, priceNotes: "GA ₱500, VIP ₱1500"
- Conditional: "Free before 10PM, ₱300 after" → priceMin: 0, priceMax: 300, priceNotes: "Free before 10PM"

DETECT EVENT UPDATES:
- If caption contains "RESCHEDULED", "MOVED TO", "NEW DATE", "CHANGE OF DATE" → set isUpdate: true, updateType: 'reschedule'
- If caption contains "CANCELLED", "POSTPONED", "SUSPENDED", "CALLED OFF" → set isUpdate: true, updateType: 'cancel'
- If caption mentions weather (typhoon, bagyo, storm, flood, baha) + date change → set reason: 'weather'
- If caption mentions "venue change", "new location" → set isUpdate: true, updateType: 'venue_change'
- Extract originalDate when rescheduling is detected (the old date being changed from)

DETECT AVAILABILITY:
- "SOLD OUT", "fully booked", "no more slots" → availabilityStatus: 'sold_out'
- "waitlist only", "join waitlist" → availabilityStatus: 'waitlist'
- "limited slots", "few tickets left", "almost full" → availabilityStatus: 'limited'

LOCATION STATUS:
- "secret location", "undisclosed" → locationStatus: 'secret'
- "location TBA", "venue TBD" → locationStatus: 'tba'
- "DM for address", "message for location" → locationStatus: 'dm_for_details'

NOT AN EVENT - Set isEvent: false if:
- Missing ANY of: specific date + venue + invitation language
- Contains operating hours pattern: "6PM — Tues to Sat", "Open Mon-Fri", "Daily 10AM-10PM"
- Says "Every [day]" without a specific date: "Every Friday night"
- Generic promo language with no specific date: "Visit us", "Come check out", "Be in the loop"
- Has day range schedule (Mon-Sat, Tues to Sun) but no specific event date
- Describes regular venue operations, not a unique event
- Rate sheet or menu (price lists for services/drinks, not event tickets)
- Promotional material without event details (teasers, announcements, "coming soon")
- Teaser with "soon", "TBA", "watch this space" but no concrete date/venue

EVENT_ENDED - Set isEvent: false if:
- Event date is in the past (before ${today})
- Post says "was", "happened", "throwback", "last night", "yesterday"
- Post is clearly a recap or retrospective of a past event

Examples of NOT events:
- "Open 6PM — Tues to Sat" → recurring hours, NOT an event
- "Every Friday we have live music" → recurring, no specific date
- "Visit us at our new location" → promo, not event
- "Drink Menu: Beer ₱100, Cocktails ₱200" → rate sheet, NOT an event
- "Coming soon to BGC!" → teaser, no date/venue
- "Amazing night last Saturday!" → past event, EVENT_ENDED

FILIPINO DATE/TIME WORDS:
- Date: "bukas" = tomorrow, "mamaya" = later today, "ngayon" = today
- Days: "Lunes"=Mon, "Martes"=Tue, "Miyerkules"=Wed, "Huwebes"=Thu, "Biyernes"=Fri, "Sabado"=Sat, "Linggo"=Sun
- Time: "tanghali"=noon (~12:00), "hapon"=afternoon (~15:00-18:00), "gabi"=evening (~18:00+), "umaga"=morning (~06:00-11:00)
`;

  // Add known venues context if available
  if (context.knownVenues && context.knownVenues.length > 0) {
    prompt += `
KNOWN VENUES (match if you see these):
${context.knownVenues.map(v => `- "${v.name}"${v.address ? ` at ${v.address}` : ''}`).join('\n')}
`;
  }

  // Add past corrections context if available
  if (context.similarCorrections && context.similarCorrections.length > 0) {
    prompt += `
PAST CORRECTIONS (learn from these):
${context.similarCorrections.map(c => `- "${c.original}" → "${c.corrected}" (${c.field})`).join('\n')}
`;
  }

  prompt += `
Return ONLY valid JSON (no markdown, no code blocks):
{
  "eventTitle": "string - the main event/artist name from stylized text",
  "eventDate": "YYYY-MM-DD",
  "eventEndDate": "YYYY-MM-DD or null (for multi-day events or midnight crossing)",
  "eventTime": "HH:MM:SS (24-hour format)",
  "endTime": "HH:MM:SS or null",
  "locationName": "venue name only - no dates, times, or descriptions",
  "locationAddress": "full address if visible",
  "price": number or null (use minimum/presale price),
  "priceMin": number or null,
  "priceMax": number or null,
  "priceNotes": string or null,
  "isFree": boolean,
  "signupUrl": "URL if visible or null",
  "isEvent": boolean,
  "confidence": 0.0 to 1.0,
  "reasoning": "describe what you found in the image",
  "isUpdate": boolean,
  "updateType": "reschedule" | "cancel" | "venue_change" | "time_change" | null,
  "originalDate": "YYYY-MM-DD" or null,
  "reason": string or null,
  "availabilityStatus": "available" | "sold_out" | "waitlist" | "limited" | "few_left" or null,
  "locationStatus": "confirmed" | "tba" | "secret" | "dm_for_details" or null
}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Image
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024,
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Vision API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  
  // Extract the text content from Gemini response
  const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!textContent) {
    throw new Error('No content in Gemini Vision response');
  }
  
  // Parse the JSON response
  // Clean up the response - remove markdown code blocks if present
  let jsonStr = textContent.trim();
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  }
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();
  
  // Extract JSON from response if there's extra text
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in Gemini Vision response');
  }
  
  const result = JSON.parse(jsonMatch[0]) as AIExtractionResult;
  
  // Validate required fields
  if (typeof result.isEvent !== 'boolean') {
    result.isEvent = false;
  }
  if (typeof result.confidence !== 'number') {
    result.confidence = 0.5;
  }
  if (!result.reasoning) {
    result.reasoning = 'Extracted using Gemini Vision';
  }
  
  result.extractionMethod = 'vision';
  
  return result;
}

/**
 * Clean caption by stripping hashtags before processing
 */
function cleanCaptionForExtraction(caption: string): string {
  // Remove hashtags but preserve the text for context
  const cleaned = caption
    // Replace hashtags with spaces to preserve word boundaries
    .replace(/#[\w]+/g, ' ')
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    .trim();
  
  return cleaned;
}

/**
 * Build the extraction prompt for Gemini with smart context
 */
function buildExtractionPrompt(
  context: AIContext,
  postTimestamp?: string | null
): string {
  const cleanedCaption = cleanCaptionForExtraction(context.caption);
  
  // Use Philippine timezone (UTC+8) for consistent date handling
  const philippineTime = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const currentYear = philippineTime.getUTCFullYear();
  const today = philippineTime.toISOString().split('T')[0];
  
  // Parse post timestamp for relative date calculations
  const postDate = postTimestamp ? new Date(postTimestamp).toISOString().split('T')[0] : null;
  
  let prompt = `You are an expert at extracting event information from Filipino Instagram posts.

TODAY'S DATE: ${today}
${postDate ? `POST TIMESTAMP: ${postDate}` : ''}

CRITICAL VALIDATION RULES:
1. eventDate MUST be on or after today (${today})
2. eventDate MUST be within 6 months of today  
3. eventDate year MUST be ${currentYear} or ${currentYear + 1}
4. If you see past dates, check if it's a recurring event - calculate the NEXT occurrence
5. DO NOT extract phone numbers as prices (e.g., 09171234567 is NOT a price)
6. DO NOT extract years as times (e.g., 2025 is NOT a time)
7. Prices in Philippines are typically ₱100-₱5000 for events

CONFIDENCE GUIDELINES:
- Set confidence >= 0.9 ONLY if all core fields (date, time, venue) are clearly visible
- Set confidence 0.7-0.89 if most fields are clear but some are inferred
- Set confidence 0.5-0.69 if you're making educated guesses
- Set confidence < 0.5 if you're very uncertain

COMMON MISTAKES TO AVOID:
- "@photographer_name" is NOT a venue - it's a credit/mention
- "DM for reservations" numbers are NOT prices
- Sponsor logos/handles are NOT venue names
- "Every Saturday" means recurring - extract the NEXT Saturday from ${today}

CAPTION TO ANALYZE:
"""
${cleanedCaption}
"""

INSTAGRAM LOCATION TAG: ${context.locationHint || 'None provided'}
${context.ownerUsername ? `POSTED BY: @${context.ownerUsername}` : ''}
`;

  // Add corrections context if available
  if (context.similarCorrections.length > 0) {
    prompt += `\nPAST CORRECTIONS (learn from these):`;
    for (const c of context.similarCorrections) {
      prompt += `\n- "${c.original}" → "${c.corrected}" (${c.field})`;
    }
    prompt += '\n';
  }

  // Add known venues if available
  if (context.knownVenues.length > 0) {
    prompt += `\nKNOWN VENUES (use exact names when matching):`;
    for (const v of context.knownVenues) {
      prompt += `\n- "${v.name}"`;
      if (v.aliases.length > 0) prompt += ` (also known as: ${v.aliases.join(', ')})`;
      if (v.address) prompt += ` - ${v.address}`;
    }
    prompt += '\n';
  }

  // Add account context if available
  if (context.accountUsualVenues.length > 0) {
    prompt += `\nTHIS ACCOUNT'S USUAL VENUES:`;
    for (const v of context.accountUsualVenues) {
      prompt += `\n- ${v.venue} (${v.frequency} posts)`;
    }
    prompt += '\n';
  }

  prompt += `
DATE EXTRACTION PRIORITY (CRITICAL):
1. EXPLICIT date in caption (highest priority) - e.g., "December 7th", "Nov 29", "on the 15th"
2. RELATIVE words calculated from POST TIMESTAMP${postDate ? ` (${postDate})` : ''} (not today):
   - "tomorrow" = post_date + 1 day
   - "tonight" = post_date
   - "this weekend" = next Sat/Sun from post_date
   - "bukas" (Filipino) = post_date + 1 day
   - "mamaya" (Filipino) = later today (post_date)

IMPORTANT: Relative words are hints. If both "tomorrow" AND "Nov 29" appear → USE "Nov 29"

YEAR INFERENCE:
- If month/day has already passed this year → assume next year
- "Jan 5" posted in December ${currentYear} → January 5, ${currentYear + 1}
- Always prefer future dates over past dates

MULTI-DAY EVENTS (CRITICAL - extract eventEndDate):
- "Dec 6-7" or "Dec 6 and Dec 7" → eventDate: ${currentYear}-12-06, eventEndDate: ${currentYear}-12-07
- "December 12 Friday and December 13 Saturday" → eventDate: ${currentYear}-12-12, eventEndDate: ${currentYear}-12-13
- "Friday & Saturday" → calculate both dates, set eventDate=first, eventEndDate=last
- "3-day event Dec 12-14" → eventDate: Dec 12, eventEndDate: Dec 14
- "DEC 12-13, 2025" → eventDate: 2025-12-12, eventEndDate: 2025-12-13
- If poster shows MULTIPLE dates on different days → ALWAYS set eventEndDate to the last date

TIME EXTRACTION:
- Convert to 24-hour format (HH:MM:SS)
- TIME AMBIGUITY - Infer AM/PM from context:
  * "gabi" = PM (evening), "umaga" = AM (morning), "tanghali" = noon
  * Bar/club/party/concert events: hours like 8, 9, 10 = PM (20:00, 21:00, 22:00)
  * Market/fair/yoga/run events: hours like 7, 8, 9 = AM (07:00, 08:00, 09:00)

MIDNIGHT CROSSING:
- If end time < start time, event crosses midnight
- "10PM - 4AM" on Dec 7 → eventTime: 22:00, endTime: 04:00, eventEndDate: Dec 8

LOCATION EXTRACTION:
- ONLY the venue name. If a known venue matches, use its exact name.
- STOP extraction at: dates, times, hashtags, sponsor text, @mentions
- "@radius_katipunan" → "Radius Katipunan"
- Split: "Xin Chào - 4344 Valdez St." → locationName: "Xin Chào", locationAddress: "4344 Valdez St."

VENUE EXTRACTION PRIORITY:
1. Physical address (e.g., "5857 Alfonso, Poblacion, Makati")
2. Venue/establishment name (e.g., "Red Room", "Radius")
3. 📍 or 📌 emoji followed by location name
4. "at [Place Name]" or "sa [Place Name]" patterns
5. Instagram location tag if provided

DO NOT use as venue:
- @mentions - these are usually artists, DJs, or other accounts
- Generic words after "with" or "featuring" - these are performers
- Account username of the post

PRICE FORMATS:
- "₱500", "P500", "Php500", "PHP 500" → 500
- "₱300-500" → 300 (use minimum/presale)
- "FREE", "LIBRE", "Walang bayad" → isFree: true, price: null

PRICE EXTRACTION (enhanced):
- Single price: "₱500" → price: 500, priceMin: 500, priceMax: 500
- Range: "₱500-1000" → priceMin: 500, priceMax: 1000
- Tiers: "₱500 GA / ₱1500 VIP" → priceMin: 500, priceMax: 1500, priceNotes: "GA ₱500, VIP ₱1500"
- Conditional: "Free before 10PM, ₱300 after" → priceMin: 0, priceMax: 300, priceNotes: "Free before 10PM"

DETECT EVENT UPDATES:
- If caption contains "RESCHEDULED", "MOVED TO", "NEW DATE", "CHANGE OF DATE" → set isUpdate: true, updateType: 'reschedule'
- If caption contains "CANCELLED", "POSTPONED", "SUSPENDED", "CALLED OFF" → set isUpdate: true, updateType: 'cancel'
- If caption mentions weather (typhoon, bagyo, storm, flood, baha) + date change → set reason: 'weather'
- If caption mentions "venue change", "new location" → set isUpdate: true, updateType: 'venue_change'
- Extract originalDate when rescheduling is detected (the old date being changed from)

DETECT AVAILABILITY:
- "SOLD OUT", "fully booked", "no more slots" → availabilityStatus: 'sold_out'
- "waitlist only", "join waitlist" → availabilityStatus: 'waitlist'
- "limited slots", "few tickets left", "almost full" → availabilityStatus: 'limited'

LOCATION STATUS:
- "secret location", "undisclosed" → locationStatus: 'secret'
- "location TBA", "venue TBD" → locationStatus: 'tba'
- "DM for address", "message for location" → locationStatus: 'dm_for_details'

NOT AN EVENT - Set isEvent: false if:
- Missing ANY of: specific date + venue + invitation language
- Contains operating hours pattern: "6PM — Tues to Sat", "Open Mon-Fri", "Daily 10AM-10PM"
- Says "Every [day]" without a specific date: "Every Friday night"
- Generic promo language with no specific date: "Visit us", "Come check out", "Be in the loop"
- Has day range schedule (Mon-Sat, Tues to Sun) but no specific event date
- Describes regular venue operations, not a unique event
- Rate sheet or menu (price lists for services/drinks, not event tickets)
- Promotional material without event details (teasers, announcements, "coming soon")
- Teaser with "soon", "TBA", "watch this space" but no concrete date/venue

EVENT_ENDED - Set isEvent: false if:
- Event date is in the past (before ${today})
- Post says "was", "happened", "throwback", "last night", "yesterday"
- Post is clearly a recap or retrospective of a past event

Examples of NOT events:
- "Open 6PM — Tues to Sat" → recurring hours, NOT an event
- "Every Friday we have live music" → recurring, no specific date
- "Visit us at our new location" → promo, not event
- "Drink Menu: Beer ₱100, Cocktails ₱200" → rate sheet, NOT an event
- "Coming soon to BGC!" → teaser, no date/venue
- "Amazing night last Saturday!" → past event, EVENT_ENDED

FILIPINO LANGUAGE:
- Date: "bukas"=tomorrow, "mamaya"=later today, "ngayon"=today
- Days: "Lunes"=Mon, "Martes"=Tue, "Miyerkules"=Wed, "Huwebes"=Thu, "Biyernes"=Fri, "Sabado"=Sat, "Linggo"=Sun
- Time: "tanghali"=noon, "hapon"=afternoon, "gabi"=evening, "umaga"=morning

CATEGORY (must be one of these EXACT values):
- nightlife: clubs, bars, DJ sets, parties, club nights
- music: concerts, gigs, live bands, album launches, open mic
- art_culture: galleries, theater, film screenings, art shows, exhibits
- markets: bazaars, pop-ups, flea markets, food markets, thrift sales
- food: food festivals, dining events, tastings, pop-up restaurants
- workshops: classes, seminars, skill-building, tutorials
- community: meetups, fundraisers, volunteer events, networking
- comedy: stand-up, improv, comedy shows
- other: anything that doesn't fit above

RECURRING EVENTS:
- If caption says "Every Friday", "Weekly", "Monthly", "Regularly" → isRecurring: true
- Pattern detection:
  * "Every Friday" → recurrencePattern: "weekly:friday"
  * "Every Saturday" → recurrencePattern: "weekly:saturday"
  * "First Friday of every month" → recurrencePattern: "monthly:first-friday"
  * "Biweekly on Saturdays" → recurrencePattern: "biweekly:saturday"
- Still extract the NEXT occurrence date as eventDate

OTHER RULES:
- event_title: Extract the actual event NAME, not the first line of caption
- If multiple venues/dates exist, put the FIRST one as primary and list others in additionalDates
- is_event: true if this describes an upcoming event with date/time/location
- confidence: 0.0-1.0 based on how certain you are about the extraction

Return a valid JSON object with these exact fields:
{
  "eventTitle": string or null,
  "eventDate": "YYYY-MM-DD" or null,
  "eventEndDate": "YYYY-MM-DD" or null (for multi-day events or midnight crossing),
  "eventTime": "HH:MM:SS" or null,
  "endTime": "HH:MM:SS" or null,
  "locationName": string or null (venue name only, no dates/times/hashtags),
  "locationAddress": string or null,
  "isEvent": boolean,
  "confidence": number (0.0-1.0),
  "reasoning": string explaining extraction logic,
  "additionalDates": [{"date": "YYYY-MM-DD", "venue": string, "time": "HH:MM:SS"}] or null,
  "isFree": boolean or null,
  "price": number or null (in PHP, use minimum/presale),
  "priceMin": number or null,
  "priceMax": number or null,
  "priceNotes": string or null,
  "signupUrl": string or null,
  "isUpdate": boolean,
  "updateType": "reschedule" | "cancel" | "venue_change" | "time_change" | null,
  "originalDate": "YYYY-MM-DD" or null,
  "reason": string or null,
  "availabilityStatus": "available" | "sold_out" | "waitlist" | "limited" | "few_left" or null,
  "locationStatus": "confirmed" | "tba" | "secret" | "dm_for_details" or null,
  "category": "nightlife" | "music" | "art_culture" | "markets" | "food" | "workshops" | "community" | "comedy" | "other",
  "isRecurring": boolean,
  "recurrencePattern": string or null
}`;

  return prompt;
}

/**
 * Build the extraction prompt with OCR text from image
 */
function buildPromptWithOCR(
  caption: string,
  ocrText: string,
  ocrLines: string[],
  context: AIContext,
  postTimestamp?: string | null
): string {
  const cleanedCaption = cleanCaptionForExtraction(caption);
  
  // Use Philippine timezone (UTC+8) for consistent date handling
  const philippineTime = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const currentYear = philippineTime.getUTCFullYear();
  const today = philippineTime.toISOString().split('T')[0];
  
  // Parse post timestamp for relative date calculations
  const postDate = postTimestamp ? new Date(postTimestamp).toISOString().split('T')[0] : null;
  
  let prompt = `You are an expert at extracting event information from Filipino Instagram posts.

TODAY'S DATE: ${today}
${postDate ? `POST TIMESTAMP: ${postDate}` : ''}

INSTAGRAM CAPTION:
"""
${cleanedCaption || '(No caption provided)'}
"""
`;

  if (ocrText && ocrText.trim().length > 0) {
    prompt += `
TEXT EXTRACTED FROM EVENT POSTER IMAGE (via OCR):
"""
${ocrText}
"""

INDIVIDUAL TEXT LINES FROM IMAGE:
${ocrLines.map((line, i) => `${i + 1}. ${line}`).join('\n')}

IMPORTANT: The IMAGE TEXT often contains the real event details (date, time, venue, price).
The CAPTION is often just promotional text. Prioritize information from the image!
`;
  }

  if (context.similarCorrections && context.similarCorrections.length > 0) {
    prompt += `
PAST CORRECTIONS (learn from these):
${context.similarCorrections.map(c => `- "${c.original}" → "${c.corrected}"`).join('\n')}
`;
  }

  if (context.knownVenues && context.knownVenues.length > 0) {
    prompt += `
KNOWN VENUES (use exact names when matching):
${context.knownVenues.map(v => `- "${v.name}"${v.aliases?.length > 0 ? ` (aliases: ${v.aliases.join(', ')})` : ''}`).join('\n')}
`;
  }

  prompt += `

DATE EXTRACTION PRIORITY (CRITICAL):
1. EXPLICIT date in image (highest priority) - e.g., "Nov 29", "December 7", "DEC 04"
2. EXPLICIT date in caption - e.g., "December 7th", "on the 15th"
3. RELATIVE words calculated from POST TIMESTAMP${postDate ? ` (${postDate})` : ''} (not today):
   - "tomorrow" = post_date + 1 day
   - "tonight" = post_date
   - "this weekend" = next Sat/Sun from post_date
   - "bukas" (Filipino) = post_date + 1 day

IMPORTANT: If caption says "tomorrow" BUT image shows "Nov 29" → USE "Nov 29"
Relative words just confirm the date, they don't override explicit dates.

YEAR INFERENCE:
- If month/day has already passed this year → assume next year
- "Jan 5" posted in December ${currentYear} → January 5, ${currentYear + 1}
- Always prefer future dates over past dates

MULTI-DAY EVENTS:
- "Dec 6-7" → eventDate: first date, eventEndDate: last date
- "Friday & Saturday" → calculate both dates

TIME EXTRACTION:
- Look for "PM", "AM", time formats. Convert to 24-hour HH:MM:SS
- TIME AMBIGUITY: Infer AM/PM from context:
  * Bar/club/party/concert → PM (9 → 21:00)
  * Market/fair/yoga → AM (9 → 09:00)

MIDNIGHT CROSSING:
- If end time < start time, event crosses midnight
- "10PM - 4AM" on Dec 7 → eventTime: 22:00, endTime: 04:00, eventEndDate: Dec 8

LOCATION EXTRACTION:
- Extract ONLY the venue name from the image (usually more accurate than caption)
- STOP extraction at: dates, times, hashtags, sponsor text, @mentions
- "@radius_katipunan" → "Radius Katipunan"

VENUE EXTRACTION PRIORITY:
1. Physical address from image text (e.g., "5857 Alfonso, Poblacion, Makati")
2. Venue/establishment name from image (e.g., "Red Room", "Radius")
3. 📍 or 📌 emoji followed by location name
4. "at [Place Name]" or "sa [Place Name]" patterns
5. Instagram location tag if provided

DO NOT use as venue:
- @mentions - these are usually artists, DJs, or other accounts
- Generic words after "with" or "featuring" - these are performers
- Account username of the post

PRICE FORMATS:
- "₱500", "P500", "Php500", "PHP 500" → 500
- "₱300-500" → 300 (use minimum/presale)
- "FREE", "LIBRE", "Walang bayad" → isFree: true, price: null

PRICE EXTRACTION (enhanced):
- Single price: "₱500" → price: 500, priceMin: 500, priceMax: 500
- Range: "₱500-1000" → priceMin: 500, priceMax: 1000
- Tiers: "₱500 GA / ₱1500 VIP" → priceMin: 500, priceMax: 1500, priceNotes: "GA ₱500, VIP ₱1500"
- Conditional: "Free before 10PM, ₱300 after" → priceMin: 0, priceMax: 300, priceNotes: "Free before 10PM"

DETECT EVENT UPDATES:
- If caption contains "RESCHEDULED", "MOVED TO", "NEW DATE", "CHANGE OF DATE" → set isUpdate: true, updateType: 'reschedule'
- If caption contains "CANCELLED", "POSTPONED", "SUSPENDED", "CALLED OFF" → set isUpdate: true, updateType: 'cancel'
- If caption mentions weather (typhoon, bagyo, storm, flood, baha) + date change → set reason: 'weather'
- If caption mentions "venue change", "new location" → set isUpdate: true, updateType: 'venue_change'
- Extract originalDate when rescheduling is detected (the old date being changed from)

DETECT AVAILABILITY:
- "SOLD OUT", "fully booked", "no more slots" → availabilityStatus: 'sold_out'
- "waitlist only", "join waitlist" → availabilityStatus: 'waitlist'
- "limited slots", "few tickets left", "almost full" → availabilityStatus: 'limited'

LOCATION STATUS:
- "secret location", "undisclosed" → locationStatus: 'secret'
- "location TBA", "venue TBD" → locationStatus: 'tba'
- "DM for address", "message for location" → locationStatus: 'dm_for_details'

NOT AN EVENT - Set isEvent: false if:
- Missing ANY of: specific date + venue + invitation language
- Contains operating hours pattern: "6PM — Tues to Sat", "Open Mon-Fri", "Daily 10AM-10PM"
- Says "Every [day]" without a specific date: "Every Friday night"
- Generic promo language with no specific date: "Visit us", "Come check out", "Be in the loop"
- Has day range schedule (Mon-Sat, Tues to Sun) but no specific event date
- Describes regular venue operations, not a unique event
- Rate sheet or menu (price lists for services/drinks, not event tickets)
- Promotional material without event details (teasers, announcements, "coming soon")
- Teaser with "soon", "TBA", "watch this space" but no concrete date/venue

EVENT_ENDED - Set isEvent: false if:
- Event date is in the past (before ${today})
- Post says "was", "happened", "throwback", "last night", "yesterday"
- Post is clearly a recap or retrospective of a past event

Examples of NOT events:
- "Open 6PM — Tues to Sat" → recurring hours, NOT an event
- "Every Friday we have live music" → recurring, no specific date
- "Visit us at our new location" → promo, not event
- "Drink Menu: Beer ₱100, Cocktails ₱200" → rate sheet, NOT an event
- "Coming soon to BGC!" → teaser, no date/venue
- "Amazing night last Saturday!" → past event, EVENT_ENDED

FILIPINO LANGUAGE:
- Date: "bukas"=tomorrow, "mamaya"=later today, "ngayon"=today
- Days: "Lunes"=Mon, "Martes"=Tue, "Miyerkules"=Wed, "Huwebes"=Thu, "Biyernes"=Fri, "Sabado"=Sat, "Linggo"=Sun
- Time: "tanghali"=noon, "hapon"=afternoon, "gabi"=evening, "umaga"=morning

Return ONLY valid JSON (no markdown, no code blocks):
{
  "eventTitle": "string",
  "eventDate": "YYYY-MM-DD",
  "eventEndDate": "YYYY-MM-DD or null (for multi-day events or midnight crossing)",
  "eventTime": "HH:MM:SS",
  "endTime": "HH:MM:SS or null",
  "locationName": "venue name only - no dates, times, or descriptions",
  "locationAddress": "full address if found, or null",
  "price": number or null (use minimum/presale),
  "priceMin": number or null,
  "priceMax": number or null,
  "priceNotes": string or null,
  "isFree": boolean,
  "signupUrl": "URL if found or null",
  "isEvent": boolean,
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation of what was found where",
  "sourceBreakdown": {
    "fromCaption": ["fields found in caption"],
    "fromImage": ["fields found in image OCR"]
  },
  "isUpdate": boolean,
  "updateType": "reschedule" | "cancel" | "venue_change" | "time_change" | null,
  "originalDate": "YYYY-MM-DD" or null,
  "reason": string or null,
  "availabilityStatus": "available" | "sold_out" | "waitlist" | "limited" | "few_left" or null,
  "locationStatus": "confirmed" | "tba" | "secret" | "dm_for_details" or null
}`;

  return prompt;
}

/**
 * Call OCR extraction edge function
 */
async function callOCRExtract(
  imageUrl: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<OCRExtractResult | null> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/ocr-extract`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ imageUrl })
    });
    
    if (!response.ok) {
      console.error(`OCR extraction failed with status ${response.status}`);
      return null;
    }
    
    const result = await response.json() as OCRExtractResult;
    return result;
  } catch (error) {
    console.error('OCR extraction error:', error);
    return null;
  }
}

/**
 * Extract event with OCR assistance
 * This combines OCR text from image with caption text for AI analysis.
 * Falls back to Gemini Vision when OCR confidence is low or text extraction is minimal.
 */
async function extractWithOCRAndAI(
  caption: string,
  imageUrl: string,
  context: AIContext,
  supabaseUrl: string,
  supabaseKey: string,
  geminiApiKey: string,
  postTimestamp?: string | null
): Promise<AIExtractionResult> {
  
  // Step 1: Run OCR on image
  let ocrText = '';
  let ocrLines: string[] = [];
  let ocrConfidence = 0;
  
  const ocrResult = await callOCRExtract(imageUrl, supabaseUrl, supabaseKey);
  
  if (ocrResult && ocrResult.success) {
    ocrText = ocrResult.fullText;
    ocrLines = ocrResult.textLines;
    ocrConfidence = ocrResult.confidence;
    console.log(`OCR extracted ${ocrLines.length} lines with confidence ${ocrConfidence}`);
  } else {
    console.warn('OCR failed:', ocrResult?.error || 'Unknown error');
  }

  // Step 2: Check if OCR was successful enough
  const ocrSuccessful = ocrConfidence >= OCR_CONFIDENCE_THRESHOLD && ocrText.length >= OCR_MIN_TEXT_LENGTH;
  
  if (!ocrSuccessful && imageUrl) {
    // OCR struggled - fall back to Gemini Vision
    console.log(`OCR confidence too low (${ocrConfidence}) or text too short (${ocrText.length} chars). Using Gemini Vision.`);
    
    try {
      const visionResult = await extractWithGeminiVision(imageUrl, caption, context, geminiApiKey, postTimestamp);
      return {
        ...visionResult,
        extractionMethod: 'vision',
        ocrConfidence: ocrConfidence > 0 ? ocrConfidence : undefined, // Track that OCR was attempted
      };
    } catch (visionError) {
      console.warn('Gemini Vision failed, falling back to OCR+AI:', visionError);
      // Continue with OCR+AI as last resort
    }
  }

  // Step 3: Build enhanced prompt with OCR text (original flow)
  const combinedPrompt = buildPromptWithOCR(caption, ocrText, ocrLines, context, postTimestamp);
  
  // Step 4: Call Gemini with combined context
  const aiResult = await callGeminiAPI(combinedPrompt, geminiApiKey);
  
  // Step 5: Add OCR metadata
  return {
    ...aiResult,
    ocrTextExtracted: ocrLines.length > 0 ? ocrLines : undefined,
    ocrConfidence: ocrConfidence > 0 ? ocrConfidence : undefined,
    extractionMethod: ocrLines.length > 0 ? 'ocr_ai' : 'ai'
  };
}

/**
 * Call Gemini API for extraction
 */
async function callGeminiAPI(
  prompt: string,
  apiKey: string
): Promise<AIExtractionResult> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.1, // Low temperature for consistent extraction
          topP: 0.8,
          topK: 40,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  
  // Extract the text content from Gemini response
  const textContent = result.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!textContent) {
    throw new Error('No content in Gemini response');
  }

  // Parse the JSON response
  try {
    // Clean up the response - remove markdown code blocks if present
    let jsonStr = textContent.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    }
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();
    
    const parsed = JSON.parse(jsonStr) as AIExtractionResult;
    
    // Validate required fields
    if (typeof parsed.isEvent !== 'boolean') {
      parsed.isEvent = false;
    }
    if (typeof parsed.confidence !== 'number') {
      parsed.confidence = 0.5;
    }
    if (!parsed.reasoning) {
      parsed.reasoning = 'No reasoning provided';
    }
    
    return parsed;
  } catch (parseError) {
    console.error('Failed to parse Gemini response:', textContent);
    throw new Error(`Failed to parse Gemini response: ${parseError}`);
  }
}

/**
 * Validate and clean the extraction result
 */
function validateExtractionResult(result: AIExtractionResult): AIExtractionResult {
  // Validate date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (result.eventDate && !dateRegex.test(result.eventDate)) {
    result.eventDate = null;
  }
  if (result.eventEndDate && !dateRegex.test(result.eventEndDate)) {
    result.eventEndDate = null;
  }
  
  // Validate time format (HH:MM:SS)
  const timeRegex = /^\d{2}:\d{2}:\d{2}$/;
  if (result.eventTime && !timeRegex.test(result.eventTime)) {
    // Try to fix common time formats
    if (/^\d{2}:\d{2}$/.test(result.eventTime)) {
      result.eventTime = result.eventTime + ':00';
    } else {
      result.eventTime = null;
    }
  }
  if (result.endTime && !timeRegex.test(result.endTime)) {
    if (/^\d{2}:\d{2}$/.test(result.endTime)) {
      result.endTime = result.endTime + ':00';
    } else {
      result.endTime = null;
    }
  }
  
  // Validate time values
  if (result.eventTime) {
    const [hour, minute] = result.eventTime.split(':').map(Number);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      result.eventTime = null;
    }
  }
  if (result.endTime) {
    const [hour, minute] = result.endTime.split(':').map(Number);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      result.endTime = null;
    }
  }
  
  // Clean location name - strip any remaining dates, times, hashtags
  if (result.locationName) {
    let cleanLoc = result.locationName
      // Remove date patterns
      .replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s*\d{1,2}(?:-\d{1,2})?,?\s*\d{0,4}/gi, '')
      // Remove time patterns
      .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, '')
      .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, '')
      // Remove hashtags
      .replace(/#[\w]+/g, '')
      // Remove sponsor text
      .replace(/\s*(?:Made possible by|Powered by|Sponsored by|Presented by|In partnership with):?.*$/i, '')
      // Remove @mentions
      .replace(/@[\w.]+/g, '')
      // Clean up whitespace
      .replace(/\s+/g, ' ')
      .trim();
    
    // Remove trailing punctuation
    cleanLoc = cleanLoc.replace(/[.,!?;:]+$/, '').trim();
    
    result.locationName = cleanLoc || null;
  }
  
  // Validate additionalDates
  if (result.additionalDates && Array.isArray(result.additionalDates)) {
    result.additionalDates = result.additionalDates.filter(ad => {
      if (!ad.date || !dateRegex.test(ad.date)) return false;
      if (!ad.venue) return false;
      if (ad.time && !timeRegex.test(ad.time)) {
        ad.time = undefined;
      }
      return true;
    });
    if (result.additionalDates.length === 0) {
      result.additionalDates = undefined;
    }
  }
  
  // Ensure confidence is in valid range
  result.confidence = Math.max(0, Math.min(1, result.confidence));
  
  return result;
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get Gemini API key
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ 
          error: 'GEMINI_API_KEY not configured',
          message: 'Please set the GEMINI_API_KEY secret in Supabase'
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Parse request body
    const body = await req.json();
    const { 
      caption, 
      imageUrl,
      locationHint, 
      postId, 
      postedAt, 
      ownerUsername, 
      instagramAccountId,
      useOCR // Optional flag to force OCR extraction
    } = body;

    // Allow extraction with just imageUrl (for image-only posts)
    if (!caption && !imageUrl) {
      return new Response(
        JSON.stringify({ error: 'Either caption or imageUrl is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`AI extraction for post: ${postId || 'unknown'}${imageUrl ? ' (with image)' : ''}`);

    // Initialize Supabase client for context building
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    let context: AIContext;
    
    if (supabaseUrl && supabaseServiceKey) {
      // Build smart context from database
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      context = await buildAIContext({
        caption: caption || '',
        locationHint,
        postedAt,
        ownerUsername,
        instagramAccountId,
      }, supabase);
      
      console.log(`Context built: ${context.similarCorrections.length} corrections, ${context.knownVenues.length} venues, ${context.accountUsualVenues.length} account venues`);
    } else {
      // Fallback: no smart context, just raw data
      console.log('Supabase not configured, using raw data only');
      context = {
        caption: caption || '',
        locationHint: locationHint || null,
        postedAt: postedAt || null,
        ownerUsername: ownerUsername || null,
        similarCorrections: [],
        knownVenues: [],
        accountUsualVenues: [],
      };
    }

    let result: AIExtractionResult;

    // Use OCR extraction if imageUrl is provided and either:
    // 1. useOCR flag is explicitly set
    // 2. Caption is short/missing (details probably in image)
    const shouldUseOCR = imageUrl && supabaseUrl && supabaseServiceKey && (
      useOCR || 
      !caption || 
      (caption && caption.length < SHORT_CAPTION_THRESHOLD)
    );

    if (shouldUseOCR) {
      console.log(`Using OCR+AI extraction for post: ${postId || 'unknown'}`);
      const rawResult = await extractWithOCRAndAI(
        caption || '',
        imageUrl,
        context,
        supabaseUrl!,
        supabaseServiceKey!,
        geminiApiKey,
        postedAt // Pass post timestamp for relative date calculations
      );
      result = validateExtractionResult(rawResult);
    } else {
      // Standard caption-only AI extraction
      const prompt = buildExtractionPrompt(context, postedAt);
      const rawResult = await callGeminiAPI(prompt, geminiApiKey);
      result = validateExtractionResult(rawResult);
    }
    
    console.log(`AI extraction result for ${postId}: isEvent=${result.isEvent}, confidence=${result.confidence}, method=${result.extractionMethod || 'ai'}`);

    return new Response(
      JSON.stringify({
        success: true,
        postId,
        extraction: result,
        contextUsed: {
          corrections: context.similarCorrections.length,
          knownVenues: context.knownVenues.length,
          accountVenues: context.accountUsualVenues.length,
        },
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('AI extraction error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
