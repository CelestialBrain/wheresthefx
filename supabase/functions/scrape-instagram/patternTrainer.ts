/**
 * Pattern Trainer Module
 * 
 * Trains regex patterns from AI extraction results:
 * - Saves high-confidence AI results to extraction_ground_truth
 * - Compares regex results to AI results to track pattern effectiveness
 * - Queues pattern suggestions when AI finds values that regex missed
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { MergedExtractionResult, valuesMatch } from './parallelExtraction.ts';

/**
 * Minimum confidence threshold for saving ground truth
 */
const MIN_CONFIDENCE_FOR_GROUND_TRUTH = 0.7;

/**
 * Map field names to pattern types
 */
function fieldToPatternType(fieldName: string): string {
  const mapping: Record<string, string> = {
    eventDate: 'event_date',
    eventEndDate: 'event_date',
    eventTime: 'event_time',
    endTime: 'event_time',
    locationName: 'venue',
    locationAddress: 'address',
    price: 'price',
    signupUrl: 'signup_url',
  };
  return mapping[fieldName] || fieldName;
}

/**
 * Parse time string to HH:MM format for validation
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
  
  if (period === 'pm' && hour < 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

/**
 * Validate that original_text logically matches the normalized value
 */
function validateGroundTruth(
  fieldName: string, 
  originalText: string | null, 
  normalizedValue: string
): boolean {
  if (!originalText || !normalizedValue) return false;
  
  // For time fields, verify the parsed time matches
  if (fieldName === 'endTime' || fieldName === 'eventTime') {
    const parsedTime = parseTimeToHHMM(originalText);
    const normalizedHHMM = normalizedValue.substring(0, 5); // Handle HH:MM:SS format
    
    if (parsedTime && parsedTime !== normalizedHHMM) {
      console.warn(`[PatternTrainer] Validation failed for ${fieldName}: "${originalText}" parses to ${parsedTime}, expected ${normalizedHHMM}`);
      return false;
    }
  }
  
  // For date fields, we do a basic sanity check (contains right day number)
  if (fieldName === 'eventDate' || fieldName === 'eventEndDate') {
    const dayMatch = normalizedValue.match(/-(\d{2})$/);
    if (dayMatch) {
      const expectedDay = parseInt(dayMatch[1], 10);
      const foundDays = originalText.match(/\d{1,2}/g);
      if (foundDays && !foundDays.some(d => parseInt(d, 10) === expectedDay)) {
        console.warn(`[PatternTrainer] Validation failed for ${fieldName}: "${originalText}" doesn't contain day ${expectedDay}`);
        return false;
      }
    }
  }
  
  return true;
}

/**
 * Find the original raw text in caption that corresponds to a normalized value
 * Returns the actual text found (e.g., "Dec 6" instead of "2025-12-06")
 * 
 * CRITICAL: For range fields (endTime, eventEndDate), extract the END value, not the start
 */
