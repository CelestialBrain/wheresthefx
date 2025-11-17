import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

export interface ExtractionPattern {
  id: string;
  pattern_type: string;
  pattern_regex: string;
  pattern_description: string | null;
  confidence_score: number;
  success_count: number;
  failure_count: number;
  source: string;
}

/**
 * Fetch learned patterns from database, ordered by confidence
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
    .gte('confidence_score', 0.5)
    .order('confidence_score', { ascending: false })
    .limit(10);

  if (error) {
    console.error(`Error fetching patterns for ${patternType}:`, error);
    return [];
  }

  return data || [];
}

/**
 * Try to extract value using learned patterns
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

  for (const pattern of patterns) {
    try {
      const regex = new RegExp(pattern.pattern_regex, 'gi');
      const match = text.match(regex);

      if (match) {
        return {
          value: match[1] || match[0],
          patternId: pattern.id,
        };
      }
    } catch (e) {
      console.error(`Invalid regex pattern: ${pattern.pattern_regex}`, e);
    }
  }

  return { value: null, patternId: null };
}
