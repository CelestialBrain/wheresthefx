/**
 * Extraction utilities for parsing event information from Instagram captions
 * Supports English, Filipino, and OCR-corrupted text
 * NOW INTEGRATED WITH LEARNED PATTERNS FROM DATABASE
 * 
 * VENDOR DETECTION IMPROVEMENTS (Phase 1):
 * - Split vendor detection into strict (hard reject) and soft (signal) functions
 * - isVendorPostStrict(): Hard rejects obvious vendor posts (booth rentals, price per item, etc.)
 * - isPossiblyVendorPost(): Soft detection for merchant-ish language (sales, promos, shop terms)
 * - isVendorPost(): Maintained as alias to isVendorPostStrict() for backward compatibility
 * 
 * MERCHANT TAGGING (Phase 1):
 * - autoTagPost() enhanced with merchant/promo tags: 'sale', 'shop', 'promotion'
 * - These tags help identify borderline merchant/event posts
 * - Used in conjunction with needsReview flag for conservative classification
 *
 * PHASE 2 IMPROVEMENTS:
 * - Time validation: Robust validation ensuring hours 0-23, minutes 0-59
 * - Location normalization: Strip emojis, sentence fragments, sponsor text
 * - Venue aliasing: Canonicalize venue names before geocoding
 * - isEvent classification: Better detection of markets, pop-ups, fairs with date ranges
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { extractWithLearnedPatterns } from './patternFetcher.ts';
// Type-only import to avoid circular dependencies
import type { PatternUsageLogger } from './patternFetcher.ts';
import type { ScraperLogger } from './logger.ts';

// ============================================================
// TIME VALIDATION UTILITIES
// ============================================================

/**
 * Validates if a time string represents a valid wall-clock time.
 * Returns true if hour is 0-23 and minute is 0-59.
 */
export function isValidTime(timeStr: string | null | undefined): boolean {
  if (!timeStr) return false;
  
  // Handle both HH:MM:SS and HH:MM formats
  const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return false;
  
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const second = match[3] ? parseInt(match[3], 10) : 0;
  
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59;
}

/**
 * Result type for time extraction with validation info
 */
export interface TimeExtractionResult {
  startTime: string | null;
  endTime: string | null;
  timeValidationFailed: boolean;
  rawStartTime?: string | null;
  rawEndTime?: string | null;
  patternId?: string | null;
}

/**
 * Validates extracted times and returns cleaned result.
 * Invalid times (e.g., "34:00:00") are set to null with timeValidationFailed: true
 */
export function validateAndCleanTimes(
  startTime: string | null,
  endTime: string | null,
  patternId?: string | null
): TimeExtractionResult {
  const startValid = isValidTime(startTime);
  const endValid = endTime ? isValidTime(endTime) : true; // null is considered valid (absence is OK)
  
  const timeValidationFailed = (startTime !== null && !startValid) || (endTime !== null && !endValid);
  
  return {
    startTime: startValid ? startTime : null,
    endTime: endValid ? endTime : null,
    timeValidationFailed,
    rawStartTime: timeValidationFailed && startTime ? startTime : undefined,
    rawEndTime: timeValidationFailed && endTime && !endValid ? endTime : undefined,
    patternId,
  };
}

// ============================================================
// LOCATION NORMALIZATION UTILITIES
// ============================================================

/**
 * Strips emojis from a string
 */
export function stripEmojis(text: string): string {
  // Remove emoji-like characters using a broad Unicode range approach
  // This catches most common emojis while avoiding regex complexity issues
  return text
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Miscellaneous Symbols and Pictographs, Emoticons, etc.
    .replace(/[\u{2600}-\u{27BF}]/gu, '')   // Miscellaneous symbols
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')   // Variation selectors
    .replace(/[\u{1FA00}-\u{1FAFF}]/gu, '') // Extended symbols and pictographs
    .replace(/[\u{231A}\u{231B}]/gu, '')    // Watch, hourglass
    .replace(/[\u{23E9}-\u{23FA}]/gu, '')   // Media control symbols
    .replace(/[\u{25AA}-\u{25FE}]/gu, '')   // Geometric shapes
    .trim();
}

/**
 * Normalizes a location name by:
 * - Stripping emojis
 * - Removing trailing punctuation
 * - Handling sentence fragments (text after a period followed by lowercase)
 * - Removing obvious non-location words
 */
export function normalizeLocationName(name: string | null | undefined): string | null {
  if (!name || typeof name !== 'string') return null;
  
  let cleaned = name.trim();
  
  // Strip emojis
  cleaned = stripEmojis(cleaned);
  
  // If string contains a period followed by lowercase letter and more text, 
  // keep only part before the period (e.g., "Jess & Pat's.When a listener" -> "Jess & Pat's")
  const periodSplit = cleaned.match(/^(.+?)\.\s*[a-z]/);
  if (periodSplit && periodSplit[1].length >= 3) {
    cleaned = periodSplit[1].trim();
  }
  
  // Remove trailing punctuation (but keep apostrophes in venue names)
  cleaned = cleaned.replace(/[.,!?;:]+$/, '').trim();
  
  // Remove obvious non-location phrases
  const nonLocationPhrases = [
    /^limited slots available\.?$/i,
    /^slots? available\.?$/i,
    /^available\.?$/i,
    /^limited\.?$/i,
    /^register now\.?$/i,
    /^book now\.?$/i,
    /^join us\.?$/i,
  ];
  
  for (const pattern of nonLocationPhrases) {
    if (pattern.test(cleaned)) {
      return null;
    }
  }
  
  // If result is too short or just punctuation, return null
  if (cleaned.length < 2 || !/[a-zA-Z]/.test(cleaned)) {
    return null;
  }
  
  return cleaned;
}

/**
 * Normalizes a location address by:
 * - Stripping emojis
 * - Removing sponsor text ("Made possible by:", "Powered by")
 * - Removing @handles
 * - Cleaning up excess whitespace
 */
export function normalizeLocationAddress(address: string | null | undefined): string | null {
  if (!address || typeof address !== 'string') return null;
  
  let cleaned = address.trim();
  
  // Strip emojis
  cleaned = stripEmojis(cleaned);
  
  // Remove @handles
  cleaned = cleaned.replace(/@[\w.]+/g, '').trim();
  
  // Remove sponsor text and everything after it
  const sponsorPatterns = [
    /\s*Made possible by:.*$/i,
    /\s*Powered by:?.*$/i,
    /\s*Sponsored by:?.*$/i,
    /\s*Presented by:?.*$/i,
    /\s*In partnership with:?.*$/i,
  ];
  
  for (const pattern of sponsorPatterns) {
    cleaned = cleaned.replace(pattern, '').trim();
  }
  
  // Collapse multiple spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Remove trailing punctuation
  cleaned = cleaned.replace(/[.,!?;:]+$/, '').trim();
  
  // If result is too short, return null
  if (cleaned.length < 3) {
    return null;
  }
  
  return cleaned;
}

/**
 * Comprehensive location name cleaner that removes:
 * - Date patterns (December 6-7, Nov 29, etc.)
 * - Time patterns (11 am, 10:00, etc.)
 * - Hashtags (#event, etc.)
 * - Sponsor text ("Made possible by:", etc.)
 * - Trailing @mentions
 * - Collapses whitespace
 * 
 * Use this when regex extraction produces overly long/messy location names.
 */
