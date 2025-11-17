import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

/**
 * Record pattern success
 */
export async function recordPatternSuccess(
  supabase: SupabaseClient,
  patternId: string
): Promise<void> {
  const { error } = await supabase.rpc('increment_pattern_success', {
    pattern_id: patternId,
  });

  if (error) {
    // Fallback to manual update if RPC doesn't exist
    const { data: pattern } = await supabase
      .from('extraction_patterns')
      .select('success_count')
      .eq('id', patternId)
      .single();

    if (pattern) {
      await supabase
        .from('extraction_patterns')
        .update({
          success_count: (pattern.success_count || 0) + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq('id', patternId);
    }
  }
}

/**
 * Record pattern failure
 */
export async function recordPatternFailure(
  supabase: SupabaseClient,
  patternId: string
): Promise<void> {
  const { error } = await supabase.rpc('increment_pattern_failure', {
    pattern_id: patternId,
  });

  if (error) {
    // Fallback to manual update if RPC doesn't exist
    const { data: pattern } = await supabase
      .from('extraction_patterns')
      .select('failure_count')
      .eq('id', patternId)
      .single();

    if (pattern) {
      await supabase
        .from('extraction_patterns')
        .update({
          failure_count: (pattern.failure_count || 0) + 1,
        })
        .eq('id', patternId);
    }
  }
}

/**
 * Update pattern confidence score based on success/failure ratio
 */
export async function updatePatternConfidence(
  supabase: SupabaseClient,
  patternId: string
): Promise<void> {
  const { data: pattern } = await supabase
    .from('extraction_patterns')
    .select('success_count, failure_count')
    .eq('id', patternId)
    .single();

  if (!pattern) return;

  const totalAttempts = pattern.success_count + pattern.failure_count;
  if (totalAttempts === 0) return;

  const confidence = pattern.success_count / totalAttempts;

  await supabase
    .from('extraction_patterns')
    .update({
      confidence_score: confidence,
      is_active: confidence >= 0.3, // Deactivate if confidence drops below 30%
    })
    .eq('id', patternId);
}

/**
 * Log extraction correction for learning
 */
export async function logExtractionCorrection(
  supabase: SupabaseClient,
  postId: string,
  fieldName: string,
  originalValue: any,
  correctedValue: any,
  ocrText?: string,
  patternId?: string
): Promise<void> {
  if (originalValue === correctedValue) return;

  await supabase.from('extraction_corrections').insert({
    post_id: postId,
    field_name: fieldName,
    original_extracted_value: String(originalValue || ''),
    corrected_value: String(correctedValue),
    extraction_method: 'manual',
    original_ocr_text: ocrText,
    learned_pattern_id: patternId || null,
  });
}
