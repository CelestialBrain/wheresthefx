/**
 * Backfill Ground Truth Original Text
 * 
 * Populates the original_text column in extraction_ground_truth table
 * by finding the raw text snippets in captions that correspond to normalized values.
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

// Date patterns to find in captions
const DATE_PATTERNS = [
  // Month name formats
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,?\s*\d{4})?/gi,
  // Numeric formats
  /\b\d{1,2}[\/\.\-]\d{1,2}(?:[\/\.\-]\d{2,4})?\b/g,
  // Day + month name
  /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)/gi,
  // Filipino months
  /\b(?:enero|pebrero|marso|abril|mayo|hunyo|hulyo|agosto|setyembre|oktubre|nobyembre|disyembre)\s+\d{1,2}/gi,
];

// Time patterns to find in captions  
const TIME_PATTERNS = [
  /\b\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)\b/g,
  /\b(?:alas?\s+)?\d{1,2}(?::\d{2})?\s*(?:ng\s+)?(?:umaga|tanghali|hapon|gabi)\b/gi,
  /\b\d{1,2}:\d{2}\b/g,
];

// Price patterns to find in captions
const PRICE_PATTERNS = [
  /₱\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g,
  /(?:PHP|Php|php|P)\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g,
  /\d{1,3}(?:,\d{3})*\s*(?:pesos?|php)\b/gi,
];

// Venue patterns to find in captions
const VENUE_PATTERNS = [
  /📍\s*([^\n]+?)(?:\n|$)/g,
  /(?:at|sa|venue[:\s]+|location[:\s]+)\s*([A-Z][A-Za-z0-9\s&']+?)(?:\n|[,.]|$)/gi,
];

// URL patterns for signupUrl
const URL_PATTERNS = [
  /https?:\/\/(?:www\.)?(?:eventbrite|ticketmaster|dice\.fm|ra\.co|humanitix|peatix|bit\.ly|tinyurl|t\.co|fb\.me|forms\.gle)[^\s\n]*/gi,
  /(?:link\s+in\s+bio|register\s+at|sign\s*up\s+at|book\s+at|tickets?\s+at)\s*[:\s]*([^\n]+?)(?:\n|$)/gi,
  /https?:\/\/[^\s\n]+/gi,
];

/**
 * Validate if extracted date snippet could produce the normalized date
 */