export function cleanLocationName(name: string | null | undefined): string | null {
  if (!name || typeof name !== 'string') return null;
  
  let cleaned = name.trim();
  
  // Strip emojis first
  cleaned = stripEmojis(cleaned);
  
  // Remove date patterns (various formats)
  // Full month names: "December 6-7, 2025", "November 29", "Dec 6"
  cleaned = cleaned.replace(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s*\d{1,2}(?:\s*[-–]\s*\d{1,2})?,?\s*\d{0,4}/gi,
    ''
  );
  
  // Numeric date formats: "12/25", "12-25-2025"
  cleaned = cleaned.replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, '');
  
  // Remove time patterns
  // 12-hour format: "11 am", "8:00 pm", "9PM"
  cleaned = cleaned.replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)\b/gi, '');
  // 24-hour format: "15:00", "21:30"
  cleaned = cleaned.replace(/\b(?:[01]?\d|2[0-3]):\d{2}(?::\d{2})?\b/g, '');
  // Time ranges: "10am-6pm", "11 am - 8 pm"
  cleaned = cleaned.replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi, '');
  
  // Remove hashtags
  cleaned = cleaned.replace(/#[\w]+/g, '');
  
  // Remove sponsor text and everything after it
  const sponsorPatterns = [
    /\s*Made possible by:?.*$/i,
    /\s*Powered by:?.*$/i,
    /\s*Sponsored by:?.*$/i,
    /\s*Presented by:?.*$/i,
    /\s*In partnership with:?.*$/i,
    /\s*Brought to you by:?.*$/i,
  ];
  
  for (const pattern of sponsorPatterns) {
    cleaned = cleaned.replace(pattern, '').trim();
  }
  
  // Remove @mentions
  cleaned = cleaned.replace(/@[\w.]+/g, '');
  
  // Remove standalone days of week
  cleaned = cleaned.replace(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi, '');
  
  // Collapse multiple spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Remove trailing punctuation
  cleaned = cleaned.replace(/[.,!?;:\-–]+$/, '').trim();
  
  // Remove leading punctuation
  cleaned = cleaned.replace(/^[.,!?;:\-–]+/, '').trim();
  
  // If result is too short or just punctuation, return null
  if (cleaned.length < 3 || !/[a-zA-Z]/.test(cleaned)) {
    return null;
  }
  
  // Truncate if still too long (>100 chars), stopping at a reasonable word boundary
  if (cleaned.length > 100) {
    const truncated = cleaned.substring(0, 100);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 50) {
      cleaned = truncated.substring(0, lastSpace).trim();
    } else {
      cleaned = truncated.trim();
    }
    // Remove trailing punctuation again after truncation
    cleaned = cleaned.replace(/[.,!?;:\-–]+$/, '').trim();
  }
  
  return cleaned;
}

// ============================================================
// VENUE ALIASING SYSTEM
// ============================================================

/**
 * Venue alias configuration for canonicalizing venue names
 * Key: alias (what might appear in captions)
 * Value: { canonical: normalized name, context?: optional address substring to match }
 */
export const VENUE_ALIASES: Record<string, { canonical: string; context?: string }> = {
  'the victor art installation': { canonical: 'The Victor', context: 'Bridgetowne' },
  'victor art installation': { canonical: 'The Victor', context: 'Bridgetowne' },
  'the victor bridgetowne': { canonical: 'The Victor', context: 'Pasig' },
  // Add more aliases as needed
};

/**
 * Canonicalizes a venue name using the alias configuration.
 * Returns the canonical name if found, otherwise returns the original.
 */
export function canonicalizeVenueName(
  venueName: string | null | undefined,
  address?: string | null
): { canonical: string | null; wasAliased: boolean } {
  if (!venueName) return { canonical: null, wasAliased: false };
  
  const lowerName = venueName.toLowerCase().trim();
  const alias = VENUE_ALIASES[lowerName];
  
  if (alias) {
    // If alias has a context requirement, check the address
    if (alias.context) {
      const lowerAddress = (address || '').toLowerCase();
      if (lowerAddress.includes(alias.context.toLowerCase())) {
        return { canonical: alias.canonical, wasAliased: true };
      }
    } else {
      return { canonical: alias.canonical, wasAliased: true };
    }
  }
  
  return { canonical: venueName, wasAliased: false };
}

// ============================================================
// isEvent CLASSIFICATION HELPERS
// ============================================================

/**
 * Checks if text contains temporal event indicators
 * (date ranges, "coming to", pop-up, market, etc.)
 */
export function hasTemporalEventIndicators(text: string): boolean {
  const lowerText = text.toLowerCase();
  
  // Date range patterns (Nov 29-30, October 28-29, Dec. 5-7)
  const dateRangePatterns = [
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{1,2}\s*[-–]\s*\d{1,2}/i,
    /\b\d{1,2}\s*[-–]\s*\d{1,2}\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i,
  ];
  
  const hasDateRange = dateRangePatterns.some(p => p.test(text));
  
  // Temporal occurrence phrases
  const temporalPhrases = [
    'coming to',
    'coming this',
    'for the first time',
    'first time',
    'this weekend',
    'this saturday',
    'this sunday',
    'this friday',
    'pop-up',
    'pop up',
    'popup',
    'one day only',
    'one night only',
    'limited time',
    'happening on',
    'happening this',
    'see you on',
    'see you this',
    'join us on',
    'join us this',
  ];
  
  const hasTemporalPhrase = temporalPhrases.some(p => lowerText.includes(p));
  
  // Event type keywords that suggest time-bound activity
  const eventTypeKeywords = [
    'market',
    'flea market',
    'fleamarket',
    'bazaar',
    'fair',
    'festival',
    'pop-up',
    'popup',
    'community market',
    'night market',
    'weekend market',
  ];
  
  const hasEventType = eventTypeKeywords.some(k => lowerText.includes(k));
  
  return hasDateRange || (hasTemporalPhrase && hasEventType) || (hasDateRange && hasEventType);
}

// ============================================================
// PRE-NORMALIZE TEXT
// ============================================================