function findOriginalTextInCaption(
  caption: string, 
  normalizedValue: string, 
  fieldName: string
): string | null {
  if (!caption || !normalizedValue) return null;
  
  const text = caption;
  
  // ============================================
  // END TIME - Extract the SECOND value in time ranges
  // ============================================
  if (fieldName === 'endTime') {
    // Handle special time words first
    const lower = text.toLowerCase();
    if (lower.includes('midnight') || lower.includes('12mn') || lower.includes('12 mn')) {
      if (normalizedValue === '00:00' || normalizedValue === '00:00:00') {
        return 'midnight';
      }
    }
    
    // Time range patterns - capture END time (group 2)
    const timeRangePatterns = [
      // "10AM-9PM", "10AM - 9PM", "10AM to 9PM"
      /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*[-–to]+\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/gi,
      // "10AM 'til 9PM", "10AM until 9PM"
      /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+(?:'til|until)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/gi,
      // "doors 8PM, ends midnight"
      /(?:ends?|closes?|until)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|midnight)/gi,
    ];
    
    for (const pattern of timeRangePatterns) {
      pattern.lastIndex = 0; // Reset regex state
      const match = pattern.exec(text);
      if (match) {
        // Return the END part (group 2 if exists, else group 1 for single-capture patterns)
        const endTime = match[2] || match[1];
        if (endTime) {
          const cleaned = endTime.trim();
          // Validate it matches the normalized value
          if (validateGroundTruth(fieldName, cleaned, normalizedValue)) {
            return cleaned;
          }
        }
      }
    }
    
    // Fall through to regular time patterns but skip if we have a range
    // (to avoid returning the start time)
    if (text.match(/\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-–to]+\s*\d{1,2}/i)) {
      return null; // Has a range but we couldn't extract - don't fallback to first time
    }
  }
  
  // ============================================
  // END DATE - Extract the SECOND value in date ranges
  // ============================================
  if (fieldName === 'eventEndDate') {
    // Date range patterns - capture END date
    const dateRangePatterns = [
      // "December 27-30" or "Dec 27-30" → return "December 30"
      /((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[.\s]*)(\d{1,2})\s*[-–]\s*(\d{1,2})/gi,
      // "Dec. 19–21" → return "Dec. 21"
      /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[.\s]+)(\d{1,2})\s*[-–]\s*(\d{1,2})/gi,
      // "27-30 December" → return "30 December"
      /(\d{1,2})\s*[-–]\s*(\d{1,2})\s+((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?))/gi,
    ];
    
    for (const pattern of dateRangePatterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(text);
      if (match) {
        let endDateText: string;
        
        if (match[3] && match[3].match(/\d/)) {
          // Pattern: "Month startDay-endDay" → "Month endDay"
          endDateText = `${match[1].trim()} ${match[3]}`;
        } else if (match[3] && !match[3].match(/\d/)) {
          // Pattern: "startDay-endDay Month" → "endDay Month"
          endDateText = `${match[2]} ${match[3].trim()}`;
        } else {
          endDateText = `${match[1].trim()} ${match[3]}`;
        }
        
        if (validateGroundTruth(fieldName, endDateText, normalizedValue)) {
          return endDateText;
        }
      }
    }
    
    // Don't fall back to first date if there's a range
    if (text.match(/\d{1,2}\s*[-–]\s*\d{1,2}/)) {
      return null;
    }
  }
  
  // ============================================
  // Regular date patterns (for eventDate, not endDate)
  // ============================================
  if (fieldName === 'eventDate') {
    const datePatterns = [
      // Month name formats: "Dec 6", "December 6", "Dec. 6"
      /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[.\s]+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*\d{4})?\b/gi,
      // Day first: "6 Dec", "6th December"
      /\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/gi,
      // Filipino months
      /\b(Enero|Pebrero|Marso|Abril|Mayo|Hunyo|Hulyo|Agosto|Setyembre|Oktubre|Nobyembre|Disyembre)\s+(\d{1,2})\b/gi,
    ];
    
    for (const pattern of datePatterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(text);
      if (match && match[0]) {
        const dateText = match[0].trim();
        if (validateGroundTruth(fieldName, dateText, normalizedValue)) {
          return dateText;
        }
      }
    }
  }
  
  // ============================================
  // Regular time patterns (for eventTime, not endTime)
  // ============================================
  if (fieldName === 'eventTime') {
    const timePatterns = [
      // Standard time: "6:00 PM", "6pm", "18:00"
      /\b(\d{1,2}):(\d{2})\s*(am|pm|AM|PM)?\b/g,
      /\b(\d{1,2})\s*(am|pm|AM|PM)\b/g,
      // Filipino time: "alas-6", "alas 8 ng gabi"
      /\balas[- ]?(\d{1,2})(?:\s*(?:ng\s*)?(umaga|gabi|hapon))?\b/gi,
    ];
    
    for (const pattern of timePatterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(text);
      if (match && match[0]) {
        const timeText = match[0].trim();
        if (validateGroundTruth(fieldName, timeText, normalizedValue)) {
          return timeText;
        }
      }
    }
  }
  
  // ============================================
  // Price patterns
  // ============================================
  if (fieldName === 'price') {
    const pricePatterns = [
      // PHP formats: "₱500", "PHP 500", "P500", "500 pesos"
      /[₱P][\s]?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g,
      /PHP[\s]?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,
      /(\d{1,3}(?:,\d{3})*)\s*(?:pesos?|php)/gi,
      // Free indicators
      /\bfree\s*(?:entry|entrance|admission)?\b/gi,
    ];
    
    for (const pattern of pricePatterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(text);
      if (match && match[0]) {
        return match[0].trim();
      }
    }
  }
  
  // ============================================
  // URL patterns
  // ============================================
  if (fieldName === 'signupUrl') {
    const urlPatterns = [
      /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi,
      /(?:bit\.ly|tinyurl\.com|forms\.gle|eventbrite\.com|fb\.me|linktr\.ee)[^\s<>"{}|\\^`\[\]]+/gi,
    ];
    
    for (const pattern of urlPatterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(text);
      if (match && match[0]) {
        return match[0].trim();
      }
    }
  }
  
  // ============================================
  // Venue/location - stricter matching
  // ============================================
  if (fieldName === 'locationName') {
    // Priority 1: Check if normalized value appears EXACTLY in caption
    if (caption.includes(normalizedValue)) {
      return normalizedValue;
    }
    
    // Priority 2: Look for 📍 emoji pattern
    const pinMatch = text.match(/📍\s*([^\n,]+?)(?:\n|,|$)/);
    if (pinMatch && pinMatch[1]) {
      const venue = pinMatch[1].trim();
      // Only return if it looks like a venue (not hashtags/handles)
      if (!venue.startsWith('#') && !venue.startsWith('@') && venue.length >= 3 && venue.length <= 80) {
        return venue;
      }
    }
    
    // Priority 3: Look for "at [Venue]" or "sa [Venue]" patterns
    const atMatch = text.match(/(?:^|\s)(?:at|sa)\s+([A-Z][A-Za-z0-9\s&']+?)(?:\n|[,.]|$)/m);
    if (atMatch && atMatch[1]) {
      const venue = atMatch[1].trim();
      if (venue.length >= 3 && venue.length <= 60) {
        return venue;
      }
    }
    
    // DON'T fall back to random text - return null instead
    return null;
  }
  
  return null;
}

/**
 * Extract a short, relevant snippet from text around a value
 */
function extractRelevantSnippet(text: string, value: string, windowSize: number = 100): string {
  const normalizedText = text.toLowerCase();
  const normalizedValue = value.toLowerCase();
  
  const idx = normalizedText.indexOf(normalizedValue);
  if (idx === -1) {
    // Value not found in text directly - return first part of text
    return text.substring(0, Math.min(windowSize * 2, text.length));
  }
  
  const start = Math.max(0, idx - windowSize);
  const end = Math.min(text.length, idx + value.length + windowSize);
  
  return text.substring(start, end);
}

/**
 * Save high-confidence AI results to extraction_ground_truth table
 * Now stores BOTH the normalized value AND the original raw text from caption
 * 
 * CRITICAL: Validates that original_text matches normalized value before saving
 */
export async function saveGroundTruth(
  postId: string,
  caption: string,
  mergedResult: MergedExtractionResult,
  supabase: SupabaseClient
): Promise<void> {
  // Only save if AI confidence is high enough
  const confidence = mergedResult.confidence ?? 0;
  if (confidence < MIN_CONFIDENCE_FOR_GROUND_TRUTH) {
    return;
  }

  const records: Array<{
    post_id: string;
    field_name: string;
    ground_truth_value: string;
    original_text: string | null;
    source: string;
  }> = [];

  // Save each field where AI provided a value
  const fieldsToSave: Array<{
    name: string;
    value: string | number | null | undefined;
  }> = [
    { name: 'eventDate', value: mergedResult.eventDate },
    { name: 'eventEndDate', value: mergedResult.eventEndDate },
    { name: 'eventTime', value: mergedResult.eventTime },
    { name: 'endTime', value: mergedResult.endTime },
    { name: 'locationName', value: mergedResult.locationName },
    { name: 'signupUrl', value: mergedResult.signupUrl },
  ];

  // Handle price separately (numeric)
  if (mergedResult.price !== null && mergedResult.price !== undefined) {
    const originalText = findOriginalTextInCaption(caption, String(mergedResult.price), 'price');
    if (originalText) {
      records.push({
        post_id: postId,
        field_name: 'price',
        ground_truth_value: String(mergedResult.price),
        original_text: originalText,
        source: 'ai_high_confidence',
      });
    }
  }

  // Add string fields - only if validation passes
  for (const field of fieldsToSave) {
    if (field.value !== null && field.value !== undefined && field.value !== '') {
      const originalText = findOriginalTextInCaption(caption, String(field.value), field.name);
      
      // Only save if we found valid original text that matches the normalized value
      if (originalText && validateGroundTruth(field.name, originalText, String(field.value))) {
        records.push({
          post_id: postId,
          field_name: field.name,
          ground_truth_value: String(field.value),
          original_text: originalText,
          source: 'ai_high_confidence',
        });
      } else {
        console.log(`[PatternTrainer] Skipping ${field.name} - no valid original_text found for "${field.value}"`);
      }
    }
  }

  if (records.length === 0) {
    console.log(`[PatternTrainer] No valid fields to save for post ${postId} (confidence: ${confidence})`);
    return;
  }

  // Log what we're about to insert for debugging
  console.log(`[PatternTrainer] Saving ${records.length} validated ground truth records for post ${postId}`);

  try {
    const { data, error } = await supabase
      .from('extraction_ground_truth')
      .insert(records)
      .select();

    if (error) {
      console.error(`[PatternTrainer] Failed to save ground truth for ${postId}:`, error.message);
    } else {
      console.log(`[PatternTrainer] ✅ Saved ${records.length} ground truth records for post ${postId}`);
    }
  } catch (err) {
    console.error('[PatternTrainer] Exception saving ground truth:', err);
  }
}

/**
 * Train patterns by comparing regex results to AI results
 */
export async function trainPatternsFromComparison(
  postId: string,
  caption: string,
  mergedResult: MergedExtractionResult,
  supabase: SupabaseClient
): Promise<void> {
  // Only train from high-confidence AI results
  const confidence = mergedResult.confidence ?? 0;
  if (confidence < MIN_CONFIDENCE_FOR_GROUND_TRUTH) {
    return;
  }

  const patternSuggestions: Array<{
    pattern_type: string;
    suggested_regex: string;
    sample_text: string;
    expected_value: string;
    status: string;
  }> = [];
  const patternUpdates: Array<{ patternId: string; success: boolean }> = [];

  // Define fields to analyze
  const fieldsToAnalyze: Array<{
    name: keyof MergedExtractionResult['sources'];
    patternIdKey: 'datePatternId' | 'timePatternId' | 'venuePatternId' | 'pricePatternId' | 'signupUrlPatternId';
    valueKey: keyof MergedExtractionResult;
    fieldType: 'date' | 'time' | 'venue' | 'price' | 'url' | 'text';
  }> = [
    { name: 'eventDate', patternIdKey: 'datePatternId', valueKey: 'eventDate', fieldType: 'date' },
    { name: 'eventTime', patternIdKey: 'timePatternId', valueKey: 'eventTime', fieldType: 'time' },
    { name: 'locationName', patternIdKey: 'venuePatternId', valueKey: 'locationName', fieldType: 'venue' },
    { name: 'price', patternIdKey: 'pricePatternId', valueKey: 'price', fieldType: 'price' },
    { name: 'signupUrl', patternIdKey: 'signupUrlPatternId', valueKey: 'signupUrl', fieldType: 'url' },
  ];

  for (const field of fieldsToAnalyze) {
    const source = mergedResult.sources[field.name];
    const patternId = mergedResult[field.patternIdKey] as string | null | undefined;
    const finalValue = mergedResult[field.valueKey];

    // Check if this field had a conflict
    const conflict = mergedResult.conflicts.find(c => c.field === field.valueKey);

    if (patternId) {
      // A pattern was used - determine if it was successful
      if (source === 'both' && !conflict) {
        // Pattern matched AI result - success
        patternUpdates.push({ patternId, success: true });
      } else if (conflict) {
        // Pattern conflicted with AI - failure
        patternUpdates.push({ patternId, success: false });
      }
    } else if (source === 'ai' && finalValue !== null && finalValue !== undefined) {
      // No pattern matched, but AI found a value
      // Find the ORIGINAL text in caption for this value
      const originalText = findOriginalTextInCaption(caption, String(finalValue), String(field.valueKey));
      
      // Only create suggestion if we found valid original text
      if (originalText && validateGroundTruth(String(field.valueKey), originalText, String(finalValue))) {
        const patternType = fieldToPatternType(String(field.valueKey));
        
        patternSuggestions.push({
          pattern_type: patternType,
          suggested_regex: 'NEEDS_GENERATION',
          sample_text: originalText,
          expected_value: String(finalValue),
          status: 'pending',
        });
        
        console.log(`[PatternTrainer] Queuing suggestion: "${originalText}" → "${finalValue}" (${field.valueKey})`);
      }
    }
  }

  // Update pattern stats
  for (const update of patternUpdates) {
    try {
      const column = update.success ? 'success_count' : 'failure_count';
      
      const { data: pattern, error: fetchError } = await supabase
        .from('extraction_patterns')
        .select('id, success_count, failure_count, is_active')
        .eq('id', update.patternId)
        .single();

      if (fetchError) {
        console.error(`Failed to fetch pattern ${update.patternId}:`, fetchError.message);
        continue;
      }

      const newSuccessCount = update.success
        ? (pattern.success_count || 0) + 1
        : (pattern.success_count || 0);
      const newFailureCount = update.success
        ? (pattern.failure_count || 0)
        : (pattern.failure_count || 0) + 1;

      const totalAttempts = newSuccessCount + newFailureCount;
      
      // Auto-disable patterns with >66% failure rate after 10+ attempts
      const shouldDisable = pattern.is_active && 
        totalAttempts > 10 && 
        newFailureCount > newSuccessCount * 2;

      const updateData: Record<string, number | string | boolean> = {
        [column]: update.success ? newSuccessCount : newFailureCount,
        last_used_at: new Date().toISOString(),
      };

      if (shouldDisable) {
        updateData.is_active = false;
        console.log(
          `[PatternTrainer] Auto-disabled failing pattern ${pattern.id} ` +
          `(${newSuccessCount} successes, ${newFailureCount} failures)`
        );
      }

      await supabase
        .from('extraction_patterns')
        .update(updateData)
        .eq('id', update.patternId);

    } catch (err) {
      console.error(`Error updating pattern ${update.patternId}:`, err);
    }
  }

  // Queue pattern suggestions (with deduplication via upsert)
  if (patternSuggestions.length > 0) {
    console.log(`[PatternTrainer] Queueing ${patternSuggestions.length} validated pattern suggestions`);
    
    for (const suggestion of patternSuggestions) {
      try {
        // Check if similar suggestion already exists
        const { data: existing } = await supabase
          .from('pattern_suggestions')
          .select('id, attempt_count')
          .eq('pattern_type', suggestion.pattern_type)
          .eq('expected_value', suggestion.expected_value)
          .eq('status', 'pending')
          .maybeSingle();
        
        if (existing) {
          // Increment attempt count instead of creating duplicate
          await supabase
            .from('pattern_suggestions')
            .update({ 
              attempt_count: (existing.attempt_count || 1) + 1,
              sample_text: suggestion.sample_text, // Update with latest sample
            })
            .eq('id', existing.id);
          console.log(`[PatternTrainer] Updated existing suggestion for ${suggestion.expected_value} (attempt ${(existing.attempt_count || 1) + 1})`);
        } else {
          // Insert new suggestion
          const { error } = await supabase
            .from('pattern_suggestions')
            .insert(suggestion);
          
          if (error && !error.message.includes('duplicate')) {
            console.error(`[PatternTrainer] Failed to queue suggestion:`, error.message);
          } else if (!error) {
            console.log(`[PatternTrainer] ✅ Queued new suggestion: ${suggestion.expected_value}`);
          }
        }
      } catch (err) {
        console.error('[PatternTrainer] Exception queuing suggestion:', err);
      }
    }
  }
}
