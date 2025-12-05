/**
 * Generate Patterns from AI Edge Function
 * 
 * This function:
 * 1. Fetches pending pattern_suggestions OR high-confidence ground truth
 * 2. Groups samples by pattern_type (venue, date, time, price, signup_url)
 * 3. Calls Gemini AI to generate regex patterns from examples
 * 4. Validates generated regex against sample texts
 * 5. If success rate >= 70%, adds to extraction_patterns with is_active=true
 * 6. Marks suggestions as processed
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PatternSuggestion {
  id: string;
  pattern_type: string;
  suggested_regex: string;
  sample_text: string;
  expected_value: string;
  status: string;
  created_at: string;
}

interface GroundTruthRecord {
  id: string;
  post_id: string;
  field_name: string;
  ground_truth_value: string;
  source: string;
  created_at: string;
}

interface Sample {
  id: string;
  sample_text: string;
  expected_value: string;
  source: 'suggestion' | 'ground_truth';
}

/**
 * Map field names to pattern types
 */
function fieldNameToPatternType(fieldName: string): string {
  const mapping: Record<string, string> = {
    eventDate: 'date',
    eventEndDate: 'date',
    eventTime: 'time',
    endTime: 'time',
    locationName: 'venue',
    locationAddress: 'address',
    price: 'price',
    signupUrl: 'signup_url',
    event_date: 'date',
    event_time: 'time',
    location_name: 'venue',
    location_address: 'address',
    signup_url: 'signup_url',
  };
  return mapping[fieldName] || fieldName;
}

/**
 * Build prompt for Gemini AI to generate regex from multiple samples
 */
function buildMultiSamplePrompt(patternType: string, samples: Sample[]): string {
  const sampleText = samples.map((s, i) => `
Example ${i + 1}:
Text: "${s.sample_text}"
Correct value: "${s.expected_value}"
`).join('\n');

  return `You are an expert at creating regex patterns for extracting specific data from Instagram event captions.

Given these examples of ${patternType} extraction:

${sampleText}

Generate a regex pattern that would correctly extract these values.

REQUIREMENTS:
1. The regex must capture the target value in GROUP 1 (first capture group)
2. Use JavaScript/ECMAScript regex syntax
3. Be specific enough to avoid false positives
4. Handle variations in formatting (spaces, punctuation)
5. Work with Filipino/English mixed text
6. Escape special regex characters properly

Pattern type guidance:
- For dates: Match formats like "Dec 7", "December 7", "12/7", "7 December", etc.
- For times: Match formats like "7pm", "7:00 PM", "19:00", "7-9pm", etc.
- For prices: Match peso formats (₱500, PHP 500, P500, Php500) and dollar formats
- For URLs: Match http/https patterns and shortened links
- For venues: Look for patterns like "at [Venue]", "📍 [Venue]", "@venue"

Return JSON only, no markdown code blocks:
{
  "regex": "your regex pattern here",
  "description": "human readable description",
  "confidence": 0.X
}`;
}

/**
 * Call Gemini AI to generate a pattern from multiple samples
 */
async function generatePatternFromSamples(
  patternType: string,
  samples: Sample[],
  apiKey: string
): Promise<{ regex: string; description: string; confidence: number } | null> {
  if (samples.length === 0) return null;

  const prompt = buildMultiSamplePrompt(patternType, samples);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 512,
          }
        })
      }
    );

    if (!response.ok) {
      console.error(`Gemini API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textContent) {
      return null;
    }

    // Clean up the response - remove markdown code blocks if present
    let cleaned = textContent.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\w*\s*/, '').replace(/\s*```$/, '');
    }

    try {
      const parsed = JSON.parse(cleaned);
      return {
        regex: parsed.regex,
        description: parsed.description || `AI-generated pattern for ${patternType}`,
        confidence: parsed.confidence || 0.5,
      };
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', cleaned);
      return null;
    }
  } catch (err) {
    console.error('Gemini pattern generation error:', err);
    return null;
  }
}

/**
 * Validate that a regex pattern matches expected values in samples
 */
function validatePatternAgainstSamples(
  pattern: string,
  samples: Sample[]
): { successRate: number; successCount: number; totalCount: number } {
  let successCount = 0;
  const totalCount = samples.length;

  for (const sample of samples) {
    try {
      const regex = new RegExp(pattern, 'gi');
      const match = regex.exec(sample.sample_text);

      if (match) {
        // Check if group 1 or full match contains the expected value
        const extractedValue = match[1] || match[0];
        const normalized1 = extractedValue.toLowerCase().trim();
        const normalized2 = sample.expected_value.toLowerCase().trim();

        // Check for exact or partial match
        if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
          successCount++;
        }
      }
    } catch {
      // Invalid regex
      return { successRate: 0, successCount: 0, totalCount };
    }
  }

  return {
    successRate: totalCount > 0 ? successCount / totalCount : 0,
    successCount,
    totalCount,
  };
}

