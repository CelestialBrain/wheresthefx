/**
 * Generate Pattern Edge Function
 * 
 * Fetches pending pattern suggestions and uses Gemini AI
 * to generate regex patterns from sample text + correct value.
 * Saves generated patterns to extraction_patterns with is_active=false.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PatternSuggestion {
  id: string;
  pattern_type: string;
  raw_text: string;
  correct_value: string;
  status: string;
  generated_pattern: string | null;
  created_at: string;
}

/**
 * Build prompt for Gemini to generate a regex pattern
 */
function buildPatternGenerationPrompt(
  patternType: string,
  rawText: string,
  correctValue: string
): string {
  return `You are an expert at creating regex patterns for extracting specific data from text.

TASK: Generate a regex pattern that extracts "${correctValue}" from text like the sample below.

PATTERN TYPE: ${patternType}

SAMPLE TEXT:
"""
${rawText}
"""

CORRECT VALUE TO EXTRACT: ${correctValue}

REQUIREMENTS:
1. The regex must capture the target value in GROUP 1 (first capture group)
2. Use JavaScript/ECMAScript regex syntax
3. Make the pattern specific enough to avoid false positives
4. Make the pattern flexible enough to handle minor variations
5. Escape special regex characters properly
6. For dates, match common formats (Dec 7, December 7, 12/7, etc.)
7. For times, match formats like 7pm, 7:00 PM, 19:00, etc.
8. For prices, match peso formats (₱500, PHP 500, P500, etc.)
9. For URLs, match http/https patterns
10. For venues, look for patterns like "at [Venue]" or "📍 [Venue]"

Return ONLY the regex pattern as a raw string (no quotes, no /slashes/, no flags).
Example: (?:at|@)\\s+([A-Z][a-zA-Z\\s]+?)(?=\\s*[,\\n]|$)

IMPORTANT: Return ONLY the pattern, nothing else.`;
}

/**
 * Call Gemini API to generate pattern
 */
async function generatePatternWithGemini(
  patternType: string,
  rawText: string,
  correctValue: string,
  apiKey: string
): Promise<string | null> {
  const prompt = buildPatternGenerationPrompt(patternType, rawText, correctValue);

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
            maxOutputTokens: 256,
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

    // Clean up the response - trim whitespace, remove markdown if present
    let pattern = textContent.trim();
    if (pattern.startsWith('```')) {
      pattern = pattern.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
    }
    if (pattern.startsWith('"') && pattern.endsWith('"')) {
      pattern = pattern.slice(1, -1);
    }
    if (pattern.startsWith("'") && pattern.endsWith("'")) {
      pattern = pattern.slice(1, -1);
    }

    return pattern.trim();
  } catch (err) {
    console.error('Gemini pattern generation error:', err);
    return null;
  }
}

/**
 * Validate that a regex pattern is valid and matches the expected value
 */
function validatePattern(pattern: string, rawText: string, correctValue: string): boolean {
  try {
    const regex = new RegExp(pattern, 'gi');
    const match = regex.exec(rawText);

    if (!match) {
      return false;
    }

    // Check if group 1 or full match contains the correct value
    const extractedValue = match[1] || match[0];
    
    // Normalize for comparison
    const normalized1 = extractedValue.toLowerCase().trim();
    const normalized2 = correctValue.toLowerCase().trim();

    // Check for exact or partial match
    return normalized1.includes(normalized2) || normalized2.includes(normalized1);
  } catch {
    // Invalid regex
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

    // Parse request body for optional parameters
    let limit = 10;
    try {
      const body = await req.json();
      if (body.limit && typeof body.limit === 'number') {
        limit = Math.min(body.limit, 50); // Cap at 50
      }
    } catch {
      // No body or invalid JSON - use defaults
    }

    // Fetch pending pattern suggestions
    const { data: suggestions, error: fetchError } = await supabase
      .from('pattern_suggestions')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(limit);

    if (fetchError) {
      throw new Error(`Failed to fetch suggestions: ${fetchError.message}`);
    }

    if (!suggestions || suggestions.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No pending suggestions to process',
          processed: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${suggestions.length} pattern suggestions`);

    let processed = 0;
    let generated = 0;
    let failed = 0;

    for (const suggestion of suggestions as PatternSuggestion[]) {
      processed++;

      // Generate pattern with Gemini
      const pattern = await generatePatternWithGemini(
        suggestion.pattern_type,
        suggestion.raw_text,
        suggestion.correct_value,
        geminiApiKey
      );

      if (!pattern) {
        // Mark as failed
        await supabase
          .from('pattern_suggestions')
          .update({ status: 'rejected' })
          .eq('id', suggestion.id);
        failed++;
        continue;
      }

      // Validate pattern
      const isValid = validatePattern(pattern, suggestion.raw_text, suggestion.correct_value);

      if (!isValid) {
        // Mark as rejected
        await supabase
          .from('pattern_suggestions')
          .update({
            status: 'rejected',
            generated_pattern: pattern, // Save for debugging
          })
          .eq('id', suggestion.id);
        failed++;
        console.log(`Pattern rejected (validation failed): ${pattern}`);
        continue;
      }

      // Save to extraction_patterns with is_active=false
      const { error: insertError } = await supabase
        .from('extraction_patterns')
        .insert({
          pattern_type: suggestion.pattern_type,
          pattern_regex: pattern,
          pattern_description: `Auto-generated from AI extraction (value: ${suggestion.correct_value})`,
          confidence_score: 0.5, // Start with neutral confidence
          source: 'learned',
          is_active: false, // Requires manual approval
          priority: 150, // Lower priority than default patterns
        });

      if (insertError) {
        console.error(`Failed to insert pattern: ${insertError.message}`);
        await supabase
          .from('pattern_suggestions')
          .update({ status: 'rejected' })
          .eq('id', suggestion.id);
        failed++;
        continue;
      }

      // Mark suggestion as generated
      await supabase
        .from('pattern_suggestions')
        .update({
          status: 'generated',
          generated_pattern: pattern,
        })
        .eq('id', suggestion.id);

      generated++;
      console.log(`Generated pattern for ${suggestion.pattern_type}: ${pattern}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        generated,
        failed,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Generate pattern error:', error);
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
