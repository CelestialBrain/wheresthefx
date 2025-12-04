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
 * Ground truth record for training data
 */
interface GroundTruthRecord {
  post_id: string;
  field_name: string;
  raw_text: string;
  correct_value: string;
  ai_confidence: number;
}

/**
 * Pattern suggestion for AI-generated patterns queue
 */
interface PatternSuggestion {
  pattern_type: string;
  raw_text: string;
  correct_value: string;
  status: 'pending';
}

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
 * 
 * This provides training data for pattern learning.
 * 
 * @param postId Post ID
 * @param caption Raw caption text
 * @param mergedResult Merged extraction result
 * @param supabase Supabase client
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

  const records: GroundTruthRecord[] = [];

  // Save each field where AI provided a value
  const fieldsToSave: Array<{
    name: string;
    value: string | number | null | undefined;
    fieldType: 'date' | 'time' | 'venue' | 'price' | 'url' | 'text';
  }> = [
    { name: 'eventDate', value: mergedResult.eventDate, fieldType: 'date' },
    { name: 'eventEndDate', value: mergedResult.eventEndDate, fieldType: 'date' },
    { name: 'eventTime', value: mergedResult.eventTime, fieldType: 'time' },
    { name: 'endTime', value: mergedResult.endTime, fieldType: 'time' },
    { name: 'locationName', value: mergedResult.locationName, fieldType: 'venue' },
    { name: 'signupUrl', value: mergedResult.signupUrl, fieldType: 'url' },
  ];

  // Handle price separately (numeric)
  if (mergedResult.price !== null && mergedResult.price !== undefined) {
    const priceSnippet = extractRelevantSnippet(caption, String(mergedResult.price));
    records.push({
      post_id: postId,
      field_name: 'price',
      raw_text: priceSnippet,
      correct_value: String(mergedResult.price),
      ai_confidence: confidence,
    });
  }

  // Add string fields
  for (const field of fieldsToSave) {
    if (field.value !== null && field.value !== undefined && field.value !== '') {
      const valueStr = String(field.value);
      const snippet = extractRelevantSnippet(caption, valueStr);
      records.push({
        post_id: postId,
        field_name: field.name,
        raw_text: snippet,
        correct_value: valueStr,
        ai_confidence: confidence,
      });
    }
  }

  if (records.length === 0) {
    return;
  }

  try {
    const { error } = await supabase
      .from('extraction_ground_truth')
      .insert(records);

    if (error) {
      console.error('Failed to save ground truth:', error.message);
    } else {
      console.log(`Saved ${records.length} ground truth records for post ${postId}`);
    }
  } catch (err) {
    console.error('Error saving ground truth:', err);
  }
}

/**
 * Train patterns by comparing regex results to AI results
 * 
 * - If regex matched AI → increment pattern success_count
 * - If regex was wrong → increment pattern failure_count
 * - If no pattern but AI found value → queue pattern suggestion
 * 
 * @param postId Post ID
 * @param caption Raw caption text
 * @param mergedResult Merged extraction result
 * @param supabase Supabase client
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

  const patternSuggestions: PatternSuggestion[] = [];
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
        // Pattern conflicted with AI - check which one was "right"
        // For training purposes, we trust AI with high confidence
        patternUpdates.push({ patternId, success: false });
      }
    } else if (source === 'ai' && finalValue !== null && finalValue !== undefined) {
      // No pattern matched, but AI found a value
      // Queue a pattern suggestion
      const patternType = fieldToPatternType(String(field.valueKey));
      const snippet = extractRelevantSnippet(caption, String(finalValue));
      
      patternSuggestions.push({
        pattern_type: patternType,
        raw_text: snippet,
        correct_value: String(finalValue),
        status: 'pending',
      });
    }
  }

  // Update pattern stats
  for (const update of patternUpdates) {
    try {
      // Increment success or failure count
      const column = update.success ? 'success_count' : 'failure_count';
      
      // Use RPC for atomic increment, or fall back to read-update
      const { data: pattern, error: fetchError } = await supabase
        .from('extraction_patterns')
        .select('success_count, failure_count')
        .eq('id', update.patternId)
        .single();

      if (fetchError) {
        console.error(`Failed to fetch pattern ${update.patternId}:`, fetchError.message);
        continue;
      }

      const newCount = update.success
        ? (pattern.success_count || 0) + 1
        : (pattern.failure_count || 0) + 1;

      const { error: updateError } = await supabase
        .from('extraction_patterns')
        .update({
          [column]: newCount,
          last_used_at: new Date().toISOString(),
        })
        .eq('id', update.patternId);

      if (updateError) {
        console.error(`Failed to update pattern ${update.patternId}:`, updateError.message);
      }
    } catch (err) {
      console.error(`Error updating pattern ${update.patternId}:`, err);
    }
  }

  // Queue pattern suggestions
  if (patternSuggestions.length > 0) {
    try {
      const { error } = await supabase
        .from('pattern_suggestions')
        .insert(patternSuggestions);

      if (error) {
        console.error('Failed to queue pattern suggestions:', error.message);
      } else {
        console.log(`Queued ${patternSuggestions.length} pattern suggestions for post ${postId}`);
      }
    } catch (err) {
      console.error('Error queuing pattern suggestions:', err);
    }
  }

  const successUpdates = patternUpdates.filter(u => u.success).length;
  const failureUpdates = patternUpdates.filter(u => !u.success).length;
  
  if (patternUpdates.length > 0 || patternSuggestions.length > 0) {
    console.log(
      `Pattern training for ${postId}: ` +
      `${successUpdates} successes, ${failureUpdates} failures, ` +
      `${patternSuggestions.length} suggestions`
    );
  }
}