/**
 * Check if regex is valid
 */
function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern, 'gi');
    return true;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    if (!geminiApiKey) {
      throw new Error('Missing GEMINI_API_KEY');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body for options
    let useGroundTruth = true;
    let useSuggestions = true;
    let minSamplesPerType = 3;
    let minSuccessRate = 0.7;
    
    try {
      const body = await req.json();
      if (typeof body.useGroundTruth === 'boolean') useGroundTruth = body.useGroundTruth;
      if (typeof body.useSuggestions === 'boolean') useSuggestions = body.useSuggestions;
      if (typeof body.minSamplesPerType === 'number') minSamplesPerType = body.minSamplesPerType;
      if (typeof body.minSuccessRate === 'number') minSuccessRate = body.minSuccessRate;
    } catch {
      // No body or invalid JSON - use defaults
    }

    console.log(`[GeneratePatterns] Starting with options: useGroundTruth=${useGroundTruth}, useSuggestions=${useSuggestions}, minSamples=${minSamplesPerType}, minSuccessRate=${minSuccessRate}`);

    // Collect samples from pattern_suggestions (pending status with NEEDS_GENERATION)
    const samplesByType = new Map<string, Sample[]>();

    if (useSuggestions) {
      const { data: suggestions, error: suggestionsError } = await supabase
        .from('pattern_suggestions')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(100);

      if (suggestionsError) {
        console.error('Failed to fetch suggestions:', suggestionsError.message);
      } else if (suggestions) {
        console.log(`[GeneratePatterns] Found ${suggestions.length} pending suggestions`);
        
        for (const suggestion of suggestions as PatternSuggestion[]) {
          if (!suggestion.sample_text || !suggestion.expected_value) continue;
          
          const patternType = suggestion.pattern_type;
          if (!samplesByType.has(patternType)) {
            samplesByType.set(patternType, []);
          }
          
          samplesByType.get(patternType)?.push({
            id: suggestion.id,
            sample_text: suggestion.sample_text,
            expected_value: suggestion.expected_value,
            source: 'suggestion',
          });
        }
      }
    }

    // Collect samples from ground truth
    if (useGroundTruth) {
      const { data: groundTruth, error: groundTruthError } = await supabase
        .from('extraction_ground_truth')
        .select('*')
        .eq('source', 'ai_high_confidence')
        .order('created_at', { ascending: false })
        .limit(200);

      if (groundTruthError) {
        console.error('Failed to fetch ground truth:', groundTruthError.message);
      } else if (groundTruth) {
        console.log(`[GeneratePatterns] Found ${groundTruth.length} ground truth records`);

        // For ground truth, we need to fetch the original caption
        // Group by post_id first to minimize queries
        const postIds = [...new Set((groundTruth as GroundTruthRecord[]).map(gt => gt.post_id))];
        
        // Fetch captions for these posts
        const { data: posts } = await supabase
          .from('instagram_posts')
          .select('post_id, caption')
          .in('post_id', postIds.slice(0, 50)); // Limit to avoid huge queries

        const captionMap = new Map<string, string>();
        if (posts) {
          for (const post of posts) {
            if (post.caption && post.post_id) {
              captionMap.set(post.post_id, post.caption);
            }
          }
        }

        for (const gt of groundTruth as GroundTruthRecord[]) {
          const caption = captionMap.get(gt.post_id);
          if (!caption || !gt.ground_truth_value) continue;

          const patternType = fieldNameToPatternType(gt.field_name);
          if (!samplesByType.has(patternType)) {
            samplesByType.set(patternType, []);
          }

          // Extract a relevant snippet around the value
          const normalizedCaption = caption.toLowerCase();
          const normalizedValue = gt.ground_truth_value.toLowerCase();
          const idx = normalizedCaption.indexOf(normalizedValue);
          
          let snippet = caption;
          if (idx !== -1) {
            const start = Math.max(0, idx - 100);
            const end = Math.min(caption.length, idx + gt.ground_truth_value.length + 100);
            snippet = caption.substring(start, end);
          } else {
            // Value not found directly - use first 300 chars
            snippet = caption.substring(0, 300);
          }

          samplesByType.get(patternType)?.push({
            id: gt.id,
            sample_text: snippet,
            expected_value: gt.ground_truth_value,
            source: 'ground_truth',
          });
        }
      }
    }

    // Log sample counts
    for (const [type, samples] of samplesByType.entries()) {
      console.log(`[GeneratePatterns] ${type}: ${samples.length} samples`);
    }

    // Generate patterns for each type with enough samples
    let patternsGenerated = 0;
    let patternsRejected = 0;
    const results: Array<{ patternType: string; status: string; pattern?: string; reason?: string }> = [];

    for (const [patternType, samples] of samplesByType.entries()) {
      if (samples.length < minSamplesPerType) {
        console.log(`[GeneratePatterns] Skipping ${patternType} - only ${samples.length} samples (need ${minSamplesPerType})`);
        results.push({
          patternType,
          status: 'skipped',
          reason: `Only ${samples.length} samples (need ${minSamplesPerType})`,
        });
        continue;
      }

      // Use up to 10 samples for generation
      const samplesToUse = samples.slice(0, 10);
      
      console.log(`[GeneratePatterns] Generating pattern for ${patternType} from ${samplesToUse.length} samples`);
      
      const generated = await generatePatternFromSamples(patternType, samplesToUse, geminiApiKey);

      if (!generated || !generated.regex) {
        console.log(`[GeneratePatterns] Failed to generate pattern for ${patternType}`);
        results.push({
          patternType,
          status: 'generation_failed',
          reason: 'AI failed to generate pattern',
        });
        patternsRejected++;
        continue;
      }

      if (!isValidRegex(generated.regex)) {
        console.log(`[GeneratePatterns] Invalid regex for ${patternType}: ${generated.regex}`);
        results.push({
          patternType,
          status: 'invalid_regex',
          pattern: generated.regex,
          reason: 'Generated regex is invalid',
        });
        patternsRejected++;
        continue;
      }

      // Validate against all samples
      const validation = validatePatternAgainstSamples(generated.regex, samples);

      if (validation.successRate < minSuccessRate) {
        console.log(`[GeneratePatterns] Pattern for ${patternType} failed validation: ${(validation.successRate * 100).toFixed(1)}% success rate (need ${minSuccessRate * 100}%)`);
        results.push({
          patternType,
          status: 'validation_failed',
          pattern: generated.regex,
          reason: `Only ${(validation.successRate * 100).toFixed(1)}% success rate (need ${minSuccessRate * 100}%)`,
        });
        patternsRejected++;
        continue;
      }

      // Check for duplicate pattern
      const { data: existingPatterns } = await supabase
        .from('extraction_patterns')
        .select('id')
        .eq('pattern_regex', generated.regex)
        .limit(1);

      if (existingPatterns && existingPatterns.length > 0) {
        console.log(`[GeneratePatterns] Pattern already exists for ${patternType}`);
        results.push({
          patternType,
          status: 'duplicate',
          pattern: generated.regex,
          reason: 'Pattern already exists',
        });
        continue;
      }

      // Save to extraction_patterns
      const { error: insertError } = await supabase
        .from('extraction_patterns')
        .insert({
          pattern_type: patternType,
          pattern_regex: generated.regex,
          pattern_description: generated.description,
          confidence_score: Math.min(validation.successRate, generated.confidence),
          source: 'ai_learned', // AI-generated from ground truth and suggestions
          is_active: true, // Enable immediately since it passed validation
          priority: 120, // Medium-high priority (default patterns are 100-150)
          success_count: validation.successCount,
          failure_count: validation.totalCount - validation.successCount,
        });

      if (insertError) {
        console.error(`[GeneratePatterns] Failed to insert pattern: ${insertError.message}`);
        results.push({
          patternType,
          status: 'insert_failed',
          pattern: generated.regex,
          reason: insertError.message,
        });
        patternsRejected++;
        continue;
      }

      console.log(`[GeneratePatterns] ✅ Created pattern for ${patternType}: ${generated.regex} (${(validation.successRate * 100).toFixed(1)}% success)`);
      results.push({
        patternType,
        status: 'created',
        pattern: generated.regex,
      });
      patternsGenerated++;

      // Mark suggestions as processed
      const suggestionIds = samples
        .filter(s => s.source === 'suggestion')
        .map(s => s.id);

      if (suggestionIds.length > 0) {
        await supabase
          .from('pattern_suggestions')
          .update({ status: 'generated' })
          .in('id', suggestionIds);
        
        console.log(`[GeneratePatterns] Marked ${suggestionIds.length} suggestions as generated`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        patternsGenerated,
        patternsRejected,
        totalTypesProcessed: samplesByType.size,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Generate patterns error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
