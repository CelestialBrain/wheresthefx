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
 * DB Schema:
 * - post_id: uuid
 * - field_name: text
 * - ground_truth_value: text (NOT correct_value)
 * - source: text (default 'admin_correction')
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

  const records: Array<{
    post_id: string;
    field_name: string;
    ground_truth_value: string;
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
    records.push({
      post_id: postId,
      field_name: 'price',
      ground_truth_value: String(mergedResult.price),
      source: 'ai_high_confidence',
    });
  }

  // Add string fields
  for (const field of fieldsToSave) {
    if (field.value !== null && field.value !== undefined && field.value !== '') {
      records.push({
        post_id: postId,
        field_name: field.name,
        ground_truth_value: String(field.value),
        source: 'ai_high_confidence',
      });
    }
  }

  if (records.length === 0) {
    console.log(`[PatternTrainer] No fields to save for post ${postId} (confidence: ${confidence})`);
    return;
  }

  // Log what we're about to insert for debugging
  console.log(`[PatternTrainer] Attempting to save ${records.length} ground truth records for post ${postId}`);
  console.log(`[PatternTrainer] Records:`, JSON.stringify(records, null, 2));

  try {
    const { data, error } = await supabase
      .from('extraction_ground_truth')
      .insert(records)
      .select();

    if (error) {
      console.error(`[PatternTrainer] Failed to save ground truth for ${postId}:`, error.message);
      console.error(`[PatternTrainer] Error details:`, JSON.stringify(error, null, 2));
    } else {
      console.log(`[PatternTrainer] ✅ Saved ${records.length} ground truth records for post ${postId}`);
      console.log(`[PatternTrainer] Inserted data:`, JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error('[PatternTrainer] Exception saving ground truth:', err);
  }
}

/**
 * Train patterns by comparing regex results to AI results
 * 
 * - If regex matched AI → increment pattern success_count
 * - If regex was wrong → increment pattern failure_count
 * - If no pattern but AI found value → queue pattern suggestion
 * 
 * DB Schema for pattern_suggestions:
 * - pattern_type: text
 * - suggested_regex: text (required - use placeholder)
 * - sample_text: text (NOT raw_text)
 * - expected_value: text (NOT correct_value)
 * - status: text (default 'pending')
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
      // Queue a pattern suggestion
      const patternType = fieldToPatternType(String(field.valueKey));
      const snippet = extractRelevantSnippet(caption, String(finalValue));
      
      patternSuggestions.push({
        pattern_type: patternType,
        suggested_regex: 'NEEDS_GENERATION', // Placeholder - will be reviewed by admin
        sample_text: snippet,
        expected_value: String(finalValue),
        status: 'pending',
      });
    }
  }

  // Update pattern stats
  for (const update of patternUpdates) {
    try {
      // Increment success or failure count
      const column = update.success ? 'success_count' : 'failure_count';
      
      // Fetch current counts
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
          `(${newSuccessCount} successes, ${newFailureCount} failures, ` +
          `${((newFailureCount / totalAttempts) * 100).toFixed(1)}% failure rate)`
        );
      }

      const { error: updateError } = await supabase
        .from('extraction_patterns')
        .update(updateData)
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
    console.log(`[PatternTrainer] Attempting to queue ${patternSuggestions.length} pattern suggestions`);
    console.log(`[PatternTrainer] Suggestions:`, JSON.stringify(patternSuggestions, null, 2));
    
    try {
      const { data, error } = await supabase
        .from('pattern_suggestions')
        .insert(patternSuggestions)
        .select();

      if (error) {
        console.error(`[PatternTrainer] Failed to queue pattern suggestions:`, error.message);
        console.error(`[PatternTrainer] Error details:`, JSON.stringify(error, null, 2));
      } else {
        console.log(`[PatternTrainer] ✅ Queued ${patternSuggestions.length} pattern suggestions for post ${postId}`);
        console.log(`[PatternTrainer] Inserted suggestions:`, JSON.stringify(data, null, 2));
      }
    } catch (err) {
      console.error('[PatternTrainer] Exception queuing pattern suggestions:', err);
    }
  }

  const successUpdates = patternUpdates.filter(u => u.success).length;
  const failureUpdates = patternUpdates.filter(u => !u.success).length;
  
  if (patternUpdates.length > 0 || patternSuggestions.length > 0) {
    console.log(
      `[PatternTrainer] Training for ${postId}: ` +
      `${successUpdates} successes, ${failureUpdates} failures, ` +
      `${patternSuggestions.length} suggestions`
    );
  }
}
