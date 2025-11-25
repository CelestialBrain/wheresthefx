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
 * Fetch learned patterns from database, ordered by priority (then confidence)
 * Priority field may not exist yet - gracefully handles both cases
 */
export async function fetchLearnedPatterns(
  supabase: SupabaseClient,
  patternType: string
): Promise<ExtractionPattern[]> {
  const { data, error } = await supabase
    .from('extraction_patterns')
    .select('*')
    .eq('pattern_type', patternType)
    .eq('is_active', true)
    .gte('confidence_score', 0.3) // Lower threshold to allow learning
    .order('priority', { ascending: true, nullsFirst: false }) // Lower priority = higher ranking
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
 */
async function updatePatternStats(
  supabase: SupabaseClient,
  patternId: string,
  success: boolean
): Promise<void> {
  // Fire and forget - don't await this
  setTimeout(async () => {
    try {
      const field = success ? 'success_count' : 'failure_count';
      const { data: pattern } = await supabase
        .from('extraction_patterns')
        .select('success_count, failure_count')
        .eq('id', patternId)
        .single();

      if (pattern) {
        const currentCount = pattern[field] || 0;
        await supabase
          .from('extraction_patterns')
          .update({
            [field]: currentCount + 1,
            last_used_at: new Date().toISOString(),
          })
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
 */
export async function extractWithLearnedPatterns(
  supabase: SupabaseClient,
  text: string,
  patternType: string
): Promise<{ value: string | null; patternId: string | null }> {
  const patterns = await fetchLearnedPatterns(supabase, patternType);

  if (patterns.length === 0) {
    return { value: null, patternId: null };
  }

  let firstValidPattern: string | null = null;

  for (const pattern of patterns) {
    try {
      const regex = new RegExp(pattern.pattern_regex, 'gi');
      const match = regex.exec(text);

      if (match) {
        // Extract value from group 1 if present, else from full match
        const value = match[1] || match[0];
        
        // Record success asynchronously
        updatePatternStats(supabase, pattern.id, true);
        
        return {
          value,
          patternId: pattern.id,
        };
      }
      
      // Track first valid pattern for failure recording
      if (!firstValidPattern) {
        firstValidPattern = pattern.id;
      }
    } catch (e) {
      console.error(`Invalid regex pattern: ${pattern.pattern_regex}`, e);
      // Skip invalid patterns, don't count as failure
    }
  }

  // No patterns matched - record failure for the highest priority valid pattern
  if (firstValidPattern) {
    updatePatternStats(supabase, firstValidPattern, false);
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
        field: feedback.field,
        raw_text: feedback.rawText,
        correct_value: feedback.correctValue,
        used_pattern_id: feedback.usedPatternId,
        is_correct: feedback.isCorrect,
      });

    if (error) {
      console.error('Failed to record extraction feedback:', error);
    }
  } catch (e) {
    console.error('Error recording extraction feedback:', e);
  }
}
