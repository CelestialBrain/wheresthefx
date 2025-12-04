import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

/**
 * Database schema for extraction_patterns table (must exist):
 * - id: uuid (PRIMARY KEY)
 * - pattern_type: text ('price' | 'date' | 'time' | 'venue' | 'signup_url' | 'vendor' | 'event')
 * - pattern_regex: text (regex pattern string)
 * - pattern_description: text (nullable)
 * - confidence_score: numeric (0.0 to 1.0)
 * - success_count: integer (default 0)
 * - failure_count: integer (default 0)
 * - last_used_at: timestamptz (nullable)
 * - created_at: timestamptz (default now())
 * - is_active: boolean (default true)
 * - source: text ('default' | 'learned' | 'manual')
 * - priority: integer (default 100, lower = higher priority) -- TODO: Add this column via migration
 * 
 * Suggested migration to add priority field:
 * ALTER TABLE public.extraction_patterns ADD COLUMN IF NOT EXISTS priority integer DEFAULT 100;
 * CREATE INDEX IF NOT EXISTS idx_extraction_patterns_priority ON public.extraction_patterns(priority ASC);
 */

export interface ExtractionPattern {
  id: string;
  pattern_type: string;
  pattern_regex: string;
  pattern_description: string | null;
  confidence_score: number;
  success_count: number;
  failure_count: number;
  source: string;
  priority?: number;
  last_used_at?: string;
  is_active: boolean;
}

/**
 * Interface for logging pattern usage events without coupling to ScraperLogger.
 * Allows callers to hook into pattern success/failure events for observability.
 */
export interface PatternUsageLogger {
  /**
   * Called when a pattern successfully matches and returns a value.
   * @param patternId - The ID of the matched pattern
   * @param patternType - The type of pattern (e.g., 'price', 'time', 'venue')
   * @param extractedValue - A short preview of the extracted value
   * @param patternDescription - Optional description of the pattern
   */
  onPatternSuccess(
    patternId: string,
    patternType: string,
    extractedValue: string,
    patternDescription?: string | null
  ): void;

  /**
   * Called when no patterns match and a failure is recorded.
   * @param patternId - The ID of the highest-priority pattern that failed
   * @param patternType - The type of pattern (e.g., 'price', 'time', 'venue')
   * @param patternDescription - Optional description of the pattern
   */
  onPatternFailure(
    patternId: string,
    patternType: string,
    patternDescription?: string | null
  ): void;
}

/**
 * Get the minimum confidence score threshold for a pattern type.
 * Stricter thresholds for time/price, looser for venue.
 * @param patternType - The type of pattern
 * @returns Minimum confidence score threshold
 */
export function getThresholdForPatternType(patternType: string): number {
  switch (patternType) {
    case 'time':
    case 'event_time':
      return 0.5; // Stricter threshold for time patterns
    case 'price':
      return 0.4; // Moderately strict for price patterns
    case 'venue':
      return 0.25; // Looser threshold for venue patterns
    case 'event_date':
    case 'date':
      return 0.35; // Moderate threshold for date patterns
    default:
      return 0.3; // Default threshold for other patterns
  }
}

/**
 * Fetch learned patterns from database, ordered by priority (then confidence)
 * Priority field may not exist yet - gracefully handles both cases
 * Uses field-specific confidence thresholds for better precision.
 */
export async function fetchLearnedPatterns(
  supabase: SupabaseClient,
  patternType: string
): Promise<ExtractionPattern[]> {
  const threshold = getThresholdForPatternType(patternType);
  
  const { data, error } = await supabase
    .from('extraction_patterns')
    .select('*')
    .eq('pattern_type', patternType)
    .eq('is_active', true)
    .gte('confidence_score', 0.3) // Lower threshold to allow learning
    .order('priority', { ascending: true }) // Lower priority number = higher precedence
    .order('confidence_score', { ascending: false })
    .limit(20);

  if (error) {
    console.error(`Error fetching patterns for ${patternType}:`, error);
    return [];
  }

  return data || [];
}

/**
 * Update pattern statistics asynchronously (fire and forget)
 * Includes cooldown/deactivation heuristic: if total samples >= 10 and
 * failure rate exceeds ~70%, auto-deactivates the pattern.
 */
async function updatePatternStats(
  supabase: SupabaseClient,
  patternId: string,
  success: boolean
): Promise<void> {
  // Fire and forget - don't await this
  setTimeout(async () => {
    try {
      const { data: pattern } = await supabase
        .from('extraction_patterns')
        .select('success_count, failure_count')
        .eq('id', patternId)
        .single();

      if (pattern) {
        const newSuccessCount = (pattern.success_count || 0) + (success ? 1 : 0);
        const newFailureCount = (pattern.failure_count || 0) + (success ? 0 : 1);
        const totalSamples = newSuccessCount + newFailureCount;
        
        // Cooldown/deactivation heuristic:
        // If we have at least 10 samples and failure rate exceeds ~70%, deactivate
        const failureRate = totalSamples > 0 ? newFailureCount / totalSamples : 0;
        const shouldDeactivate = totalSamples >= 10 && failureRate > 0.7;
        
        const updateData: Record<string, unknown> = {
          success_count: newSuccessCount,
          failure_count: newFailureCount,
          last_used_at: new Date().toISOString(),
        };
        
        if (shouldDeactivate) {
          updateData.is_active = false;
          console.log(
            `Pattern ${patternId} auto-deactivated: failure rate ${(failureRate * 100).toFixed(1)}% ` +
            `(${newFailureCount}/${totalSamples} failures)`
          );
        }
        
        await supabase
          .from('extraction_patterns')
          .update(updateData)
          .eq('id', patternId);
      }
    } catch (e) {
      console.error('Failed to update pattern stats:', e);
    }
  }, 0);
}

