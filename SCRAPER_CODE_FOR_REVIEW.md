# Instagram Scraper Parser Code - For ChatGPT Review

This document contains the complete Instagram scraper parsing logic for external review.

## File 1: extractionUtils.ts

Contains all extraction utility functions for parsing event information from Instagram captions.

```typescript
/**
 * Extraction utilities for parsing event information from Instagram captions
 * Supports English, Filipino, and OCR-corrupted text
 */

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

// Check if post is a vendor/merchant listing (not an event)
export function isVendorPost(text: string): boolean {
  // AGGRESSIVE vendor detection - ANY vendor keyword = reject
  const strictVendorPatterns = [
    // Vendor recruitment/applications
    /\b(calling all vendors|vendor applications?|looking for vendors|vendor registration|vendor booth|vendor slots?|vendors? wanted)\b/i,
    /\b(apply as vendor|become a vendor|join as vendor|vendor inquiry)\b/i,
    
    // Selling/commerce patterns
    /\b(for sale|selling|buy now|purchase|order now|shop|available|in stock|limited quantity|pre-?order)\b/i,
    /\b(₱\d+|PHP\d+|P\d+)\s*(each|per|\/pc|\/piece|\/set|\/item)\b/i, // Price per item
    /\b(brand new|unused|sealed|authentic|original|replica)\b/i,
    
    // Vendor logistics
    /\b(delivery|shipping|meet-?up|cod|cash on delivery|courier|nationwide shipping)\b/i,
    /\b(booth rental|table rental|selling space|market stall|bazaar booth)\b/i,
    
    // Sales inquiry patterns
    /\b(inquiry|inquire|interested\?|dm for price|pm for price|message for price|whatsapp|viber)\b/i,
    /\b(size|sizes|color|colors|available colors?|stocks?|variants?)\b/i,
  ];

  // ANY vendor pattern = automatically reject (no need to check event indicators)
  return strictVendorPatterns.some(pattern => pattern.test(text));
}

// Extract price information
export function extractPrice(text: string): { amount: number; currency: string; isFree: boolean } | null {
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

// Extract time information (supports 12h, 24h, Filipino "alas-", ranges)
export function extractTime(text: string): { startTime: string | null; endTime: string | null } {
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
  
  const startTime = convertTo24h(startHour, startMin, startMeridiem);
  const endTime = endHour ? convertTo24h(endHour, endMin, endMeridiem) : null;
  
  return { startTime, endTime };
}

// Extract date information (supports English/Filipino months, ordinals, ISO, ranges)
export function extractDate(text: string): { eventDate: string | null; eventEndDate: string | null } {
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

// Extract venue information
export function extractVenue(text: string, locationName?: string | null): { venueName: string | null; address: string | null } {
  // Priority 1: Pin emoji 📍
  const pinPattern = /📍\s*([^\n,]+?)(?:,\s*([^\n]+?))?(?=\n|$|[📍🗓️⏰🎟️])/;
  const pinMatch = text.match(pinPattern);
  
  if (pinMatch) {
    return {
      venueName: pinMatch[1].trim(),
      address: pinMatch[2]?.trim() || null,
    };
  }
  
  // Priority 2: Venue/location keywords (English + Filipino)
  const venuePattern = /\b(?:venue|location|where|saan|lugar)\s*[:\-]?\s*([^,\n.;#@]+?)(?=\n|$|when|kailan|time|date)/i;
  const venueMatch = text.match(venuePattern);
  
  if (venueMatch) {
    const venue = venueMatch[1].trim();
    // Avoid capturing "when", "time", "date" keywords
    if (!/\b(when|kailan|time|oras|date|petsa)\b/i.test(venue)) {
      return { venueName: venue, address: null };
    }
  }
  
  // Priority 3: "at/@" patterns (but avoid Instagram handles like @username)
  const atPattern = /\b(?:at|@)\s+(?![\w.]+\s*$)([A-Z][^\n,@#]{2,}?)(?=\n|$|when|time|date|@)/;
  const atMatch = text.match(atPattern);
  
  if (atMatch) {
    const venue = atMatch[1].trim();
    // Make sure it's not an Instagram handle (no spaces usually)
    if (venue.includes(' ') || /^The\s/.test(venue)) {
      return { venueName: venue, address: null };
    }
  }
  
  // Fallback to Instagram location tag if available
  if (locationName) {
    return { venueName: locationName, address: null };
  }
  
  return { venueName: null, address: null };
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
```

## Key Features & Patterns

### Vendor Detection (Strict)
- ANY vendor keyword triggers rejection
- Covers: vendor recruitment, booth rentals, selling patterns
- Example rejections: "CALLING ALL VENDORS", "booth rental", "for sale"

### Price Extraction (PHP-focused)
- Supports: ₱, PHP, P symbols
- Handles: ranges (₱299-349), k/m suffixes (₱5k = ₱5000)
- Free detection: "free", "libre", "walang bayad"

### Time Extraction (Multi-format)
- Filipino: "alas-7 ng gabi" → 19:00:00
- European: "19h30" → 19:30:00
- Standard: "7pm" or "7:00 PM" or "7-10pm"
- Ranges: "7pm to 10pm"

### Date Extraction (Bilingual)
- English months: January, Feb, Dec
- Filipino months: Enero, Pebrero, Disyembre
- Filipino ordinals: "ika-5 ng Mayo"
- Ranges: "Dec 25-27" or "December 25 to 27"
- ISO: "2025-01-05"

### Venue Extraction (Priority-based)
1. Pin emoji 📍 (highest priority)
2. Keywords: "venue:", "location:", "where:", "saan:"
3. "at/@ [Place Name]" (avoiding Instagram handles)
4. Fallback to Instagram location tag

### Signup URL Extraction
- Prioritizes known domains (eventbrite, forms.gle, bit.ly)
- Looks for URLs near signup keywords
- Returns first URL as fallback

## Request for ChatGPT Review

Please review this code and suggest improvements for:
1. More robust regex patterns
2. Edge cases we might be missing
3. Better handling of OCR errors
4. Additional Filipino language patterns
5. Performance optimizations
6. Better vendor detection patterns

Focus on the Philippine event market context where posts mix English, Filipino (Tagalog), and occasional OCR errors from image text.
