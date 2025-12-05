/**
 * Parallel Extraction Module
 * 
 * Runs both regex patterns and AI extraction in parallel,
 * then merges results intelligently with confidence tracking.
 * 
 * Architecture:
 * Post → [Regex Patterns] ──┐
 *                           ├──► Merge → Final Result
 * Post → [AI Extraction] ───┘
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import {
  extractPrice,
  extractTime,
  extractDate,
  extractVenue,
  extractSignupUrl,
  TimeExtractionResult,
} from './extractionUtils.ts';

/**
 * Minimum word overlap threshold for fuzzy venue matching.
 * A value of 0.5 means at least half of the words must match.
 */
const VENUE_WORD_OVERLAP_THRESHOLD = 0.5;

/**
 * Minimum word length to consider for venue matching.
 * Shorter words are often articles/prepositions that don't indicate venue identity.
 */
const MIN_WORD_LENGTH_FOR_MATCHING = 2;

/**
 * Result from a single extraction source (regex or AI)
 */
export interface ExtractionResult {
  eventTitle?: string | null;
  eventDate?: string | null;
  eventEndDate?: string | null;
  eventTime?: string | null;
  endTime?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
  signupUrl?: string | null;
  price?: number | null;
  isFree?: boolean | null;
  isEvent?: boolean;
  confidence?: number;
  reasoning?: string;
  // Pattern IDs for tracking
  datePatternId?: string | null;
  timePatternId?: string | null;
  venuePatternId?: string | null;
  pricePatternId?: string | null;
  signupUrlPatternId?: string | null;
}

/**
 * Merged extraction result with source tracking
 */
export interface MergedExtractionResult extends ExtractionResult {
  sources: {
    eventTitle?: 'regex' | 'ai' | 'both';
    eventDate?: 'regex' | 'ai' | 'both';
    eventTime?: 'regex' | 'ai' | 'both';
    locationName?: 'regex' | 'ai' | 'both';
    price?: 'regex' | 'ai' | 'both';
    signupUrl?: 'regex' | 'ai' | 'both';
  };
  conflicts: {
    field: string;
    regexValue: string | number | null;
    aiValue: string | number | null;
  }[];
  overallSource: 'both' | 'ai_only' | 'regex_only' | 'conflict';
}

/**
 * Input for AI extraction function
 */
interface AIExtractionInput {
  caption: string;
  locationHint?: string | null;
  postId: string;
  postedAt?: string | null;
  ownerUsername?: string | null;
  instagramAccountId?: string | null;
  imageUrl?: string | null;
  useOCR?: boolean;
}

/**
 * Normalize strings for comparison (lowercase, trim, remove extra spaces)
 */
