/**
 * Generate Patterns from AI Edge Function - ENHANCED VERSION
 * 
 * This function:
 * 1. Fetches ALL pending pattern_suggestions AND high-confidence ground truth (no limits)
 * 2. Groups samples by pattern_type (date, time, price, signup_url, free)
 * 3. CLUSTERS samples by detected format (e.g., "Dec 7" vs "12/7" for dates)
 * 4. Generates MULTIPLE regex patterns per type (one per format cluster)
 * 5. Validates generated regex against cluster samples
 * 6. If success rate >= 60%, adds to extraction_patterns with is_active=true
 * 7. Includes rate limit handling for Gemini API
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
  original_text: string | null;  // The raw text from caption (e.g., "Dec 6" instead of "2025-12-06")
  source: string;
  created_at: string;
}

interface Sample {
  id: string;
  sample_text: string;
  expected_value: string;
  source: 'suggestion' | 'ground_truth';
  detectedFormat?: string;
}

interface ClusterResult {
  patternType: string;
  cluster: string;
  samplesInCluster: number;
  samplesUsed: number;
  generatedRegex: string | null;
  validationResult: {
    testedAgainst: number;
    matched: number;
    successRate: number;
  } | null;
  status: 'created' | 'validation_failed' | 'generation_failed' | 'invalid_regex' | 'duplicate' | 'skipped';
  reason?: string;
}

// ============================================================
// FORMAT DETECTION - Cluster samples by detected format
// ============================================================

function detectDateFormat(value: string): string {
  const v = value.toLowerCase().trim();
  
  // Filipino months
  if (/^(enero|pebrero|marso|abril|mayo|hunyo|hulyo|agosto|setyembre|oktubre|nobyembre|disyembre)/i.test(v)) {
    return 'filipino_month';
  }
  
  // Month abbreviation first: "Dec 7", "Dec. 7", "December 7"
  if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(v)) {
    return 'month_first';
  }
  
  // Day first with month: "7 Dec", "7th December"
  if (/^\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(v)) {
    return 'day_first';
  }
  
  // Numeric with slash: "12/7", "12/07/2025"
  if (/^\d{1,2}\/\d{1,2}/.test(v)) {
    return 'numeric_slash';
  }
  
  // Numeric with dash: "12-7", "2025-12-07"
  if (/^\d{1,2}-\d{1,2}/.test(v) || /^\d{4}-\d{1,2}-\d{1,2}/.test(v)) {
    return 'numeric_dash';
  }
  
  // Numeric with dot: "12.07", "07.12.2025"
  if (/^\d{1,2}\.\d{1,2}/.test(v)) {
    return 'numeric_dot';
  }
  
  return 'other_date';
}

function detectTimeFormat(value: string): string {
  const v = value.toLowerCase().trim();
  
  // Filipino time: "alas-7", "7 ng gabi"
  if (/alas/i.test(v) || /ng\s*(umaga|gabi|hapon)/i.test(v)) {
    return 'filipino_time';
  }
  
  // 12-hour with AM/PM: "7pm", "7:00 PM", "7:00pm"
  if (/\d{1,2}(:\d{2})?\s*(am|pm)/i.test(v)) {
    return '12h_ampm';
  }
  
  // 24-hour: "19:00", "07:30"
  if (/^([01]?\d|2[0-3]):[0-5]\d$/.test(v)) {
    return '24h';
  }
  
  // Just colon format without AM/PM: "7:00"
  if (/^\d{1,2}:\d{2}/.test(v)) {
    return 'colon_format';
  }
  
  return 'other_time';
}

function detectPriceFormat(value: string): string {
  const v = value.trim();
  
  // Peso sign: "₱500"
  if (/^₱/.test(v)) {
    return 'peso_sign';
  }
  
  // PHP prefix: "PHP 500", "Php500"
  if (/^php/i.test(v)) {
    return 'php_prefix';
  }
  
  // P prefix: "P500"
  if (/^P\d/.test(v)) {
    return 'p_prefix';
  }
  
  // Word "pesos": "500 pesos"
  if (/pesos?/i.test(v)) {
    return 'peso_word';
  }
  
  // Dollar: "$50"
  if (/^\$/.test(v)) {
    return 'dollar';
  }
  
  // Range format: "500-800"
  if (/^\d+-\d+/.test(v)) {
    return 'range';
  }
  
  return 'other_price';
}

function detectFormat(patternType: string, value: string): string {
  switch (patternType) {
    case 'date':
      return detectDateFormat(value);
    case 'time':
      return detectTimeFormat(value);
    case 'price':
      return detectPriceFormat(value);
    case 'signup_url':
      if (/^https?:\/\//i.test(value)) return 'full_url';
      if (/bit\.ly|tinyurl|goo\.gl/i.test(value)) return 'shortener';
      return 'other_url';
    case 'free':
      return 'free_indicator';
    default:
      return 'default';
  }
}

// ============================================================
// FIELD NAME MAPPING
// ============================================================

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

// ============================================================
// AI PROMPT BUILDING - Format-specific guidance
// ============================================================

function buildClusterPrompt(patternType: string, cluster: string, samples: Sample[]): string {
  const sampleText = samples.slice(0, 15).map((s, i) => `
Example ${i + 1}:
Text: "${s.sample_text.substring(0, 200)}"
Correct value: "${s.expected_value}"
`).join('\n');

  // Cluster-specific guidance
  const clusterGuidance: Record<string, Record<string, string>> = {
    date: {
      'month_first': `Pattern for MONTH-FIRST dates like "Dec 7", "December 7th", "Dec. 7":
- Match: (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?\\s*(\\d{1,2})
- Capture the full date in group 1`,
      'day_first': `Pattern for DAY-FIRST dates like "7 Dec", "7th December":
- Match: (\\d{1,2})(?:st|nd|rd|th)?\\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*`,
      'numeric_slash': `Pattern for NUMERIC dates with slash like "12/7", "12/07/2025":
- Match: (\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?`,
      'numeric_dash': `Pattern for NUMERIC dates with dash like "12-7", "2025-12-07":
- Match: (\\d{1,2})-(\\d{1,2})(?:-(\\d{2,4}))? or (\\d{4})-(\\d{1,2})-(\\d{1,2})`,
      'numeric_dot': `Pattern for NUMERIC dates with dot like "12.07", "07.12.2025":
- Match: (\\d{1,2})\\.(\\d{1,2})(?:\\.(\\d{2,4}))?`,
      'filipino_month': `Pattern for FILIPINO month names like "Enero 7", "Disyembre 25":
- Match: (Enero|Pebrero|Marso|Abril|Mayo|Hunyo|Hulyo|Agosto|Setyembre|Oktubre|Nobyembre|Disyembre)\\s*(\\d{1,2})`,
    },
    time: {
      '12h_ampm': `Pattern for 12-HOUR times with AM/PM like "7pm", "7:00 PM":
- Match: (\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|AM|PM)
- CRITICAL: Must have AM/PM indicator`,
      '24h': `Pattern for 24-HOUR times like "19:00", "07:30":
- Match: ([01]?\\d|2[0-3]):([0-5]\\d)
- No AM/PM needed`,
      'colon_format': `Pattern for times with colon like "7:00":
- Match: (\\d{1,2}):(\\d{2})`,
      'filipino_time': `Pattern for FILIPINO times like "alas-7", "7 ng gabi":
- Match: alas-?(\\d{1,2}) or (\\d{1,2})\\s*ng\\s*(umaga|gabi|hapon)`,
    },
    price: {
      'peso_sign': `Pattern for PESO SIGN prices like "₱500", "₱1,500":
- Match: ₱\\s*(\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?)`,
      'php_prefix': `Pattern for PHP PREFIX prices like "PHP 500", "Php500":
- Match: [Pp][Hh][Pp]\\s*(\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?)`,
      'p_prefix': `Pattern for P PREFIX prices like "P500":
- Match: P(\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?)
- CRITICAL: Avoid matching "PM" times`,
      'peso_word': `Pattern for PESO WORD prices like "500 pesos":
- Match: (\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?)\\s*pesos?`,
      'range': `Pattern for PRICE RANGES like "500-800", "₱500-₱1000":
- Match: (?:₱|PHP|P)?(\\d+)\\s*[-–]\\s*(?:₱|PHP|P)?(\\d+)`,
    },
    signup_url: {
      'full_url': `Pattern for FULL URLs like "https://example.com/signup":
- Match: (https?://[^\\s<>"{}|\\\\^\\[\\]]+)`,
      'shortener': `Pattern for URL SHORTENERS like "bit.ly/abc123":
- Match: ((?:bit\\.ly|tinyurl\\.com|goo\\.gl)/[^\\s]+)`,
    },
  };

  const guidance = clusterGuidance[patternType]?.[cluster] || 
    `For ${patternType} (${cluster}): Create a simple pattern that captures the target value`;

  return `You are an expert at creating SIMPLE, PERMISSIVE regex patterns for extracting ${patternType} data from Instagram event captions.

TARGET FORMAT: ${cluster}

${guidance}

CRITICAL RULES:
1. SIMPLER IS BETTER - complex patterns fail more often
2. Use GROUP 1 for capture (first parentheses)
3. AVOID word boundaries (\\b) near emojis - they fail
4. AVOID complex lookaheads/lookbehinds
5. Use character classes [...] instead of complex alternations
6. NEVER include control characters or double-escaped sequences

Given these examples of ${patternType} (${cluster} format):

${sampleText}

Generate a regex pattern specifically for this format cluster.

REQUIREMENTS:
1. Capture target value in GROUP 1 (or full match)
2. JavaScript/ECMAScript syntax
3. Works with messy social media text (emojis, mixed languages)
4. No control characters, no double-escaping like \\\\b

Return JSON only (no markdown code blocks):
{
  "regex": "your simple regex pattern",
  "description": "what this pattern matches",
  "confidence": 0.X
}`;
}

// ============================================================
// GEMINI API CALL WITH RATE LIMITING
// ============================================================

async function generatePatternFromCluster(
  patternType: string,
  cluster: string,
  samples: Sample[],
  apiKey: string,
  retryCount = 0
): Promise<{ regex: string; description: string; confidence: number } | null> {
  if (samples.length === 0) return null;

  const prompt = buildClusterPrompt(patternType, cluster, samples);

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

    // Handle rate limiting
    if (response.status === 429) {
      if (retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
        console.log(`[GeneratePatterns] Rate limited, waiting ${delay}ms before retry ${retryCount + 1}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return generatePatternFromCluster(patternType, cluster, samples, apiKey, retryCount + 1);
      }
      console.error(`[GeneratePatterns] Rate limit exceeded after ${retryCount} retries`);
      return null;
    }

    if (!response.ok) {
      console.error(`[GeneratePatterns] Gemini API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textContent) {
      return null;
    }

    // Clean up the response
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
        description: parsed.description || `AI-generated ${patternType} pattern for ${cluster} format`,
        confidence: parsed.confidence || 0.5,
      };
    } catch (parseError) {
      console.error(`[GeneratePatterns] Failed to parse Gemini response for ${patternType}/${cluster}:`, cleaned);
      return null;
    }
  } catch (err) {
    console.error(`[GeneratePatterns] Gemini error for ${patternType}/${cluster}:`, err);
    return null;
  }
}

// ============================================================
// VALIDATION
// ============================================================

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
        const extractedValue = match[1] || match[0];
        const normalized1 = extractedValue.toLowerCase().trim();
        const normalized2 = sample.expected_value.toLowerCase().trim();

        if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
          successCount++;
        }
      }
    } catch {
      return { successRate: 0, successCount: 0, totalCount };
    }
  }

  return {
    successRate: totalCount > 0 ? successCount / totalCount : 0,
    successCount,
    totalCount,
  };
}

function isValidRegex(pattern: string): { valid: boolean; error?: string } {
  // Check for control characters
  for (let i = 0; i < pattern.length; i++) {
    const charCode = pattern.charCodeAt(i);
    if (charCode >= 0 && charCode <= 31 && charCode !== 10 && charCode !== 13) {
      return { 
        valid: false, 
        error: `Control character (ASCII ${charCode}) at position ${i}` 
      };
    }
  }

  // Check for double-escaped sequences
  if (pattern.includes('\\\\b') || pattern.includes('\\\\d') || pattern.includes('\\\\s')) {
    return {
      valid: false,
      error: 'Double-escaped sequences detected'
    };
  }

  try {
    new RegExp(pattern, 'gi');
    return { valid: true };
  } catch (e) {
    return { 
      valid: false, 
      error: `Invalid regex: ${e instanceof Error ? e.message : 'Unknown'}` 
    };
  }
}

// ============================================================
// MAIN HANDLER
// ============================================================

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

    // Parse options
    let useGroundTruth = true;
    let useSuggestions = true;
    let minSamplesPerCluster = 2;  // Lower threshold for clusters
    let minSuccessRate = 0.6;      // Lowered from 0.7 for cluster-specific patterns
    
    try {
      const body = await req.json();
      if (typeof body.useGroundTruth === 'boolean') useGroundTruth = body.useGroundTruth;
      if (typeof body.useSuggestions === 'boolean') useSuggestions = body.useSuggestions;
      if (typeof body.minSamplesPerCluster === 'number') minSamplesPerCluster = body.minSamplesPerCluster;
      if (typeof body.minSuccessRate === 'number') minSuccessRate = body.minSuccessRate;
    } catch {
      // Use defaults
    }

    console.log(`[GeneratePatterns] ========================================`);
    console.log(`[GeneratePatterns] ENHANCED VERSION - Starting pattern generation`);
    console.log(`[GeneratePatterns] Options: groundTruth=${useGroundTruth}, suggestions=${useSuggestions}, minSamples=${minSamplesPerCluster}, minSuccess=${minSuccessRate}`);

    const SKIP_PATTERN_TYPES = ['venue', 'address'];
    const samplesByType = new Map<string, Sample[]>();

    // ========== FETCH ALL SUGGESTIONS (NO LIMIT) ==========
    if (useSuggestions) {
      const { data: suggestions, error: suggestionsError } = await supabase
        .from('pattern_suggestions')
        .select('*')
        .eq('status', 'pending')
        .lt('attempt_count', 3)
        .order('created_at', { ascending: false });  // NO LIMIT

      if (suggestionsError) {
        console.error('[GeneratePatterns] Failed to fetch suggestions:', suggestionsError.message);
      } else if (suggestions) {
        console.log(`[GeneratePatterns] Fetched ALL ${suggestions.length} pending suggestions`);
        
        for (const suggestion of suggestions as PatternSuggestion[]) {
          if (!suggestion.sample_text || !suggestion.expected_value) continue;
          
          const patternType = fieldNameToPatternType(suggestion.pattern_type);
          if (!samplesByType.has(patternType)) {
            samplesByType.set(patternType, []);
          }
          
          const sample: Sample = {
            id: suggestion.id,
            sample_text: suggestion.sample_text,
            expected_value: suggestion.expected_value,
            source: 'suggestion',
            detectedFormat: detectFormat(patternType, suggestion.expected_value),
          };
          
          samplesByType.get(patternType)?.push(sample);
        }
      }
    }

    // ========== FETCH ALL GROUND TRUTH WITH ORIGINAL_TEXT (NO LIMIT) ==========
    if (useGroundTruth) {
      const { data: groundTruth, error: groundTruthError } = await supabase
        .from('extraction_ground_truth')
        .select('*')
        .eq('source', 'ai_high_confidence')
        .order('created_at', { ascending: false });  // NO LIMIT

      if (groundTruthError) {
        console.error('[GeneratePatterns] Failed to fetch ground truth:', groundTruthError.message);
      } else if (groundTruth) {
        console.log(`[GeneratePatterns] Fetched ALL ${groundTruth.length} ground truth records`);

        // Count records WITH original_text (the ones useful for pattern generation)
        const withOriginalText = (groundTruth as GroundTruthRecord[]).filter(gt => gt.original_text);
        console.log(`[GeneratePatterns] ${withOriginalText.length} records have original_text (${Math.round(withOriginalText.length / groundTruth.length * 100)}%)`);

        // Only fetch captions for records WITHOUT original_text (legacy fallback)
        const recordsWithoutOriginal = (groundTruth as GroundTruthRecord[]).filter(gt => !gt.original_text);
        const postIds = [...new Set(recordsWithoutOriginal.map(gt => gt.post_id))];
        
        const captionMap = new Map<string, string>();
        if (postIds.length > 0) {
          console.log(`[GeneratePatterns] Fetching captions for ${postIds.length} posts without original_text`);
          for (let i = 0; i < postIds.length; i += 200) {
            const batch = postIds.slice(i, i + 200);
            const { data: posts } = await supabase
              .from('instagram_posts')
              .select('post_id, caption')
              .in('post_id', batch);

            if (posts) {
              for (const post of posts) {
                if (post.caption && post.post_id) {
                  captionMap.set(post.post_id, post.caption);
                }
              }
            }
          }
        }

        for (const gt of groundTruth as GroundTruthRecord[]) {
          if (!gt.ground_truth_value) continue;

          const patternType = fieldNameToPatternType(gt.field_name);
          if (!samplesByType.has(patternType)) {
            samplesByType.set(patternType, []);
          }

          // PREFER original_text (the raw caption text like "Dec 6")
          // This is what we want to generate patterns for!
          let sampleText: string;
          let expectedValue: string;
          
          if (gt.original_text) {
            // Use original_text as BOTH sample and expected value
            // The pattern should match this exact text!
            sampleText = gt.original_text;
            expectedValue = gt.original_text;  // Use original for matching, not normalized
          } else {
            // Fallback for legacy records without original_text
            const caption = captionMap.get(gt.post_id);
            if (!caption) continue;
            
            const normalizedCaption = caption.toLowerCase();
            const normalizedValue = gt.ground_truth_value.toLowerCase();
            const idx = normalizedCaption.indexOf(normalizedValue);
            
            if (idx !== -1) {
              const start = Math.max(0, idx - 100);
              const end = Math.min(caption.length, idx + gt.ground_truth_value.length + 100);
              sampleText = caption.substring(start, end);
            } else {
              sampleText = caption.substring(0, 300);
            }
            expectedValue = gt.ground_truth_value;
          }

          const sample: Sample = {
            id: gt.id,
            sample_text: sampleText,
            expected_value: expectedValue,
            source: 'ground_truth',
            // Detect format from original_text (raw) not normalized value
            detectedFormat: detectFormat(patternType, gt.original_text || gt.ground_truth_value),
          };

          samplesByType.get(patternType)?.push(sample);
        }
      }
    }

    // Log totals by type
    console.log(`[GeneratePatterns] ----------------------------------------`);
    console.log(`[GeneratePatterns] SAMPLE TOTALS BY TYPE:`);
    for (const [type, samples] of samplesByType.entries()) {
      console.log(`[GeneratePatterns]   ${type}: ${samples.length} total samples`);
    }

    // ========== PROCESS EACH TYPE WITH CLUSTERING ==========
    let patternsGenerated = 0;
    let patternsRejected = 0;
    let clustersProcessed = 0;
    const results: ClusterResult[] = [];

    for (const [patternType, samples] of samplesByType.entries()) {
      // Skip venue/address
      if (SKIP_PATTERN_TYPES.includes(patternType)) {
        console.log(`[GeneratePatterns] Skipping ${patternType} - handled by AI + known_venues`);
        
        const suggestionIds = samples.filter(s => s.source === 'suggestion').map(s => s.id);
        if (suggestionIds.length > 0) {
          await supabase
            .from('pattern_suggestions')
            .update({ status: 'not_applicable' })
            .in('id', suggestionIds);
          console.log(`[GeneratePatterns] Marked ${suggestionIds.length} ${patternType} suggestions as not_applicable`);
        }
        
        results.push({
          patternType,
          cluster: 'all',
          samplesInCluster: samples.length,
          samplesUsed: 0,
          generatedRegex: null,
          validationResult: null,
          status: 'skipped',
          reason: 'Handled by AI + known_venues DB',
        });
        continue;
      }

      // ========== CLUSTER BY FORMAT ==========
      const clusters = new Map<string, Sample[]>();
      for (const sample of samples) {
        const format = sample.detectedFormat || 'other';
        if (!clusters.has(format)) {
          clusters.set(format, []);
        }
        clusters.get(format)?.push(sample);
      }

      console.log(`[GeneratePatterns] ----------------------------------------`);
      console.log(`[GeneratePatterns] ${patternType.toUpperCase()} - ${clusters.size} format clusters:`);
      for (const [cluster, clusterSamples] of clusters.entries()) {
        console.log(`[GeneratePatterns]   ${cluster}: ${clusterSamples.length} samples`);
      }

      // Process each cluster
      for (const [cluster, clusterSamples] of clusters.entries()) {
        clustersProcessed++;
        
        if (clusterSamples.length < minSamplesPerCluster) {
          console.log(`[GeneratePatterns] Skipping ${patternType}/${cluster} - only ${clusterSamples.length} samples`);
          results.push({
            patternType,
            cluster,
            samplesInCluster: clusterSamples.length,
            samplesUsed: 0,
            generatedRegex: null,
            validationResult: null,
            status: 'skipped',
            reason: `Only ${clusterSamples.length} samples (need ${minSamplesPerCluster})`,
          });
          continue;
        }

        // Use up to 25 samples for generation
        const samplesToUse = clusterSamples.slice(0, 25);
        
        console.log(`[GeneratePatterns] Generating pattern for ${patternType}/${cluster} from ${samplesToUse.length} samples...`);
        
        // Add delay between Gemini calls to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const generated = await generatePatternFromCluster(patternType, cluster, samplesToUse, geminiApiKey);

        if (!generated || !generated.regex) {
          console.log(`[GeneratePatterns] ❌ Failed to generate for ${patternType}/${cluster}`);
          results.push({
            patternType,
            cluster,
            samplesInCluster: clusterSamples.length,
            samplesUsed: samplesToUse.length,
            generatedRegex: null,
            validationResult: null,
            status: 'generation_failed',
            reason: 'AI failed to generate pattern',
          });
          patternsRejected++;
          continue;
        }

        // Validate regex syntax
        const regexValidation = isValidRegex(generated.regex);
        if (!regexValidation.valid) {
          console.log(`[GeneratePatterns] ❌ Invalid regex for ${patternType}/${cluster}: ${regexValidation.error}`);
          results.push({
            patternType,
            cluster,
            samplesInCluster: clusterSamples.length,
            samplesUsed: samplesToUse.length,
            generatedRegex: generated.regex,
            validationResult: null,
            status: 'invalid_regex',
            reason: regexValidation.error,
          });
          patternsRejected++;
          continue;
        }

        // Validate against cluster samples (not all samples)
        const validation = validatePatternAgainstSamples(generated.regex, clusterSamples);

        if (validation.successRate < minSuccessRate) {
          console.log(`[GeneratePatterns] ❌ ${patternType}/${cluster} failed validation: ${(validation.successRate * 100).toFixed(1)}% (need ${minSuccessRate * 100}%)`);
          results.push({
            patternType,
            cluster,
            samplesInCluster: clusterSamples.length,
            samplesUsed: samplesToUse.length,
            generatedRegex: generated.regex,
            validationResult: {
              testedAgainst: validation.totalCount,
              matched: validation.successCount,
              successRate: validation.successRate,
            },
            status: 'validation_failed',
            reason: `${(validation.successRate * 100).toFixed(1)}% success rate`,
          });
          patternsRejected++;
          continue;
        }

        // Check for duplicate
        const { data: existingPatterns } = await supabase
          .from('extraction_patterns')
          .select('id')
          .eq('pattern_regex', generated.regex)
          .limit(1);

        if (existingPatterns && existingPatterns.length > 0) {
          console.log(`[GeneratePatterns] ⚠️ Duplicate pattern for ${patternType}/${cluster}`);
          results.push({
            patternType,
            cluster,
            samplesInCluster: clusterSamples.length,
            samplesUsed: samplesToUse.length,
            generatedRegex: generated.regex,
            validationResult: {
              testedAgainst: validation.totalCount,
              matched: validation.successCount,
              successRate: validation.successRate,
            },
            status: 'duplicate',
            reason: 'Pattern already exists in database',
          });
          continue;
        }

        // Insert new pattern
        const { error: insertError } = await supabase
          .from('extraction_patterns')
          .insert({
            pattern_type: patternType,
            pattern_regex: generated.regex,
            pattern_description: `${generated.description} [${cluster} format]`,
            confidence_score: Math.min(validation.successRate, generated.confidence),
            source: 'ai_learned',
            is_active: true,
            priority: 120,
            success_count: validation.successCount,
            failure_count: validation.totalCount - validation.successCount,
          });

        if (insertError) {
          console.error(`[GeneratePatterns] ❌ Insert failed for ${patternType}/${cluster}: ${insertError.message}`);
          results.push({
            patternType,
            cluster,
            samplesInCluster: clusterSamples.length,
            samplesUsed: samplesToUse.length,
            generatedRegex: generated.regex,
            validationResult: {
              testedAgainst: validation.totalCount,
              matched: validation.successCount,
              successRate: validation.successRate,
            },
            status: 'validation_failed',
            reason: `DB insert failed: ${insertError.message}`,
          });
          patternsRejected++;
          continue;
        }

        console.log(`[GeneratePatterns] ✅ CREATED: ${patternType}/${cluster} - ${(validation.successRate * 100).toFixed(1)}% success`);
        console.log(`[GeneratePatterns]    Regex: ${generated.regex}`);
        
        results.push({
          patternType,
          cluster,
          samplesInCluster: clusterSamples.length,
          samplesUsed: samplesToUse.length,
          generatedRegex: generated.regex,
          validationResult: {
            testedAgainst: validation.totalCount,
            matched: validation.successCount,
            successRate: validation.successRate,
          },
          status: 'created',
        });
        patternsGenerated++;

        // Mark suggestions as processed
        const suggestionIds = clusterSamples
          .filter(s => s.source === 'suggestion')
          .map(s => s.id);

        if (suggestionIds.length > 0) {
          await supabase
            .from('pattern_suggestions')
            .update({ status: 'generated' })
            .in('id', suggestionIds);
        }
      }
    }

    // ========== FINAL SUMMARY ==========
    console.log(`[GeneratePatterns] ========================================`);
    console.log(`[GeneratePatterns] FINAL SUMMARY:`);
    console.log(`[GeneratePatterns]   Patterns Generated: ${patternsGenerated}`);
    console.log(`[GeneratePatterns]   Patterns Rejected: ${patternsRejected}`);
    console.log(`[GeneratePatterns]   Clusters Processed: ${clustersProcessed}`);
    console.log(`[GeneratePatterns]   Total Types: ${samplesByType.size}`);
    console.log(`[GeneratePatterns] ========================================`);

    return new Response(
      JSON.stringify({
        success: true,
        patternsGenerated,
        patternsRejected,
        clustersProcessed,
        totalTypes: samplesByType.size,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[GeneratePatterns] Fatal error:', error);
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
