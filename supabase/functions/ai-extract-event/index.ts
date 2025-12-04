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
  extractionMethod?: 'ai' | 'ocr_ai';
  sourceBreakdown?: {
    fromCaption: string[];
    fromImage: string[];
  };
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
  context: AIContext
): string {
  const cleanedCaption = cleanCaptionForExtraction(context.caption);
  
  // Use Philippine timezone (UTC+8) for consistent date handling
  const philippineTime = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const currentYear = philippineTime.getUTCFullYear();
  const today = philippineTime.toISOString().split('T')[0];
  
  let prompt = `You are an expert at extracting event information from Filipino Instagram posts.

TODAY'S DATE: ${today}

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
RULES:
1. event_title: Extract the actual event NAME, not the first line of caption. Look for event names like "Solana Holiday Pop-Up Tour", "Community Fleamarket", "Open Siomaic", etc.
2. event_date: Convert to YYYY-MM-DD format. Handle Filipino dates like "ika-5 ng Mayo", "Disyembre 6-7". For date ranges, use the start date. Assume current year (${currentYear}) if not specified.
3. event_end_date: For date ranges like "Dec 6-7", put the end date in YYYY-MM-DD format.
4. event_time: Convert to 24-hour format (HH:MM:SS). Infer AM/PM from context:
   - "gabi" = PM (evening), "umaga" = AM (morning)
   - Events at bars/clubs default to PM
   - Markets/fairs typically start in AM
5. location_name: ONLY the venue name. If a known venue matches, use its exact name. STOP extraction at:
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

  return prompt;
}

/**
 * Build the extraction prompt with OCR text from image
 */
function buildPromptWithOCR(
  caption: string,
  ocrText: string,
  ocrLines: string[],
  context: AIContext
): string {
  const cleanedCaption = cleanCaptionForExtraction(caption);
  
  // Use Philippine timezone (UTC+8) for consistent date handling
  const philippineTime = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const currentYear = philippineTime.getUTCFullYear();
  const today = philippineTime.toISOString().split('T')[0];
  
  let prompt = `You are an expert at extracting event information from Filipino Instagram posts.

TODAY'S DATE: ${today}

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

EXTRACTION RULES:
1. EVENT TITLE: Look for the largest/most prominent text in the image, not the caption
2. DATE: Look for month names, day numbers. Convert to YYYY-MM-DD format. Assume year ${currentYear} if not specified.
3. TIME: Look for "PM", "AM", time formats. Convert to 24-hour HH:MM:SS
4. VENUE: The venue name from the image is usually more accurate than the caption
5. PRICE: Look for "₱", "PHP", "P", "FREE", "LIBRE" in the image
6. If date is ambiguous, assume it's in the future (not past)

Return ONLY valid JSON (no markdown, no code blocks):
{
  "eventTitle": "string",
  "eventDate": "YYYY-MM-DD",
  "eventEndDate": "YYYY-MM-DD or null",
  "eventTime": "HH:MM:SS",
  "endTime": "HH:MM:SS or null",
  "locationName": "venue name only, clean",
  "locationAddress": "full address if found, or null",
  "price": number or null,
  "isFree": boolean,
  "signupUrl": "URL if found or null",
  "isEvent": boolean,
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation of what was found where",
  "sourceBreakdown": {
    "fromCaption": ["fields found in caption"],
    "fromImage": ["fields found in image OCR"]
  }
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
 * This combines OCR text from image with caption text for AI analysis
 */
async function extractWithOCRAndAI(
  caption: string,
  imageUrl: string,
  context: AIContext,
  supabaseUrl: string,
  supabaseKey: string,
  geminiApiKey: string
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
    console.warn('OCR failed, falling back to AI vision only:', ocrResult?.error || 'Unknown error');
  }

  // Step 2: Build enhanced prompt with OCR text
  const combinedPrompt = buildPromptWithOCR(caption, ocrText, ocrLines, context);
  
  // Step 3: Call Gemini with combined context
  const aiResult = await callGeminiAPI(combinedPrompt, geminiApiKey);
  
  // Step 4: Add OCR metadata
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
      (caption && caption.length < 100)
    );

    if (shouldUseOCR) {
      console.log(`Using OCR+AI extraction for post: ${postId || 'unknown'}`);
      const rawResult = await extractWithOCRAndAI(
        caption || '',
        imageUrl,
        context,
        supabaseUrl!,
        supabaseServiceKey!,
        geminiApiKey
      );
      result = validateExtractionResult(rawResult);
    } else {
      // Standard caption-only AI extraction
      const prompt = buildExtractionPrompt(context);
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
