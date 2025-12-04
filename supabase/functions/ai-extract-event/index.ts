/**
 * AI-Powered Event Extraction using Google's Gemini API
 * 
 * This function intelligently extracts event information from Instagram captions,
 * handling Filipino/English mixed content, multi-venue events, and complex date formats.
 */

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
 * Build the extraction prompt for Gemini
 */
function buildExtractionPrompt(
  caption: string,
  locationHint: string | null
): string {
  const cleanedCaption = cleanCaptionForExtraction(caption);
  const currentYear = new Date().getFullYear();
  
  return `You are an expert at extracting event information from Filipino Instagram posts.

RULES:
1. event_title: Extract the actual event NAME, not the first line of caption. Look for event names like "Solana Holiday Pop-Up Tour", "Community Fleamarket", "Open Siomaic", etc.
2. event_date: Convert to YYYY-MM-DD format. Handle Filipino dates like "ika-5 ng Mayo", "Disyembre 6-7". For date ranges, use the start date. Assume current year (${currentYear}) if not specified.
3. event_end_date: For date ranges like "Dec 6-7", put the end date in YYYY-MM-DD format.
4. event_time: Convert to 24-hour format (HH:MM:SS). Infer AM/PM from context:
   - "gabi" = PM (evening), "umaga" = AM (morning)
   - Events at bars/clubs default to PM
   - Markets/fairs typically start in AM
5. location_name: ONLY the venue name. STOP extraction at:
   - Dates (December 6, Nov 29-30)
   - Times (11 am, 10:00)
   - Hashtags (#event)
   - Sponsor text ("Made possible by:", "Powered by:")
   - @mentions
6. location_address: The city/area if mentioned separately from venue name
7. If multiple venues/dates exist, put the FIRST one as primary and list others in additionalDates
8. is_event: true if this describes an upcoming event with date/time/location
9. confidence: 0.0-1.0 based on how certain you are about the extraction
10. reasoning: Brief explanation of your extraction logic

CAPTION TO ANALYZE:
${cleanedCaption}

${locationHint ? `LOCATION HINT FROM INSTAGRAM: ${locationHint}` : ''}

Return a valid JSON object with these exact fields:
{
  "eventTitle": string or null,
  "eventDate": "YYYY-MM-DD" or null,
  "eventEndDate": "YYYY-MM-DD" or null,
  "eventTime": "HH:MM:SS" or null,
  "endTime": "HH:MM:SS" or null,
  "locationName": string or null (venue name only, no dates/times/hashtags),
  "locationAddress": string or null,
  "isEvent": boolean,
  "confidence": number (0.0-1.0),
  "reasoning": string explaining extraction logic,
  "additionalDates": [{"date": "YYYY-MM-DD", "venue": string, "time": "HH:MM:SS"}] or null,
  "isFree": boolean or null,
  "price": number or null (in PHP),
  "signupUrl": string or null
}`;
}

/**
 * Call Gemini API for extraction
 */
async function callGeminiAPI(
  prompt: string,
  apiKey: string
): Promise<AIExtractionResult> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
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
    // Note: imageUrl is accepted for future multimodal extraction support
    // Currently only caption text is processed
    const { caption, locationHint, postId } = body;

    if (!caption) {
      return new Response(
        JSON.stringify({ error: 'Caption is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`AI extraction for post: ${postId || 'unknown'}`);

    // Build prompt and call Gemini
    const prompt = buildExtractionPrompt(caption, locationHint);
    const rawResult = await callGeminiAPI(prompt, geminiApiKey);
    
    // Validate and clean the result
    const result = validateExtractionResult(rawResult);
    
    console.log(`AI extraction result for ${postId}: isEvent=${result.isEvent}, confidence=${result.confidence}`);

    return new Response(
      JSON.stringify({
        success: true,
        postId,
        extraction: result,
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