// Pre-normalize text to fix OCR issues and Unicode problems
export function preNormalizeText(text: string): string {
  // Unicode normalize
  let normalized = text.normalize('NFKC');
  
  // Remove zero-width characters
  normalized = normalized.replace(/[\u200B-\u200D\uFEFF]/g, '');
  
  // Collapse weird spaces to single space
  normalized = normalized.replace(/\s+/g, ' ');
  
  // Fix OCR broken AM/PM (common OCR errors: "a m", "p. m.", "a·m")
  normalized = normalized.replace(/a\W*m\.?/gi, 'am');
  normalized = normalized.replace(/p\W*m\.?/gi, 'pm');
  
  // Fix broken URLs from OCR (spaces in https://)
  normalized = normalized.replace(/h\s*t\s*t\s*p\s*s?\s*:\s*\/\s*\//gi, 'https://');
  normalized = normalized.replace(/(\w)\s*\.\s*(\w)/g, '$1.$2'); // Fix "word . com" → "word.com"
  
  // Fix common peso OCR errors
  normalized = normalized.replace(/Ph?P|Php|PHp/gi, 'PHP');
  
  // Fix URL spaces around slashes
  normalized = normalized.replace(/\s*\/\s*/g, '/');
  
  return normalized.trim();
}

// Check if post is DEFINITELY a vendor/merchant listing (hard reject)
// This is a strict filter for obvious non-event vendor posts
// Enhanced with NCR-specific patterns and non-event detection
export function isVendorPostStrict(text: string): boolean {
  const strictVendorPatterns = [
    // Vendor recruitment/applications
    /\b(calling all vendors|vendor applications?|looking for vendors|vendor registration|vendor booth|vendor slots?|vendors? wanted)\b/i,
    /\b(apply as vendor|become a vendor|join as vendor|vendor inquiry)\b/i,
    
    // Direct selling/commerce patterns (strong signals)
    /\b(₱\d+|PHP\d+|P\d+)\s*(each|per|\/pc|\/piece|\/set|\/item)\b/i, // Price per item
    /\b(brand new|unused|sealed|authentic|original|replica)\b/i,
    
    // Vendor logistics (very specific)
    /\b(booth rental|table rental|selling space|market stall|bazaar booth)\b/i,
    /\b(cod|cash on delivery|nationwide shipping)\b/i,
    
    // Sales inquiry patterns (strong signals)
    /\b(dm for price|pm for price|message for price)\b/i,
    /\b(size|sizes|color|colors)\s*[:/]?\s*(?:s|m|l|xl|small|medium|large)\b/i, // Size variants
    
    // NCR-specific vendor patterns
    /\b(tiangge|tiyangge|palengke|palengke selling|ukay-?ukay|ukay selling)\b/i,
    /\b(fb live selling|facebook live|live selling|selling live)\b/i,
    /\b(divisoria|168 mall|168 shopping|baclaran)\s+(seller|merchant|supplier|wholesale)\b/i,
    /\b(pasalubong business|reseller|wholesale price|factory price)\b/i,
    /\b(overrun|surplus|factory reject|reject items)\b/i,
  ];

  return strictVendorPatterns.some(pattern => pattern.test(text));
}

/**
 * Detects posts that are NOT events - venue promos, recaps, calls for applications, etc.
 * These should be rejected even if they have event-like keywords
 */
export function isNotAnEventPost(text: string): boolean {
  const notEventPatterns = [
    // ===== VENUE RENTAL/BOOKING PROMOS =====
    /\b(host your events?|book our (venue|space|cafe|bar))\b/i,
    /\b(private events?|for (private )?bookings?)\b/i,
    /\b(event (venue|space|rental)|inquire about|planning (a|an) (private )?event)\b/i,
    /\b(corporate events?|venue for rent|rent our space)\b/i,
    /\bbook us for your\b/i,
    
    // ===== THANK YOU / RECAP POSTS =====
    /\b(thank you|maraming salamat|merci|gracias)\b.*(@|to our|to the|to everyone)/i,
    /\b(that was|what a night|what a day|until next time)\b/i,
    /\b(see you (again|next|soon)|til next time)\b/i,
    
    // ===== THROWBACK / MEMORIES =====
    /\b(quick look ?back|throwback|recap|highlights?|memories from)\b/i,
    /\b(#tbt|#throwback|#flashback)\b/i,
    /\blast (week|month|year)'?s?\b/i,
    
    // ===== CALL FOR APPLICATIONS (not the event itself) =====
    /\b(calling (all|for)|applications? (are )?open|now accepting)\b/i,
    /\b(apply now|sign[- ]?up to (be|join|become))\b/i,
    /\b(looking for (food|drink|)?\s*merchants?|vendor (slots?|applications?))\b/i,
    /\b(join our team|we'?re hiring|now hiring)\b/i,
    
    // ===== PRODUCT/MENU ANNOUNCEMENTS =====
    /\b(new (on the )?menu|now (available|serving)|try our)\b/i,
    /\b(limited (edition|time) (only)?|seasonal (drink|menu|item))\b/i,
    /\b(introducing our (new)?|check out our (new )?menu)\b/i,
    
    // ===== GENERIC VENUE PROMOS (no specific event) =====
    /\b(visit us|come (check|hang)|drop by anytime)\b/i,
    /\b(see you soon|be in the loop|stay tuned)\b.*!?\s*$/i, // At end of caption
    /\b(follow us|link in bio)\s*$/i, // At end of caption
    
    // ===== OPERATING HOURS ANNOUNCEMENTS =====
    /\bwe('re| are) now open\b/i,
    /\b(open|operating) hours?\b/i,
    /\bnew hours?\b/i,
  ];

  return notEventPatterns.some(pattern => pattern.test(text));
}

// Check if post has merchant/vendor-ish language (soft signal)
// This doesn't hard-reject but indicates the post might be promotional
export function isPossiblyVendorPost(text: string): boolean {
  const softVendorPatterns = [
    // Generic sales/shop language
    /\b(for sale|selling|buy now|purchase|order now|shop now|available now|in stock|pre-?order)\b/i,
    /\b(limited quantity|limited stock|while supplies last|get yours)\b/i,
    
    // Store/collection language
    /\b(new collection|new arrival|now available|shop|store|boutique)\b/i,
    /\b(check out our|visit our|browse our)\b/i,
    
    // Promotional language
    /\b(sale|promo|discount|off|clearance|special offer)\b/i,
    /\b(\d+%\s*off|buy \d+ get \d+)\b/i,
    
    // Softer logistics patterns
    /\b(delivery|shipping|meet-?up|courier)\b/i,
    
    // Inquiry patterns (softer)
    /\b(inquiry|inquire|interested\?|dm us|pm us|message us|whatsapp|viber)\b/i,
    /\b(stocks?|variants?|available colors?)\b/i,
  ];

  return softVendorPatterns.some(pattern => pattern.test(text));
}

// Backward compatibility: keep isVendorPost as alias to strict version
// This maintains existing behavior for current call sites
export function isVendorPost(text: string): boolean {
  return isVendorPostStrict(text);
}

// ============================================================
// RECURRING SCHEDULE DETECTION
// ============================================================

/**
 * Patterns that indicate recurring/repeating schedules (NOT one-time events)
 * These indicate operating hours or weekly recurring activities
 */
const recurringPatterns = [
  // Day range patterns: "Mon-Sat", "Tues to Sun", "Mon — Fri"
  /\b(mon|tues?|wed(nes)?|thurs?|fri|sat(ur)?|sun)(day)?\s*[-–—to]+\s*(mon|tues?|wed(nes)?|thurs?|fri|sat(ur)?|sun)(day)?\b/i,
  // "Every [day]" without specific date: "Every Friday night", "Every weekend"
  /\bevery\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|day|weekend|night)\b/i,
  // Open daily/everyday patterns
  /\bopen\s+(daily|everyday|24\/7)\b/i,
  // Weekly recurring
  /\bweekly\b/i,
  // Operating hours with day range: "6PM — Tues to Sat" (time followed by day range)
  /\b\d{1,2}\s*(am|pm)\s*[-–—]\s*(mon|tues?|wed(nes)?|thurs?|fri|sat(ur)?|sun)(day)?\s*(to|[-–—])\s*(mon|tues?|wed(nes)?|thurs?|fri|sat(ur)?|sun)(day)?\b/i,
];

// Event-type keywords that should NOT be filtered even if they contain recurring patterns
// These indicate actual recurring events (markets, DJ nights) rather than operating hours
const eventTypeKeywords = [
  /\bmarket\b/i,
  /\bflea\s*market\b/i,
  /\bnight\s*market\b/i,
  /\bweekend\s*market\b/i,
  /\b(dj|deejay)\b/i,
  /\bparty\b/i,
  /\bparties\b/i,
  /\bgig\b/i,
  /\bconcert\b/i,
  /\blive\s*(music|band|performance)\b/i,
  /\bshowcase\b/i,
  /\bnight\s*life\b/i,
  /\bsession\b/i,
  /\bweekend\s*(event|series)\b/i,
];

/**
 * Check if text contains an explicit date (not relative)
 * e.g., "Dec 5", "January 10", "12/25", "2025-01-15"
 */
export function hasExplicitDate(text: string): boolean {
  // Month + Day patterns: "Dec 5", "January 10th", "5 December"
  const monthDayPattern = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\s*\.?\s*\d{1,2}(?:st|nd|rd|th)?/i;
  const dayMonthPattern = /\b\d{1,2}(?:st|nd|rd|th)?\s+(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)/i;
  
  // Numeric date patterns with month validation (1-12 for month, 1-31 for day)
  // Matches: "12/25", "12-25-2025", "1/5", but not times like "6:30"
  // Requires the first number to be 1-12 (month) and second to be 1-31 (day)
  const numericDatePattern = /\b(0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])([/-]\d{2,4})?\b/;
  
  // ISO format: "2025-01-15"
  const isoPattern = /\b\d{4}-\d{2}-\d{2}\b/;
  
  return monthDayPattern.test(text) || 
         dayMonthPattern.test(text) || 
         numericDatePattern.test(text) || 
         isoPattern.test(text);
}

/**
 * Detect posts that describe recurring schedules or venue operating hours
 * These are NOT events - they describe regular business operations
 * 
 * Examples:
 * - "6PM — Tues to Sat" → recurring hours, NOT an event
 * - "Every Friday we have live music" → recurring, no specific date
 * - "Open daily 10AM-10PM" → operating hours
 * - "Visit us at our new location" → promo, not event
 * 
 * WHITELISTED EXCEPTIONS:
 * - Weekly markets (flea market, night market) with "Every Saturday" → ALLOWED (these are events)
 * - DJ nights / live music events with "Every Friday" → ALLOWED (these are events)
 * 
 * Returns true if the text looks like recurring schedule/promo (should NOT be classified as event)
 */
export function isRecurringSchedulePost(text: string): boolean {
  // Check for recurring patterns
  const hasRecurringPattern = recurringPatterns.some(p => p.test(text));
  
  // If no recurring pattern found, it's not a recurring schedule post
  if (!hasRecurringPattern) {
    return false;
  }
  
  // Check if there's also a specific date mentioned
  // If there IS a specific date, this might be a one-time event despite recurring language
  const hasSpecificDate = hasExplicitDate(text);
  
  // Check for event-type keywords (markets, DJ nights, etc.)
  // These are actual events even if they recur weekly
  const hasEventTypeKeyword = eventTypeKeywords.some(p => p.test(text));
  
  // It's a recurring schedule post if:
  // - Has recurring patterns (e.g., "Tues to Sat", "Every Friday")
  // - AND does NOT have a specific date (e.g., "Dec 5", "January 10")
  // - AND does NOT have event-type keywords (markets, DJ nights, etc.)
  return hasRecurringPattern && !hasSpecificDate && !hasEventTypeKeyword;
}

/**
 * Creates a PatternUsageLogger that logs to a ScraperLogger.
 * Used to hook learned-pattern activity into the scraper_logs table.
 */
function createPatternUsageLogger(logger: ScraperLogger): PatternUsageLogger {
  return {
    onPatternSuccess(
      patternId: string,
      patternType: string,
      extractedValue: string,
      patternDescription?: string | null
    ): void {
      // Log pattern match success at debug level
      logger.debug('extraction', `Learned pattern matched for ${patternType}`, {
        patternId,
        patternType,
        extractedValue: extractedValue.substring(0, 50),
        patternDescription,
      });
    },
    onPatternFailure(
      patternId: string,
      patternType: string,
      patternDescription?: string | null
    ): void {
      // Log pattern miss at debug level
      logger.debug('extraction', `Learned pattern miss for ${patternType}`, {
        patternId,
        patternType,
        patternDescription,
      });
    },
  };
}

// Extract price with learned patterns
export async function extractPrice(
  text: string,
  supabase?: SupabaseClient,
  logger?: ScraperLogger
): Promise<{ amount: number; currency: string; isFree: boolean; patternId?: string | null } | null> {
  // Try learned patterns first if supabase client provided
  if (supabase) {
    // Create usage logger if ScraperLogger is provided
    const usageLogger = logger ? createPatternUsageLogger(logger) : undefined;
    const learned = await extractWithLearnedPatterns(supabase, text, 'price', usageLogger);
    if (learned.value) {
      const amount = parseFloat(learned.value.replace(/[^0-9.]/g, ''));
      if (!isNaN(amount)) {
        return {
          amount,
          currency: 'PHP',
          isFree: false,
          patternId: learned.patternId
        };
      }
    }
  }
  
  // Fall back to hardcoded patterns
  // Check for free keywords first (English + Filipino)
  if (/\b(free|complimentary|walang\s*bayad|libre|free\s*admission|free\s*entrance|no\s*cover)\b/i.test(text)) {
    return { amount: 0, currency: 'PHP', isFree: true };
  }
  
  // Check for presale/door pricing - extract presale (lower) price
  // "₱300 presale / ₱500 door" or "₱300 advance / ₱500 at door"
  const presalePattern = /\b(?:₱|PHP|Php|P)\s*(\d{1,3}(?:[,\s]\d{3})*)\s*(?:presale|advance|early\s*bird)/i;
  const presaleMatch = text.match(presalePattern);
  if (presaleMatch) {
    const amount = parseFloat(presaleMatch[1].replace(/[,\s]/g, ''));
    if (amount >= 0 && amount <= 1000000) {
      return { amount, currency: 'PHP', isFree: false };
    }
  }
  
  // Filipino slang multipliers
  const HUNDO_MULTIPLIER = 100;  // "5 hundo" = 500
  const LIBO_AMOUNT = 1000;      // "isang libo" = 1000
  
  // Filipino slang: "5 hundo" = 500
  const hundoMatch = text.match(/\b(\d+)\s*hundo\b/i);
  if (hundoMatch) {
    const amount = parseInt(hundoMatch[1]) * HUNDO_MULTIPLIER;
    if (amount >= 0 && amount <= 1000000) {
      return { amount, currency: 'PHP', isFree: false };
    }
  }
  
  // Filipino slang: "isang libo" = 1000
  if (/\bisang\s*libo\b/i.test(text)) {
    return { amount: LIBO_AMOUNT, currency: 'PHP', isFree: false };
  }
  
  // Price range pattern (₱299–₱349, PHP 299 to 349, P299-349)
  const rangePattern = /\b(?:₱|PHP|Php|P)\s*(\d{1,3}(?:[,\s]\d{3})*(?:\.\d{2})?)\s*(?:-|–|to|hanggang)\s*(?:₱|PHP|Php|P)?\s*(\d{1,3}(?:[,\s]\d{3})*(?:\.\d{2})?)\s*([kKmM])?\b/i;
  const rangeMatch = text.match(rangePattern);
  
  if (rangeMatch) {
    let min = parseFloat(rangeMatch[1].replace(/[,\s]/g, ''));
    const suf = rangeMatch[3];
    if (suf === 'k' || suf === 'K') min *= 1000;
    if (suf === 'm' || suf === 'M') min *= 1000000;
    
    if (min >= 0 && min <= 1000000) {
      return { amount: min, currency: 'PHP', isFree: false };
    }
  }
  
  // Single price pattern with k/m suffix
  // Extended to match: "₱500", "P500", "Php500", "PHP 500", "500 pesos", "500php"
  const singlePattern = /\b(?:₱|PHP|Php|P)\s*(\d{1,3}(?:[,\s]\d{3})*(?:\.\d{2})?)\s*([kKmM])?\b/i;
  const singleMatch = text.match(singlePattern);
  
  if (singleMatch) {
    let amount = parseFloat(singleMatch[1].replace(/[,\s]/g, ''));
    const suf = singleMatch[2];
    if (suf === 'k' || suf === 'K') amount *= 1000;
    if (suf === 'm' || suf === 'M') amount *= 1000000;
    
    // Sanity check
    if (amount >= 0 && amount <= 1000000) {
      return { amount, currency: 'PHP', isFree: false };
    }
  }
  
  // Pattern for "500 pesos" or "500php"
  const pesosPattern = /\b(\d{1,3}(?:[,\s]\d{3})*)\s*(?:pesos?|php)\b/i;
  const pesosMatch = text.match(pesosPattern);
  if (pesosMatch) {
    const amount = parseFloat(pesosMatch[1].replace(/[,\s]/g, ''));
    if (amount >= 0 && amount <= 1000000) {
      return { amount, currency: 'PHP', isFree: false };
    }
  }
  
  return null;
}

/**
 * Infer AM/PM from context when time lacks explicit meridiem
 * Uses contextual keywords, event types, and reasonable defaults
 * Enhanced with Filipino context and event-type based inference
 */
function inferAMPM(hour: number, text: string): 'AM' | 'PM' | null {
  const lowerText = text.toLowerCase();
  
  // If hour is clearly 24h format (13-23), convert to PM
  if (hour >= 13 && hour <= 23) return 'PM';
  
  // CRITICAL FIX: After-hours context detection for late-night times (1-5)
  // Check for after-party, late-night contexts that indicate early morning hours
  const afterHoursPattern = /after.?party|late.?night|after.?hours|dawn|sunrise.?set|madaling.?araw/i;
  if (afterHoursPattern.test(text) && hour >= 1 && hour <= 5) {
    return 'AM'; // Times 1-5 in after-hours contexts are early morning, not afternoon
  }
  
  // If hour is clearly early morning (0-5), it's AM
  if (hour >= 0 && hour <= 5) return 'AM';
  
  // Enhanced PM keywords (evening/night activities, Filipino terms)
  const pmKeywords = [
    'evening', 'night', 'dinner', 'sunset', 'gabi', 'hapunan', 'nightlife', 'concert',
    'party', 'club', 'bar', 'drinks', 'inuman', 'tagay', 'late night', 'after dark',
    'midnight', 'rave', 'dj set', 'live music', 'gig', 'happy hour', 'hapon'
  ];
  
  // Enhanced AM keywords (morning/daytime activities, Filipino terms)
  const amKeywords = [
    'morning', 'breakfast', 'brunch', 'umaga', 'almusal', 'sunrise',
    'misa', 'mass', 'church', 'sunday service', 'yoga', 'run', 'marathon',
    'farmers market', 'early bird', 'wake up', 'coffee', 'kape', 'madaling araw'
  ];
  
  // Event type based inference
  const eveningEventTypes = ['concert', 'party', 'club', 'bar', 'nightlife', 'rave', 'gig'];
  const morningEventTypes = ['yoga', 'run', 'marathon', 'mass', 'breakfast', 'brunch', 'market'];
  
  const hasPMContext = pmKeywords.some(kw => lowerText.includes(kw));
  const hasAMContext = amKeywords.some(kw => lowerText.includes(kw));
  const hasEveningEvent = eveningEventTypes.some(et => lowerText.includes(et));
  const hasMorningEvent = morningEventTypes.some(et => lowerText.includes(et));
  
  // Strong PM signal from context or event type
  if ((hasPMContext || hasEveningEvent) && !hasAMContext) return 'PM';
  
  // Strong AM signal from context or event type
  if ((hasAMContext || hasMorningEvent) && !hasPMContext) return 'AM';
  
  // Special case: 12 noon vs 12 midnight
  if (hour === 12) {
    // Check for noon indicators (tanghali = noon in Filipino)
    const noonKeywords = ['noon', 'tanghali', 'lunch', 'tanghalian'];
    // hatinggabi = midnight in Filipino
    const midnightKeywords = ['midnight', 'hatinggabi', 'late night', 'madaling araw'];
    
    if (noonKeywords.some(kw => lowerText.includes(kw))) return 'PM';
    if (midnightKeywords.some(kw => lowerText.includes(kw))) return 'AM';
    
    // Default 12 to PM (noon is more common for events)
    return 'PM';
  }
  
  // Default assumptions for ambiguous hours without clear context
  if (hour >= 6 && hour <= 11) return 'PM'; // 6-11 assume evening events
  
  return null; // Unable to infer
}

// Extract time information with learned patterns
// Returns validated times - invalid times (hour > 23 or minute > 59) are set to null
export async function extractTime(
  text: string,
  supabase?: SupabaseClient,
  logger?: ScraperLogger
): Promise<TimeExtractionResult> {
  // Try learned patterns first if supabase client provided
  if (supabase) {
    // Create usage logger if ScraperLogger is provided
    const usageLogger = logger ? createPatternUsageLogger(logger) : undefined;
    // NOTE: Database stores patterns as 'time', not 'event_time'
    const learned = await extractWithLearnedPatterns(supabase, text, 'time', usageLogger);
    if (learned.value) {
      // Validate the learned pattern result
      return validateAndCleanTimes(learned.value, null, learned.patternId);
    }
  }
  
  // Fall back to hardcoded patterns
  // Filipino "alas-7 ng gabi" pattern
  const filipinoPattern = /alas[-\s]?(\d{1,2})(?::(\d{2}))?\s*(?:ng\s*)?(umaga|tanghali|hapon|gabi)?/gi;
  const filipinoMatches = [...text.matchAll(filipinoPattern)];
  
  if (filipinoMatches.length > 0) {
    const times = filipinoMatches.map(match => {
      let hour = parseInt(match[1]);
      const minute = match[2] || '00';
      const period = match[3]?.toLowerCase();
      
      // Convert to 24h based on Filipino time period
      if (period === 'umaga') { // Morning (AM)
        if (hour === 12) hour = 0;
      } else if (period === 'tanghali') { // Noon
        hour = 12;
      } else if (period === 'hapon' || period === 'gabi') { // Afternoon/Evening (PM)
        if (hour < 12) hour += 12;
      }
      
      return `${String(hour).padStart(2, '0')}:${minute}:00`;
    });
    
    return validateAndCleanTimes(times[0] || null, times[1] || null);
  }
  
  // European 19h30 format
  const europeanPattern = /\b([01]?\d|2[0-3])h([0-5]\d)\b/g;
  const europeanMatches = [...text.matchAll(europeanPattern)];
  
  if (europeanMatches.length > 0) {
    const times = europeanMatches.map(match => 
      `${match[1].padStart(2, '0')}:${match[2]}:00`
    );
    return validateAndCleanTimes(times[0] || null, times[1] || null);
  }
  
  // Standard time pattern with optional range
  // Enhanced: Requires colon OR am/pm, and negative lookbehind for currency
  const timePattern = /(?<!₱|PHP|P\s?)(\d{1,2}):([0-5]\d)\s*(am|pm)?|(?<!\d)(\d{1,2})\s*(am|pm)\b/gi;
  const matches = [...text.matchAll(timePattern)];
  
  if (matches.length === 0) {
    return { startTime: null, endTime: null, timeValidationFailed: false };
  }
  
  const convertTo24h = (hour: number, minute: string, meridiem?: string): string | null => {
    // PRE-VALIDATION: Reject invalid hours immediately
    if (hour < 0 || hour > 23) {
      return null;
    }
    
    let h = hour;
    // Only convert if hour is in valid 12-hour range
    if (meridiem === 'pm' && h < 12) h += 12;
    if (meridiem === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${minute || '00'}:00`;
  };
  
  const firstMatch = matches[0];
  // Handle two match groups: (hour:minute am/pm) OR (hour am/pm)
  const startHour = parseInt(firstMatch[1] || firstMatch[4]);
  const startMin = firstMatch[2] || '00';
  let startMeridiem = (firstMatch[3] || firstMatch[5])?.toLowerCase();
  
  // Check if we need to look for a range (second time in remaining matches)
  let endHour: number | null = null;
  let endMin = '00';
  let endMeridiem: string | undefined;
  
  // Look for time range pattern "7pm-9pm" or "7-9pm"
  if (matches.length > 1) {
    const secondMatch = matches[1];
    endHour = parseInt(secondMatch[1] || secondMatch[4]);
    endMin = secondMatch[2] || '00';
    endMeridiem = (secondMatch[3] || secondMatch[5])?.toLowerCase();
  }
  
  // Propagate meridiem if only end has it
  if (!startMeridiem && endMeridiem) {
    startMeridiem = endMeridiem;
  }
  
  // PHASE 2: Smart AM/PM inference if still missing
  // Only infer if the hour is in valid 12-hour range
  if (!startMeridiem && startHour <= 12) {
    const inferred = inferAMPM(startHour, text);
    if (inferred) startMeridiem = inferred.toLowerCase();
  }
  if (endHour && !endMeridiem && endHour <= 12) {
    const inferred = inferAMPM(endHour, text);
    if (inferred) endMeridiem = inferred.toLowerCase();
  }
  
  // Convert with pre-validation
  const startTime = convertTo24h(startHour, startMin, startMeridiem);
  const endTime = endHour ? convertTo24h(endHour, endMin, endMeridiem) : null;
  
  // If conversion failed (returned null), mark as validation failure
  if (startTime === null && startHour !== null) {
    return { 
      startTime: null, 
      endTime: null, 
      timeValidationFailed: true,
      rawStartTime: `${startHour}:${startMin}:00`
    };
  }
  
  // Validate and return cleaned times
  return validateAndCleanTimes(startTime, endTime);
}

/**
 * Parse relative dates like "this Friday", "next week", "this weekend"
 * Returns Date object or null if no match
 */
function parseRelativeDate(text: string, referenceDate: Date = new Date()): Date | null {
  const lowerText = text.toLowerCase();
  
  // Get current day of week (0=Sunday, 6=Saturday)
  const currentDay = referenceDate.getDay();
  
  // Days of week patterns (English + Filipino)
  const dayPatterns: Record<string, number> = {
    'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4,
    'friday': 5, 'saturday': 6, 'sunday': 0,
    // Filipino days
    'lunes': 1, 'martes': 2, 'miyerkules': 3, 'huwebes': 4,
    'biyernes': 5, 'sabado': 6, 'linggo': 0
  };
  
  // Filipino relative date words
  // "bukas" = tomorrow, "mamaya" = later today, "ngayon" = today
  if (/\bbukas\b/i.test(lowerText)) {
    return new Date(referenceDate.getTime() + 86400000); // tomorrow
  }
  if (/\b(mamaya|ngayon)\b/i.test(lowerText)) {
    return referenceDate; // today
  }
  
  // "tonight", "today" = today
  if (/\b(tonight|today)\b/i.test(lowerText)) {
    return referenceDate;
  }
  
  // "tomorrow" = tomorrow
  if (/\btomorrow\b/i.test(lowerText)) {
    return new Date(referenceDate.getTime() + 86400000);
  }
  
  // "this [day]" - next occurrence of that day this week
  for (const [dayName, dayNum] of Object.entries(dayPatterns)) {
    const thisPattern = new RegExp(`\\bthis\\s+${dayName}\\b`, 'i');
    if (thisPattern.test(lowerText)) {
      const daysUntil = (dayNum - currentDay + 7) % 7 || 7;
      return new Date(referenceDate.getTime() + daysUntil * 86400000);
    }
  }
  
  // "next [day]" - same day next week
  for (const [dayName, dayNum] of Object.entries(dayPatterns)) {
    const nextPattern = new RegExp(`\\bnext\\s+${dayName}\\b`, 'i');
    if (nextPattern.test(lowerText)) {
      const daysUntil = ((dayNum - currentDay + 7) % 7) + 7;
      return new Date(referenceDate.getTime() + daysUntil * 86400000);
    }
  }
  
  // "this weekend" (assume Saturday)
  if (lowerText.match(/\bthis\s+weekend\b/)) {
    const daysUntilSaturday = (6 - currentDay + 7) % 7 || 7;
    return new Date(referenceDate.getTime() + daysUntilSaturday * 86400000);
  }
  
  // "next week" (assume Monday next week)
  if (lowerText.match(/\bnext\s+week\b/)) {
    const daysUntilNextMonday = (8 - currentDay) % 7 + 7;
    return new Date(referenceDate.getTime() + daysUntilNextMonday * 86400000);
  }
  
  return null;
}

// Extract date information with learned patterns
export async function extractDate(
  text: string,
  supabase?: SupabaseClient
): Promise<{ eventDate: string | null; eventEndDate: string | null; patternId?: string | null }> {
  // Try learned patterns first if supabase client provided
  if (supabase) {
    // NOTE: Database stores patterns as 'date', not 'event_date'
    const learned = await extractWithLearnedPatterns(supabase, text, 'date');
    if (learned.value) {
      return {
        eventDate: learned.value,
        eventEndDate: null,
        patternId: learned.patternId
      };
    }
  }
  
  // PHASE 2: Try relative date parsing first (highest priority)
  const relativeDate = parseRelativeDate(text);
  if (relativeDate) {
    return {
      eventDate: relativeDate.toISOString().split('T')[0],
      eventEndDate: null,
      patternId: null,
    };
  }
  
  // Fall back to hardcoded patterns
  const filipinoMonths: Record<string, number> = {
    'enero': 1, 'pebrero': 2, 'marso': 3, 'abril': 4,
    'mayo': 5, 'hunyo': 6, 'hulyo': 7, 'agosto': 8,
    'setyembre': 9, 'oktubre': 10, 'nobyembre': 11, 'disyembre': 12
  };
  
  const englishMonths: Record<string, number> = {
    'jan': 1, 'january': 1, 'feb': 2, 'february': 2, 'mar': 3, 'march': 3,
    'apr': 4, 'april': 4, 'may': 5, 'jun': 6, 'june': 6,
    'jul': 7, 'july': 7, 'aug': 8, 'august': 8, 'sep': 9, 'sept': 9, 'september': 9,
    'oct': 10, 'october': 10, 'nov': 11, 'november': 11, 'dec': 12, 'december': 12
  };
  
  const allMonths = { ...englishMonths, ...filipinoMonths };
  
  // Date range: "Dec 25-27" or "December 25 to 27" or "Dec 25 hanggang 27"
  const rangePattern = new RegExp(
    `\\b(${Object.keys(allMonths).join('|')})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:[-–]|to|hanggang)\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`,
    'i'
  );
  const rangeMatch = text.match(rangePattern);
  
  if (rangeMatch) {
    const month = allMonths[rangeMatch[1].toLowerCase()];
    const startDay = parseInt(rangeMatch[2]);
    const endDay = parseInt(rangeMatch[3]);
    const year = rangeMatch[4] ? parseInt(rangeMatch[4]) : new Date().getFullYear();
    
    const eventDate = `${year}-${String(month).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
    const eventEndDate = `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
    
    return { eventDate, eventEndDate };
  }
  
  // Filipino ordinal: "ika-5 ng Mayo, 2025"
  const filipinoOrdinalPattern = new RegExp(
    `ika-?\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:ng\\s+)?(${Object.keys(filipinoMonths).join('|')})\\s*,?\\s*(\\d{4})?`,
    'i'
  );
  const filipinoMatch = text.match(filipinoOrdinalPattern);
  
  if (filipinoMatch) {
    const day = parseInt(filipinoMatch[1]);
    const month = filipinoMonths[filipinoMatch[2].toLowerCase()];
    const year = filipinoMatch[3] ? parseInt(filipinoMatch[3]) : new Date().getFullYear();
    
    const eventDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { eventDate, eventEndDate: null };
  }
  
  // Standard month + day: "January 5" or "5 January"
  const monthDayPattern = new RegExp(
    `\\b(?:(\\d{1,2})(?:st|nd|rd|th)?\\s+(${Object.keys(allMonths).join('|')})|(${Object.keys(allMonths).join('|')})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?)(?:,?\\s*(\\d{4}))?\\b`,
    'gi'
  );
  const monthDayMatches = [...text.matchAll(monthDayPattern)];
  
  if (monthDayMatches.length > 0) {
    const dates = monthDayMatches.map(match => {
      const day = parseInt(match[1] || match[4]);
      const monthStr = (match[2] || match[3]).toLowerCase();
      const month = allMonths[monthStr];
      const year = match[5] ? parseInt(match[5]) : new Date().getFullYear();
      
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    });
    
    return {
      eventDate: dates[0],
      eventEndDate: dates[1] || null,
    };
  }
  
  // ISO format: 2025-01-05
  const isoPattern = /\b(\d{4})-(\d{2})-(\d{2})\b/;
  const isoMatch = text.match(isoPattern);
  
  if (isoMatch) {
    return { eventDate: isoMatch[0], eventEndDate: null };
  }
  
  return { eventDate: null, eventEndDate: null };
}

/**
 * Validate if a string looks like a real street address
 */
export function isValidAddress(address: string): boolean {
  if (!address || address.length < 10) return false;
  
  // Must contain street indicators
  const streetIndicators = /\b(street|st|avenue|ave|road|rd|blvd|boulevard|drive|dr|lane|ln|kalye|kanto)\b/i;
  
  // Or barangay/city indicators (Filipino)
  const locationIndicators = /\b(brgy|barangay|city|manila|quezon|makati|taguig|pasig|pasay|mandaluyong)\b/i;
  
  return streetIndicators.test(address) || locationIndicators.test(address);
}

// PHASE 3: Enhanced venue extraction with address validation, learned patterns, and normalization
export async function extractVenue(
  text: string,
  locationName?: string | null,
  supabase?: SupabaseClient
): Promise<{ 
  venueName: string | null; 
  address: string | null; 
  rawLocationName?: string | null;
  canonicalVenueName?: string | null;
  patternId?: string | null 
}> {
  // Try learned patterns first if supabase client provided
  if (supabase) {
    const learned = await extractWithLearnedPatterns(supabase, text, 'venue');
    if (learned.value) {
      const normalized = normalizeLocationName(learned.value);
      const { canonical, wasAliased } = canonicalizeVenueName(normalized);
      return {
        venueName: normalized,
        address: null,
        rawLocationName: wasAliased ? learned.value : undefined,
        canonicalVenueName: wasAliased ? canonical : undefined,
        patternId: learned.patternId
      };
    }
  }

  // Fall back to hardcoded patterns
  // Priority 1: Pin emoji 📍 with venue and optional address
  // Using Unicode escape for emojis to avoid regex linting issues
  const pinPattern = /\u{1F4CD}\s*([^\n,]+?)(?:,\s*([^\n]+?))?(?=\n|$)/u;
  const pinMatch = text.match(pinPattern);
  
  if (pinMatch) {
    const rawVenueName = pinMatch[1].trim();
    const rawAddress = pinMatch[2]?.trim() || null;
    
    // Normalize venue name and address
    const venueName = normalizeLocationName(rawVenueName);
    const address = normalizeLocationAddress(rawAddress);
    
    // Apply venue aliasing
    const { canonical, wasAliased } = canonicalizeVenueName(venueName, address);
    
    return {
      venueName,
      address: address && isValidAddress(address) ? address : null,
      rawLocationName: wasAliased ? rawVenueName : undefined,
      canonicalVenueName: wasAliased ? canonical : undefined,
      patternId: null,
    };
  }
  
  // Priority 2: Explicit "Venue:" or "Location:" prefix
  const venueKeywordPattern = /\b(?:venue|location|lugar|place)\s*[:|\\-]\s*([^,\n]+?)(?:,\s*([^\n]+?))?(?=\n|$|when|kailan|time|date)/i;
  const venueKeywordMatch = text.match(venueKeywordPattern);
  
  if (venueKeywordMatch) {
    const rawVenueName = venueKeywordMatch[1].trim();
    const rawAddress = venueKeywordMatch[2]?.trim() || null;
    
    // Normalize venue name
    const venueName = normalizeLocationName(rawVenueName);
    const address = normalizeLocationAddress(rawAddress);
    
    // Avoid capturing timing keywords as venues
    if (venueName && !/\b(when|kailan|time|oras|date|petsa|am|pm)\b/i.test(venueName)) {
      const { canonical, wasAliased } = canonicalizeVenueName(venueName, address);
      return {
        venueName,
        address: address && isValidAddress(address) ? address : null,
        rawLocationName: wasAliased ? rawVenueName : undefined,
        canonicalVenueName: wasAliased ? canonical : undefined,
        patternId: null,
      };
    }
  }
  
  // Priority 3: "at" or "sa" (Filipino) patterns
  // NOTE: Removed @ mention pattern - it caused false positives matching @photographer_credits etc.
  // The 📍 emoji pattern and AI extraction handle venue detection accurately
  const atPattern = /\b(?:at|sa)\s+(?![\w.]+\s*$)([A-Z][^\n,@#]{2,40})(?:,\s*([^\n]+))?/;
  const atMatch = text.match(atPattern);
  
  if (atMatch) {
    const rawVenueName = atMatch[1].trim();
    const rawAddress = atMatch[2]?.trim() || null;
    
    const venueName = normalizeLocationName(rawVenueName);
    const address = normalizeLocationAddress(rawAddress);
    
    // Make sure it's not an Instagram handle and has space or starts with "The"
    if (venueName && (venueName.includes(' ') || /^The\s/.test(venueName))) {
      const { canonical, wasAliased } = canonicalizeVenueName(venueName, address);
      return {
        venueName,
        address: address && isValidAddress(address) ? address : null,
        rawLocationName: wasAliased ? rawVenueName : undefined,
        canonicalVenueName: wasAliased ? canonical : undefined,
        patternId: null,
      };
    }
  }
  
  // Fallback to Instagram location tag if available
  if (locationName) {
    const venueName = normalizeLocationName(locationName);
    const { canonical, wasAliased } = canonicalizeVenueName(venueName);
    return { 
      venueName, 
      address: null, 
      rawLocationName: wasAliased ? locationName : undefined,
      canonicalVenueName: wasAliased ? canonical : undefined,
      patternId: null 
    };
  }
  
  return { venueName: null, address: null, patternId: null };
}

/**
 * PHASE 1: Auto-tagging system for better filtering
 * Generates tags based on caption, OCR text, and extracted entities
 */
export function autoTagPost(
  caption: string,
  ocrText: string,
  entities: {
    price?: number | null;
    isFree?: boolean;
    eventDate?: string | null;
    eventTime?: string | null;
  }
): string[] {
  const tags: string[] = [];
  const combinedText = `${caption} ${ocrText}`.toLowerCase();
  
  // Music & Performance
  if (/\b(concert|music|band|dj|live|performance|gig|acoustic)\b/i.test(combinedText)) {
    tags.push('music');
  }
  
  // Food & Dining
  if (/\b(food|dinner|brunch|breakfast|restaurant|cafe|culinary|chef|tasting)\b/i.test(combinedText)) {
    tags.push('food');
  }
  
  // Nightlife & Party
  if (/\b(party|club|nightlife|rave|bar|drinks|dancing)\b/i.test(combinedText)) {
    tags.push('nightlife');
  }
  
  // Art & Culture
  if (/\b(art|gallery|exhibit|museum|cultural|theater|theatre|performance|workshop)\b/i.test(combinedText)) {
    tags.push('arts');
  }
  
  // Outdoor & Nature
  if (/\b(outdoor|beach|hiking|nature|park|camping|adventure)\b/i.test(combinedText)) {
    tags.push('outdoor');
  }
  
  // Sports & Fitness
  if (/\b(sports?|fitness|yoga|running|marathon|workout|gym|athletic)\b/i.test(combinedText)) {
    tags.push('sports');
  }
  
  // Market & Shopping
  if (/\b(market|bazaar|thrift|shopping|pop-?up|makers?)\b/i.test(combinedText)) {
    tags.push('market');
  }
  
  // Community & Networking
  if (/\b(community|networking|meetup|social|gathering)\b/i.test(combinedText)) {
    tags.push('community');
  }
  
  // Merchant/Promotional content tags (new)
  // Note: 'sale' tag is separate from 'market' to distinguish merchant sales from market events
  if (/\b(sale|promo|discount|clearance|\d+%\s*off|special offer|limited offer)\b/i.test(combinedText)) {
    tags.push('sale');
  }
  
  if (/\b(shop|store|boutique|buy now|purchase|order now|available now|new collection|new arrival)\b/i.test(combinedText)) {
    tags.push('shop');
  }
  
  if (/\b(for sale|selling|vendor|merchant|delivery|shipping|cod)\b/i.test(combinedText)) {
    tags.push('promotion');
  }
  
  // Price-based tags
  if (entities.isFree) {
    tags.push('free');
  } else if (entities.price && entities.price > 0) {
    tags.push('paid');
  }
  
  // Time-based tags (weekend/weekday)
  if (entities.eventDate) {
    const date = new Date(entities.eventDate);
    const dayOfWeek = date.getDay();
    
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      tags.push('weekend');
    } else {
      tags.push('weekday');
    }
    
    // Evening events (after 6pm)
    if (entities.eventTime) {
      const hour = parseInt(entities.eventTime.split(':')[0]);
      if (hour >= 18 || hour <= 2) {
        tags.push('evening');
      }
    }
  }
  
  return [...new Set(tags)]; // Remove duplicates
}

// Extract signup URL with learned patterns
export async function extractSignupUrl(
  text: string,
  supabase?: SupabaseClient
): Promise<{ url: string | null; patternId?: string | null }> {
  // Try learned patterns first if supabase client provided
  if (supabase) {
    const learned = await extractWithLearnedPatterns(supabase, text, 'signup_url');
    if (learned.value) {
      return {
        url: learned.value.replace(/[.,!?;]+$/, ''), // Clean trailing punctuation
        patternId: learned.patternId
      };
    }
  }
  
  // Fall back to hardcoded patterns
  // Generic http(s) URLs
  const urlPattern = /https?:\/\/[^\s"'<>)\]]+/g;
  const urls = text.match(urlPattern);
  
  if (!urls) return { url: null, patternId: null };
  
  // Domain allow-list for signup/ticketing services
  const signupDomains = [
    'eventbrite.com', 'forms.gle', 'docs.google.com/forms',
    'bit.ly', 't.ly', 'tinyurl.com',
    'ticketmelon.com', 'ticket2me.net', 'smtickets.com',
    'ticketnet.com.ph', 'klook.com', 'zoom.us', 'meetup.com',
    'linktr.ee', 'beacons.ai', 'carrd.co'
  ];
  
  // Check if URL domain matches allow-list
  for (const url of urls) {
    const cleanUrl = url.replace(/[.,!?;]+$/, ''); // Remove trailing punctuation
    
    for (const domain of signupDomains) {
      if (cleanUrl.includes(domain)) {
        return { url: cleanUrl, patternId: null };
      }
    }
  }
  
  // If no match, check for URLs near signup keywords
  const signupKeywordPattern = /\b(register|signup|sign up|tickets?|reserve|rsvp|book now|get tickets?)\b[^https]*?(https?:\/\/[^\s"'<>)\]]+)/i;
  const keywordMatch = text.match(signupKeywordPattern);
  
  if (keywordMatch) {
    return { url: keywordMatch[2].replace(/[.,!?;]+$/, ''), patternId: null };
  }
  
  return { url: urls[0].replace(/[.,!?;]+$/, ''), patternId: null }; // Return first URL as fallback
}