/**
 * Try to extract value using learned patterns
 * Returns { value, patternId } if successful, { null, null } if no match
 * Automatically updates pattern success/failure counts asynchronously
 * 
 * @param supabase - Supabase client
 * @param text - Text to extract from
 * @param patternType - Type of pattern to use
 * @param usageLogger - Optional logger for pattern success/failure events
 */
export async function extractWithLearnedPatterns(
  supabase: SupabaseClient,
  text: string,
  patternType: string,
  usageLogger?: PatternUsageLogger
): Promise<{ value: string | null; patternId: string | null }> {
  const patterns = await fetchLearnedPatterns(supabase, patternType);

  if (patterns.length === 0) {
    return { value: null, patternId: null };
  }

  let firstValidPattern: ExtractionPattern | null = null;

  for (const pattern of patterns) {
    try {
      const regex = new RegExp(pattern.pattern_regex, 'gi');
      const match = regex.exec(text);

      if (match) {
        // Extract value from group 1 if present, else from full match
        const value = match[1] || match[0];
        
        // Record success asynchronously
        updatePatternStats(supabase, pattern.id, true);
        
        // Notify usage logger of success
        if (usageLogger) {
          usageLogger.onPatternSuccess(
            pattern.id,
            patternType,
            value.substring(0, 50), // Short preview
            pattern.pattern_description
          );
        }
        
        return {
          value,
          patternId: pattern.id,
        };
      }
      
      // Track first valid pattern for failure recording
      if (!firstValidPattern) {
        firstValidPattern = pattern;
      }
    } catch (e) {
      console.error(`Invalid regex pattern: ${pattern.pattern_regex}`, e);
      // Skip invalid patterns, don't count as failure
    }
  }

  // No patterns matched - record failure for the highest priority valid pattern
  if (firstValidPattern) {
    updatePatternStats(supabase, firstValidPattern.id, false);
    
    // Notify usage logger of failure
    if (usageLogger) {
      usageLogger.onPatternFailure(
        firstValidPattern.id,
        patternType,
        firstValidPattern.pattern_description
      );
    }
  }

  return { value: null, patternId: null };
}

/**
 * Record extraction feedback for learning
 * 
 * Database schema for extraction_feedback table (TODO: Add via migration):
 * CREATE TABLE IF NOT EXISTS public.extraction_feedback (
 *   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   post_id uuid REFERENCES public.instagram_posts(id) ON DELETE CASCADE,
 *   field text NOT NULL,  -- 'price' | 'date' | 'time' | 'venue' | 'vendor' | 'event'
 *   raw_text text NOT NULL,
 *   correct_value text,  -- nullable for vendor/event classification
 *   used_pattern_id uuid REFERENCES public.extraction_patterns(id) ON DELETE SET NULL,
 *   is_correct boolean NOT NULL,
 *   created_at timestamptz DEFAULT now()
 * );
 * CREATE INDEX IF NOT EXISTS idx_extraction_feedback_field ON public.extraction_feedback(field);
 * CREATE INDEX IF NOT EXISTS idx_extraction_feedback_post ON public.extraction_feedback(post_id);
 * CREATE INDEX IF NOT EXISTS idx_extraction_feedback_created ON public.extraction_feedback(created_at DESC);
 */
export interface ExtractionFeedback {
  postId: string;
  field: 'price' | 'date' | 'time' | 'venue' | 'vendor' | 'event';
  rawText: string;
  correctValue?: string | null;
  usedPatternId?: string | null;
  isCorrect: boolean;
}

/**
 * Record extraction feedback for pattern learning
 * This function can be called from admin tools when correcting extracted data
 */
export async function recordExtractionFeedback(
  supabase: SupabaseClient,
  feedback: ExtractionFeedback
): Promise<void> {
  try {
    const { error } = await supabase
      .from('extraction_feedback')
      .insert({
        post_id: feedback.postId,
        field_name: feedback.field,
        original_value: feedback.rawText,
        corrected_value: feedback.correctValue || '',
        pattern_id: feedback.usedPatternId,
        feedback_type: feedback.isCorrect ? 'confirm' : 'correction',
      });

    if (error) {
      console.error('Failed to record extraction feedback:', error);
    }
  } catch (e) {
    console.error('Error recording extraction feedback:', e);
  }
}
