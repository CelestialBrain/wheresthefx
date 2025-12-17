import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import {
  preNormalizeText,
  isVendorPost,
  isVendorPostStrict,
  isPossiblyVendorPost,
  isRecurringSchedulePost,
  isNotAnEventPost,
  extractPrice,
  extractTime,
  extractDate,
  extractVenue,
  extractSignupUrl,
  autoTagPost,
  isValidAddress,
  isValidTime,
  hasTemporalEventIndicators,
  normalizeLocationAddress,
  canonicalizeVenueName,
  cleanLocationName,
} from './extractionUtils.ts';
import { ScraperLogger, RejectedPostLogData } from './logger.ts';
import { lookupNCRVenue, fuzzyMatchVenue, lookupKnownVenuesFirst, DEFAULT_FUZZY_THRESHOLD, loadGeoConfiguration } from './ncrGeoCache.ts';
import { fetchWithRetry, fetchWithTimeout } from './retryUtils.ts';
import { saveGroundTruth, trainPatternsFromComparison } from './patternTrainer.ts';
import { extractInParallel, mergeResults, MergedExtractionResult } from './parallelExtraction.ts';
import { validateExtractedData, assignReviewTier, checkForDuplicate, logValidationWarnings } from './validationUtils.ts';

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
 * - additional_images: TEXT[] (for carousel image support)
 *   Stores additional image URLs from carousel posts
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
  childPosts?: Array<{
    displayUrl?: string;
    imageUrl?: string;
    type?: string;
  }>;
}

// Maximum number of additional carousel images to extract (excludes primary image)
const MAX_ADDITIONAL_CAROUSEL_IMAGES = 3;

/**
 * Extract additional images from carousel posts (Sidecar type)
 * Returns array of up to MAX_ADDITIONAL_CAROUSEL_IMAGES image URLs
 */
function extractCarouselImages(item: ApifyDatasetItem): string[] {
  if (item.type !== 'Sidecar' || !item.childPosts || item.childPosts.length === 0) {
    return [];
  }

  const additionalImages: string[] = [];

  // Skip first child (it's usually the primary image already in displayUrl)
  // Extract up to MAX_ADDITIONAL_CAROUSEL_IMAGES additional images
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

/**
 * Calculate source authority score for deduplication
 * Higher authority sources are preferred when merging duplicate events
 */
function getSourceAuthority(ownerUsername: string, venueHandles: Set<string>): number {
  const username = ownerUsername.toLowerCase();

  // Venue official account (highest authority)
  if (venueHandles.has(username)) return 100;

  // Known event organizer patterns
  if (/events?|productions?|presents?|collective/i.test(username)) return 80;

  // Artist/performer accounts
  if (/band|music|dj|artist/i.test(username)) return 60;

  // Media/promo accounts
  if (/blog|media|promo|ph$/i.test(username)) return 40;

  // Default
  return 50;
}

// ============================================================
// AI EXTRACTION TYPES AND HELPER
// ============================================================

// Caption length thresholds for OCR extraction decisions
const SHORT_CAPTION_THRESHOLD = 100; // Captions shorter than this may have details in image
const EMOJI_TEXT_THRESHOLD = 50; // Text content below this after removing emojis/hashtags indicates image-heavy post
const MESSY_EXTRACTION_THRESHOLD = 100; // Location/title longer than this indicates messy extraction

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
  additionalDates?: Array<{ date: string; venue: string; time?: string }>;
  isFree?: boolean;
  price?: number;
  signupUrl?: string;
  // OCR metadata
  ocrTextExtracted?: string[];
  ocrConfidence?: number;
  extractionMethod?: 'ai' | 'ocr_ai';
}

/**
 * Determines if image extraction should be attempted.
 * Returns true if:
 * - Caption is short (details probably in image)
 * - Missing multiple critical fields AND has event indicators
 * - Caption is mostly emojis/hashtags
 */
function shouldExtractFromImage(
  caption: string | null,
  eventInfo: {
    eventDate?: string;
    eventTime?: string;
    locationName?: string;
  }
): boolean {
  const captionLength = caption?.length || 0;

  // Caption is very short (details probably in image)
  const shortCaption = captionLength < SHORT_CAPTION_THRESHOLD;

  // Missing critical fields
  const missingDate = !eventInfo.eventDate;
  const missingTime = !eventInfo.eventTime;
  const missingVenue = !eventInfo.locationName;
  const missingMultiple = [missingDate, missingTime, missingVenue].filter(Boolean).length >= 2;

  // Has event indicators but no details
  const hasEventKeywords = /join us|see you|save the date|mark your calendar|party|event|concert|gig|market|pop.?up/i.test(caption || '');

  // Caption is mostly emojis/hashtags
  const textWithoutEmojisHashtags = (caption || '')
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
    .replace(/#\w+/g, '')
    .trim();
  const mostlyEmojis = textWithoutEmojisHashtags.length < EMOJI_TEXT_THRESHOLD;

  return (shortCaption && hasEventKeywords) ||
    (missingMultiple && hasEventKeywords) ||
    (mostlyEmojis && captionLength > 0);
}

/**
 * Determines if regex extraction results need AI correction.
 * Returns true if:
 * - Missing critical info (date, time, or location)
 * - Location name is too long indicating messy extraction
 * - Event title is too long
 */
function needsAIExtraction(eventInfo: {
  eventDate?: string;
  eventTime?: string;
  locationName?: string;
  eventTitle?: string;
}): boolean {
  // Missing critical info
  const missingDate = !eventInfo.eventDate;
  const missingTime = !eventInfo.eventTime;
  const missingLocation = !eventInfo.locationName;

  // Messy extraction (too long) - explicitly convert to boolean
  const messyLocation = Boolean(eventInfo.locationName && eventInfo.locationName.length > MESSY_EXTRACTION_THRESHOLD);
  const messyTitle = Boolean(eventInfo.eventTitle && eventInfo.eventTitle.length > MESSY_EXTRACTION_THRESHOLD);

  return missingDate || missingTime || missingLocation || messyLocation || messyTitle;
}

/**
 * Call the AI extraction edge function
 */

/**
 * Raw data input for AI extraction with full context
 */
interface AIExtractionInput {
  caption: string;
  locationHint: string | null;
  postId: string;
  postedAt?: string | null;
  ownerUsername?: string | null;
  instagramAccountId?: string | null;
  imageUrl?: string | null;
  useOCR?: boolean;
}

/**
 * Call the AI extraction edge function with full context
 */
async function parseEventWithAI(
  input: AIExtractionInput,
  supabase: any // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<AIExtractionResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke('ai-extract-event', {
      body: {
        caption: input.caption,
        imageUrl: input.imageUrl,
        locationHint: input.locationHint,
        postId: input.postId,
        postedAt: input.postedAt,
        ownerUsername: input.ownerUsername,
        instagramAccountId: input.instagramAccountId,
        useOCR: input.useOCR,
      },
    });

    if (error) {
      console.error(`AI extraction failed for ${input.postId}:`, error.message);
      return null;
    }

    if (!data || !data.success || !data.extraction) {
      console.log(`AI extraction returned no results for ${input.postId}`);
      return null;
    }

    return data.extraction as AIExtractionResult;
  } catch (err) {
    console.error(`AI extraction error for ${input.postId}:`, err);
    return null;
  }
}

/**
 * Calculate similarity between two event titles (0-1 scale)
 * Used to prevent merging different events at the same venue/date
 */
function calculateTitleSimilarity(title1: string | null, title2: string | null): number {
  if (!title1 || !title2) return 0;

  // Normalize titles: lowercase, remove special chars, trim
  const normalize = (s: string) => s.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 2); // Remove short words

  const words1 = normalize(title1);
  const words2 = normalize(title2);

  if (words1.length === 0 || words2.length === 0) return 0;

  // Calculate Jaccard similarity (intersection over union)
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

