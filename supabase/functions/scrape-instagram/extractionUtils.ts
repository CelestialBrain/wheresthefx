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
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { extractWithLearnedPatterns } from './patternFetcher.ts';

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
    /\b(size|sizes|color|colors)\s*[:\/]?\s*\b(s|m|l|xl|small|medium|large)\b/i, // Size variants
  ];

  return strictVendorPatterns.some(pattern => pattern.test(text));
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

// Extract price with learned patterns
export async function extractPrice(
  text: string,
  supabase?: SupabaseClient
): Promise<{ amount: number; currency: string; isFree: boolean; patternId?: string | null } | null> {
  // Try learned patterns first if supabase client provided
  if (supabase) {
    const learned = await extractWithLearnedPatterns(supabase, text, 'price');
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
  if (/\b(free|complimentary|walang\s*bayad|libre|free\s*admission|free\s*entrance)\b/i.test(text)) {
    return { amount: 0, currency: 'PHP', isFree: true };
  }
  
  // Price range pattern (₱299–₱349, PHP 299 to 349, P299-349)
  const rangePattern = /\b(?:₱|PHP|P)\s*(\d{1,3}(?:[,\s]\d{3})*(?:\.\d{2})?)\s*(?:-|–|to|hanggang)\s*(?:₱|PHP|P)?\s*(\d{1,3}(?:[,\s]\d{3})*(?:\.\d{2})?)\s*([kKmM])?\b/i;
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
  const singlePattern = /\b(?:₱|PHP|P)\s*(\d{1,3}(?:[,\s]\d{3})*(?:\.\d{2})?)\s*([kKmM])?\b/i;
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
  
  return null;
}

/**
 * Infer AM/PM from context when time lacks explicit meridiem
 * Uses contextual keywords and reasonable defaults
 */
function inferAMPM(hour: number, text: string): 'AM' | 'PM' | null {
  const lowerText = text.toLowerCase();
  
  // If hour is clearly 24h format (13-23), convert to PM
  if (hour >= 13 && hour <= 23) return 'PM';
  
  // If hour is clearly early morning (0-5), it's AM
  if (hour >= 0 && hour <= 5) return 'AM';
  
  // Context clues for ambiguous hours (6-12)
  const pmKeywords = ['evening', 'night', 'dinner', 'sunset', 'gabi', 'hapunan', 'nightlife', 'concert'];
  const amKeywords = ['morning', 'breakfast', 'brunch', 'umaga', 'almusal', 'sunrise'];
  
  const hasPMContext = pmKeywords.some(kw => lowerText.includes(kw));
  const hasAMContext = amKeywords.some(kw => lowerText.includes(kw));
  
  if (hasPMContext && !hasAMContext) return 'PM';
  if (hasAMContext && !hasPMContext) return 'AM';
  
  // Default assumptions for ambiguous hours without context
  if (hour >= 6 && hour <= 11) return 'PM'; // 6-11 assume evening events
  if (hour === 12) return 'PM'; // 12 assume noon/midnight context
  
  return null; // Unable to infer
}

// Extract time information with learned patterns
export async function extractTime(
  text: string,
  supabase?: SupabaseClient
): Promise<{ startTime: string | null; endTime: string | null; patternId?: string | null }> {
  // Try learned patterns first if supabase client provided
  if (supabase) {
    const learned = await extractWithLearnedPatterns(supabase, text, 'event_time');
    if (learned.value) {
      return { 
        startTime: learned.value, 
        endTime: null,
        patternId: learned.patternId 
      };
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
        if (hour !== 12) hour += 12;
      }
      
      return `${String(hour).padStart(2, '0')}:${minute}:00`;
    });
    
    return {
      startTime: times[0] || null,
      endTime: times[1] || null,
    };
  }
  
  // European 19h30 format
  const europeanPattern = /\b([01]?\d|2[0-3])h([0-5]\d)\b/g;
  const europeanMatches = [...text.matchAll(europeanPattern)];
  
  if (europeanMatches.length > 0) {
    const times = europeanMatches.map(match => 
      `${match[1].padStart(2, '0')}:${match[2]}:00`
    );
    return {
      startTime: times[0] || null,
      endTime: times[1] || null,
    };
  }
  
  // Standard time pattern with optional range
  const timePattern = /\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)?\s*(?:[-–]|to|hanggang)?\s*(\d{1,2})?(?::([0-5]\d))?\s*(am|pm)?\b/gi;
  const matches = [...text.matchAll(timePattern)];
  
  if (matches.length === 0) return { startTime: null, endTime: null };
  
  const convertTo24h = (hour: number, minute: string, meridiem?: string) => {
    let h = hour;
    if (meridiem === 'pm' && h !== 12) h += 12;
    if (meridiem === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${minute || '00'}:00`;
  };
  
  const firstMatch = matches[0];
  const startHour = parseInt(firstMatch[1]);
  const startMin = firstMatch[2] || '00';
  let startMeridiem = firstMatch[3]?.toLowerCase();
  
  const endHour = firstMatch[4] ? parseInt(firstMatch[4]) : null;
  const endMin = firstMatch[5] || '00';
  let endMeridiem = firstMatch[6]?.toLowerCase();
  
  // Propagate meridiem if only end has it
  if (!startMeridiem && endMeridiem) {
    startMeridiem = endMeridiem;
  }
  
  // PHASE 2: Smart AM/PM inference if still missing
  if (!startMeridiem) {
    const inferred = inferAMPM(startHour, text);
    if (inferred) startMeridiem = inferred.toLowerCase();
  }
  if (endHour && !endMeridiem) {
    const inferred = inferAMPM(endHour, text);
    if (inferred) endMeridiem = inferred.toLowerCase();
  }
  
  const startTime = convertTo24h(startHour, startMin, startMeridiem);
  const endTime = endHour ? convertTo24h(endHour, endMin, endMeridiem) : null;
  
  return { startTime, endTime };
}

/**
 * Parse relative dates like "this Friday", "next week", "this weekend"
 * Returns Date object or null if no match
 */
function parseRelativeDate(text: string, referenceDate: Date = new Date()): Date | null {
  const lowerText = text.toLowerCase();
  
  // Get current day of week (0=Sunday, 6=Saturday)
  const currentDay = referenceDate.getDay();
  
  // Days of week patterns
  const dayPatterns: Record<string, number> = {
    'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4,
    'friday': 5, 'saturday': 6, 'sunday': 0
  };
  
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
    const learned = await extractWithLearnedPatterns(supabase, text, 'event_date');
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
function isValidAddress(address: string): boolean {
  if (!address || address.length < 10) return false;
  
  // Must contain street indicators
  const streetIndicators = /\b(street|st|avenue|ave|road|rd|blvd|boulevard|drive|dr|lane|ln|kalye|kanto)\b/i;
  
  // Or barangay/city indicators (Filipino)
  const locationIndicators = /\b(brgy|barangay|city|manila|quezon|makati|taguig|pasig|pasay|mandaluyong)\b/i;
  
  return streetIndicators.test(address) || locationIndicators.test(address);
}

// PHASE 3: Enhanced venue extraction with address validation
export function extractVenue(text: string, locationName?: string | null): { venueName: string | null; address: string | null } {
  // Priority 1: Pin emoji 📍 with venue and optional address
  const pinPattern = /📍\s*([^\n,]+?)(?:,\s*([^\n]+?))?(?=\n|$|[📍🗓️⏰🎟️])/;
  const pinMatch = text.match(pinPattern);
  
  if (pinMatch) {
    const venueName = pinMatch[1].trim();
    const potentialAddress = pinMatch[2]?.trim() || null;
    
    return {
      venueName,
      address: potentialAddress && isValidAddress(potentialAddress) ? potentialAddress : null,
    };
  }
  
  // Priority 2: Explicit "Venue:" or "Location:" prefix
  const venueKeywordPattern = /\b(?:venue|location|lugar|place)\s*[:\-]\s*([^,\n]+?)(?:,\s*([^\n]+?))?(?=\n|$|when|kailan|time|date)/i;
  const venueKeywordMatch = text.match(venueKeywordPattern);
  
  if (venueKeywordMatch) {
    const venueName = venueKeywordMatch[1].trim();
    const potentialAddress = venueKeywordMatch[2]?.trim() || null;
    
    // Avoid capturing timing keywords as venues
    if (!/\b(when|kailan|time|oras|date|petsa|am|pm)\b/i.test(venueName)) {
      return {
        venueName,
        address: potentialAddress && isValidAddress(potentialAddress) ? potentialAddress : null,
      };
    }
  }
  
  // Priority 3: "@" mentions (common for venue tags)
  const mentionPattern = /@([a-zA-Z0-9._]+)/;
  const mentionMatch = text.match(mentionPattern);
  
  if (mentionMatch) {
    const venueName = mentionMatch[1].replace(/_/g, ' ').trim();
    return { venueName, address: null };
  }
  
  // Priority 4: "at" or "sa" (Filipino) patterns
  const atPattern = /\b(?:at|sa)\s+(?![\w.]+\s*$)([A-Z][^\n,@#]{2,40})(?:,\s*([^\n]+))?/;
  const atMatch = text.match(atPattern);
  
  if (atMatch) {
    const venueName = atMatch[1].trim();
    const potentialAddress = atMatch[2]?.trim() || null;
    
    // Make sure it's not an Instagram handle and has space or starts with "The"
    if (venueName.includes(' ') || /^The\s/.test(venueName)) {
      return {
        venueName,
        address: potentialAddress && isValidAddress(potentialAddress) ? potentialAddress : null,
      };
    }
  }
  
  // Fallback to Instagram location tag if available
  if (locationName) {
    return { venueName: locationName, address: null };
  }
  
  return { venueName: null, address: null };
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

// Extract signup URL
export function extractSignupUrl(text: string): string | null {
  // Generic http(s) URLs
  const urlPattern = /https?:\/\/[^\s"'<>)\]]+/g;
  const urls = text.match(urlPattern);
  
  if (!urls) return null;
  
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
        return cleanUrl;
      }
    }
  }
  
  // If no match, check for URLs near signup keywords
  const signupKeywordPattern = /\b(register|signup|sign up|tickets?|reserve|rsvp|book now|get tickets?)\b[^https]*?(https?:\/\/[^\s"'<>)\]]+)/i;
  const keywordMatch = text.match(signupKeywordPattern);
  
  if (keywordMatch) {
    return keywordMatch[2].replace(/[.,!?;]+$/, '');
  }
  
  return urls[0].replace(/[.,!?;]+$/, ''); // Return first URL as fallback
}