function validateDateMatch(snippet: string, normalizedDate: string): boolean {
  if (!snippet || !normalizedDate) return false;
  
  // Parse normalized date (YYYY-MM-DD format)
  const parts = normalizedDate.split('-');
  if (parts.length !== 3) return false;
  
  const targetYear = parseInt(parts[0], 10);
  const targetMonth = parseInt(parts[1], 10);
  const targetDay = parseInt(parts[2], 10);
  
  const lowerSnippet = snippet.toLowerCase();
  
  // Check for month name match
  for (const [monthName, monthNum] of Object.entries(MONTH_NAMES)) {
    if (lowerSnippet.includes(monthName) && monthNum === targetMonth) {
      // Check if day number is present
      const dayMatch = snippet.match(/\d{1,2}/);
      if (dayMatch && parseInt(dayMatch[0], 10) === targetDay) {
        return true;
      }
    }
  }
  
  // Check numeric format (allow some flexibility for day/month order)
  const numericMatch = snippet.match(/(\d{1,2})[\/\.\-](\d{1,2})(?:[\/\.\-](\d{2,4}))?/);
  if (numericMatch) {
    const a = parseInt(numericMatch[1], 10);
    const b = parseInt(numericMatch[2], 10);
    
    // Check both DD/MM and MM/DD interpretations
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
  
  // Parse normalized time (HH:MM:SS format)
  const timeParts = normalizedTime.split(':');
  if (timeParts.length < 2) return false;
  
  const targetHour = parseInt(timeParts[0], 10);
  const targetMinute = parseInt(timeParts[1], 10);
  
  // Extract hour and minute from snippet
  const timeMatch = snippet.match(/(\d{1,2})(?::(\d{2}))?/);
  if (!timeMatch) return false;
  
  let snippetHour = parseInt(timeMatch[1], 10);
  const snippetMinute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
  
  // Handle AM/PM
  const lowerSnippet = snippet.toLowerCase();
  if (lowerSnippet.includes('pm') && snippetHour < 12) {
    snippetHour += 12;
  } else if (lowerSnippet.includes('am') && snippetHour === 12) {
    snippetHour = 0;
  }
  
  // Handle Filipino time indicators
  if (lowerSnippet.includes('gabi') || lowerSnippet.includes('hapon')) {
    if (snippetHour < 12) snippetHour += 12;
  } else if (lowerSnippet.includes('umaga') && snippetHour === 12) {
    snippetHour = 0;
  }
  
  // Allow match if hour matches (minute can be 0 if not specified)
  return snippetHour === targetHour && (snippetMinute === targetMinute || targetMinute === 0);
}

/**
 * Check if snippet is valid (not garbage)
 */
function isValidSnippet(snippet: string): boolean {
  if (!snippet || snippet.length < 3) return false;
  
  // Reject if mostly hashtags
  const hashtagCount = (snippet.match(/#/g) || []).length;
  const wordCount = snippet.split(/\s+/).length;
  if (hashtagCount > wordCount / 2) return false;
  
  // Reject if mostly emojis (rough check)
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
  const emojiMatches = snippet.match(emojiRegex) || [];
  if (emojiMatches.length > snippet.length / 4) return false;
  
  // Reject if it's just @mentions
  if (/^[@\s]+$/.test(snippet.replace(/@\w+/g, ''))) return false;
  
  return true;
}

/**
 * Find original text in caption for a given field
 */
function findOriginalText(caption: string, normalizedValue: string, fieldName: string): string | null {
  if (!caption || !normalizedValue) return null;
  
  switch (fieldName) {
    case 'eventDate':
    case 'eventEndDate': {
      // Try to find date text that validates against normalized date
      for (const pattern of DATE_PATTERNS) {
        const matches = caption.match(pattern);
        if (matches) {
          for (const match of matches) {
            if (validateDateMatch(match, normalizedValue)) {
              return match.trim();
            }
          }
        }
      }
      break;
    }
    
    case 'eventTime':
    case 'endTime': {
      // Try to find time text that validates against normalized time
      for (const pattern of TIME_PATTERNS) {
        const matches = caption.match(pattern);
        if (matches) {
          for (const match of matches) {
            if (validateTimeMatch(match, normalizedValue)) {
              return match.trim();
            }
          }
        }
      }
      break;
    }
    
    case 'signupUrl': {
      // Try to find URL
      for (const pattern of URL_PATTERNS) {
        const matches = caption.match(pattern);
        if (matches) {
          for (const match of matches) {
            // If the normalized value is a URL, check if this match contains it
            if (normalizedValue.startsWith('http') && match.includes(normalizedValue.substring(0, 20))) {
              return match.trim().substring(0, 100); // Limit URL length
            } else if (!normalizedValue.startsWith('http')) {
              return match.trim().substring(0, 100);
            }
          }
          // Return first URL match as fallback
          return matches[0].trim().substring(0, 100);
        }
      }
      break;
    }
    
    case 'price': {
      // Try to find price text
      for (const pattern of PRICE_PATTERNS) {
        const matches = caption.match(pattern);
        if (matches) {
          for (const match of matches) {
            // Check if this match could produce the normalized price
            const numMatch = match.match(/\d[\d,]*/);
            if (numMatch) {
              const extractedPrice = parseInt(numMatch[0].replace(/,/g, ''), 10);
              const normalizedPrice = parseInt(normalizedValue, 10);
              if (extractedPrice === normalizedPrice) {
                return match.trim();
              }
            }
          }
        }
      }
      break;
    }
    
    case 'locationName':
    case 'venue': {
      // First check if normalized value appears directly in caption
      if (caption.includes(normalizedValue)) {
        return normalizedValue;
      }
      
      // Try venue patterns
      for (const pattern of VENUE_PATTERNS) {
        const matches = caption.match(pattern);
        if (matches) {
          for (const match of matches) {
            const cleaned = match.trim();
            if (isValidSnippet(cleaned)) {
              return cleaned.substring(0, 80);
            }
          }
        }
      }
      break;
    }
    
    case 'isFree':
    case 'free': {
      // Look for free indicators
      const freePatterns = [
        /\bfree\s+(?:entry|entrance|admission)\b/gi,
        /\bno\s+cover\b/gi,
        /\blibre\b/gi,
        /\bwalang\s+bayad\b/gi,
        /\bfree\b/gi,
      ];
      for (const pattern of freePatterns) {
        const match = caption.match(pattern);
        if (match) {
          return match[0].trim();
        }
      }
      break;
    }
    
    case 'category': {
      // Category is inferred, not found in text - skip
      return null;
    }
    
    case 'eventTitle': {
      // Try to find the title in caption (usually at the start or after a line break)
      if (caption.includes(normalizedValue)) {
        return normalizedValue.substring(0, 80);
      }
      // Title might be slightly different - look for similar text at start
      const firstLine = caption.split('\n')[0].trim();
      if (firstLine.length >= 5 && firstLine.length <= 100) {
        return firstLine.substring(0, 80);
      }
      return null;
    }
  }
  
  // Fallback: only use for locationName/venue, skip for structured fields
  if (fieldName === 'locationName' || fieldName === 'venue') {
    return extractSnippetFallback(caption, normalizedValue, fieldName);
  }
  
  return null;
}

/**
 * Fallback snippet extraction - stricter version
 */
function extractSnippetFallback(caption: string, normalizedValue: string, fieldName: string): string | null {
  const keywords: Record<string, string[]> = {
    locationName: ['📍', 'venue', 'location', 'at', 'sa'],
    venue: ['📍', 'venue', 'location', 'at', 'sa'],
  };
  
  const fieldKeywords = keywords[fieldName] || [];
  const lowerCaption = caption.toLowerCase();
  
  for (const keyword of fieldKeywords) {
    const idx = lowerCaption.indexOf(keyword.toLowerCase());
    if (idx !== -1) {
      // Extract 60 chars after the keyword (venue names follow the keyword)
      const start = idx;
      const end = Math.min(caption.length, idx + 60);
      let snippet = caption.substring(start, end).trim();
      
      // Clean up: remove trailing hashtags and @mentions
      snippet = snippet.replace(/#\w+\s*/g, '').replace(/@\w+\s*/g, '').trim();
      
      // Truncate at newline
      const newlineIdx = snippet.indexOf('\n');
      if (newlineIdx > 0) {
        snippet = snippet.substring(0, newlineIdx).trim();
      }
      
      if (isValidSnippet(snippet) && snippet.length >= 5 && snippet.length <= 60) {
        return snippet;
      }
    }
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

    // Get ground truth records without original_text - increased batch size to 500
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

    // Fetch captions for these posts - use post_id (TEXT) not id (UUID)
    const { data: posts, error: postsError } = await supabase
      .from('instagram_posts')
      .select('post_id, caption')
      .in('post_id', postIds);

    if (postsError) {
      throw new Error(`Failed to fetch posts: ${postsError.message}`);
    }

    // Map by post_id (Instagram numeric ID as string)
    const captionMap = new Map(posts?.map(p => [p.post_id, p.caption]) || []);

    // Process each ground truth record
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

    // Count remaining records without original_text
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
