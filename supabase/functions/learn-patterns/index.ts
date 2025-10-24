import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractionCorrection {
  id: string;
  field_name: string;
  corrected_value: string;
  original_ocr_text: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Starting pattern learning process...');

    // Fetch recent corrections (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: corrections, error: correctionsError } = await supabase
      .from('extraction_corrections')
      .select('*')
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    if (correctionsError) {
      throw new Error(`Failed to fetch corrections: ${correctionsError.message}`);
    }

    console.log(`Found ${corrections?.length || 0} corrections to analyze`);

    if (!corrections || corrections.length < 3) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Not enough corrections to learn from (need at least 3)',
          newPatterns: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Group corrections by field type
    const correctionsByField = new Map<string, ExtractionCorrection[]>();
    corrections.forEach((correction: ExtractionCorrection) => {
      if (!correctionsByField.has(correction.field_name)) {
        correctionsByField.set(correction.field_name, []);
      }
      correctionsByField.get(correction.field_name)?.push(correction);
    });

    const newPatterns: any[] = [];

    // Generate patterns for each field
    for (const [fieldName, fieldCorrections] of correctionsByField.entries()) {
      if (fieldCorrections.length < 3) continue;

      console.log(`Analyzing ${fieldCorrections.length} corrections for ${fieldName}`);

      const patterns = generatePatternsFromCorrections(fieldName, fieldCorrections);
      
      // Validate patterns
      const validated = await validatePatterns(patterns, fieldCorrections, supabase);
      newPatterns.push(...validated);
    }

    console.log(`Generated ${newPatterns.length} new patterns`);

    // Insert new patterns
    if (newPatterns.length > 0) {
      const { error: insertError } = await supabase
        .from('extraction_patterns')
        .insert(newPatterns);

      if (insertError) {
        throw new Error(`Failed to insert patterns: ${insertError.message}`);
      }
    }

    // Update confidence scores for existing patterns
    await updateExistingPatternConfidence(supabase);

    return new Response(
      JSON.stringify({
        success: true,
        newPatterns: newPatterns.length,
        analyzedCorrections: corrections.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Pattern learning error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function generatePatternsFromCorrections(
  fieldName: string,
  corrections: ExtractionCorrection[]
): any[] {
  const patterns: any[] = [];
  const patternType = mapFieldToPatternType(fieldName);

  // Analyze value structures
  const structures = corrections.map(c => analyzeValueStructure(c.corrected_value));
  const frequencyMap = new Map<string, number>();

  structures.forEach(struct => {
    frequencyMap.set(struct, (frequencyMap.get(struct) || 0) + 1);
  });

  // Keep structures that appear at least 2 times
  for (const [structure, count] of frequencyMap.entries()) {
    if (count >= 2) {
      const regex = structureToRegex(structure);
      if (regex && isValidRegex(regex)) {
        patterns.push({
          pattern_type: patternType,
          pattern_regex: regex,
          pattern_description: `Learned from ${fieldName} (${count} occurrences)`,
          confidence_score: 0.5,
          source: 'learned',
          is_active: true,
        });
      }
    }
  }

  return patterns;
}

function mapFieldToPatternType(fieldName: string): string {
  const mapping: Record<string, string> = {
    'event_time': 'time',
    'event_date': 'date',
    'location_name': 'venue',
    'price': 'price',
    'signup_url': 'signup_url',
    'location_address': 'address',
  };
  return mapping[fieldName] || 'venue';
}

function analyzeValueStructure(value: string): string {
  return value
    .replace(/\\d+/g, '\\\\d+')
    .replace(/[a-z]+/gi, '[a-zA-Z]+')
    .replace(/\\s+/g, '\\\\s*')
    .replace(/[.]/g, '\\\\.')
    .replace(/[:]/g, ':')
    .replace(/[/]/g, '/')
    .replace(/[-]/g, '-');
}

function structureToRegex(structure: string): string {
  // Add capture groups and make it more flexible
  return `(${structure})`;
}

function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

async function validatePatterns(
  patterns: any[],
  corrections: ExtractionCorrection[],
  supabase: any
): Promise<any[]> {
  const validated: any[] = [];

  for (const pattern of patterns) {
    let successCount = 0;
    const totalTests = corrections.length;

    for (const correction of corrections) {
      try {
        const regex = new RegExp(pattern.pattern_regex, 'gi');
        if (regex.test(correction.corrected_value)) {
          successCount++;
        }
      } catch (e) {
        console.error('Invalid regex during validation:', pattern.pattern_regex);
        break;
      }
    }

    const successRate = successCount / totalTests;
    
    // Keep patterns with >60% success rate
    if (successRate > 0.6) {
      validated.push({
        ...pattern,
        confidence_score: successRate,
        success_count: successCount,
        failure_count: totalTests - successCount,
      });
    }
  }

  return validated;
}

async function updateExistingPatternConfidence(supabase: any) {
  const { data: patterns } = await supabase
    .from('extraction_patterns')
    .select('*')
    .eq('is_active', true);

  if (!patterns) return;

  for (const pattern of patterns) {
    const totalAttempts = pattern.success_count + pattern.failure_count;
    if (totalAttempts > 10) {
      const newConfidence = pattern.success_count / totalAttempts;
      
      // Disable patterns with low confidence after many attempts
      const shouldDisable = totalAttempts > 20 && newConfidence < 0.3;

      await supabase
        .from('extraction_patterns')
        .update({
          confidence_score: newConfidence,
          is_active: !shouldDisable,
        })
        .eq('id', pattern.id);
    }
  }
}
