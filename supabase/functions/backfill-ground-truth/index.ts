/**
 * Backfill Ground Truth Original Text
 * 
 * Populates the original_text column in extraction_ground_truth table
 * by finding the raw text snippets in captions that correspond to normalized values.
 * 
 * CRITICAL: For range fields (endTime, eventEndDate), extracts the END value, not the start.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Month name mappings for validation
const MONTH_NAMES: Record<string, number> = {
  'jan': 1, 'january': 1, 'enero': 1,
  'feb': 2, 'february': 2, 'pebrero': 2,
  'mar': 3, 'march': 3, 'marso': 3,
  'apr': 4, 'april': 4, 'abril': 4,
  'may': 5, 'mayo': 5,
  'jun': 6, 'june': 6, 'hunyo': 6,
  'jul': 7, 'july': 7, 'hulyo': 7,
  'aug': 8, 'august': 8, 'agosto': 8,
  'sep': 9, 'sept': 9, 'september': 9, 'setyembre': 9,
  'oct': 10, 'october': 10, 'oktubre': 10,
  'nov': 11, 'november': 11, 'nobyembre': 11,
  'dec': 12, 'december': 12, 'disyembre': 12,
};

/**
 * Parse time string to HH:MM format
 */
function parseTimeToHHMM(timeStr: string): string | null {
  if (!timeStr) return null;
  
  const lower = timeStr.toLowerCase().trim();
  
  // Handle midnight
  if (lower.includes('midnight') || lower.includes('12mn') || lower === '12 mn') {
    return '00:00';
  }
  
  // Handle noon
  if (lower === 'noon' || lower === '12 noon' || lower === '12nn') {
    return '12:00';
  }
  
  // Parse standard time formats
  const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!timeMatch) return null;
  
  let hour = parseInt(timeMatch[1], 10);
  const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
  const period = timeMatch[3]?.toLowerCase();
  
  // Handle Filipino time indicators
  if (lower.includes('gabi') || lower.includes('hapon')) {
    if (hour < 12) hour += 12;
  } else if (lower.includes('umaga') && hour === 12) {
    hour = 0;
  }
  
  if (period === 'pm' && hour < 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

/**
 * Validate if extracted date snippet could produce the normalized date
 */
function validateDateMatch(snippet: string, normalizedDate: string): boolean {
  if (!snippet || !normalizedDate) return false;
  
  const parts = normalizedDate.split('-');
  if (parts.length !== 3) return false;
  
  const targetMonth = parseInt(parts[1], 10);
  const targetDay = parseInt(parts[2], 10);
  
  const lowerSnippet = snippet.toLowerCase();
  
  // Check for month name match
  for (const [monthName, monthNum] of Object.entries(MONTH_NAMES)) {
    if (lowerSnippet.includes(monthName) && monthNum === targetMonth) {
      const dayMatch = snippet.match(/\d{1,2}/g);
      if (dayMatch && dayMatch.some(d => parseInt(d, 10) === targetDay)) {
        return true;
      }
    }
  }
  
  // Check numeric format
  const numericMatch = snippet.match(/(\d{1,2})[\/\.\-](\d{1,2})/);
  if (numericMatch) {
    const a = parseInt(numericMatch[1], 10);
    const b = parseInt(numericMatch[2], 10);
    if ((a === targetDay && b === targetMonth) || (a === targetMonth && b === targetDay)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Validate if extracted time snippet could produce the normalized time
 */
function validateTimeMatch(snippet: string, normalizedTime: string): boolean {
  if (!snippet || !normalizedTime) return false;
  
  const parsedSnippet = parseTimeToHHMM(snippet);
  if (!parsedSnippet) return false;
  
  // Compare HH:MM (ignore seconds)
  const normalizedHHMM = normalizedTime.substring(0, 5);
  
  return parsedSnippet === normalizedHHMM;
}

/**
 * Check if snippet is valid (not garbage)
 */
function isValidSnippet(snippet: string): boolean {
  if (!snippet || snippet.length < 2) return false;
  
  // Reject if mostly hashtags
  const hashtagCount = (snippet.match(/#/g) || []).length;
  const wordCount = snippet.split(/\s+/).length;
  if (hashtagCount > wordCount / 2) return false;
  
  // Reject if mostly emojis
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
  const emojiMatches = snippet.match(emojiRegex) || [];
  if (emojiMatches.length > snippet.length / 4) return false;
  
  // Reject if just @mentions
  if (/^[@\s]+$/.test(snippet.replace(/@\w+/g, ''))) return false;
  
  return true;
}

/**
 * Find original text in caption for a given field
 * 
 * CRITICAL: For endTime and eventEndDate, extract the END value from ranges
 */
function findOriginalText(caption: string, normalizedValue: string, fieldName: string): string | null {
  if (!caption || !normalizedValue) return null;
  
  switch (fieldName) {
    // ============================================
    // END TIME - Extract SECOND value in time ranges
    // ============================================
    case 'endTime': {
      const lower = caption.toLowerCase();
      
      // Handle midnight
      if ((lower.includes('midnight') || lower.includes('12mn')) && 
          (normalizedValue === '00:00:00' || normalizedValue === '00:00')) {
        return 'midnight';
      }
      
      // Time range patterns - capture END time (group 2)
      const timeRangePatterns = [
        /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*[-–to]+\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/gi,
        /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+(?:'til|until)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/gi,
      ];
      
      for (const pattern of timeRangePatterns) {
        pattern.lastIndex = 0;
        const match = pattern.exec(caption);
        if (match && match[2]) {
          const endTime = match[2].trim();
          if (validateTimeMatch(endTime, normalizedValue)) {
            return endTime;
          }
        }
      }
      
      // If there's a time range but we couldn't extract, don't fallback
      if (caption.match(/\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-–to]+\s*\d{1,2}/i)) {
        return null;
      }
      break;
    }
    
    // ============================================
    // EVENT TIME - Extract FIRST value or standalone time
    // ============================================
    case 'eventTime': {
      const timePatterns = [
        /\b(\d{1,2}):(\d{2})\s*(am|pm|AM|PM)?\b/g,
        /\b(\d{1,2})\s*(am|pm|AM|PM)\b/g,
        /\balas[- ]?(\d{1,2})(?:\s*ng\s*)?(umaga|gabi|hapon)?/gi,
      ];
      
      for (const pattern of timePatterns) {
        pattern.lastIndex = 0;
        const match = pattern.exec(caption);
        if (match) {
          const timeText = match[0].trim();
          if (validateTimeMatch(timeText, normalizedValue)) {
            return timeText;
          }
        }
      }
      break;
    }
    
    // ============================================
    // END DATE - Extract SECOND value in date ranges
    // ============================================
    case 'eventEndDate': {
      // Date range patterns - capture END date
      const dateRangePatterns = [
        // "December 27-30" → return "December 30"
        /((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[.\s]*)(\d{1,2})\s*[-–]\s*(\d{1,2})/gi,
      ];
      
      for (const pattern of dateRangePatterns) {
        pattern.lastIndex = 0;
        const match = pattern.exec(caption);
        if (match) {
          const endDateText = `${match[1].trim()} ${match[3]}`;
          if (validateDateMatch(endDateText, normalizedValue)) {
            return endDateText;
          }
        }
      }
      
      // Don't fall back if there's a date range
      if (caption.match(/\d{1,2}\s*[-–]\s*\d{1,2}/)) {
        return null;
      }
      break;
    }
    
    // ============================================
    // EVENT DATE - Extract FIRST value or standalone date
    // ============================================
    case 'eventDate': {
      const datePatterns = [
        /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,?\s*\d{4})?/gi,
        /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)/gi,
        /\b(?:enero|pebrero|marso|abril|mayo|hunyo|hulyo|agosto|setyembre|oktubre|nobyembre|disyembre)\s+\d{1,2}/gi,
      ];
      
      for (const pattern of datePatterns) {
        pattern.lastIndex = 0;
        const match = pattern.exec(caption);
        if (match) {
          const dateText = match[0].trim();
          if (validateDateMatch(dateText, normalizedValue)) {
            return dateText;
          }
        }
      }
      break;
    }
    
    // ============================================
    // SIGNUP URL
    // ============================================
    case 'signupUrl': {
      const urlPatterns = [
        /https?:\/\/(?:www\.)?(?:eventbrite|ticketmaster|dice\.fm|ra\.co|humanitix|peatix|bit\.ly|tinyurl|t\.co|fb\.me|forms\.gle)[^\s\n]*/gi,
        /https?:\/\/[^\s\n]+/gi,
      ];
      
      for (const pattern of urlPatterns) {
        pattern.lastIndex = 0;
        const match = pattern.exec(caption);
        if (match) {
          return match[0].trim().substring(0, 100);
        }
      }
      break;
    }
    
    // ============================================
    // PRICE
    // ============================================
    case 'price': {
      const pricePatterns = [
        /₱\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g,
        /(?:PHP|Php|php|P)\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g,
        /\d{1,3}(?:,\d{3})*\s*(?:pesos?|php)\b/gi,
      ];
      
      for (const pattern of pricePatterns) {
        pattern.lastIndex = 0;
        const match = pattern.exec(caption);
        if (match) {
          const numMatch = match[0].match(/\d[\d,]*/);
          if (numMatch) {
            const extracted = parseInt(numMatch[0].replace(/,/g, ''), 10);
            const normalized = parseInt(normalizedValue, 10);
            if (extracted === normalized) {
              return match[0].trim();
            }
          }
        }
      }
      break;
    }
    
    // ============================================
    // LOCATION NAME - Stricter matching
    // ============================================
    case 'locationName':
    case 'venue': {
      // Priority 1: Exact match
      if (caption.includes(normalizedValue)) {
        return normalizedValue;
      }
      
      // Priority 2: 📍 emoji pattern
      const pinMatch = caption.match(/📍\s*([^\n,]+?)(?:\n|,|$)/);
      if (pinMatch && pinMatch[1]) {
        const venue = pinMatch[1].trim();
        if (!venue.startsWith('#') && !venue.startsWith('@') && venue.length >= 3 && venue.length <= 80) {
          return venue;
        }
      }
      
      // Priority 3: "at [Venue]" pattern
      const atMatch = caption.match(/(?:^|\s)(?:at|sa)\s+([A-Z][A-Za-z0-9\s&']+?)(?:\n|[,.]|$)/m);
      if (atMatch && atMatch[1]) {
        const venue = atMatch[1].trim();
        if (venue.length >= 3 && venue.length <= 60) {
          return venue;
        }
      }
      
      // DON'T fall back to random text
      return null;
    }
    
    case 'isFree':
    case 'free': {
      const freePatterns = [
        /\bfree\s+(?:entry|entrance|admission)\b/gi,
        /\bno\s+cover\b/gi,
        /\blibre\b/gi,
        /\bfree\b/gi,
      ];
      for (const pattern of freePatterns) {
        const match = caption.match(pattern);
        if (match) return match[0].trim();
      }
      break;
    }
    
    case 'category':
    case 'eventTitle':
      return null;
  }
  
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get ground truth records without original_text - batch size 500
    const { data: groundTruth, error: gtError } = await supabase
      .from('extraction_ground_truth')
      .select('id, post_id, field_name, ground_truth_value')
      .is('original_text', null)
      .limit(500);

    if (gtError) {
      throw new Error(`Failed to fetch ground truth: ${gtError.message}`);
    }

    if (!groundTruth || groundTruth.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'All ground truth records have original_text', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get unique post IDs
    const postIds = [...new Set(groundTruth.map(g => g.post_id).filter(Boolean))];

    // Fetch captions using post_id (TEXT)
    const { data: posts, error: postsError } = await supabase
      .from('instagram_posts')
      .select('post_id, caption')
      .in('post_id', postIds);

    if (postsError) {
      throw new Error(`Failed to fetch posts: ${postsError.message}`);
    }

    const captionMap = new Map(posts?.map(p => [p.post_id, p.caption]) || []);

    let updated = 0;
    let skipped = 0;
    const updates: { id: string; original_text: string }[] = [];

    for (const gt of groundTruth) {
      if (!gt.post_id) {
        skipped++;
        continue;
      }

      const caption = captionMap.get(gt.post_id);
      if (!caption) {
        skipped++;
        continue;
      }

      const originalText = findOriginalText(caption, gt.ground_truth_value, gt.field_name);
      if (originalText && isValidSnippet(originalText)) {
        updates.push({ id: gt.id, original_text: originalText });
        updated++;
      } else {
        skipped++;
      }
    }

    // Batch update
    for (const update of updates) {
      await supabase
        .from('extraction_ground_truth')
        .update({ original_text: update.original_text })
        .eq('id', update.id);
    }

    // Count remaining
    const { count: remaining } = await supabase
      .from('extraction_ground_truth')
      .select('*', { count: 'exact', head: true })
      .is('original_text', null);

    return new Response(
      JSON.stringify({
        success: true,
        processed: groundTruth.length,
        updated,
        skipped,
        remaining: remaining || 0,
        message: remaining && remaining > 0 
          ? `Run again to process ${remaining} more records`
          : 'All records processed!'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Backfill error:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
