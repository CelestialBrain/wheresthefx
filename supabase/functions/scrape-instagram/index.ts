import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import {
  preNormalizeText,
  isVendorPost,
  isVendorPostStrict,
  isPossiblyVendorPost,
  extractPrice,
  extractTime,
  extractDate,
  extractVenue,
  extractSignupUrl,
  autoTagPost,
  isValidAddress,
  hasTemporalEventIndicators,
  normalizeLocationAddress,
  canonicalizeVenueName,
} from './extractionUtils.ts';
import { ScraperLogger, RejectedPostLogData } from './logger.ts';

/*
 * DATABASE SCHEMA NOTES:
 * 
 * The instagram_posts table includes the following columns used by this function:
 * - needs_review: BOOLEAN (already exists via migration 20251023171840)
 *   Used to flag posts that need manual review due to:
 *   a) Missing critical info (date, time, or location)
 *   b) Borderline merchant/event classification
 *   c) Merchant tags with weak event structure
 * 
 * - tags: TEXT[] (already exists)
 *   Auto-generated tags including new merchant/promo tags:
 *   'sale', 'shop', 'promotion' (for merchant content detection)
 * 
 * No schema migrations are needed for this change.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Interface for Apify dataset items
interface ApifyDatasetItem {
  id?: string;
  shortCode?: string;
  type?: 'Sidecar' | 'Image' | 'Video';
  caption?: string;
  commentsCount?: number;
  likesCount?: number;
  timestamp?: string;
  locationName?: string | null;
  ownerFullName?: string;
  ownerUsername?: string;
  ownerId?: string;
  url?: string;
  inputUrl?: string;
  displayUrl?: string;  // Direct CDN image URL (primary)
  imageUrl?: string;    // Alternative image URL field
  hashtags?: string[];
  mentions?: string[];
  error?: string;
  errorDescription?: string;
  childPosts?: any[];
}

// Extract dataset ID and token from input
function parseDatasetInput(input: string): { datasetId: string; token: string | undefined } {
  const datasetMatch = input.match(/datasets\/([a-zA-Z0-9]+)/);
  const datasetId = datasetMatch ? datasetMatch[1] : input.trim();
  
  const tokenMatch = input.match(/[?&]token=([^&]+)/);
  const token = tokenMatch ? tokenMatch[1] : undefined;
  
  return { datasetId, token };
}

// Extract username from Instagram URL
function extractUsernameFromUrl(url: string): string | undefined {
  if (!url) return undefined;
  const match = url.match(/instagram\.com\/([^/?]+)/);
  if (!match) return undefined;
  let username = decodeURIComponent(match[1]).trim().toLowerCase();
  if (username.startsWith('@')) username = username.slice(1);
  return username || undefined;
}

// Parse and normalize date to YYYY-MM-DD format
function parseAndNormalizeDate(dateStr: string): string | null {
  if (!dateStr) return null;
  
  const currentYear = new Date().getFullYear();
  const today = new Date();
  
  // If already in YYYY-MM-DD format, validate and return
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const date = new Date(dateStr);
    // If date is in the past by more than 30 days, assume next year
    if (date < new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)) {
      date.setFullYear(currentYear + 1);
      return date.toISOString().split('T')[0];
    }
    return dateStr;
  }
  
  // Handle "Month Day" or "Month Day, Year" formats
  const monthDayYearMatch = dateStr.match(/(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?/i);
  if (monthDayYearMatch) {
    const monthStr = dateStr.match(/(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i)?.[0].toLowerCase();
    const monthMap: { [key: string]: number } = {
      january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2,
      april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6,
      august: 7, aug: 7, september: 8, sep: 8, october: 9, oct: 9,
      november: 10, nov: 10, december: 11, dec: 11
    };
    
    if (monthStr && monthMap[monthStr] !== undefined) {
      const day = parseInt(monthDayYearMatch[1]);
      let year = monthDayYearMatch[2] ? parseInt(monthDayYearMatch[2]) : currentYear;
      
      const date = new Date(year, monthMap[monthStr], day);
      
      // If date is in the past by more than 30 days, assume next year
      if (date < new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)) {
        date.setFullYear(currentYear + 1);
      }
      
      return date.toISOString().split('T')[0];
    }
  }
  
  // Handle MM/DD or MM/DD/YYYY formats
  const slashMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (slashMatch) {
    const month = parseInt(slashMatch[1]) - 1;
    const day = parseInt(slashMatch[2]);
    let year = slashMatch[3] ? parseInt(slashMatch[3]) : currentYear;
    if (year < 100) year += 2000; // Handle 2-digit years
    
    const date = new Date(year, month, day);
    
    // If date is in the past by more than 30 days, assume next year
    if (date < new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)) {
      date.setFullYear(currentYear + 1);
    }
    
    return date.toISOString().split('T')[0];
  }
  
  // Handle DD-MM-YYYY formats
  const dashMatch = dateStr.match(/(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (dashMatch) {
    const day = parseInt(dashMatch[1]);
    const month = parseInt(dashMatch[2]) - 1;
    let year = parseInt(dashMatch[3]);
    if (year < 100) year += 2000;
    
    const date = new Date(year, month, day);
    
    // If date is in the past by more than 30 days, assume next year
    if (date < new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)) {
      date.setFullYear(currentYear + 1);
    }
    
    return date.toISOString().split('T')[0];
  }
  
  return null;
}

// Convert relative date terms to actual dates with improved year detection
function parseRelativeDate(text: string): string | null {
  const now = new Date();
  const lowercaseText = text.toLowerCase();
  
  if (lowercaseText.includes('tonight') || lowercaseText.includes('today')) {
    return now.toISOString().split('T')[0];
  }
  
  if (lowercaseText.includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }
  
  if (lowercaseText.includes('this weekend')) {
    const dayOfWeek = now.getDay();
    const daysUntilFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 0;
    const friday = new Date(now);
    friday.setDate(now.getDate() + daysUntilFriday);
    return friday.toISOString().split('T')[0];
  }
  
  return null;
}

// Validate time format (must be HH:MM with valid hours 0-23, minutes 0-59)
function isValidTime(timeStr: string): boolean {
  if (!timeStr) return false;
  const parts = timeStr.split(':');
  if (parts.length !== 2) return false;
  
  const hour = parseInt(parts[0]);
  const minute = parseInt(parts[1]);
  
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

// Enhanced event parser with learned patterns integration
async function parseEventFromCaption(
  caption: string,
  locationName?: string | null,
  supabase?: any
): Promise<{
  eventTitle?: string;
  eventDate?: string;
  eventEndDate?: string;
  eventTime?: string;
  endTime?: string;
  locationName?: string;
  locationAddress?: string;
  rawLocationName?: string;
  canonicalVenueName?: string;
  signupUrl?: string;
  price?: number;
  isFree?: boolean;
  isEvent: boolean;
  needsReview?: boolean;
  timeValidationFailed?: boolean;
  rawEventTime?: string;
  rawEndTime?: string;
  pricePatternId?: string | null;
  datePatternId?: string | null;
  timePatternId?: string | null;
  venuePatternId?: string | null;
  vendorPatternId?: string | null;
}> {
  if (!caption) {
    return { isEvent: false, isFree: true, needsReview: false };
  }

  // Pre-normalize text to fix OCR issues
  const normalized = preNormalizeText(caption);
  const lowercaseCaption = normalized.toLowerCase();
  
  // STEP 1: Check for vendor/merchant posts using STRICT detection (hard reject)
  if (isVendorPostStrict(normalized)) {
    return { isEvent: false, isFree: true, needsReview: false };
  }
  
  // STEP 2: Check for exclusion patterns (skip generic celebrations)
  const exclusionPatterns = [
    /happy\s+birthday(?!\s+(party|celebration|bash|event))/i,
    /#tbt\b/i,
    /#throwback/i,
    /thank\s+you\s+(to|for)/i,
    /congratulations(?!\s+on\s+.*?\s+(opening|launch|event))/i,
    /welcome\s+to\s+the\s+team/i,
  ];
  
  for (const pattern of exclusionPatterns) {
    if (pattern.test(normalized)) {
      // Unless it's an anniversary with a date and location
      const hasAnniversary = /anniversary/i.test(normalized);
      if (hasAnniversary) {
        const dateInfo = await extractDate(normalized, supabase);
        const hasDate = !!dateInfo.eventDate;
        const venueInfo = await extractVenue(normalized, locationName, supabase);
        const hasLocation = locationName || venueInfo.venueName;
        
        if (!hasDate || !hasLocation) {
          return { isEvent: false, isFree: true, needsReview: false };
        }
      } else {
        return { isEvent: false, isFree: true, needsReview: false };
      }
    }
  }
  
  // STEP 3: Check for event indicators (enhanced with temporal event detection)
  const eventKeywords = [
    'party', 'event', 'happening', 'tonight', 'tomorrow', 'this weekend',
    'join us', 'rsvp', 'free entry', 'entrance', 'tickets', 'doors open',
    'gig', 'concert', 'show', 'performance', 'dj', 'live music',
    'workshop', 'seminar', 'meetup', 'gathering', 'celebration',
    'anniversary', 'opening', 'launch', 'festival', 'market',
    'book now', 'reservations', 'save the date', 'see you', 'come by',
    'drop by', 'visit us', 'limited slots', 'register', 'sign up',
    'admission', 'cover charge', 'entry fee', 'open to public',
    // Added for market/fair/pop-up detection
    'flea market', 'fleamarket', 'bazaar', 'fair', 'pop-up', 'popup',
    'coming to', 'for the first time', 'community market', 'night market'
  ];
  const hasEventKeyword = eventKeywords.some(keyword => lowercaseCaption.includes(keyword));
  
  // Also check for temporal event indicators (date ranges + market/fair/pop-up keywords)
  const hasTemporalIndicators = hasTemporalEventIndicators(normalized);

  if (!hasEventKeyword && !hasTemporalIndicators) {
    return { isEvent: false, isFree: true, needsReview: false };
  }

  // STEP 4: Extract event details using improved utilities with learned patterns
  const lines = normalized.split('\n').filter(line => line.trim());
  const eventTitle = lines[0]?.substring(0, 100) || undefined;

  // Extract structured data - now async with learned patterns
  const priceInfo = await extractPrice(normalized, supabase);
  const timeInfo = await extractTime(normalized, supabase);
  const dateInfo = await extractDate(normalized, supabase);
  const venueInfo = await extractVenue(normalized, locationName, supabase);
  const signupUrl = extractSignupUrl(normalized);

  // Consider it an event if we have event keywords + (date OR location)
  // OR if we have temporal indicators (date range with market/pop-up keywords)
  const hasMinimumInfo = !!(venueInfo.venueName || dateInfo.eventDate);
  
  // STEP 5: Check for soft vendor signals (merchant-ish content)
  const maybeVendor = isPossiblyVendorPost(normalized);
  
  // STEP 6: Determine if this is a borderline case that needs review
  // Enhanced: temporal indicators (date ranges + market keywords) are a strong signal
  const looksLikeEvent = (hasEventKeyword && hasMinimumInfo) || (hasTemporalIndicators && hasMinimumInfo);
  let needsReview = false;
  let isEvent = false;
  
  if (looksLikeEvent && maybeVendor) {
    // Borderline case: has event structure but also merchant signals
    // Mark as event but flag for manual review to catch merchant posts masquerading as events
    isEvent = true;
    needsReview = true;
  } else if (looksLikeEvent) {
    // Clear event case
    isEvent = true;
    needsReview = false;
  } else if (hasTemporalIndicators) {
    // Has temporal indicators but missing key info - still likely an event, flag for review
    isEvent = true;
    needsReview = true;
  } else if (maybeVendor) {
    // Has merchant signals but not enough event structure
    isEvent = false;
    needsReview = false;
  } else {
    // Doesn't look like an event
    isEvent = false;
    needsReview = false;
  }
  
  return {
    eventTitle,
    eventDate: dateInfo.eventDate || undefined,
    eventEndDate: dateInfo.eventEndDate || undefined,
    // Only include time if validation passed
    eventTime: timeInfo.startTime || undefined,
    endTime: timeInfo.endTime || undefined,
    locationName: venueInfo.venueName || undefined,
    locationAddress: venueInfo.address || undefined,
    rawLocationName: venueInfo.rawLocationName || undefined,
    canonicalVenueName: venueInfo.canonicalVenueName || undefined,
    signupUrl: signupUrl || undefined,
    price: priceInfo?.amount,
    isFree: priceInfo?.isFree ?? true,
    isEvent,
    needsReview,
    // Time validation info
    timeValidationFailed: timeInfo.timeValidationFailed,
    rawEventTime: timeInfo.rawStartTime || undefined,
    rawEndTime: timeInfo.rawEndTime || undefined,
    // Pattern IDs for logging and analytics
    pricePatternId: priceInfo?.patternId,
    datePatternId: dateInfo.patternId,
    timePatternId: timeInfo.patternId,
    venuePatternId: venueInfo.patternId,
    vendorPatternId: null, // Not a vendor post if we got here
  };
}

// Check if event has ended (considering both start and end dates)
function isEventInPast(eventDateStr: string | undefined, eventEndDateStr?: string | undefined): boolean {
  if (!eventDateStr) return false;
  
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // If event has an end date, check if end date has passed
    if (eventEndDateStr) {
      const endDate = new Date(eventEndDateStr);
      endDate.setHours(0, 0, 0, 0);
      return endDate < today;
    }
    
    // Otherwise check start date
    const eventDate = new Date(eventDateStr);
    eventDate.setHours(0, 0, 0, 0);
    return eventDate < today;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let runId: string | undefined;
  const startTime = Date.now();
  const TIMEOUT_MS = 55 * 60 * 1000; // 55 minutes

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const apifyApiKeySecret = Deno.env.get('APIFY_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    let body: { datasetId?: string; automated?: boolean; forceImport?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      // No body provided
    }

    const rawDatasetInput = body.datasetId;
    const isAutomated = body.automated || false;
    const forceImport = body.forceImport || false; // New flag for permissive dataset imports
    
    let datasetId: string | undefined;
    let datasetToken: string | undefined;
    
    if (rawDatasetInput) {
      const parsed = parseDatasetInput(rawDatasetInput);
      datasetId = parsed.datasetId;
      datasetToken = parsed.token;
    }

    // Determine which token to use
    let finalToken: string | undefined;
    if (datasetToken) {
      finalToken = datasetToken;
      console.log('Using token from dataset URL');
    } else if (apifyApiKeySecret) {
      finalToken = apifyApiKeySecret;
      console.log('Using APIFY_API_KEY secret');
    }

    if (datasetId && !finalToken) {
      return new Response(
        JSON.stringify({ 
          error: 'No Apify token available. Either include token=... in the dataset URL or set APIFY_API_KEY in backend secrets.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine run type
    const runType = datasetId ? 'manual_dataset' : (isAutomated ? 'automated' : 'manual_scrape');

    // Create scrape run record
    const { data: scrapeRun, error: runError } = await supabase
      .from('scrape_runs')
      .insert({
        run_type: runType,
        dataset_id: datasetId,
        status: 'running',
      })
      .select()
      .single();

    if (runError) {
      console.error('Failed to create scrape run record:', runError);
    }

    runId = scrapeRun?.id;

    console.log(`Starting Instagram data import... Run ID: ${runId}, Type: ${runType}`);
    
    // Initialize logger
    const logger = new ScraperLogger(supabase, runId!);
    await logger.info('fetch', `Starting scrape run: ${runType}`, { datasetId, runType });

    let totalScrapedPosts = 0;
    let totalUpdatedPosts = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    const failureReasons: { [key: string]: number } = {};
    const accountsFound = new Set<string>();

    // MODE 1: Dataset Import
    if (datasetId && finalToken) {
      console.log(`Fetching data from dataset: ${datasetId}`);
      await logger.info('fetch', `Fetching dataset: ${datasetId}`, { datasetId });
      
      const fetchStart = Date.now();
      const apifyResponse = await fetch(
        `https://api.apify.com/v2/datasets/${datasetId}/items?token=${finalToken}&clean=1`
      );
      const fetchDuration = Date.now() - fetchStart;

      if (!apifyResponse.ok) {
        const errorMsg = `Failed to fetch dataset (${apifyResponse.status}): ${apifyResponse.statusText}`;
        console.error(errorMsg);
        await logger.error('fetch', 'Dataset fetch failed', { datasetId, status: apifyResponse.status }, { error: errorMsg });
        
        if (runId) {
          await supabase.from('scrape_runs').update({
            status: 'failed',
            error_message: errorMsg,
            completed_at: new Date().toISOString(),
          }).eq('id', runId);
        }
        
        await logger.close();
        throw new Error(errorMsg);
      }

      const apifyData: ApifyDatasetItem[] = await apifyResponse.json();
      console.log(`Dataset returned ${apifyData.length} items`);
      await logger.success('fetch', `Dataset fetched: ${apifyData.length} items`, { 
        datasetId, 
        itemCount: apifyData.length,
        duration_ms: fetchDuration 
      });

      // Process each item
      for (const item of apifyData) {
        // Skip error items
        if (item.error || item.errorDescription) {
          totalSkipped++;
          console.log(`Skipping error item: ${item.error || item.errorDescription}`);
          continue;
        }

        // Skip if no ID or shortCode
        if (!item.id && !item.shortCode) {
          totalSkipped++;
          console.log('Skipping item without ID or shortCode');
          continue;
        }

        const postId = item.id || item.shortCode || 'unknown';

        // Resolve username
        let username = item.ownerUsername?.trim().toLowerCase();
        if (!username) {
          username = extractUsernameFromUrl(item.inputUrl || item.url || '');
        }
        if (!username) {
          totalSkipped++;
          console.log(`Skipping post ${postId} - no username found`);
          continue;
        }

        accountsFound.add(username);

        // Normalize fields
        const likesCount = (item.likesCount === -1 || !item.likesCount) ? 0 : item.likesCount;
        const commentsCount = item.commentsCount || 0;
        const postedAt = item.timestamp;
        
        if (!postedAt) {
          totalSkipped++;
          console.log(`Skipping post ${postId} - no timestamp`);
          continue;
        }

        const hashtags = item.hashtags || [];
        const mentions = item.mentions || [];
        const postUrl = item.url || `https://www.instagram.com/p/${item.shortCode}/`;

        // Parse event information
        const parseStart = Date.now();
        let eventInfo;
        try {
          eventInfo = await parseEventFromCaption(item.caption || '', item.locationName, supabase);
        } catch (parseError) {
          const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
          totalSkipped++;
          await logger.error('parse', 'Caption parsing failed', { postId }, { error: errorMessage });
          // Log as rejected post for parse failure
          await logger.logRejectedPost({
            postId,
            reason: 'PARSE_FAILED',
            reasonMessage: `Caption parsing error: ${errorMessage}`,
            captionPreview: item.caption?.substring(0, 200) || null,
          });
          console.log(`Skipping post ${postId} - parse failed: ${errorMessage}`);
          continue;
        }
        const parseDuration = Date.now() - parseStart;
        
        await logger.logParsing(postId, undefined, item.caption || '', eventInfo, parseDuration);

        // PHASE 3: Validate and geocode venue if address exists
        let locationLat: number | null = null;
        let locationLng: number | null = null;
        let geocodedAddress: string | null = null;
        
        if (eventInfo.locationName && eventInfo.locationAddress && isValidAddress(eventInfo.locationAddress)) {
          try {
            await logger.info('validation', `Validating venue: ${eventInfo.locationName}`, { 
              postId, 
              venue: eventInfo.locationName,
              address: eventInfo.locationAddress 
            });
            
            const geocodeStart = Date.now();
            const { data: geocodeData, error: geocodeError } = await supabase.functions.invoke('validate-venue', {
              body: { 
                venue: eventInfo.locationName, 
                address: eventInfo.locationAddress 
              },
            });
            const geocodeDuration = Date.now() - geocodeStart;
            
            if (!geocodeError && geocodeData?.isValid) {
              locationLat = geocodeData.lat;
              locationLng = geocodeData.lng;
              geocodedAddress = geocodeData.formattedAddress || eventInfo.locationAddress;
              
              await logger.success('validation', 'Venue geocoded successfully', {
                postId,
                venue: eventInfo.locationName,
                lat: geocodeData.lat,
                lng: geocodeData.lng,
                confidence: geocodeData.confidence,
                duration_ms: geocodeDuration
              });
            } else {
              await logger.warn('validation', 'Venue validation failed', {
                postId,
                venue: eventInfo.locationName,
                error: geocodeError?.message || 'No valid coordinates returned'
              });
              // Log as rejected post for venue validation failure (post continues without coordinates)
              await logger.logRejectedPost({
                postId,
                reason: 'VENUE_VALIDATION_FAILED',
                reasonMessage: geocodeError?.message || 'No valid coordinates returned',
                captionPreview: item.caption?.substring(0, 200) || null,
                locationName: eventInfo.locationName || null,
                locationAddress: eventInfo.locationAddress || null,
                eventDate: eventInfo.eventDate || null,
                eventTime: eventInfo.eventTime || null,
              });
            }
          } catch (err) {
            const error = err as Error;
            await logger.error('validation', 'Geocoding error', { 
              postId, 
              venue: eventInfo.locationName 
            }, { 
              error: error.message 
            });
          }
        }

        // Skip non-events (unless force import)
        if (!eventInfo.isEvent && !forceImport) {
          totalSkipped++;
          await logger.logSkip(postId, 'Not an event', { 
            caption_preview: item.caption?.substring(0, 100),
            forceImport 
          });
          // Also log as rejected post with structured data
          await logger.logRejectedPost({
            postId,
            reason: 'NOT_EVENT',
            reasonMessage: 'Post classified as not an event',
            captionPreview: item.caption?.substring(0, 200) || null,
            locationName: eventInfo.locationName || null,
            eventDate: eventInfo.eventDate || null,
            eventTime: eventInfo.eventTime || null,
          });
          console.log(`Skipping post ${postId} - not an event. Caption: "${item.caption?.substring(0, 100)}..."`);
          continue;
        }

        // Skip events that have ended (unless force import)
        if (eventInfo.eventDate && !forceImport) {
          if (isEventInPast(eventInfo.eventDate, eventInfo.eventEndDate)) {
            totalSkipped++;
            await logger.logSkip(postId, 'Event has ended', { 
              eventDate: eventInfo.eventDate,
              eventEndDate: eventInfo.eventEndDate 
            });
            // Also log as rejected post with structured data
            await logger.logRejectedPost({
              postId,
              reason: 'EVENT_ENDED',
              reasonMessage: `Event has ended (date: ${eventInfo.eventDate}${eventInfo.eventEndDate ? `, end: ${eventInfo.eventEndDate}` : ''})`,
              captionPreview: item.caption?.substring(0, 200) || null,
              eventDate: eventInfo.eventDate,
              eventTime: eventInfo.eventTime || null,
              locationName: eventInfo.locationName || null,
              extra: { eventEndDate: eventInfo.eventEndDate },
            });
            console.log(`Skipping post ${postId} - event has ended. Start: ${eventInfo.eventDate}, End: ${eventInfo.eventEndDate || 'N/A'}`);
            continue;
          }
        }

        // Check if this post was previously rejected
        const { data: rejection } = await supabase
          .from('post_rejections')
          .select('id')
          .eq('post_id', postId)
          .maybeSingle();

        if (rejection && !forceImport) {
          totalSkipped++;
          await logger.logSkip(postId, 'Previously rejected', { rejectionId: rejection.id });
          console.log(`Skipping post ${postId} - previously rejected`);
          continue;
        }

        // Check timeout
        if (Date.now() - startTime > TIMEOUT_MS) {
          console.log('Timeout approaching, saving progress and exiting...');
          await supabase
            .from('scrape_runs')
            .update({
              status: 'failed',
              completed_at: new Date().toISOString(),
              error_message: 'Process timed out after 55 minutes',
              posts_added: totalScrapedPosts,
              posts_updated: totalUpdatedPosts,
            })
            .eq('id', runId!);
          
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Process timed out',
              stats: { totalScrapedPosts, totalUpdatedPosts, totalSkipped },
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`Processing event: ${postId}, Date: ${eventInfo.eventDate || 'TBD'}, Time: ${eventInfo.eventTime || 'TBD'}, Location: ${eventInfo.locationName || 'TBD'}`);

        // Ensure account exists
        let { data: account } = await supabase
          .from('instagram_accounts')
          .select('id')
          .eq('username', username)
          .maybeSingle();

        if (!account) {
          console.log(`Creating new account for @${username}`);
          const { data: newAccount, error: createError } = await supabase
            .from('instagram_accounts')
            .insert({
              username: username,
              display_name: item.ownerFullName,
              is_active: true,
              last_scraped_at: new Date().toISOString(),
            })
            .select('id')
            .single();

          if (createError) {
            console.error(`Failed to create account ${username}:`, createError.message);
            continue;
          }
          account = newAccount;
        } else {
          // Update existing account
          await supabase
            .from('instagram_accounts')
            .update({
              display_name: item.ownerFullName,
              last_scraped_at: new Date().toISOString(),
            })
            .eq('id', account.id);
        }

        // Check if post exists
        const { data: existingPost } = await supabase
          .from('instagram_posts')
          .select('id, caption, image_url, event_date, event_time, location_name, location_address')
          .eq('post_id', postId)
          .maybeSingle();

        if (existingPost) {
          // Always backfill missing image_url
          const imageUrl = item.displayUrl || item.imageUrl;
          if (!existingPost.image_url && imageUrl) {
            await supabase
              .from('instagram_posts')
              .update({ image_url: imageUrl })
              .eq('id', existingPost.id);
            console.log(`Backfilled image_url for post ${postId}`);
          }
          
          // Check if caption changed (indicating potential update)
          if (existingPost.caption !== item.caption) {
            const newEventInfo = await parseEventFromCaption(item.caption || '', item.locationName, supabase);
            
            // Only update if new event info is valid
            if (newEventInfo.isEvent && newEventInfo.eventDate && newEventInfo.locationName) {
              await supabase
                .from('instagram_posts')
                .update({
                  caption: item.caption,
                  event_date: newEventInfo.eventDate,
                  event_time: newEventInfo.eventTime,
                  location_name: newEventInfo.locationName,
                  location_address: newEventInfo.locationAddress,
                  likes_count: likesCount,
                  comments_count: commentsCount,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', existingPost.id);
              
              totalUpdatedPosts++;
              console.log(`Updated post ${postId} with new event info`);
            } else {
              // Just update engagement metrics
              await supabase
                .from('instagram_posts')
                .update({
                  likes_count: likesCount,
                  comments_count: commentsCount,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', existingPost.id);
              
              totalUpdatedPosts++;
              console.log(`Updated post ${postId} engagement only`);
            }
          } else {
            console.log(`Post ${postId} already exists, no changes`);
          }
          continue;
        }

        // Check for duplicate events (same location, date within 1 day)
        if (eventInfo.eventDate && eventInfo.locationName) {
          const eventDateObj = new Date(eventInfo.eventDate);
          const dayBefore = new Date(eventDateObj);
          dayBefore.setDate(dayBefore.getDate() - 1);
          const dayAfter = new Date(eventDateObj);
          dayAfter.setDate(dayAfter.getDate() + 1);

          const { data: similarEvents } = await supabase
            .from('instagram_posts')
            .select('id, post_id, event_title, likes_count')
            .eq('location_name', eventInfo.locationName)
            .gte('event_date', dayBefore.toISOString().split('T')[0])
            .lte('event_date', dayAfter.toISOString().split('T')[0])
            .eq('is_event', true);

          if (similarEvents && similarEvents.length > 0) {
            console.log(`Found ${similarEvents.length} similar event(s) for post ${postId}, checking for duplicates`);
            
            // If this is likely a duplicate, link them in event_groups
            for (const similar of similarEvents) {
              if (similar.post_id !== postId) {
                // Check if already in a group
                const { data: existingGroup } = await supabase
                  .from('event_groups')
                  .select('*')
                  .or(`primary_post_id.eq.${similar.id},merged_post_ids.cs.{${similar.id}}`)
                  .maybeSingle();

                if (existingGroup) {
                  // Add to existing group
                  const updatedMergedIds = [...(existingGroup.merged_post_ids || [])];
                  if (!updatedMergedIds.includes(postId)) {
                    updatedMergedIds.push(postId);
                    await supabase
                      .from('event_groups')
                      .update({ merged_post_ids: updatedMergedIds })
                      .eq('id', existingGroup.id);
                    console.log(`Added post ${postId} to existing event group`);
                  }
                } else {
                  // Create new group with the higher engagement post as primary
                  const primaryId = likesCount > similar.likes_count ? postId : similar.post_id;
                  const mergedId = likesCount > similar.likes_count ? similar.post_id : postId;
                  
                  await supabase
                    .from('event_groups')
                    .insert({
                      primary_post_id: primaryId,
                      merged_post_ids: [mergedId]
                    });
                  console.log(`Created new event group for posts ${primaryId} and ${mergedId}`);
                }
              }
            }
          }
        }

        // Extract image URL from Apify data (displayUrl or imageUrl)
        const imageUrl = item.displayUrl || item.imageUrl;

        // Download and store image in Supabase Storage
        let storedImageUrl: string | null = null;
        if (imageUrl) {
          try {
            console.log(`Downloading image for post ${postId}...`);
            const imageResponse = await fetch(imageUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            });
            
            if (imageResponse.ok) {
              const imageBlob = await imageResponse.blob();
              const arrayBuffer = await imageBlob.arrayBuffer();
              
              // Compress image using canvas-like approach
              // For simplicity, we'll store as-is but with reasonable size limit
              // Advanced compression would require image processing library
              
              const fileName = `instagram-posts/${postId}.jpg`;
              
              const { data: uploadData, error: uploadError } = await supabase.storage
                .from('event-images')
                .upload(fileName, arrayBuffer, {
                  contentType: 'image/jpeg',
                  upsert: true,
                });
              
              if (uploadError) {
                console.error(`Failed to upload image for ${postId}:`, uploadError);
              } else {
                // Get public URL
                const { data: urlData } = supabase.storage
                  .from('event-images')
                  .getPublicUrl(fileName);
                
                storedImageUrl = urlData.publicUrl;
                console.log(`✓ Stored image for ${postId}`);
              }
            } else {
              console.error(`Failed to download image for ${postId}: ${imageResponse.status}`);
            }
          } catch (imageError) {
            console.error(`Error processing image for ${postId}:`, imageError);
          }
        }

        // PHASE 1: Generate auto-tags for the post
        const tags = autoTagPost(item.caption || '', '', {
          price: eventInfo.price,
          isFree: eventInfo.isFree,
          eventDate: eventInfo.eventDate,
          eventTime: eventInfo.eventTime
        });

        // Determine if post needs review
        // Start with the needsReview flag from parseEventFromCaption (which detects borderline merchant/event cases)
        let needsReview = eventInfo.needsReview || false;
        
        // Also flag for review if missing critical info or time validation failed
        if (forceImport || !eventInfo.eventDate || !eventInfo.eventTime || !eventInfo.locationName || eventInfo.timeValidationFailed) {
          needsReview = true;
        }
        
        // Log time validation failures as rejected post (but continue with post insertion)
        if (eventInfo.timeValidationFailed) {
          await logger.logRejectedPost({
            postId,
            reason: 'TIME_VALIDATION_FAILED',
            reasonMessage: `Invalid time format: ${eventInfo.rawEventTime || eventInfo.rawEndTime || 'unknown'}`,
            captionPreview: item.caption?.substring(0, 200) || null,
            eventDate: eventInfo.eventDate || null,
            eventTime: eventInfo.rawEventTime || null,
            endTime: eventInfo.rawEndTime || null,
            locationName: eventInfo.locationName || null,
            extra: { 
              rawEventTime: eventInfo.rawEventTime,
              rawEndTime: eventInfo.rawEndTime,
            },
          });
        }
        
        // Optional: If post has merchant/promo tags and weak event structure, also flag for review
        const merchantTagsSet = new Set(['sale', 'shop', 'promotion']);
        const hasMerchantTags = tags.some(tag => merchantTagsSet.has(tag));
        const hasWeakEventStructure = !eventInfo.eventDate || !eventInfo.eventTime;
        if (hasMerchantTags && hasWeakEventStructure) {
          needsReview = true;
        }

        // Prepare insert data - allow NULL for missing data
        const insertData: any = {
          post_id: postId,
          instagram_account_id: account.id,
          caption: item.caption,
          post_url: postUrl,
          image_url: imageUrl,
          stored_image_url: storedImageUrl,
          posted_at: postedAt,
          likes_count: likesCount,
          comments_count: commentsCount,
          hashtags: hashtags,
          mentions: mentions,
          is_event: eventInfo.isEvent || forceImport,
          event_title: eventInfo.eventTitle,
          event_date: eventInfo.eventDate || null, // Allow null for TBD dates
          location_name: eventInfo.locationName,
          location_address: geocodedAddress || eventInfo.locationAddress,
          location_lat: locationLat,
          location_lng: locationLng,
          signup_url: eventInfo.signupUrl,
          needs_review: needsReview,
          tags: tags, // PHASE 1: Add auto-generated tags
        };

        // Only add event_time if we have a valid value
        if (eventInfo.eventTime && !eventInfo.timeValidationFailed) {
          insertData.event_time = eventInfo.eventTime;
        }

        // Insert new post with error handling
        try {
          const { data: insertedPost, error: insertError } = await supabase
            .from('instagram_posts')
            .insert(insertData)
            .select()
            .single();

          if (insertError) {
            console.error(`Failed to insert post ${postId}:`, insertError.message, insertError);
            totalFailed++;
            const reason = insertError.code || 'unknown_error';
            failureReasons[reason] = (failureReasons[reason] || 0) + 1;
            continue;
          }

          totalScrapedPosts++;
          console.log(`✓ Inserted post ${postId}${needsReview ? ' (needs review)' : ''}`);

          // PHASE 1: Removed enrich-post-ocr call - OCR is handled by ClientOCRProcessor
          // Mark post for admin review instead
        } catch (unexpectedError) {
          console.error(`Unexpected error inserting post ${postId}:`, unexpectedError);
          totalFailed++;
          failureReasons['unexpected_error'] = (failureReasons['unexpected_error'] || 0) + 1;
        }
      }

    } else {
      // MODE 2 & 3: Manual or Automated Scraping
      if (!apifyApiKeySecret) {
        throw new Error('APIFY_API_KEY secret not configured. Please add it in backend settings.');
      }

      // PHASE 2: Get active Instagram accounts with scrape_depth
      const { data: accounts, error: accountsError } = await supabase
        .from('instagram_accounts')
        .select('id, username, display_name, scrape_depth, last_scraped_at, is_active')
        .eq('is_active', true);

      if (accountsError) {
        throw new Error(`Failed to fetch accounts: ${accountsError.message}`);
      }

      if (!accounts || accounts.length === 0) {
        console.log('No active Instagram accounts configured');
        
        if (runId) {
          await supabase.from('scrape_runs').update({
            status: 'completed',
            completed_at: new Date().toISOString(),
          }).eq('id', runId);
        }
        
        return new Response(
          JSON.stringify({ message: 'No active accounts configured', newPostsAdded: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Found ${accounts.length} active accounts to scrape`);

      // Calculate 30 days ago for filtering
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoTimestamp = thirtyDaysAgo.toISOString();

      // Scrape each account
      for (const account of accounts) {
        accountsFound.add(account.username);
        
        try {
          console.log(`Scraping account: @${account.username}`);

          // PHASE 2: Use configurable scrape depth per account
          const scrapeDepth = account.scrape_depth || 5;
          
          const apifyResponse = await fetch(
            `https://api.apify.com/v2/acts/nH2AHrwxeTRJoN5hX/run-sync-get-dataset-items?token=${apifyApiKeySecret}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: [account.username],
                resultsLimit: scrapeDepth,
              }),
            }
          );

          if (!apifyResponse.ok) {
            console.error(`Apify error for ${account.username}: ${apifyResponse.statusText}`);
            continue;
          }

          const apifyData: ApifyDatasetItem[] = await apifyResponse.json();
          console.log(`Apify returned ${apifyData.length} results for @${account.username}`);

          if (!apifyData || apifyData.length === 0) {
            continue;
          }

          // Filter recent posts
          const recentPosts = apifyData.filter(post => {
            if (!post.timestamp) return false;
            const postDate = new Date(post.timestamp);
            return postDate >= thirtyDaysAgo;
          });

          console.log(`Processing ${recentPosts.length} recent posts for @${account.username}`);

          // Update account info
          if (recentPosts.length > 0) {
            const firstPost = recentPosts[0];
            await supabase
              .from('instagram_accounts')
              .update({
                display_name: firstPost.ownerFullName,
                last_scraped_at: new Date().toISOString(),
              })
              .eq('id', account.id);
          }

          // Process each post
          for (const post of recentPosts) {
            const postId = post.id || post.shortCode || 'unknown';
            
            const likesCount = (post.likesCount === -1 || !post.likesCount) ? 0 : post.likesCount;
            const commentsCount = post.commentsCount || 0;
            const hashtags = post.hashtags || [];
            const mentions = post.mentions || [];
            const postUrl = post.url || `https://www.instagram.com/p/${post.shortCode}/`;

            // Parse event information
            let eventInfo;
            try {
              eventInfo = await parseEventFromCaption(post.caption || '', post.locationName, supabase);
            } catch (parseError) {
              const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
              totalSkipped++;
              console.log(`Skipping post ${postId} - parse failed: ${errorMessage}`);
              continue;
            }

            // Skip non-events
            if (!eventInfo.isEvent) {
              totalSkipped++;
              continue;
            }

            // Skip events that have ended in direct scraping
            if (eventInfo.eventDate && isEventInPast(eventInfo.eventDate, eventInfo.eventEndDate)) {
              totalSkipped++;
              console.log(`Skipping post ${postId} - event has ended. Start: ${eventInfo.eventDate}, End: ${eventInfo.eventEndDate || 'N/A'}`);
              continue;
            }

            // Check if this post was previously rejected
            const { data: rejectionCheck } = await supabase
              .from('post_rejections')
              .select('id')
              .eq('post_id', postId)
              .maybeSingle();

            if (rejectionCheck) {
              totalSkipped++;
              console.log(`Skipping post ${postId} - previously rejected`);
              continue;
            }

            // Check timeout
            if (Date.now() - startTime > TIMEOUT_MS) {
              console.log('Timeout approaching during automated scraping, saving progress...');
              await supabase
                .from('scrape_runs')
                .update({
                  status: 'failed',
                  completed_at: new Date().toISOString(),
                  error_message: 'Process timed out after 55 minutes',
                  posts_added: totalScrapedPosts,
                  posts_updated: totalUpdatedPosts,
                  accounts_found: accountsFound.size,
                })
                .eq('id', runId!);
              
              return new Response(
                JSON.stringify({
                  success: false,
                  error: 'Process timed out',
                  stats: { totalScrapedPosts, totalUpdatedPosts, totalSkipped },
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }

            // Check if post exists
            const { data: existingPost } = await supabase
              .from('instagram_posts')
              .select('id, caption')
              .eq('post_id', postId)
              .maybeSingle();

            if (existingPost) {
              // Check for caption changes
              if (existingPost.caption !== post.caption) {
                const newEventInfo = await parseEventFromCaption(post.caption || '', post.locationName, supabase);
                
                if (newEventInfo.isEvent && newEventInfo.eventDate && newEventInfo.locationName) {
                  await supabase
                    .from('instagram_posts')
                    .update({
                    caption: post.caption,
                    event_date: newEventInfo.eventDate,
                    event_end_date: newEventInfo.eventEndDate,
                    event_time: newEventInfo.eventTime,
                    end_time: newEventInfo.endTime,
                    location_name: newEventInfo.locationName,
                    location_address: newEventInfo.locationAddress,
                    price: newEventInfo.price,
                    is_free: newEventInfo.isFree,
                    signup_url: newEventInfo.signupUrl,
                    likes_count: likesCount,
                    comments_count: commentsCount,
                    updated_at: new Date().toISOString(),
                    })
                    .eq('id', existingPost.id);
                  
                  totalUpdatedPosts++;
                }
              }
              continue;
            }

            // Check for duplicate events
            if (eventInfo.eventDate && eventInfo.locationName) {
              const eventDateObj = new Date(eventInfo.eventDate);
              const dayBefore = new Date(eventDateObj);
              dayBefore.setDate(dayBefore.getDate() - 1);
              const dayAfter = new Date(eventDateObj);
              dayAfter.setDate(dayAfter.getDate() + 1);

              const { data: similarEvents } = await supabase
                .from('instagram_posts')
                .select('id, post_id, event_title, likes_count')
                .eq('location_name', eventInfo.locationName)
                .gte('event_date', dayBefore.toISOString().split('T')[0])
                .lte('event_date', dayAfter.toISOString().split('T')[0])
                .eq('is_event', true);

              if (similarEvents && similarEvents.length > 0) {
                for (const similar of similarEvents) {
                  if (similar.post_id !== postId) {
                    const { data: existingGroup } = await supabase
                      .from('event_groups')
                      .select('*')
                      .or(`primary_post_id.eq.${similar.id},merged_post_ids.cs.{${similar.id}}`)
                      .maybeSingle();

                    if (existingGroup) {
                      const updatedMergedIds = [...(existingGroup.merged_post_ids || [])];
                      if (!updatedMergedIds.includes(postId)) {
                        updatedMergedIds.push(postId);
                        await supabase
                          .from('event_groups')
                          .update({ merged_post_ids: updatedMergedIds })
                          .eq('id', existingGroup.id);
                      }
                    } else {
                      const primaryId = likesCount > similar.likes_count ? postId : similar.post_id;
                      const mergedId = likesCount > similar.likes_count ? similar.post_id : postId;
                      
                      await supabase
                        .from('event_groups')
                        .insert({
                          primary_post_id: primaryId,
                          merged_post_ids: [mergedId]
                        });
                    }
                  }
                }
              }
            }

            // Detect incomplete data and combine with eventInfo.needsReview
            const hasIncompleteData = !eventInfo.eventDate || !eventInfo.eventTime || !eventInfo.locationName;
            const needsReview = eventInfo.needsReview || hasIncompleteData;

            // Extract image URL from Apify data
            const imageUrl = post.displayUrl || post.imageUrl;

            // Insert new post
            const { data: insertedPost, error: insertError } = await supabase
              .from('instagram_posts')
              .insert({
                instagram_account_id: account.id,
                post_id: postId,
                caption: post.caption,
                post_url: postUrl,
                image_url: imageUrl,
                posted_at: post.timestamp,
                likes_count: likesCount,
                comments_count: commentsCount,
                hashtags: hashtags,
                mentions: mentions,
                is_event: true,
              event_title: eventInfo.eventTitle,
              event_date: eventInfo.eventDate,
              event_end_date: eventInfo.eventEndDate,
              event_time: eventInfo.eventTime,
              end_time: eventInfo.endTime,
              location_name: eventInfo.locationName,
              location_address: eventInfo.locationAddress,
              signup_url: eventInfo.signupUrl,
              price: eventInfo.price,
              is_free: eventInfo.isFree,
                needs_review: needsReview,
                ocr_processed: false,
              })
              .select()
              .single();

            if (insertError) {
              console.error(`Failed to insert post ${postId}:`, insertError.message);
            } else {
              totalScrapedPosts++;

              // PHASE 1: Removed enrich-post-ocr call - OCR is handled by ClientOCRProcessor
              // Posts marked needs_review will appear in admin queue
            }
          }
        } catch (accountError) {
          console.error(`Error scraping account ${account.username}:`, accountError);
        }
      }
    }

    console.log(`Import completed. New: ${totalScrapedPosts}, Updated: ${totalUpdatedPosts}, Skipped: ${totalSkipped}, Failed: ${totalFailed}`);
    if (totalFailed > 0) {
      console.log('Failure reasons:', failureReasons);
    }

    // Update scrape run record
    if (runId) {
      await supabase.from('scrape_runs').update({
        status: 'completed',
        posts_added: totalScrapedPosts,
        posts_updated: totalUpdatedPosts,
        accounts_found: accountsFound.size,
        completed_at: new Date().toISOString(),
      }).eq('id', runId);
    }

    return new Response(
      JSON.stringify({ 
        message: datasetId ? 'Dataset import completed' : 'Scraping completed',
        accountsProcessed: accountsFound.size,
        newPostsAdded: totalScrapedPosts,
        postsUpdated: totalUpdatedPosts,
        postsSkipped: totalSkipped,
        postsFailed: totalFailed,
        failureReasons: totalFailed > 0 ? failureReasons : undefined,
        datasetId: datasetId || null,
        runId: runId,
        forceImport: forceImport,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in scrape-instagram function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    // Update scrape run as failed if we have a runId
    if (runId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        await supabase.from('scrape_runs').update({
          status: 'failed',
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        }).eq('id', runId);
      } catch (updateError) {
        console.error('Failed to update scrape run status:', updateError);
      }
    }
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
