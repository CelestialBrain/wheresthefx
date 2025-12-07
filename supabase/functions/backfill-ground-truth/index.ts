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

/**
 * Find original text in caption for a given field
 */
function findOriginalText(caption: string, normalizedValue: string, fieldName: string): string | null {
  if (!caption || !normalizedValue) return null;
  
  const lowerCaption = caption.toLowerCase();
  
  switch (fieldName) {
    case 'eventDate': {
      // Try to find date text that matches the normalized date
      for (const pattern of DATE_PATTERNS) {
        const matches = caption.match(pattern);
        if (matches) {
          // Return first match that could produce this date
          for (const match of matches) {
            return match.trim();
          }
        }
      }
      break;
    }
    
    case 'eventTime': {
      // Try to find time text
      for (const pattern of TIME_PATTERNS) {
        const matches = caption.match(pattern);
        if (matches) {
          for (const match of matches) {
            return match.trim();
          }
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
            return match.trim();
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
  }
  
  // Fallback: extract a snippet around where keywords might appear
  return extractSnippetFallback(caption, normalizedValue, fieldName);
}

/**
 * Fallback snippet extraction when patterns don't match
 */
function extractSnippetFallback(caption: string, normalizedValue: string, fieldName: string): string | null {
  const keywords: Record<string, string[]> = {
    eventDate: ['date', 'when', 'day', 'on', 'this'],
    eventTime: ['time', 'doors', 'starts', 'pm', 'am', 'alas'],
    price: ['₱', 'php', 'peso', 'ticket', 'cover'],
    locationName: ['📍', 'venue', 'location', 'at', 'sa'],
    isFree: ['free', 'libre', 'walang', 'cover'],
  };
  
  const fieldKeywords = keywords[fieldName] || [];
  const lowerCaption = caption.toLowerCase();
  
  for (const keyword of fieldKeywords) {
    const idx = lowerCaption.indexOf(keyword.toLowerCase());
    if (idx !== -1) {
      // Extract 50 chars around the keyword
      const start = Math.max(0, idx - 10);
      const end = Math.min(caption.length, idx + 40);
      const snippet = caption.substring(start, end).trim();
      if (snippet.length >= 3) {
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

    // Get ground truth records without original_text
    const { data: groundTruth, error: gtError } = await supabase
      .from('extraction_ground_truth')
      .select('id, post_id, field_name, ground_truth_value')
      .is('original_text', null)
      .limit(100);

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

    // Fetch captions for these posts
    const { data: posts, error: postsError } = await supabase
      .from('instagram_posts')
      .select('id, caption')
      .in('id', postIds);

    if (postsError) {
      throw new Error(`Failed to fetch posts: ${postsError.message}`);
    }

    const captionMap = new Map(posts?.map(p => [p.id, p.caption]) || []);

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
      if (originalText) {
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