function normalizeForComparison(value: string | null | undefined): string {
  if (!value) return '';
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Check if two extracted values match (with tolerance for variations)
 * 
 * @param val1 First value
 * @param val2 Second value
 * @param fieldType Type of field for specialized comparison
 * @returns true if values match
 */
export function valuesMatch(
  val1: string | number | null | undefined,
  val2: string | number | null | undefined,
  fieldType: 'date' | 'time' | 'venue' | 'price' | 'url' | 'text'
): boolean {
  // Both null/undefined = match
  if ((val1 === null || val1 === undefined) && (val2 === null || val2 === undefined)) {
    return true;
  }
  
  // One null = no match
  if (val1 === null || val1 === undefined || val2 === null || val2 === undefined) {
    return false;
  }

  switch (fieldType) {
    case 'date':
      // Compare YYYY-MM-DD format directly
      return String(val1) === String(val2);
    
    case 'time':
      // Compare HH:MM:SS or HH:MM format
      // Normalize to HH:MM for comparison
      const time1 = String(val1).substring(0, 5);
      const time2 = String(val2).substring(0, 5);
      return time1 === time2;
    
    case 'venue':
      // Fuzzy venue matching - normalize and check substring
      const norm1 = normalizeForComparison(String(val1));
      const norm2 = normalizeForComparison(String(val2));
      // Check if one contains the other or they're very similar
      if (norm1 === norm2) return true;
      if (norm1.includes(norm2) || norm2.includes(norm1)) return true;
      // Check for significant word overlap
      const words1 = new Set(norm1.split(' ').filter(w => w.length > MIN_WORD_LENGTH_FOR_MATCHING));
      const words2 = new Set(norm2.split(' ').filter(w => w.length > MIN_WORD_LENGTH_FOR_MATCHING));
      const intersection = [...words1].filter(w => words2.has(w));
      const minWords = Math.min(words1.size, words2.size);
      if (minWords > 0 && intersection.length / minWords >= VENUE_WORD_OVERLAP_THRESHOLD) return true;
      return false;
    
    case 'price':
      // Prices should be exactly equal
      return Number(val1) === Number(val2);
    
    case 'url':
      // Normalize URLs by removing trailing slashes and comparing
      const url1 = String(val1).replace(/\/+$/, '').toLowerCase();
      const url2 = String(val2).replace(/\/+$/, '').toLowerCase();
      return url1 === url2;
    
    case 'text':
    default:
      // Generic text comparison - normalize and compare
      return normalizeForComparison(String(val1)) === normalizeForComparison(String(val2));
  }
}

/**
 * Extract event data using regex patterns
 */
async function extractWithRegex(
  text: string,
  locationHint: string | null | undefined,
  supabase: SupabaseClient
): Promise<ExtractionResult> {
  const [priceInfo, timeInfo, dateInfo, venueInfo, signupUrlInfo] = await Promise.all([
    extractPrice(text, supabase),
    extractTime(text, supabase),
    extractDate(text, supabase),
    extractVenue(text, locationHint, supabase),
    extractSignupUrl(text, supabase),
  ]);

  return {
    eventDate: dateInfo.eventDate,
    eventEndDate: dateInfo.eventEndDate,
    eventTime: timeInfo.startTime,
    endTime: timeInfo.endTime,
    locationName: venueInfo.venueName,
    locationAddress: venueInfo.address,
    signupUrl: signupUrlInfo.url,
    price: priceInfo?.amount ?? null,
    isFree: priceInfo?.isFree ?? null,
    isEvent: true, // Will be determined by caller
    datePatternId: dateInfo.patternId,
    timePatternId: timeInfo.patternId,
    venuePatternId: venueInfo.patternId,
    pricePatternId: priceInfo?.patternId,
    signupUrlPatternId: signupUrlInfo.patternId,
  };
}

/**
 * Default timeout for AI extraction calls (30 seconds)
 */
const AI_EXTRACTION_TIMEOUT_MS = 30000;

/**
 * Call AI extraction edge function with timeout
 */
async function extractWithAI(
  input: AIExtractionInput,
  supabase: SupabaseClient,
  timeoutMs: number = AI_EXTRACTION_TIMEOUT_MS
): Promise<ExtractionResult | null> {
  try {
    // Create a promise that rejects after timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`AI extraction timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    // Race between the actual call and timeout
    const extractionPromise = supabase.functions.invoke('ai-extract-event', {
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

    const { data, error } = await Promise.race([extractionPromise, timeoutPromise]);

    if (error) {
      console.error(`AI extraction failed for ${input.postId}:`, error.message);
      return null;
    }

    if (!data || !data.success || !data.extraction) {
      console.log(`AI extraction returned no results for ${input.postId}`);
      return null;
    }

    const ai = data.extraction;
    return {
      eventTitle: ai.eventTitle,
      eventDate: ai.eventDate,
      eventEndDate: ai.eventEndDate,
      eventTime: ai.eventTime,
      endTime: ai.endTime,
      locationName: ai.locationName,
      locationAddress: ai.locationAddress,
      signupUrl: ai.signupUrl,
      price: ai.price,
      isFree: ai.isFree,
      isEvent: ai.isEvent,
      confidence: ai.confidence,
      reasoning: ai.reasoning,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`AI extraction error for ${input.postId}: ${errorMsg}`);
    return null;
  }
}

/**
 * Merge regex and AI results with source tracking
 * 
 * Logic:
 * - Both agree → high confidence, source: 'both'
 * - Only AI → use AI, source: 'ai_only'
 * - Only regex → use regex, source: 'regex_only'
 * - Conflict → prefer AI, source: 'conflict', track both values
 * 
 * @param regexResult Result from regex extraction
 * @param aiResult Result from AI extraction (null if AI failed)
 * @returns Merged result with source tracking
 */
export function mergeResults(
  regexResult: ExtractionResult,
  aiResult: ExtractionResult | null
): MergedExtractionResult {
  const merged: MergedExtractionResult = {
    sources: {},
    conflicts: [],
    overallSource: 'regex_only',
    // Copy pattern IDs from regex
    datePatternId: regexResult.datePatternId,
    timePatternId: regexResult.timePatternId,
    venuePatternId: regexResult.venuePatternId,
    pricePatternId: regexResult.pricePatternId,
    signupUrlPatternId: regexResult.signupUrlPatternId,
  };

  // If no AI result, just use regex
  if (!aiResult) {
    return {
      ...merged,
      ...regexResult,
      overallSource: 'regex_only',
    };
  }

  // Helper to merge a single field
  const mergeField = <T extends string | number | null | undefined>(
    fieldName: keyof ExtractionResult,
    regexVal: T,
    aiVal: T,
    fieldType: 'date' | 'time' | 'venue' | 'price' | 'url' | 'text'
  ): T => {
    const regexHas = regexVal !== null && regexVal !== undefined;
    const aiHas = aiVal !== null && aiVal !== undefined;

    if (regexHas && aiHas) {
      if (valuesMatch(regexVal, aiVal, fieldType)) {
        // Both agree
        merged.sources[fieldName as keyof MergedExtractionResult['sources']] = 'both';
        return regexVal; // or aiVal, they match
      } else {
        // Conflict - prefer AI with high confidence
        merged.sources[fieldName as keyof MergedExtractionResult['sources']] = 'both';
        merged.conflicts.push({
          field: fieldName,
          regexValue: regexVal as string | number | null,
          aiValue: aiVal as string | number | null,
        });
        // Prefer AI if it has reasonable confidence (>= 0.6)
        const aiConfidence = aiResult.confidence ?? 0.5;
        return aiConfidence >= 0.6 ? aiVal : regexVal;
      }
    } else if (aiHas) {
      merged.sources[fieldName as keyof MergedExtractionResult['sources']] = 'ai';
      return aiVal;
    } else if (regexHas) {
      merged.sources[fieldName as keyof MergedExtractionResult['sources']] = 'regex';
      return regexVal;
    }

    return regexVal; // Both null
  };

  // Merge each field
  merged.eventTitle = mergeField('eventTitle', regexResult.eventTitle, aiResult.eventTitle, 'text');
  merged.eventDate = mergeField('eventDate', regexResult.eventDate, aiResult.eventDate, 'date');
  merged.eventEndDate = mergeField('eventEndDate', regexResult.eventEndDate, aiResult.eventEndDate, 'date');
  merged.eventTime = mergeField('eventTime', regexResult.eventTime, aiResult.eventTime, 'time');
  merged.endTime = mergeField('endTime', regexResult.endTime, aiResult.endTime, 'time');
  merged.locationName = mergeField('locationName', regexResult.locationName, aiResult.locationName, 'venue');
  merged.locationAddress = mergeField('locationAddress', regexResult.locationAddress, aiResult.locationAddress, 'text');
  merged.signupUrl = mergeField('signupUrl', regexResult.signupUrl, aiResult.signupUrl, 'url');
  merged.price = mergeField('price', regexResult.price, aiResult.price, 'price');
  
  // Handle isFree separately since it's a boolean (not in sources type)
  merged.isFree = aiResult.isFree ?? regexResult.isFree ?? true;

  // Determine isEvent - prefer AI if it made a determination
  merged.isEvent = aiResult.isEvent ?? regexResult.isEvent ?? false;
  merged.confidence = aiResult.confidence;
  merged.reasoning = aiResult.reasoning;

  // Determine overall source
  const sourceValues = Object.values(merged.sources);
  const hasBoth = sourceValues.some(s => s === 'both');
  const hasRegexOnly = sourceValues.some(s => s === 'regex');
  const hasAIOnly = sourceValues.some(s => s === 'ai');

  if (merged.conflicts.length > 0) {
    merged.overallSource = 'conflict';
  } else if (hasBoth || (hasRegexOnly && hasAIOnly)) {
    merged.overallSource = 'both';
  } else if (hasAIOnly && !hasRegexOnly) {
    merged.overallSource = 'ai_only';
  } else {
    merged.overallSource = 'regex_only';
  }

  return merged;
}

// Import pattern trainer functions
import { saveGroundTruth, trainPatternsFromComparison } from './patternTrainer.ts';

/**
 * Run both regex and AI extraction in parallel, then merge results
 * Also triggers pattern training when AI confidence is high.
 * 
 * @param caption Post caption text
 * @param locationHint Instagram location tag
 * @param postId Post ID
 * @param supabase Supabase client
 * @param additionalContext Additional context for AI extraction
 * @returns Merged extraction result
 */
export async function extractInParallel(
  caption: string,
  locationHint: string | null | undefined,
  postId: string,
  supabase: SupabaseClient,
  additionalContext?: {
    postedAt?: string | null;
    ownerUsername?: string | null;
    instagramAccountId?: string | null;
    imageUrl?: string | null;
    useOCR?: boolean;
  }
): Promise<MergedExtractionResult> {
  // Run both extractions in parallel
  const [regexResult, aiResult] = await Promise.all([
    extractWithRegex(caption, locationHint, supabase),
    extractWithAI({
      caption,
      locationHint,
      postId,
      ...additionalContext,
    }, supabase),
  ]);

  // Merge results
  const merged = mergeResults(regexResult, aiResult);

  console.log(`[ParallelExtraction] ${postId}: source=${merged.overallSource}, conflicts=${merged.conflicts.length}`);

  // PATTERN TRAINING: Save ground truth and train patterns from high-confidence AI results
  // This runs asynchronously to not block extraction
  if (aiResult && (merged.confidence ?? 0) >= 0.7) {
    Promise.all([
      saveGroundTruth(postId, caption, merged, supabase),
      trainPatternsFromComparison(postId, caption, merged, supabase),
    ]).catch(err => {
      console.error(`[ParallelExtraction] Pattern training error for ${postId}:`, err);
    });
  }

  return merged;
}