// Parse and normalize date to YYYY-MM-DD format
function parseAndNormalizeDate(dateStr: string): string | null {
  if (!dateStr) return null;

  const currentYear = new Date().getFullYear();
  const today = new Date();

  // If already in YYYY-MM-DD format, validate and return
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
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

// Enhanced event parser with learned patterns integration
async function parseEventFromCaption(
  caption: string,
  locationName?: string | null,
  supabase?: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  postId?: string,
  additionalContext?: {
    postedAt?: string | null;
    ownerUsername?: string | null;
    instagramAccountId?: string | null;
    imageUrl?: string | null;
  }
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
  signupUrlPatternId?: string | null;
  vendorPatternId?: string | null;
  // AI extraction fields
  extractionMethod?: 'regex' | 'ai' | 'ai_corrected' | 'ocr_ai';
  aiExtraction?: AIExtractionResult;
  aiConfidence?: number;
  aiReasoning?: string;
  // OCR extraction fields
  ocrTextExtracted?: string[];
  ocrConfidence?: number;
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

  // STEP 1.5: Check for recurring schedule posts (operating hours, not events)
  // e.g., "6PM — Tues to Sat", "Every Friday night", "Open daily"
  if (isRecurringSchedulePost(normalized)) {
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
  let venueInfo = await extractVenue(normalized, locationName, supabase);
  const signupUrlInfo = await extractSignupUrl(normalized, supabase);
  const signupUrl = signupUrlInfo.url;

  // Clean location name if it's messy (>100 chars)
  if (venueInfo.venueName && venueInfo.venueName.length > 100) {
    const cleanedLocation = cleanLocationName(venueInfo.venueName);
    if (cleanedLocation) {
      venueInfo = { ...venueInfo, venueName: cleanedLocation };
    }
  }

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

  // Build regex result
  let regexResult = {
    eventTitle,
    eventDate: dateInfo.eventDate || undefined,
    eventEndDate: dateInfo.eventEndDate || undefined,
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
    timeValidationFailed: timeInfo.timeValidationFailed,
    rawEventTime: timeInfo.rawStartTime || undefined,
    rawEndTime: timeInfo.rawEndTime || undefined,
    pricePatternId: priceInfo?.patternId,
    datePatternId: dateInfo.patternId,
    timePatternId: timeInfo.patternId,
    venuePatternId: venueInfo.patternId,
    signupUrlPatternId: signupUrlInfo.patternId,
    vendorPatternId: null,
    extractionMethod: 'regex' as const,
    aiExtraction: undefined as AIExtractionResult | undefined,
    aiConfidence: undefined as number | undefined,
    aiReasoning: undefined as string | undefined,
    ocrTextExtracted: undefined as string[] | undefined,
    ocrConfidence: undefined as number | undefined,
  };

  // STEP 7: AI extraction fallback (with OCR when image is available)
  // Call AI extraction if regex extraction is incomplete or messy
  // Use OCR+AI if image is available AND details are likely in the image
  if (supabase && postId && needsAIExtraction(regexResult)) {
    const imageUrl = additionalContext?.imageUrl;
    const useOCR = imageUrl && shouldExtractFromImage(caption, regexResult);

    console.log(`Attempting AI extraction for post ${postId} (regex incomplete/messy)${useOCR ? ' with OCR' : ''}`);

    // Pass full context to AI extraction for smart learning
    const aiResult = await parseEventWithAI({
      caption,
      locationHint: locationName || null,
      postId,
      postedAt: additionalContext?.postedAt,
      ownerUsername: additionalContext?.ownerUsername,
      instagramAccountId: additionalContext?.instagramAccountId,
      imageUrl: useOCR ? imageUrl : undefined,
      useOCR: !!useOCR,
    }, supabase);

    if (aiResult && aiResult.confidence >= 0.6) {
      console.log(`AI extraction succeeded for ${postId} with confidence ${aiResult.confidence}, method=${aiResult.extractionMethod || 'ai'}`);

      // Determine extraction method
      const hadRegexResults = regexResult.eventDate || regexResult.eventTime || regexResult.locationName;
      let extractionMethod: 'ai' | 'ai_corrected' | 'ocr_ai' = hadRegexResults ? 'ai_corrected' : 'ai';
      if (aiResult.extractionMethod === 'ocr_ai') {
        extractionMethod = 'ocr_ai';
      }

      // Use AI results if they provide better data
      return {
        eventTitle: aiResult.eventTitle || regexResult.eventTitle,
        eventDate: aiResult.eventDate || regexResult.eventDate,
        eventEndDate: aiResult.eventEndDate || regexResult.eventEndDate,
        eventTime: aiResult.eventTime || regexResult.eventTime,
        endTime: aiResult.endTime || regexResult.endTime,
        locationName: aiResult.locationName || regexResult.locationName,
        locationAddress: aiResult.locationAddress || regexResult.locationAddress,
        rawLocationName: regexResult.rawLocationName,
        canonicalVenueName: regexResult.canonicalVenueName,
        signupUrl: aiResult.signupUrl || regexResult.signupUrl,
        price: aiResult.price ?? regexResult.price,
        isFree: aiResult.isFree ?? regexResult.isFree,
        isEvent: aiResult.isEvent,
        needsReview: aiResult.confidence < 0.8, // Flag low-confidence AI results for review
        timeValidationFailed: regexResult.timeValidationFailed,
        rawEventTime: regexResult.rawEventTime,
        rawEndTime: regexResult.rawEndTime,
        pricePatternId: regexResult.pricePatternId,
        datePatternId: regexResult.datePatternId,
        timePatternId: regexResult.timePatternId,
        venuePatternId: regexResult.venuePatternId,
        signupUrlPatternId: regexResult.signupUrlPatternId,
        vendorPatternId: regexResult.vendorPatternId,
        extractionMethod,
        aiExtraction: aiResult,
        aiConfidence: aiResult.confidence,
        aiReasoning: aiResult.reasoning,
        ocrTextExtracted: aiResult.ocrTextExtracted,
        ocrConfidence: aiResult.ocrConfidence,
      };
    } else if (aiResult) {
      console.log(`AI extraction for ${postId} has low confidence (${aiResult.confidence}), using regex results`);
      // Store AI results anyway for reference, but use regex results
      regexResult.aiExtraction = aiResult;
      regexResult.aiConfidence = aiResult.confidence;
      regexResult.aiReasoning = aiResult.reasoning;
      regexResult.ocrTextExtracted = aiResult.ocrTextExtracted;
      regexResult.ocrConfidence = aiResult.ocrConfidence;
    }
  }

  return regexResult;
}

/**
 * Generate a fallback event title when AI extraction doesn't provide one
 * Format: "[Category] at [Venue]" or just category/venue if only one available
 * @param category - Event category (e.g., "nightlife", "music")
 * @param venueName - Venue name (e.g., "Circuit Makati")
 * @returns Generated title or null if neither category nor venue available
 */
function generateFallbackTitle(category: string | null | undefined, venueName: string | null | undefined): string | null {
  if (!category && !venueName) return null;

  // Capitalize and format category (e.g., "art_culture" -> "Art Culture")
  const formattedCategory = category
    ? category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ')
    : 'Event';

  if (venueName) {
    return `${formattedCategory} at ${venueName}`;
  }

  return formattedCategory;
}

// Check if event has ended (considering time and Philippine timezone UTC+8)
function isEventInPast(
  eventDateStr: string | undefined,
  eventEndDateStr?: string | undefined,
  eventTimeStr?: string | undefined,
  endTimeStr?: string | undefined
): boolean {
  if (!eventDateStr) return false;

  try {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Use end date if available, otherwise start date
    const targetDateStr = eventEndDateStr || eventDateStr;

    // If event is TODAY (in UTC), check end time, not start time
    // Note: Event times are already in 24-hour format and dates are YYYY-MM-DD
    // This comparison works because both now and endDateTime use the same timezone (system/UTC)
    if (targetDateStr === todayStr) {
      if (endTimeStr) {
        const [hours, minutes] = endTimeStr.split(':').map(Number);
        const endDateTime = new Date();
        endDateTime.setHours(hours, minutes, 0, 0);
        return now > endDateTime;
      }
      return false; // No end time = valid until midnight
    }

    // For past dates, check if date has passed
    return new Date(targetDateStr) < new Date(todayStr);
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
    const dataIngestToken = Deno.env.get('DATA_INGEST_TOKEN');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load geo configuration from database (NCR bounds and non-NCR keywords)
    await loadGeoConfiguration();

    // Check for GitHub ingest token authentication
    const authHeader = req.headers.get('Authorization');
    let isGitHubIngest = false;

    // Constant-time comparison to prevent timing attacks
    const safeCompare = (a: string, b: string): boolean => {
      // Constant-time comparison to prevent timing attacks
      const aBytes = new TextEncoder().encode(a);
      const bBytes = new TextEncoder().encode(b);

      if (aBytes.length !== bBytes.length) {
        return false;
      }

      // XOR all bytes and accumulate differences
      let result = 0;
      for (let i = 0; i < aBytes.length; i++) {
        result |= aBytes[i] ^ bBytes[i];
      }
      return result === 0;
    };

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');

      if (!dataIngestToken) {
        return new Response(JSON.stringify({ error: 'DATA_INGEST_TOKEN not configured' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!safeCompare(token, dataIngestToken)) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log('Data ingest token validated');
      isGitHubIngest = true;
    }

    // Parse request body
    let body: { datasetId?: string; automated?: boolean; forceImport?: boolean; mode?: string; posts?: unknown[]; runId?: string; isFirstBatch?: boolean; isLastBatch?: boolean; batchNumber?: number; totalBatches?: number; preFilterRejections?: Array<{ reason: string; rawData: Record<string, unknown> }> } = {};
    try {
      body = await req.json();
    } catch {
      // No body provided
    }

    // Handle ping for connection testing
    if (body.mode === 'ping') {
      return new Response(JSON.stringify({ success: true, message: 'pong' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Handle batch ingest from GitHub Actions
    if (body.mode === 'ingest' && Array.isArray(body.posts)) {
      if (!isGitHubIngest) {
        return new Response(JSON.stringify({ error: 'Ingest mode requires valid DATA_INGEST_TOKEN' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const isFirstBatch = body.isFirstBatch || false;
      const isLastBatch = body.isLastBatch || false;
      const batchNumber = body.batchNumber || 1;
      const totalBatches = body.totalBatches || 1;
      const providedRunId = body.runId;

      console.log(`[GH-INGEST] Batch ${batchNumber}/${totalBatches}: ${body.posts.length} posts (runId: ${providedRunId || 'new'})`);

      // Only create scrape_run record on first batch or if no runId provided
      let ingestRunId: string | null = providedRunId || null;

      if (isFirstBatch || !providedRunId) {
        const { data: ingestRun, error: runError } = await supabase
          .from('scrape_runs')
          .insert({
            id: providedRunId || undefined, // Use provided ID if available
            run_type: 'github_actions_ingest',
            status: 'running',
            dataset_id: body.datasetId || null,
          })
          .select()
          .single();

        if (runError) {
          console.error('[GH-INGEST] Failed to create scrape_run:', runError);

          // If duplicate key error (23505), the providedRunId doesn't exist in DB
          // (was deleted or never created) - create a fresh run with new ID
          if (runError.code === '23505' || !ingestRun) {
            console.log('[GH-INGEST] Creating fresh run with new ID...');
            const { data: freshRun, error: freshError } = await supabase
              .from('scrape_runs')
              .insert({
                run_type: 'github_actions_ingest',
                status: 'running',
                dataset_id: body.datasetId || null,
              })
              .select()
              .single();

            if (freshRun) {
              ingestRunId = freshRun.id;
              console.log(`[GH-INGEST] Created fresh run: ${ingestRunId}`);
            } else {
              console.error('[GH-INGEST] Failed to create fresh run:', freshError);
              ingestRunId = null; // Logger will be null, but logs won't fail FK
            }
          }
        } else if (ingestRun) {
          ingestRunId = ingestRun.id;
        }

        console.log(`[GH-INGEST] Using run: ${ingestRunId}`);
      } else {
        // For subsequent batches, verify the run exists before using it
        const { data: existingRun } = await supabase
          .from('scrape_runs')
          .select('id')
          .eq('id', providedRunId)
          .single();

        if (!existingRun) {
          console.warn(`[GH-INGEST] Provided runId ${providedRunId} not found, creating new run`);
          const { data: freshRun } = await supabase
            .from('scrape_runs')
            .insert({
              run_type: 'github_actions_ingest',
              status: 'running',
              dataset_id: body.datasetId || null,
            })
            .select()
            .single();

          if (freshRun) {
            ingestRunId = freshRun.id;
          }
        }
      }

      // Initialize logger for ingest
      const ingestLogger = ingestRunId ? new ScraperLogger(supabase, ingestRunId) : null;

      if (isFirstBatch) {
        await ingestLogger?.info('fetch', `GitHub Actions ingest started`, {
          totalBatches,
          datasetId: body.datasetId || 'unknown',
        });

        // Log pre-filter rejections if any were provided
        const preFilterRejections = body.preFilterRejections || [];

        if (preFilterRejections.length > 0) {
          await ingestLogger?.info('pre_filter', `${preFilterRejections.length} posts skipped before AI processing`, {
            totalSkipped: preFilterRejections.length,
          });

          // Log each rejection individually for visibility
          for (const rejection of preFilterRejections) {
            await ingestLogger?.log({
              log_level: 'warn',
              stage: 'pre_filter',
              message: `Post skipped: ${rejection.reason}`,
              data: rejection.rawData,
            });
          }
        }
      }

      await ingestLogger?.info('fetch', `Processing batch ${batchNumber}/${totalBatches}`, {
        batchPosts: body.posts.length,
      });

      let saved = 0;
      let failed = 0;
      let eventsDetected = 0;
      let geocoded = 0;
      let withImages = 0;
      let imagesStored = 0;
      const categoryBreakdown: Record<string, number> = {};
      const accountsProcessed = new Set<string>();

      interface IngestPost {
        postId: string;
        shortCode?: string;
        caption?: string;
        imageUrl?: string;
        ownerUsername?: string;
        timestamp?: string;
        locationName?: string;
        aiExtraction?: {
          isEvent?: boolean;
          eventTitle?: string;
          eventDate?: string;
          eventEndDate?: string;
          eventTime?: string;
          endTime?: string;
          venueName?: string;
          venueAddress?: string;
          price?: number;
          priceMin?: number;
          priceMax?: number;
          priceNotes?: string;
          isFree?: boolean;
          category?: string;
          ocrText?: string;
          confidence?: number;
          isRecurring?: boolean;
          recurrencePattern?: string;
          schedule?: Array<{ date: string; times: Array<{ time: string; label?: string }> }>;
          additionalDates?: Array<{ date: string; venue: string; time?: string }>;
        };
      }

      for (const post of body.posts as IngestPost[]) {
        try {
          // Guard against missing ownerUsername to prevent null instagram_account_id crashes
          if (!post.ownerUsername) {
            await ingestLogger?.log({
              post_id: post.postId,
              log_level: 'warn',
              stage: 'validation',
              message: 'Skipping post - missing ownerUsername',
              data: { postId: post.postId }
            });
            continue;
          }

          if (post.ownerUsername) {
            accountsProcessed.add(post.ownerUsername.toLowerCase());
          }

          // ENHANCED LOGGING: Log complete AI extraction data for debugging
          await ingestLogger?.log({
            post_id: post.postId,
            log_level: 'info',
            stage: 'extraction',
            message: `AI extraction: ${post.aiExtraction?.isEvent ? 'EVENT' : 'NOT_EVENT'}`,
            data: {
              // Core event fields
              eventTitle: post.aiExtraction?.eventTitle || null,
              eventDate: post.aiExtraction?.eventDate || null,
              eventTime: post.aiExtraction?.eventTime || null,
              endTime: post.aiExtraction?.endTime || null,
              venueName: post.aiExtraction?.venueName || null,
              venueAddress: post.aiExtraction?.venueAddress || null,
              category: post.aiExtraction?.category || null,
              price: post.aiExtraction?.price || null,
              isFree: post.aiExtraction?.isFree ?? null,
              confidence: post.aiExtraction?.confidence || null,
              // FULL CONTEXT FOR DEBUGGING
              ocrTextFull: post.aiExtraction?.ocrText || null,  // Complete OCR text
              captionFull: post.caption || null,                 // Original caption
              reasoning: (post.aiExtraction as any)?.reasoning || null,  // AI reasoning
              imageUrl: post.imageUrl || null,                   // What image was analyzed
              ownerUsername: post.ownerUsername || null,
            },
          });

          // Log non-events explicitly for analysis
          if (!post.aiExtraction?.isEvent) {
            await ingestLogger?.log({
              post_id: post.postId,
              log_level: 'info',
              stage: 'rejection',
              message: 'Post classified as NOT_EVENT by AI',
              data: {
                reason: 'AI_CLASSIFIED_NOT_EVENT',
                confidence: post.aiExtraction?.confidence || null,
                reasoning: (post.aiExtraction as any)?.reasoning || null,
                captionPreview: post.caption?.substring(0, 300) || null,
                ocrTextPreview: post.aiExtraction?.ocrText?.substring(0, 300) || null,
                ownerUsername: post.ownerUsername || null,
              },
            });
          }

          // === PHASE 3: NON-EVENT DETECTION ===
          // Check if this is a non-event post (venue promo, recap, etc.) using caption
          // IMPORTANT: Only apply pattern rejection if AI confidence is LOW (<0.85)
          // High-confidence AI decisions should be trusted over regex patterns
          let isEvent = post.aiExtraction?.isEvent || false;
          let nonEventReason: string | null = null;
          const aiConfidence = post.aiExtraction?.confidence || 0;

          // Only apply caption-based rejection patterns if AI confidence is below threshold
          // This prevents false negatives where AI correctly identified an event
          // but caption patterns like "thank you" or "see you soon" override it
          const shouldApplyPatternRejection = aiConfidence < 0.85;

          if (isEvent && post.caption && shouldApplyPatternRejection) {
            const normalizedCaption = preNormalizeText(post.caption);

            // Check for non-event patterns
            if (isNotAnEventPost(normalizedCaption)) {
              isEvent = false;
              nonEventReason = 'NON_EVENT_PATTERN_DETECTED';
              await ingestLogger?.log({
                post_id: post.postId,
                log_level: 'info',
                stage: 'rejection',
                message: `Post rejected: Non-event pattern detected (AI confidence ${aiConfidence.toFixed(2)} < 0.85 threshold)`,
                data: {
                  reason: nonEventReason,
                  captionPreview: post.caption?.substring(0, 200) || null,
                  ownerUsername: post.ownerUsername || null,
                  aiConfidence,
                },
              });
            }

            // Check for vendor posts
            if (isEvent && isVendorPostStrict(normalizedCaption)) {
              isEvent = false;
              nonEventReason = 'VENDOR_POST_DETECTED';
              await ingestLogger?.log({
                post_id: post.postId,
                log_level: 'info',
                stage: 'rejection',
                message: `Post rejected: Vendor/merchant post detected (AI confidence ${aiConfidence.toFixed(2)} < 0.85 threshold)`,
                data: {
                  reason: nonEventReason,
                  captionPreview: post.caption?.substring(0, 200) || null,
                  aiConfidence,
                },
              });
            }

            // Check for recurring schedule posts (operating hours, not events)
            if (isEvent && isRecurringSchedulePost(normalizedCaption)) {
              isEvent = false;
              nonEventReason = 'RECURRING_SCHEDULE_POST';
              await ingestLogger?.log({
                post_id: post.postId,
                log_level: 'info',
                stage: 'rejection',
                message: `Post rejected: Recurring schedule/operating hours (AI confidence ${aiConfidence.toFixed(2)} < 0.85 threshold)`,
                data: {
                  reason: nonEventReason,
                  captionPreview: post.caption?.substring(0, 200) || null,
                  aiConfidence,
                },
              });
            }
          } else if (isEvent && post.caption && !shouldApplyPatternRejection) {
            // Log that we're trusting high-confidence AI decision
            await ingestLogger?.info('extraction', `Trusting AI event detection (confidence ${aiConfidence.toFixed(2)} >= 0.85, skipping pattern rejection)`, {
              postId: post.postId,
              aiConfidence,
            });
          }

          // === PHASE 1: HISTORICAL POST DETECTION ===
          // Check if this is a historical post (old post about past event)
          let isHistoricalPost = false;

          if (isEvent && post.timestamp && post.aiExtraction?.eventDate) {
            const postDate = new Date(post.timestamp);
            const eventDate = new Date(post.aiExtraction.eventDate);
            const today = new Date();

            const postAgeInDays = Math.floor((today.getTime() - postDate.getTime()) / (1000 * 60 * 60 * 24));
            const eventAgeInDays = Math.floor((today.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24));

            // If event date is before post date, this is definitely a historical reference
            if (eventDate < postDate) {
              isEvent = false;
              isHistoricalPost = true;
              nonEventReason = 'HISTORICAL_EVENT_BEFORE_POST';
              await ingestLogger?.log({
                post_id: post.postId,
                log_level: 'info',
                stage: 'rejection',
                message: `Post rejected: Historical - event date (${post.aiExtraction.eventDate}) before post date (${post.timestamp.split('T')[0]})`,
                data: {
                  reason: nonEventReason,
                  eventDate: post.aiExtraction.eventDate,
                  postDate: post.timestamp,
                },
              });
            }
            // If post is old (>45 days) and event date is in the past, it's historical
            else if (postAgeInDays > 45 && eventAgeInDays > 0) {
              isEvent = false;
              isHistoricalPost = true;
              nonEventReason = 'HISTORICAL_OLD_POST_PAST_EVENT';
              await ingestLogger?.log({
                post_id: post.postId,
                log_level: 'info',
                stage: 'rejection',
                message: `Post rejected: Historical - old post (${postAgeInDays} days) with past event date`,
                data: {
                  reason: nonEventReason,
                  eventDate: post.aiExtraction.eventDate,
                  postAgeInDays,
                  eventAgeInDays,
                },
              });
            }
          }

          if (isEvent) eventsDetected++;
          if (post.imageUrl) withImages++;

          // Track category
          const postCategory = post.aiExtraction?.category || 'other';
          categoryBreakdown[postCategory] = (categoryBreakdown[postCategory] || 0) + 1;

          // Get or create Instagram account
          let accountId: string | null = null;
          let defaultCategory: string | null = null;

          if (post.ownerUsername) {
            const { data: account, error: accountFetchError } = await supabase
              .from('instagram_accounts')
              .select('id, default_category')
              .eq('username', post.ownerUsername.toLowerCase())
              .maybeSingle();

            if (accountFetchError) {
              await ingestLogger?.error('fetch', `Failed to fetch account @${post.ownerUsername}`, { postId: post.postId }, {
                error: accountFetchError.message,
              });
            }

            if (account) {
              accountId = account.id;
              defaultCategory = account.default_category;
            } else {
              // Create new account
              const { data: newAccount, error: accountCreateError } = await supabase
                .from('instagram_accounts')
                .insert({
                  username: post.ownerUsername.toLowerCase(),
                  is_active: true,
                  last_scraped_at: new Date().toISOString(),
                })
                .select('id')
                .single();

              if (accountCreateError) {
                await ingestLogger?.error('save', `Failed to create account @${post.ownerUsername}`, { postId: post.postId }, {
                  error: accountCreateError.message,
                  code: accountCreateError.code,
                });
                failed++;
                continue; // Skip this post if account creation fails
              }

              if (newAccount) {
                accountId = newAccount.id;
                await ingestLogger?.info('save', `Created new account: @${post.ownerUsername}`, { postId: post.postId });
              }
            }
          }

          // Verify accountId is set before proceeding
          if (!accountId) {
            await ingestLogger?.error('validation', `Missing accountId for post ${post.postId}`, {
              postId: post.postId,
              ownerUsername: post.ownerUsername
            });
            failed++;
            continue;
          }

          // Use account's default_category if AI didn't detect one
          const category = post.aiExtraction?.category || defaultCategory || 'other';

          // === KNOWLEDGE BASE INTEGRATION ===

          // 1. Get raw venue name from AI extraction or post data
          const rawVenueName = post.aiExtraction?.venueName || post.locationName;
          const rawVenueAddress = post.aiExtraction?.venueAddress || null;
          let canonicalVenue: string | null = rawVenueName || null;
          let locationAddress: string | null = rawVenueAddress;
          let locationLat: number | null = null;
          let locationLng: number | null = null;
          let geocodeSource: string | null = null;

          if (rawVenueName) {
            // 2. Canonicalize venue name (apply aliases, clean up)
            const cleaned = cleanLocationName(rawVenueName);
            if (cleaned) {
              const { canonical } = canonicalizeVenueName(cleaned);
              canonicalVenue = canonical;
            }

            const searchName = canonicalVenue || rawVenueName;

            // 3. NEW PRIORITY: Check known_venues database FIRST
            // This has verified, meter-accurate coordinates and should be preferred
            try {
              const knownVenueMatch = await lookupKnownVenuesFirst(searchName);
              if (knownVenueMatch) {
                locationLat = knownVenueMatch.lat;
                locationLng = knownVenueMatch.lng;
                canonicalVenue = knownVenueMatch.canonicalName;
                geocodeSource = 'known_venues_db';

                // Copy address from known_venues if available AND if not already set by AI
                if (knownVenueMatch.address && !locationAddress) {
                  locationAddress = knownVenueMatch.address;
                }

                // Log with match type details
                const matchTypeLabel = {
                  'exact_name': 'exact name match',
                  'exact_alias': 'alias match',
                  'normalized_name': 'normalized name match',
                  'normalized_alias': 'normalized alias match',
                  'word_match': 'word match',
                  'partial_name': 'partial name match',
                  'partial_alias': 'partial alias match',
                  'fuzzy': 'fuzzy match'
                }[knownVenueMatch.matchType] || knownVenueMatch.matchType;

                await ingestLogger?.success('geocache', `[GEOCODE] known_venues ${matchTypeLabel}: "${searchName}" → "${knownVenueMatch.canonicalName}"`, {
                  postId: post.postId,
                  venue: rawVenueName,
                  matchedName: knownVenueMatch.canonicalName,
                  matchType: knownVenueMatch.matchType,
                  lat: knownVenueMatch.lat,
                  lng: knownVenueMatch.lng,
                  city: knownVenueMatch.city,
                  address: knownVenueMatch.address || null,
                });
              }
            } catch (dbError) {
              await ingestLogger?.warn('geocache', `Known venues lookup error`, {
                postId: post.postId,
                venue: rawVenueName,
                error: dbError instanceof Error ? dbError.message : 'Unknown error',
              });
            }

            // 4. Fall back to static NCR geocache (fast, in-memory)
            if (!locationLat) {
              const cachedVenue = lookupNCRVenue(searchName);
              if (cachedVenue) {
                locationLat = cachedVenue.lat;
                locationLng = cachedVenue.lng;
                geocodeSource = 'ncr_cache_exact';

                await ingestLogger?.success('geocache', `NCR cache hit (exact): ${searchName}`, {
                  postId: post.postId,
                  venue: rawVenueName,
                  lat: cachedVenue.lat,
                  lng: cachedVenue.lng,
                  city: cachedVenue.city,
                });
              }
            }

            // 5. Fall back to fuzzy match in NCR cache
            if (!locationLat) {
              const fuzzyMatch = fuzzyMatchVenue(searchName, DEFAULT_FUZZY_THRESHOLD);
              if (fuzzyMatch) {
                locationLat = fuzzyMatch.lat;
                locationLng = fuzzyMatch.lng;
                geocodeSource = 'ncr_cache_fuzzy';

                await ingestLogger?.success('geocache', `NCR cache hit (fuzzy): ${searchName} → ${fuzzyMatch.matchedName}`, {
                  postId: post.postId,
                  venue: rawVenueName,
                  matchedName: fuzzyMatch.matchedName,
                  lat: fuzzyMatch.lat,
                  lng: fuzzyMatch.lng,
                  city: fuzzyMatch.city,
                });
              }
            }

            // Log if no geocode match found
            if (!locationLat && rawVenueName) {
              await ingestLogger?.warn('geocache', `No venue match found: ${rawVenueName}`, {
                postId: post.postId,
                searchedVenue: canonicalVenue || rawVenueName,
              });
            }
          }

          if (locationLat && locationLng) geocoded++;

          // === END KNOWLEDGE BASE INTEGRATION ===

          // === AUTO-DOWNLOAD IMAGE ===
          let storedImageUrl: string | null = null;
          const imageUrl = post.imageUrl;

          if (imageUrl) {
            try {
              await ingestLogger?.info('image', `Downloading image for ${post.postId}...`, { postId: post.postId });

              // Add 15-second timeout to prevent hanging on failed downloads
              const timeoutMs = 15000;
              const imageResponse = await Promise.race([
                fetch(imageUrl, {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                  }
                }),
                new Promise<Response>((_, reject) =>
                  setTimeout(() => reject(new Error('Image download timeout after 15s')), timeoutMs)
                )
              ]);

              if (imageResponse.ok) {
                const imageBlob = await imageResponse.blob();
                const arrayBuffer = await imageBlob.arrayBuffer();

                const fileName = `instagram-posts/${post.postId}.jpg`;

                const { error: uploadError } = await supabase.storage
                  .from('event-images')
                  .upload(fileName, arrayBuffer, {
                    contentType: 'image/jpeg',
                    upsert: true,
                  });

                if (!uploadError) {
                  const { data: urlData } = supabase.storage
                    .from('event-images')
                    .getPublicUrl(fileName);

                  storedImageUrl = urlData.publicUrl;
                  imagesStored++;

                  await ingestLogger?.success('image', `Image stored: ${post.postId}`, {
                    postId: post.postId,
                    fileName,
                  });
                } else {
                  await ingestLogger?.warn('image', `Upload failed: ${post.postId}`, {
                    postId: post.postId,
                    error: uploadError.message,
                  });
                }
              } else {
                await ingestLogger?.warn('image', `Download failed (HTTP ${imageResponse.status}): ${post.postId}`, {
                  postId: post.postId,
                  status: imageResponse.status,
                });
              }
            } catch (imgError) {
              await ingestLogger?.warn('image', `Image error: ${post.postId}`, {
                postId: post.postId,
                error: imgError instanceof Error ? imgError.message : 'Unknown error',
              });
            }
          }
          // === END AUTO-DOWNLOAD IMAGE ===

          // === VALIDATION LAYER ===
          const validation = validateExtractedData({
            eventDate: post.aiExtraction?.eventDate,
            eventEndDate: post.aiExtraction?.eventEndDate || null,
            eventTime: post.aiExtraction?.eventTime,
            endTime: post.aiExtraction?.endTime,
            locationName: canonicalVenue,
            price: post.aiExtraction?.price,
            caption: post.caption,
            eventTitle: post.aiExtraction?.eventTitle || null,
            category: category,
            isFree: post.aiExtraction?.isFree ?? null,
          });

          // Prepare new post data for completeness comparison
          const newPostDataForComparison = {
            event_title: post.aiExtraction?.eventTitle || null,
            event_time: validation.correctedData.eventTime,
            end_time: validation.correctedData.endTime,
            price: validation.correctedData.price,
            price_notes: (post.aiExtraction as any)?.priceNotes ?? null,
            location_lat: locationLat,
            location_lng: locationLng,
            signup_url: (post.aiExtraction as any)?.signupUrl ?? null,
            sub_events: (post.aiExtraction as any)?.subEvents ?? null,
            caption: post.caption,
            location_address: locationAddress,
          };

          // Check for duplicates with quality-aware comparison
          const duplicateCheck = await checkForDuplicate(
            supabase,
            validation.correctedData.locationName,
            validation.correctedData.eventDate,
            validation.correctedData.eventTime,
            post.aiExtraction?.eventTitle || null,
            newPostDataForComparison
          );

          // If new post should replace existing as primary, update the existing post
          let swappedExistingPost = false;
          if (duplicateCheck.isDuplicate && duplicateCheck.shouldReplaceExisting && duplicateCheck.existingPostId) {
            // Mark the existing post as a duplicate of the new post (will update after upsert)
            swappedExistingPost = true;
            await ingestLogger?.info('save', `New post (score: ${duplicateCheck.newCompleteness}) REPLACES existing (score: ${duplicateCheck.existingCompleteness}) as primary`, {
              postId: post.postId,
              existingPostId: duplicateCheck.existingPostId,
              newCompleteness: duplicateCheck.newCompleteness,
              existingCompleteness: duplicateCheck.existingCompleteness
            });
          }

          // Assign review tier
          const tierAssignment = assignReviewTier(
            post.aiExtraction?.confidence,
            post.aiExtraction?.confidence,
            'github_actions_gemini_vision',
            validation.warnings,
            !!validation.correctedData.eventDate,
            !!validation.correctedData.eventTime,
            !!validation.correctedData.locationName,
            !!(locationLat && locationLng),
            !!(locationLat && locationLng) // isKnownVenue = has coordinates
          );

          // If duplicate and NOT replacing existing, mark new post as rejected
          // If replacing existing, new post becomes primary (use original tier)
          const finalTier = (duplicateCheck.isDuplicate && !duplicateCheck.shouldReplaceExisting)
            ? 'rejected'
            : tierAssignment.tier;

          // Calculate urgency score based on event date proximity
          let urgencyScore = 0;
          if (validation.correctedData.eventDate) {
            const eventDate = new Date(validation.correctedData.eventDate);
            const now = new Date();
            const daysUntil = Math.floor((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

            if (daysUntil <= 0) urgencyScore = 100; // Today
            else if (daysUntil === 1) urgencyScore = 80; // Tomorrow
            else if (daysUntil <= 3) urgencyScore = 60; // This week
            else if (daysUntil <= 7) urgencyScore = 50; // Within a week
            else if (daysUntil <= 14) urgencyScore = 30; // Within 2 weeks
            else urgencyScore = 10; // Future
          }

          // Generate fallback title if AI didn't extract one
          const eventTitle = post.aiExtraction?.eventTitle ||
            (isEvent ? generateFallbackTitle(category, canonicalVenue) : null);

          // Upsert the post with enriched data + validation fields
          const { error, data: upsertedPost } = await supabase.from('instagram_posts').upsert({
            post_id: post.postId,
            post_url: `https://www.instagram.com/p/${post.shortCode || post.postId}/`,
            instagram_account_id: accountId,
            caption: post.caption,
            image_url: post.imageUrl,
            stored_image_url: storedImageUrl,
            posted_at: post.timestamp || new Date().toISOString(),
            location_name: validation.correctedData.locationName,
            location_address: locationAddress, // Use address from known_venues if available
            location_lat: locationLat,
            location_lng: locationLng,
            is_event: isEvent, // Use corrected isEvent (after non-event/historical checks)
            event_title: eventTitle,
            event_date: validation.correctedData.eventDate,
            event_end_date: post.aiExtraction?.eventEndDate || null,
            event_time: validation.correctedData.eventTime,
            end_time: validation.correctedData.endTime,
            price: validation.correctedData.price || 0,
            is_free: post.aiExtraction?.isFree ?? false, // Default to false, not true!
            category: validation.correctedCategory || category,
            ocr_text: post.aiExtraction?.ocrText,
            ai_confidence: post.aiExtraction?.confidence,
            ai_reasoning: (post.aiExtraction as any)?.reasoning || null,
            ocr_processed: true,
            extraction_method: 'github_actions_gemini_vision',
            needs_review: post.aiExtraction?.isEvent || false,
            // New validation fields
            review_tier: finalTier,
            validation_warnings: validation.warnings,
            is_duplicate: duplicateCheck.isDuplicate,
            duplicate_of: duplicateCheck.duplicateOfId,
            // Price range fields
            price_min: (post.aiExtraction as any)?.priceMin ?? null,
            price_max: (post.aiExtraction as any)?.priceMax ?? null,
            price_notes: (post.aiExtraction as any)?.priceNotes ?? null,
            // Event lifecycle status fields
            event_status: (post.aiExtraction as any)?.isUpdate
              ? ((post.aiExtraction as any)?.updateType === 'cancel' ? 'cancelled' : 'rescheduled')
              : ((post.aiExtraction as any)?.eventStatus ?? 'confirmed'),
            availability_status: (post.aiExtraction as any)?.availabilityStatus ?? 'available',
            location_status: validation.correctedData.locationStatus || (post.aiExtraction as any)?.locationStatus || 'confirmed',
            // Recurring event fields
            is_recurring: (post.aiExtraction as any)?.isRecurring ?? false,
            recurrence_pattern: (post.aiExtraction as any)?.recurrencePattern ?? null,
            // Urgency score for sorting
            urgency_score: urgencyScore,
            // Signup URL and type
            signup_url: (post.aiExtraction as any)?.signupUrl ?? null,
            url_type: (post.aiExtraction as any)?.urlType ?? null,
            // Sub-events for multi-event posts (different artists/activities per day)
            sub_events: (post.aiExtraction as any)?.subEvents ?? null,
          }, { onConflict: 'post_id' }).select('id').single();

          if (error) {
            await ingestLogger?.error('save', `Failed to save post ${post.postId}`, { postId: post.postId }, {
              error: error.message,
              code: error.code,
            });
            failed++;
          } else {
            // If we swapped duplicates, update the existing post to point to new post as primary
            if (swappedExistingPost && upsertedPost?.id && duplicateCheck.existingPostId) {
              const { error: swapError } = await supabase
                .from('instagram_posts')
                .update({
                  is_duplicate: true,
                  duplicate_of: upsertedPost.id,
                  review_tier: 'rejected'
                })
                .eq('id', duplicateCheck.existingPostId);

              if (swapError) {
                console.warn(`Failed to swap duplicate roles: ${swapError.message}`);
              } else {
                await ingestLogger?.success('save', `Swapped duplicate roles - existing post ${duplicateCheck.existingPostId} now points to new primary ${upsertedPost.id}`, {
                  existingPostId: duplicateCheck.existingPostId,
                  newPrimaryId: upsertedPost.id
                });
              }
            }

            // Log validation warnings to validation_logs table
            if (validation.warnings.length > 0 && upsertedPost?.id) {
              await logValidationWarnings(supabase, upsertedPost.id, validation.warnings, {
                date: post.aiExtraction?.eventDate,
                time: post.aiExtraction?.eventTime,
                venue: canonicalVenue,
                price: post.aiExtraction?.price,
                title: post.aiExtraction?.eventTitle,
                category: category,
              });
            }

            // Store schedule data if provided (multi-date/multi-time events)
            const schedule = (post.aiExtraction as any)?.schedule;
            if (upsertedPost?.id && schedule && Array.isArray(schedule) && schedule.length > 0) {
              try {
                // Build event_dates records from schedule
                const scheduleRecords: Array<{
                  instagram_post_id: string;
                  event_date: string;
                  event_time: string | null;
                  venue_name: string | null;
                }> = [];

                for (const day of schedule) {
                  if (day.date && day.times && Array.isArray(day.times)) {
                    for (const slot of day.times) {
                      scheduleRecords.push({
                        instagram_post_id: upsertedPost.id,
                        event_date: day.date,
                        event_time: slot.time || null,
                        venue_name: slot.label || null, // Use label as screening/slot name
                      });
                    }
                  }
                }

                if (scheduleRecords.length > 0) {
                  // Delete existing and insert new
                  const { error: deleteError } = await supabase.from('event_dates').delete().eq('instagram_post_id', upsertedPost.id);
                  if (deleteError) {
                    console.warn(`Failed to delete existing event_dates for ${post.postId}: ${deleteError.message}`);
                  }

                  const { error: scheduleError } = await supabase
                    .from('event_dates')
                    .upsert(scheduleRecords, {
                      onConflict: 'instagram_post_id,event_date,venue_name',
                      ignoreDuplicates: true
                    });

                  if (scheduleError) {
                    console.warn(`Failed to upsert schedule for ${post.postId}:`, scheduleError.message);
                  } else {
                    console.log(`Stored ${scheduleRecords.length} schedule slot(s) for ${post.postId}`);
                  }
                }
              } catch (scheduleInsertError) {
                console.warn(`Error inserting schedule for ${post.postId}:`, scheduleInsertError);
              }
            }
            // NEW: Handle allEventDates array (non-continuous multi-date events)
            const allEventDates = (post.aiExtraction as any)?.allEventDates;
            if (upsertedPost?.id && allEventDates && Array.isArray(allEventDates) && allEventDates.length > 0) {
              try {
                // Delete existing and insert new
                const { error: deleteError } = await supabase.from('event_dates').delete().eq('instagram_post_id', upsertedPost.id);
                if (deleteError) {
                  console.warn(`Failed to delete existing event_dates for ${post.postId}: ${deleteError.message}`);
                }

                const dateRecords = allEventDates.map((dateStr: string) => ({
                  instagram_post_id: upsertedPost.id,
                  event_date: dateStr,
                  event_time: validation.correctedData.eventTime || null,
                  venue_name: canonicalVenue || null,
                }));

                const { error: datesError } = await supabase.from('event_dates').upsert(dateRecords, {
                  onConflict: 'instagram_post_id,event_date,venue_name',
                  ignoreDuplicates: true
                });
                if (datesError) {
                  console.warn(`Failed to upsert allEventDates for ${post.postId}:`, datesError.message);
                } else {
                  await ingestLogger?.info('save', `Stored ${dateRecords.length} event dates for multi-date event`, { postId: post.postId, dates: allEventDates });
                }
              } catch (err) {
                console.warn(`Error inserting allEventDates for ${post.postId}:`, err);
              }
            }
            // NEW: Handle subEvents with dates (film schedules, workshop schedules, etc.)
            // IMPORTANT: Sub-events WITHOUT dates are performers/artists - keep in sub_events JSON only
            // Sub-events WITH dates are scheduled screenings/activities - store in event_dates
            const subEvents = (post.aiExtraction as any)?.subEvents;
            if (upsertedPost?.id && subEvents && Array.isArray(subEvents) && subEvents.length > 0) {
              try {
                // Filter sub-events that have specific dates (scheduled screenings, activities)
                const subEventsWithDates = subEvents.filter((e: any) => e.date);

                // Sub-events without dates are performers - keep in sub_events JSON only (already saved above)
                const performerSubEvents = subEvents.filter((e: any) => !e.date);
                if (performerSubEvents.length > 0) {
                  await ingestLogger?.info('save', `${performerSubEvents.length} performer/artist sub-events stored in sub_events JSON`, {
                    postId: post.postId,
                    performers: performerSubEvents.map((e: any) => e.title)
                  });
                }

                if (subEventsWithDates.length > 0) {
                  // Delete existing event_dates for this post first
                  const { error: deleteError } = await supabase.from('event_dates').delete().eq('instagram_post_id', upsertedPost.id);
                  if (deleteError) {
                    console.warn(`Failed to delete existing event_dates for ${post.postId}: ${deleteError.message}`);
                  }

                  // FIXED: Use actual venue name for venue_name, store activity description in venue_address
                  // Use upsert with ignoreDuplicates to prevent constraint violations
                  const dateRecords = subEventsWithDates.map((e: any) => ({
                    instagram_post_id: upsertedPost.id,
                    event_date: e.date,
                    event_time: e.time || validation.correctedData.eventTime || null,
                    end_time: e.endTime || validation.correctedData.endTime || null,
                    venue_name: canonicalVenue || validation.correctedData.locationName || null, // Use ACTUAL venue
                    venue_address: e.title || e.description || null, // Store sub-event title/activity as address descriptor
                  }));

                  const { error: subEventsError } = await supabase.from('event_dates').upsert(dateRecords, {
                    onConflict: 'instagram_post_id,event_date,venue_name',
                    ignoreDuplicates: true
                  });
                  if (subEventsError) {
                    console.warn(`Failed to upsert subEvents dates for ${post.postId}:`, subEventsError.message);
                  } else {
                    await ingestLogger?.info('save', `Stored ${dateRecords.length} scheduled sub-event dates with venue: ${canonicalVenue || 'unknown'}`, {
                      postId: post.postId,
                      venue: canonicalVenue,
                      activities: subEventsWithDates.map((e: any) => e.title)
                    });
                  }
                }
              } catch (err) {
                console.warn(`Error inserting subEvents dates for ${post.postId}:`, err);
              }
            }
            // Legacy support: Store additional dates if provided (multi-date events)
            else if (upsertedPost?.id && post.aiExtraction?.additionalDates && post.aiExtraction.additionalDates.length > 0) {
              try {
                const additionalDatesRecords = post.aiExtraction.additionalDates.map(ad => ({
                  instagram_post_id: upsertedPost.id,
                  event_date: ad.date,
                  event_time: ad.time || null,
                  venue_name: ad.venue,
                }));

                const { error: datesError } = await supabase
                  .from('event_dates')
                  .upsert(additionalDatesRecords, {
                    onConflict: 'instagram_post_id,event_date,venue_name',
                    ignoreDuplicates: false
                  });

                if (datesError) {
                  console.warn(`Failed to insert additional dates for ${post.postId}:`, datesError.message);
                } else {
                  console.log(`Stored ${additionalDatesRecords.length} additional date(s) for ${post.postId}`);
                }
              } catch (datesInsertError) {
                console.warn(`Error inserting additional dates for ${post.postId}:`, datesInsertError);
              }
            }

            await ingestLogger?.success('save', `Saved post ${post.postId}`, {
              postId: post.postId,
              isEvent: post.aiExtraction?.isEvent || false,
              hasCoordinates: !!(locationLat && locationLng),
              geocodeSource,
              category,
              validationWarnings: validation.warnings.length,
            });
            saved++;

            // PHASE 2: Pattern training with ACTUAL regex testing
            // Run regex extraction to compare with AI and properly track pattern success/failure
            if (post.caption && post.aiExtraction && (post.aiExtraction.confidence ?? 0) >= 0.7) {
              try {
                // Actually run regex extraction to test patterns
                const regexResult = await extractInParallel(
                  post.caption,
                  rawVenueName,
                  post.postId,
                  supabase,
                  {
                    postedAt: post.timestamp,
                    ownerUsername: post.ownerUsername,
                    imageUrl: post.imageUrl,
                    useOCR: false, // Don't re-run AI, just use regex
                  }
                );

                // Build merged result with ACTUAL source comparison
                const mergedResult: MergedExtractionResult = {
                  eventTitle: post.aiExtraction.eventTitle || regexResult.eventTitle || null,
                  eventDate: validation.correctedData.eventDate || null,
                  eventEndDate: (post.aiExtraction as any)?.eventEndDate || regexResult.eventEndDate || null,
                  eventTime: validation.correctedData.eventTime || null,
                  endTime: validation.correctedData.endTime || regexResult.endTime || null,
                  locationName: validation.correctedData.locationName || null,
                  locationAddress: post.aiExtraction.venueAddress || regexResult.locationAddress || null,
                  signupUrl: (post.aiExtraction as any)?.signupUrl || regexResult.signupUrl || null,
                  price: validation.correctedData.price ?? regexResult.price ?? null,
                  isFree: post.aiExtraction.isFree ?? regexResult.isFree ?? null,
                  isEvent: post.aiExtraction.isEvent ?? false,
                  confidence: post.aiExtraction.confidence,
                  reasoning: (post.aiExtraction as any).reasoning || null,
                  // Copy pattern IDs from regex result for tracking
                  datePatternId: regexResult.datePatternId,
                  timePatternId: regexResult.timePatternId,
                  venuePatternId: regexResult.venuePatternId,
                  pricePatternId: regexResult.pricePatternId,
                  signupUrlPatternId: regexResult.signupUrlPatternId,
                  // Calculate actual sources by comparing regex vs AI
                  sources: {
                    eventDate: regexResult.eventDate && post.aiExtraction.eventDate
                      ? (regexResult.eventDate === post.aiExtraction.eventDate ? 'both' : 'ai')
                      : (regexResult.eventDate ? 'regex' : 'ai'),
                    eventTime: regexResult.eventTime && post.aiExtraction.eventTime
                      ? (regexResult.eventTime === post.aiExtraction.eventTime ? 'both' : 'ai')
                      : (regexResult.eventTime ? 'regex' : 'ai'),
                    locationName: regexResult.locationName && post.aiExtraction.venueName
                      ? 'both' : (regexResult.locationName ? 'regex' : 'ai'),
                    price: regexResult.price !== null && post.aiExtraction.price !== null
                      ? (regexResult.price === post.aiExtraction.price ? 'both' : 'ai')
                      : (regexResult.price !== null ? 'regex' : 'ai'),
                    signupUrl: regexResult.signupUrl ? 'regex' :
                      ((post.aiExtraction as any)?.signupUrl ? 'ai' : undefined),
                  },
                  conflicts: [],
                  overallSource: 'both',
                };

                // Detect conflicts
                if (regexResult.eventDate && post.aiExtraction.eventDate &&
                  regexResult.eventDate !== post.aiExtraction.eventDate) {
                  mergedResult.conflicts.push({
                    field: 'eventDate',
                    regexValue: regexResult.eventDate,
                    aiValue: post.aiExtraction.eventDate,
                  });
                }
                if (regexResult.eventTime && post.aiExtraction.eventTime &&
                  regexResult.eventTime !== post.aiExtraction.eventTime) {
                  mergedResult.conflicts.push({
                    field: 'eventTime',
                    regexValue: regexResult.eventTime,
                    aiValue: post.aiExtraction.eventTime,
                  });
                }

                await saveGroundTruth(post.postId, post.caption || '', mergedResult, supabase);
                await trainPatternsFromComparison(post.postId, post.caption || '', mergedResult, supabase);

                await ingestLogger?.info('save', `Pattern training: ${Object.entries(mergedResult.sources).filter(([, v]) => v === 'both').length} matched, ${mergedResult.conflicts.length} conflicts`, {
                  postId: post.postId,
                  sources: mergedResult.sources,
                  conflicts: mergedResult.conflicts.length,
                  patternIds: {
                    date: regexResult.datePatternId,
                    time: regexResult.timePatternId,
                    venue: regexResult.venuePatternId,
                    price: regexResult.pricePatternId,
                  },
                });
              } catch (trainErr) {
                console.warn(`[GH-INGEST] Pattern training failed for ${post.postId}:`, trainErr);
              }
            }
          }
        } catch (err) {
          await ingestLogger?.error('save', `Error processing ${post.postId}`, { postId: post.postId }, {
            error: err instanceof Error ? err.message : 'Unknown error',
          });
          failed++;
        }
      }

      // Log summary
      const summary = {
        total: body.posts.length,
        saved,
        failed,
        eventsDetected,
        geocoded,
        withImages,
        imagesStored,
        accountsProcessed: accountsProcessed.size,
        categoryBreakdown,
      };

      await ingestLogger?.success('fetch', `Batch ${batchNumber}/${totalBatches} complete`, summary);

      // Only update scrape_run with final status on last batch
      if (isLastBatch && ingestRunId) {
        // Get current totals from the run to add to them
        const { data: currentRun } = await supabase
          .from('scrape_runs')
          .select('posts_added, accounts_found')
          .eq('id', ingestRunId)
          .single();

        const totalSaved = (currentRun?.posts_added || 0) + saved;
        const totalAccounts = Math.max(currentRun?.accounts_found || 0, accountsProcessed.size);

        await supabase.from('scrape_runs').update({
          status: 'completed',
          posts_added: totalSaved,
          posts_updated: 0,
          accounts_found: totalAccounts,
          completed_at: new Date().toISOString(),
          error_message: failed > 0 ? `${failed} posts failed in final batch` : null,
        }).eq('id', ingestRunId);

        await ingestLogger?.success('fetch', `GitHub Actions ingest COMPLETE`, {
          totalBatches,
          finalSaved: totalSaved,
        });
        await ingestLogger?.close();

        console.log(`[GH-INGEST] ALL BATCHES COMPLETE: ${totalSaved} total saved`);
      } else if (ingestRunId) {
        // Update running totals for non-final batches
        const { data: currentRun } = await supabase
          .from('scrape_runs')
          .select('posts_added, accounts_found')
          .eq('id', ingestRunId)
          .single();

        await supabase.from('scrape_runs').update({
          posts_added: (currentRun?.posts_added || 0) + saved,
          accounts_found: Math.max(currentRun?.accounts_found || 0, accountsProcessed.size),
          last_heartbeat: new Date().toISOString(),
        }).eq('id', ingestRunId);
      }

      console.log(`[GH-INGEST] Batch ${batchNumber}/${totalBatches}: ${saved} saved, ${failed} failed, ${eventsDetected} events`);

      return new Response(JSON.stringify({
        success: true,
        saved,
        failed,
        total: body.posts.length,
        eventsDetected,
        geocoded,
        withImages,
        imagesStored,
        accountsProcessed: accountsProcessed.size,
        categoryBreakdown,
        runId: ingestRunId,
        batchNumber,
        totalBatches,
        isComplete: isLastBatch,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
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

    // HEARTBEAT MECHANISM: Update last_heartbeat every 30 seconds to detect stuck runs
    const HEARTBEAT_INTERVAL_MS = 30000;
    let heartbeatInterval: number | undefined;

    const updateHeartbeat = async () => {
      if (runId) {
        try {
          await supabase
            .from('scrape_runs')
            .update({ last_heartbeat: new Date().toISOString() })
            .eq('id', runId);
        } catch (err) {
          console.error('Failed to update heartbeat:', err);
        }
      }
    };

    // Start heartbeat interval
    if (runId) {
      heartbeatInterval = setInterval(updateHeartbeat, HEARTBEAT_INTERVAL_MS) as unknown as number;
      // Send initial heartbeat
      await updateHeartbeat();
    }

    // Helper to stop heartbeat and cleanup
    const stopHeartbeat = () => {
      if (heartbeatInterval !== undefined) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = undefined;
      }
    };
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

      // Use retry logic for Apify dataset fetch
      let apifyResponse: Response;
      try {
        apifyResponse = await fetchWithRetry(
          () => fetchWithTimeout(
            `https://api.apify.com/v2/datasets/${datasetId}/items?token=${finalToken}&clean=1`,
            { timeout: 30000 } // 30 second timeout
          ),
          {
            maxRetries: 3,
            baseDelay: 2000,
            maxDelay: 8000,
            onRetry: (attempt, error) => {
              console.log(`Retry attempt ${attempt} for dataset fetch: ${error.message}`);
              logger.warn('fetch', `Dataset fetch retry ${attempt}`, { datasetId, error: error.message });
            },
          }
        );
      } catch (fetchError) {
        const errorMsg = fetchError instanceof Error
          ? `Failed to fetch dataset: ${fetchError.message}`
          : 'Failed to fetch dataset: Unknown error';
        console.error(errorMsg);
        await logger.error('fetch', 'Dataset fetch failed after retries', { datasetId }, { error: errorMsg });

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

      // BATCH PROCESSING: Process posts in smaller batches with progress updates
      const BATCH_SIZE = 10;
      let processedCount = 0;
      const totalItems = apifyData.length;

      // Build set of venue Instagram handles for source authority scoring
      const venueHandles = new Set<string>();
      try {
        const { data: venues } = await supabase
          .from('known_venues')
          .select('instagram_handle')
          .not('instagram_handle', 'is', null);

        if (venues) {
          venues.forEach(v => {
            if (v.instagram_handle) {
              // Normalize handle (remove @ if present)
              const handle = v.instagram_handle.toLowerCase().replace(/^@/, '');
              venueHandles.add(handle);
            }
          });
          console.log(`Loaded ${venueHandles.size} venue handles for authority scoring`);
        }
      } catch (error) {
        console.warn('Failed to load venue handles:', error);
        // Continue without venue handles - will use default authority scores
      }

      // Process each item
      for (const item of apifyData) {
        // Update progress every BATCH_SIZE items
        if (processedCount > 0 && processedCount % BATCH_SIZE === 0) {
          console.log(`Progress: ${processedCount}/${totalItems} items processed`);
          // Update heartbeat and progress
          if (runId) {
            await supabase
              .from('scrape_runs')
              .update({
                last_heartbeat: new Date().toISOString(),
                posts_added: totalScrapedPosts,
                posts_updated: totalUpdatedPosts,
              })
              .eq('id', runId);
          }

          // Check if run was cancelled
          const { data: runStatus } = await supabase
            .from('scrape_runs')
            .select('status')
            .eq('id', runId)
            .single();

          if (runStatus?.status === 'cancelled') {
            console.log('Scrape run was cancelled by admin');
            stopHeartbeat();
            await logger.info('skip', 'Run cancelled by admin', { processedCount, totalItems });
            await logger.close();
            return new Response(
              JSON.stringify({
                message: 'Scrape cancelled',
                processedCount,
                totalItems,
                newPostsAdded: totalScrapedPosts,
                postsUpdated: totalUpdatedPosts,
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
        processedCount++;

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

        // Calculate source authority for deduplication
        const sourceAuthority = getSourceAuthority(username, venueHandles);

        if (!postedAt) {
          totalSkipped++;
          console.log(`Skipping post ${postId} - no timestamp`);
          continue;
        }

        const hashtags = item.hashtags || [];
        const mentions = item.mentions || [];
        const postUrl = item.url || `https://www.instagram.com/p/${item.shortCode}/`;

        // Extract image URL early for OCR extraction during parsing
        const imageUrl = item.displayUrl || item.imageUrl;

        // Parse event information using parallel extraction (regex + AI)
        const parseStart = Date.now();
        let eventInfo;
        try {
          const parallelResult = await extractInParallel(
            item.caption || '',
            item.locationName,
            postId,
            supabase,
            {
              postedAt: postedAt,
              ownerUsername: username,
              instagramAccountId: undefined, // Will be looked up later
              imageUrl: imageUrl || undefined,
            }
          );

          // Map parallelResult to eventInfo for backward compatibility
          eventInfo = {
            eventTitle: parallelResult.eventTitle,
            eventDate: parallelResult.eventDate,
            eventEndDate: parallelResult.eventEndDate,
            eventTime: parallelResult.eventTime,
            endTime: parallelResult.endTime,
            locationName: parallelResult.locationName,
            locationAddress: parallelResult.locationAddress,
            price: parallelResult.price,
            isFree: parallelResult.isFree ?? undefined,
            isEvent: parallelResult.isEvent,
            signupUrl: parallelResult.signupUrl,
            needsReview: (parallelResult.confidence ?? 0) < 0.7,
            extractionMethod: parallelResult.overallSource,
            aiConfidence: parallelResult.confidence,
            extractionSources: parallelResult.sources,
            extractionConflicts: parallelResult.conflicts,
            aiReasoning: parallelResult.reasoning,
            // Pattern tracking IDs from parallel extraction
            datePatternId: parallelResult.datePatternId,
            timePatternId: parallelResult.timePatternId,
            venuePatternId: parallelResult.venuePatternId,
            pricePatternId: parallelResult.pricePatternId,
            signupUrlPatternId: parallelResult.signupUrlPatternId,
            // Legacy fields for backward compatibility
            timeValidationFailed: false,
            rawEventTime: parallelResult.eventTime,
            rawEndTime: parallelResult.endTime,
            ocrTextExtracted: null,
            ocrConfidence: null,
            aiExtraction: parallelResult.confidence ? {
              eventTitle: parallelResult.eventTitle,
              eventDate: parallelResult.eventDate,
              eventTime: parallelResult.eventTime,
              locationName: parallelResult.locationName,
              price: parallelResult.price,
              confidence: parallelResult.confidence,
            } : null,
          };
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
        // First check NCR geocache, then known_venues DB, then fall back to API
        let locationLat: number | null = null;
        let locationLng: number | null = null;
        let geocodedAddress: string | null = null;
        let cacheHit = false;

        // Helper to clean venue name for geocoding lookups
        const cleanVenueNameForGeocoding = (name: string): string => {
          return name
            .split(/\s*[-–—(]\s*/)[0]  // Stop at dashes/parentheses
            .split(/\s+(?:Dec|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov)\s+/i)[0]  // Stop at dates
            .split(/For online|can waze|via waze|see you|join us/i)[0]  // Stop at directions/CTAs
            .replace(/\d{1,2}(?:am|pm)/gi, '')  // Remove times
            .replace(/\s+/g, ' ')  // Normalize whitespace
            .trim();
        };

        if (eventInfo.locationName) {
          const cleanedVenueName = cleanVenueNameForGeocoding(eventInfo.locationName);

          // Try NCR geocache first (exact match)
          const cachedVenue = lookupNCRVenue(cleanedVenueName);
          if (cachedVenue) {
            locationLat = cachedVenue.lat;
            locationLng = cachedVenue.lng;
            geocodedAddress = `${cleanedVenueName}, ${cachedVenue.city}`;
            cacheHit = true;

            await logger.success('geocache', 'NCR venue cache hit (exact)', {
              postId,
              venue: eventInfo.locationName,
              cleanedName: cleanedVenueName,
              city: cachedVenue.city,
              lat: cachedVenue.lat,
              lng: cachedVenue.lng,
            });
          } else {
            // Try fuzzy match on NCR cache
            const fuzzyMatch = fuzzyMatchVenue(cleanedVenueName, 0.7);
            if (fuzzyMatch) {
              locationLat = fuzzyMatch.lat;
              locationLng = fuzzyMatch.lng;
              geocodedAddress = `${fuzzyMatch.matchedName}, ${fuzzyMatch.city}`;
              cacheHit = true;

              await logger.success('geocache', 'NCR venue cache hit (fuzzy)', {
                postId,
                venue: eventInfo.locationName,
                cleanedName: cleanedVenueName,
                matchedName: fuzzyMatch.matchedName,
                city: fuzzyMatch.city,
                lat: fuzzyMatch.lat,
                lng: fuzzyMatch.lng,
              });
            }
          }

          // FALLBACK: Check known_venues database table
          if (!cacheHit) {
            try {
              const searchName = cleanedVenueName.toLowerCase().replace(/[%_]/g, '').trim();
              console.log(`[GEOCODE DEBUG] Attempting known_venues DB lookup for: "${searchName}" (original: "${eventInfo.locationName}")`);

              // First, fetch all known venues (they're a small set) for flexible matching
              const { data: allVenues, error: dbError } = await supabase
                .from('known_venues')
                .select('name, lat, lng, city, aliases');

              if (dbError) {
                console.log(`[GEOCODE DEBUG] DB query error: ${dbError.message}`);
                throw dbError;
              }

              console.log(`[GEOCODE DEBUG] Fetched ${allVenues?.length || 0} known venues from DB`);

              // Check results for exact or alias match with flexible matching
              let matchedVenue = null;
              if (allVenues && allVenues.length > 0) {
                // Extract words from search name for partial matching
                const searchWords = searchName.split(/\s+/).filter(w => w.length > 2);

                for (const venue of allVenues) {
                  const venueLower = venue.name.toLowerCase();

                  // Direct name matching (either direction)
                  if (venueLower.includes(searchName) || searchName.includes(venueLower)) {
                    matchedVenue = venue;
                    console.log(`[GEOCODE DEBUG] Matched by name: "${venue.name}"`);
                    break;
                  }

                  // Check aliases (either direction)
                  if (venue.aliases && Array.isArray(venue.aliases)) {
                    for (const alias of venue.aliases) {
                      const aliasLower = alias.toLowerCase();
                      if (aliasLower.includes(searchName) || searchName.includes(aliasLower)) {
                        matchedVenue = venue;
                        console.log(`[GEOCODE DEBUG] Matched by alias "${alias}" → "${venue.name}"`);
                        break;
                      }
                    }
                  }
                  if (matchedVenue) break;

                  // Partial word matching - if venue name words appear in search
                  const venueWords = venueLower.split(/\s+/).filter((w: string) => w.length > 2);
                  const matchingWords = venueWords.filter((vw: string) => searchWords.some((sw: string) => sw.includes(vw) || vw.includes(sw)));
                  if (matchingWords.length >= 2 || (matchingWords.length === 1 && venueWords.length === 1)) {
                    matchedVenue = venue;
                    console.log(`[GEOCODE DEBUG] Matched by words [${matchingWords.join(', ')}] → "${venue.name}"`);
                    break;
                  }
                }
              }

              if (!matchedVenue) {
                console.log(`[GEOCODE DEBUG] No match found for "${searchName}"`);
              }

              if (matchedVenue?.lat && matchedVenue?.lng) {
                locationLat = Number(matchedVenue.lat);
                locationLng = Number(matchedVenue.lng);
                geocodedAddress = `${matchedVenue.name}, ${matchedVenue.city || 'Metro Manila'}`;
                cacheHit = true;

                await logger.success('geocache', 'known_venues DB hit', {
                  postId,
                  venue: eventInfo.locationName,
                  cleanedName: cleanedVenueName,
                  matchedName: matchedVenue.name,
                  city: matchedVenue.city,
                  lat: matchedVenue.lat,
                  lng: matchedVenue.lng,
                });
              } else {
                await logger.warn('geocache', 'No match in NCR cache or known_venues DB', {
                  postId,
                  venue: eventInfo.locationName,
                  cleanedName: cleanedVenueName,
                });
              }
            } catch (dbError) {
              await logger.warn('geocache', 'known_venues DB lookup failed', {
                postId,
                venue: eventInfo.locationName,
                error: dbError instanceof Error ? dbError.message : 'Unknown error',
              });
            }
          }
        }

        // If no cache hit and we have a valid address, call geocoding API with retry
        if (!cacheHit && eventInfo.locationName && eventInfo.locationAddress && isValidAddress(eventInfo.locationAddress)) {
          try {
            await logger.info('validation', `Validating venue (cache miss): ${eventInfo.locationName}`, {
              postId,
              venue: eventInfo.locationName,
              address: eventInfo.locationAddress
            });

            const geocodeStart = Date.now();

            // Use retry logic for geocoding API call
            const geocodeResult = await fetchWithRetry(
              async () => {
                const { data, error } = await supabase.functions.invoke('validate-venue', {
                  body: {
                    venue: eventInfo.locationName,
                    address: eventInfo.locationAddress
                  },
                });

                if (error) throw error;
                return data;
              },
              {
                maxRetries: 2,
                baseDelay: 1000,
                maxDelay: 3000,
                onRetry: (attempt, error) => {
                  logger.warn('validation', `Geocoding retry attempt ${attempt}`, {
                    postId,
                    venue: eventInfo.locationName,
                    error: error.message,
                  });
                },
              }
            );

            const geocodeDuration = Date.now() - geocodeStart;

            if (geocodeResult?.isValid) {
              locationLat = geocodeResult.lat;
              locationLng = geocodeResult.lng;
              geocodedAddress = geocodeResult.formattedAddress || eventInfo.locationAddress;

              await logger.success('validation', 'Venue geocoded successfully', {
                postId,
                venue: eventInfo.locationName,
                lat: geocodeResult.lat,
                lng: geocodeResult.lng,
                confidence: geocodeResult.confidence,
                duration_ms: geocodeDuration
              });
            } else {
              await logger.warn('validation', 'Venue validation failed', {
                postId,
                venue: eventInfo.locationName,
                error: 'No valid coordinates returned'
              });
              // Log as rejected post for venue validation failure (post continues without coordinates)
              await logger.logRejectedPost({
                postId,
                reason: 'VENUE_VALIDATION_FAILED',
                reasonMessage: 'No valid coordinates returned',
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
          if (isEventInPast(eventInfo.eventDate, eventInfo.eventEndDate ?? undefined, eventInfo.eventTime ?? undefined, eventInfo.endTime ?? undefined)) {
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
            const newEventInfo = await parseEventFromCaption(
              item.caption || '',
              item.locationName,
              supabase,
              postId,
              {
                postedAt: postedAt,
                ownerUsername: username,
                instagramAccountId: account.id,
                imageUrl: imageUrl || undefined,
              }
            );

            // Only update if new event info is valid
            if (newEventInfo.isEvent && newEventInfo.eventDate && newEventInfo.locationName) {
              await supabase
                .from('instagram_posts')
                .update({
                  caption: item.caption,
                  event_date: newEventInfo.eventDate,
                  event_end_date: newEventInfo.eventEndDate || null,
                  event_time: newEventInfo.eventTime,
                  end_time: newEventInfo.endTime || null,
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
            .select('id, post_id, event_title, likes_count, source_authority, instagram_account_id')
            .eq('location_name', eventInfo.locationName)
            .gte('event_date', dayBefore.toISOString().split('T')[0])
            .lte('event_date', dayAfter.toISOString().split('T')[0])
            .eq('is_event', true);

          if (similarEvents && similarEvents.length > 0) {
            console.log(`Found ${similarEvents.length} similar event(s) for post ${postId}, checking for duplicates`);

            // If this is likely a duplicate, link them in event_groups
            for (const similar of similarEvents) {
              if (similar.post_id !== postId) {
                // Check title similarity to prevent merging different events at same venue/date
                const titleSimilarity = calculateTitleSimilarity(eventInfo.eventTitle ?? null, similar.event_title);
                const SIMILARITY_THRESHOLD = 0.3; // 30% word overlap required

                if (titleSimilarity < SIMILARITY_THRESHOLD) {
                  console.log(`Skipping merge: titles too different (similarity: ${titleSimilarity.toFixed(2)})`);
                  console.log(`  - Current: "${eventInfo.eventTitle}"`);
                  console.log(`  - Existing: "${similar.event_title}"`);
                  continue; // Don't merge events with different titles
                }

                console.log(`Titles similar enough to merge (similarity: ${titleSimilarity.toFixed(2)})`);

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
                  // Create new group with higher authority source as primary
                  // Use source_authority first, then likes_count as tiebreaker
                  const currentAuthority = sourceAuthority || 50;
                  const similarAuthority = similar.source_authority || 50;

                  let primaryId: string;
                  let mergedId: string;

                  if (currentAuthority > similarAuthority) {
                    primaryId = postId;
                    mergedId = similar.post_id;
                  } else if (currentAuthority < similarAuthority) {
                    primaryId = similar.post_id;
                    mergedId = postId;
                  } else {
                    // Same authority, use likes as tiebreaker
                    primaryId = likesCount > similar.likes_count ? postId : similar.post_id;
                    mergedId = likesCount > similar.likes_count ? similar.post_id : postId;
                  }

                  await supabase
                    .from('event_groups')
                    .insert({
                      primary_post_id: primaryId,
                      merged_post_ids: [mergedId]
                    });
                  console.log(`Created new event group: primary=${primaryId} (authority=${primaryId === postId ? currentAuthority : similarAuthority}), merged=${mergedId} (authority=${mergedId === postId ? currentAuthority : similarAuthority})`);
                }
              }
            }
          }
        }

        // Extract additional images from carousel posts
        const additionalImages = extractCarouselImages(item);

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
        const insertData: Record<string, unknown> = {
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
          // AI extraction fields
          extraction_method: eventInfo.extractionMethod || 'regex',
          ai_extraction: eventInfo.aiExtraction || null,
          ai_confidence: eventInfo.aiConfidence || null,
          ai_reasoning: eventInfo.aiReasoning || null,
          // OCR extraction fields
          ocr_text: eventInfo.ocrTextExtracted || null,
          ocr_confidence: eventInfo.ocrConfidence || null,
          // Source authority for deduplication
          source_authority: sourceAuthority,
        };

        // Add additional images from carousel if available
        if (additionalImages.length > 0) {
          insertData.additional_images = additionalImages;
        }

        // Only add event_time if we have a valid value
        if (eventInfo.eventTime && !eventInfo.timeValidationFailed) {
          insertData.event_time = eventInfo.eventTime;
        }

        // Add end_time if available and valid
        if (eventInfo.endTime && !eventInfo.timeValidationFailed) {
          insertData.end_time = eventInfo.endTime;
        }

        // Add event_end_date if available
        if (eventInfo.eventEndDate) {
          insertData.event_end_date = eventInfo.eventEndDate;
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

          // Pattern training: Save ground truth and train patterns from AI extraction
          // Only process if we have AI extraction results
          if (eventInfo.aiExtraction && eventInfo.aiConfidence && eventInfo.aiConfidence >= 0.7) {
            try {
              // Convert eventInfo to MergedExtractionResult format for training
              const mergedResult: MergedExtractionResult = {
                eventTitle: eventInfo.eventTitle,
                eventDate: eventInfo.eventDate,
                eventEndDate: eventInfo.eventEndDate,
                eventTime: eventInfo.eventTime,
                endTime: eventInfo.endTime,
                locationName: eventInfo.locationName,
                locationAddress: eventInfo.locationAddress,
                signupUrl: eventInfo.signupUrl,
                price: eventInfo.price,
                isFree: eventInfo.isFree,
                isEvent: eventInfo.isEvent,
                confidence: eventInfo.aiConfidence,
                reasoning: eventInfo.aiReasoning,
                datePatternId: eventInfo.datePatternId,
                timePatternId: eventInfo.timePatternId,
                venuePatternId: eventInfo.venuePatternId,
                pricePatternId: eventInfo.pricePatternId,
                signupUrlPatternId: eventInfo.signupUrlPatternId,
                sources: {
                  eventDate: eventInfo.datePatternId ? 'regex' : (eventInfo.eventDate ? 'ai' : undefined),
                  eventTime: eventInfo.timePatternId ? 'regex' : (eventInfo.eventTime ? 'ai' : undefined),
                  locationName: eventInfo.venuePatternId ? 'regex' : (eventInfo.locationName ? 'ai' : undefined),
                  price: eventInfo.pricePatternId ? 'regex' : (eventInfo.price ? 'ai' : undefined),
                  signupUrl: eventInfo.signupUrlPatternId ? 'regex' : (eventInfo.signupUrl ? 'ai' : undefined),
                },
                conflicts: [],
                overallSource: eventInfo.extractionMethod === 'ai_only' ? 'ai_only' : (eventInfo.extractionMethod || 'both'),
              };

              // Save ground truth for future training
              await saveGroundTruth(postId, item.caption || '', mergedResult, supabase);

              // Train patterns from comparison
              await trainPatternsFromComparison(postId, item.caption || '', mergedResult, supabase);
            } catch (trainErr) {
              console.warn(`Pattern training failed for ${postId}:`, trainErr);
              // Don't fail the whole post insertion if training fails
            }
          }
        } catch (unexpectedError) {
          console.error(`Unexpected error inserting post ${postId}:`, unexpectedError);
          totalFailed++;
          failureReasons['unexpected_error'] = (failureReasons['unexpected_error'] || 0) + 1;
        }
      }

    } else {
      // MODE 2 & 3: Manual or Automated Scraping (deprecated - use GitHub Actions ingest)
      // Return a proper response instead of throwing to prevent marking runs as failed
      return new Response(
        JSON.stringify({
          error: 'Direct Apify scraping mode is deprecated. Use GitHub Actions ingest workflow instead.',
          hint: 'Go to GitHub Actions > Process Instagram Scrape > Run workflow with your Apify dataset URL'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

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

            // Extract image URL early for OCR extraction during parsing
            const postImageUrl = post.displayUrl || post.imageUrl;

            // Parse event information
            let eventInfo;
            try {
              eventInfo = await parseEventFromCaption(
                post.caption || '',
                post.locationName,
                supabase,
                postId,
                {
                  postedAt: post.timestamp,
                  ownerUsername: account.username,
                  instagramAccountId: account.id,
                  imageUrl: postImageUrl || undefined,
                }
              );
            } catch (parseError) {
              const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
              totalSkipped++;
              // Log as rejected post for parse failure
              await logger.logRejectedPost({
                postId,
                reason: 'PARSE_FAILED',
                reasonMessage: `Caption parsing error: ${errorMessage}`,
                captionPreview: post.caption?.substring(0, 200) || null,
              });
              console.log(`Skipping post ${postId} - parse failed: ${errorMessage}`);
              continue;
            }

            // Skip non-events
            if (!eventInfo.isEvent) {
              totalSkipped++;
              continue;
            }

            // Skip events that have ended in direct scraping
            if (eventInfo.eventDate && isEventInPast(eventInfo.eventDate, eventInfo.eventEndDate, eventInfo.eventTime, eventInfo.endTime)) {
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
                const newEventInfo = await parseEventFromCaption(
                  post.caption || '',
                  post.locationName,
                  supabase,
                  postId,
                  {
                    postedAt: post.timestamp,
                    ownerUsername: account.username,
                    instagramAccountId: account.id,
                    imageUrl: postImageUrl || undefined,
                  }
                );

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

            // Extract image URL from Apify data (use postImageUrl defined earlier)
            const finalImageUrl = postImageUrl || post.displayUrl || post.imageUrl;

            // Insert new post
            const { data: insertedPost, error: insertError } = await supabase
              .from('instagram_posts')
              .insert({
                instagram_account_id: account.id,
                post_id: postId,
                caption: post.caption,
                post_url: postUrl,
                image_url: finalImageUrl,
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

    // Stop heartbeat before completing
    stopHeartbeat();
    await logger.close();

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
