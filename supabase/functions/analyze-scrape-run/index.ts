/**
 * AI-Powered Scraper Run Analysis
 * 
 * Aggregates log data from a scrape run into a condensed summary (~10-20KB),
 * then sends it to Gemini for intelligent analysis and recommendations.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AggregatedData {
  runId: string;
  runStartedAt: string;
  runCompletedAt: string | null;
  runStatus: string;
  totalPosts: number;
  totalLogs: number;
  metrics: {
    eventsDetected: number;
    notEvents: number;
    geocodeSuccess: number;
    geocodeFailures: number;
    historicalRejected: number;
    preFilterSkipped: number;
    imagesStored: number;
    imagesFailed: number;
  };
  categoryBreakdown: Record<string, number>;
  topVenueMatches: Array<{ venue: string; count: number }>;
  failedVenueMatches: Array<{ venue: string; count: number }>;
  rejectionReasons: Array<{ reason: string; count: number }>;
  validationWarnings: Array<{ warning: string; count: number }>;
  sampleLogs: {
    errors: Array<{ message: string; data: any }>;
    warnings: Array<{ message: string; data: any }>;
    successes: Array<{ message: string; data: any }>;
  };
}

interface AnalysisResult {
  overallQuality: 'excellent' | 'good' | 'fair' | 'poor';
  summary: string;
  keyMetrics: {
    eventDetectionRate: string;
    geocodingRate: string;
    dataQuality: string;
  };
  issues: Array<{
    severity: 'high' | 'medium' | 'low';
    issue: string;
    recommendation: string;
  }>;
  venuesToAdd: string[];
  accountsToReview: string[];
  positives: string[];
  actionItems: string[];
}

// Fetch ALL logs using pagination to bypass 1000-row limit
async function fetchAllLogs(supabase: any, runId: string): Promise<any[]> {
  const allLogs: any[] = [];
  let page = 0;
  const pageSize = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .from('scraper_logs')
      .select('log_level, stage, message, data')
      .eq('run_id', runId)
      .range(page * pageSize, (page + 1) * pageSize - 1);
    
    if (error) throw error;
    if (!data || data.length === 0) break;
    
    allLogs.push(...data);
    if (data.length < pageSize) break;
    page++;
  }
  
  return allLogs;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { runId } = await req.json();

    if (!runId) {
      return new Response(
        JSON.stringify({ error: 'runId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[analyze-scrape-run] Starting analysis for run: ${runId}`);

    // Step 1: Fetch run metadata
    const { data: runData, error: runError } = await supabase
      .from('scrape_runs')
      .select('*')
      .eq('id', runId)
      .single();

    if (runError || !runData) {
      return new Response(
        JSON.stringify({ error: 'Run not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Fetch ALL logs using pagination
    const logs = await fetchAllLogs(supabase, runId);

    console.log(`[analyze-scrape-run] Fetched ${logs.length} logs for analysis (paginated)`);

    // Step 3: Aggregate data
    const aggregated = aggregateLogs(logs, runId, runData);

    console.log(`[analyze-scrape-run] Aggregated data:`, {
      totalLogs: aggregated.totalLogs,
      totalPosts: aggregated.totalPosts,
      eventsDetected: aggregated.metrics.eventsDetected,
      notEvents: aggregated.metrics.notEvents,
      geocodeSuccess: aggregated.metrics.geocodeSuccess,
      geocodeFailures: aggregated.metrics.geocodeFailures,
      failedVenueCount: aggregated.failedVenueMatches.length,
    });

    // Step 4: Call Gemini for analysis
    const analysis = await analyzeWithGemini(aggregated, geminiApiKey);

    console.log(`[analyze-scrape-run] Analysis complete: ${analysis.overallQuality}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        aggregated,
        analysis 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[analyze-scrape-run] Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function aggregateLogs(logs: any[], runId: string, runData: any): AggregatedData {
  const metrics = {
    eventsDetected: 0,
    notEvents: 0,
    geocodeSuccess: 0,
    geocodeFailures: 0,
    historicalRejected: 0,
    preFilterSkipped: 0,
    imagesStored: 0,
    imagesFailed: 0,
  };

  const categoryBreakdown: Record<string, number> = {};
  const venueMatchCounts: Record<string, number> = {};
  const failedVenueCounts: Record<string, number> = {};
  const rejectionCounts: Record<string, number> = {};
  const warningCounts: Record<string, number> = {};
  
  const sampleErrors: Array<{ message: string; data: any }> = [];
  const sampleWarnings: Array<{ message: string; data: any }> = [];
  const sampleSuccesses: Array<{ message: string; data: any }> = [];

  for (const log of logs) {
    const { log_level, stage, message, data } = log;
    const msgLower = message?.toLowerCase() || '';

    // Count events detected - match actual log patterns
    // Patterns: "AI extraction: EVENT", "classified as EVENT"
    if (message?.includes('AI extraction: EVENT') || message?.includes('classified as EVENT')) {
      metrics.eventsDetected++;
    }
    
    // Count not events - match actual log patterns
    // Patterns: "AI extraction: NOT_EVENT", "classified as NOT_EVENT"
    if (message?.includes('AI extraction: NOT_EVENT') || message?.includes('classified as NOT_EVENT')) {
      metrics.notEvents++;
    }

    // Geocoding success - match actual log patterns
    // Stage is 'geocache' with log_level 'success', or message contains specific patterns
    if (stage === 'geocache' && log_level === 'success') {
      metrics.geocodeSuccess++;
      // Extract venue name from message like: [GEOCODE] known_venues exact name match: "Cafe Agapita" → "Cafe Agapita"
      const venueMatch = message?.match(/[""]([^""]+)[""]\s*→/);
      const venueName = venueMatch?.[1] || data?.venue || data?.venueName || data?.locationName;
      if (venueName) {
        venueMatchCounts[venueName] = (venueMatchCounts[venueName] || 0) + 1;
      }
    }
    
    // Geocoding failures - match actual log patterns
    // Pattern: "No venue match found"
    if (message?.includes('No venue match found')) {
      metrics.geocodeFailures++;
      // Extract venue name from message or data
      const venueMatch = message?.match(/No venue match found for:?\s*[""]?([^""]+)[""]?/i);
      const venueName = venueMatch?.[1] || data?.venue || data?.venueName || data?.locationName || data?.extractedVenue;
      if (venueName) {
        failedVenueCounts[venueName] = (failedVenueCounts[venueName] || 0) + 1;
      }
    }

    // Historical rejections - match actual log patterns
    // Pattern: "Historical - event date"
    if (message?.includes('Historical - event date') || message?.includes('historical event')) {
      metrics.historicalRejected++;
    }

    // Pre-filter skips
    if (stage === 'pre_filter') {
      metrics.preFilterSkipped++;
    }

    // Image storage - match actual log patterns
    if (stage === 'image' && log_level === 'success') {
      metrics.imagesStored++;
    }
    if (stage === 'image' && log_level === 'error') {
      metrics.imagesFailed++;
    }

    // Category breakdown from data
    if (data?.category) {
      categoryBreakdown[data.category] = (categoryBreakdown[data.category] || 0) + 1;
    }

    // Rejection reasons
    if (stage === 'rejection' || msgLower.includes('rejected') || msgLower.includes('skipped')) {
      const reason = data?.reason || message?.split(':')[0] || 'unknown';
      rejectionCounts[reason] = (rejectionCounts[reason] || 0) + 1;
    }

    // Validation warnings
    if (data?.validationWarnings && Array.isArray(data.validationWarnings)) {
      for (const warning of data.validationWarnings) {
        warningCounts[warning] = (warningCounts[warning] || 0) + 1;
      }
    }

    // Sample logs by level (limited to prevent payload bloat)
    if (log_level === 'error' && sampleErrors.length < 20) {
      sampleErrors.push({ message, data: data ? JSON.stringify(data).substring(0, 500) : null });
    }
    if (log_level === 'warn' && sampleWarnings.length < 30) {
      sampleWarnings.push({ message, data: data ? JSON.stringify(data).substring(0, 300) : null });
    }
    if (log_level === 'success' && sampleSuccesses.length < 10) {
      sampleSuccesses.push({ message, data: data ? JSON.stringify(data).substring(0, 300) : null });
    }
  }

  // Convert counts to sorted arrays
  const topVenueMatches = Object.entries(venueMatchCounts)
    .map(([venue, count]) => ({ venue, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  const failedVenueMatches = Object.entries(failedVenueCounts)
    .map(([venue, count]) => ({ venue, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);

  const rejectionReasons = Object.entries(rejectionCounts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const validationWarnings = Object.entries(warningCounts)
    .map(([warning, count]) => ({ warning, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    runId,
    runStartedAt: runData.started_at,
    runCompletedAt: runData.completed_at,
    runStatus: runData.status,
    totalPosts: runData.posts_added + runData.posts_updated,
    totalLogs: logs.length,
    metrics,
    categoryBreakdown,
    topVenueMatches,
    failedVenueMatches,
    rejectionReasons,
    validationWarnings,
    sampleLogs: {
      errors: sampleErrors,
      warnings: sampleWarnings,
      successes: sampleSuccesses,
    },
  };
}

async function analyzeWithGemini(data: AggregatedData, apiKey: string): Promise<AnalysisResult> {
  const totalClassified = data.metrics.eventsDetected + data.metrics.notEvents;
  const totalGeocoded = data.metrics.geocodeSuccess + data.metrics.geocodeFailures;
  
  const geocodeRate = totalGeocoded > 0
    ? Math.round((data.metrics.geocodeSuccess / totalGeocoded) * 100)
    : 0;
    
  const eventRate = totalClassified > 0
    ? Math.round((data.metrics.eventsDetected / totalClassified) * 100)
    : 0;

  const prompt = `You are analyzing a scraper run for an event discovery platform focused on Metro Manila, Philippines.

SCRAPE RUN SUMMARY:
- Run ID: ${data.runId}
- Started: ${data.runStartedAt}
- Status: ${data.runStatus}
- Total posts in database: ${data.totalPosts}
- Total logs analyzed: ${data.totalLogs}

METRICS:
- Events detected: ${data.metrics.eventsDetected} (${eventRate}% of classified posts)
- Not events: ${data.metrics.notEvents}
- Geocoding success: ${data.metrics.geocodeSuccess} (${geocodeRate}% of venues)
- Geocoding failures: ${data.metrics.geocodeFailures}
- Historical posts rejected: ${data.metrics.historicalRejected}
- Pre-filter skipped: ${data.metrics.preFilterSkipped}
- Images stored: ${data.metrics.imagesStored}
- Images failed: ${data.metrics.imagesFailed}

CATEGORY BREAKDOWN:
${JSON.stringify(data.categoryBreakdown, null, 2)}

TOP SUCCESSFUL VENUE MATCHES:
${data.topVenueMatches.map(v => `- "${v.venue}" (${v.count}x)`).join('\n') || '(none recorded)'}

FAILED VENUE MATCHES (need to add to database):
${data.failedVenueMatches.map(v => `- "${v.venue}" (${v.count}x)`).join('\n') || '(none)'}

REJECTION REASONS:
${data.rejectionReasons.map(r => `- ${r.reason}: ${r.count}`).join('\n') || '(none)'}

VALIDATION WARNINGS:
${data.validationWarnings.map(w => `- ${w.warning}: ${w.count}`).join('\n') || '(none)'}

SAMPLE ERRORS:
${data.sampleLogs.errors.slice(0, 10).map(e => `- ${e.message}`).join('\n') || '(none)'}

SAMPLE WARNINGS:
${data.sampleLogs.warnings.slice(0, 15).map(w => `- ${w.message}`).join('\n') || '(few warnings)'}

Based on this data, provide a comprehensive analysis. Consider:
1. Overall quality assessment (excellent if geocode>=90% and events>=30%, good if geocode>=70%, fair if geocode>=50%, poor otherwise)
2. What went well vs what needs improvement
3. Specific venues that should be added to known_venues database (from failed matches)
4. Any concerning patterns or anomalies
5. Actionable next steps

Return ONLY valid JSON matching this structure:
{
  "overallQuality": "excellent" | "good" | "fair" | "poor",
  "summary": "2-3 sentence summary of the run quality",
  "keyMetrics": {
    "eventDetectionRate": "analysis of the event detection rate",
    "geocodingRate": "analysis of geocoding success rate",
    "dataQuality": "analysis of overall data quality based on warnings/errors"
  },
  "issues": [
    { "severity": "high|medium|low", "issue": "description", "recommendation": "action" }
  ],
  "venuesToAdd": ["list of venue names from failed matches worth adding"],
  "accountsToReview": ["any accounts with concerning patterns"],
  "positives": ["things that worked well"],
  "actionItems": ["specific next steps to improve"]
}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini API error:', errorText);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const result = await response.json();
  const textContent = result.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!textContent) {
    throw new Error('No content in Gemini response');
  }

  try {
    return JSON.parse(textContent);
  } catch (e) {
    console.error('Failed to parse Gemini response:', textContent);
    // Return a fallback analysis
    return {
      overallQuality: geocodeRate >= 90 && eventRate >= 30 ? 'excellent' : geocodeRate >= 70 ? 'good' : geocodeRate >= 50 ? 'fair' : 'poor',
      summary: `Processed ${data.totalPosts} posts with ${eventRate}% event detection and ${geocodeRate}% geocoding success.`,
      keyMetrics: {
        eventDetectionRate: `${eventRate}% of posts identified as events (${data.metrics.eventsDetected}/${totalClassified})`,
        geocodingRate: `${geocodeRate}% venue geocoding success (${data.metrics.geocodeSuccess}/${totalGeocoded})`,
        dataQuality: `${data.sampleLogs.errors.length} errors, ${data.validationWarnings.length} warning types`,
      },
      issues: data.failedVenueMatches.length > 10 
        ? [{ severity: 'high', issue: `${data.failedVenueMatches.length} unmatched venues`, recommendation: 'Add top venues to database' }]
        : [],
      venuesToAdd: data.failedVenueMatches.slice(0, 10).map(v => v.venue),
      accountsToReview: [],
      positives: geocodeRate >= 80 ? ['Good geocoding coverage'] : [],
      actionItems: data.failedVenueMatches.length > 0 ? ['Add missing venues to known_venues table'] : [],
    };
  }
}
