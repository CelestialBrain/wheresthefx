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

    // Step 2: Fetch aggregated log counts by stage and level
    const { data: logs, error: logsError } = await supabase
      .from('scraper_logs')
      .select('log_level, stage, message, data')
      .eq('run_id', runId);

    if (logsError) {
      console.error('Error fetching logs:', logsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch logs' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[analyze-scrape-run] Fetched ${logs.length} logs for analysis`);

    // Step 3: Aggregate data
    const aggregated = aggregateLogs(logs, runId, runData);

    console.log(`[analyze-scrape-run] Aggregated data:`, {
      totalPosts: aggregated.totalPosts,
      eventsDetected: aggregated.metrics.eventsDetected,
      geocodeSuccess: aggregated.metrics.geocodeSuccess,
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

    // Count events detected vs not events
    if (message?.includes('Event detected') || message?.includes('is_event: true')) {
      metrics.eventsDetected++;
    }
    if (message?.includes('Not an event') || message?.includes('is_event: false')) {
      metrics.notEvents++;
    }

    // Geocoding stats
    if (message?.includes('Geocoded venue') || message?.includes('venue matched') || message?.includes('NCR cache hit')) {
      metrics.geocodeSuccess++;
      const venueName = data?.venue || data?.venueName || data?.locationName;
      if (venueName) {
        venueMatchCounts[venueName] = (venueMatchCounts[venueName] || 0) + 1;
      }
    }
    if (message?.includes('No venue match') || message?.includes('geocode failed') || message?.includes('No coordinates')) {
      metrics.geocodeFailures++;
      const venueName = data?.venue || data?.venueName || data?.locationName || data?.extractedVenue;
      if (venueName) {
        failedVenueCounts[venueName] = (failedVenueCounts[venueName] || 0) + 1;
      }
    }

    // Historical rejections
    if (message?.includes('historical') || message?.includes('past event')) {
      metrics.historicalRejected++;
    }

    // Pre-filter skips
    if (stage === 'pre_filter') {
      metrics.preFilterSkipped++;
    }

    // Image storage
    if (message?.includes('Image stored') || message?.includes('image downloaded')) {
      metrics.imagesStored++;
    }
    if (message?.includes('Image failed') || message?.includes('image download failed')) {
      metrics.imagesFailed++;
    }

    // Category breakdown
    if (data?.category) {
      categoryBreakdown[data.category] = (categoryBreakdown[data.category] || 0) + 1;
    }

    // Rejection reasons
    if (stage === 'rejection' || message?.includes('rejected') || message?.includes('skipped')) {
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
  const geocodeRate = data.metrics.geocodeSuccess + data.metrics.geocodeFailures > 0
    ? Math.round((data.metrics.geocodeSuccess / (data.metrics.geocodeSuccess + data.metrics.geocodeFailures)) * 100)
    : 0;
    
  const eventRate = data.metrics.eventsDetected + data.metrics.notEvents > 0
    ? Math.round((data.metrics.eventsDetected / (data.metrics.eventsDetected + data.metrics.notEvents)) * 100)
    : 0;

  const prompt = `You are analyzing a scraper run for an event discovery platform focused on Metro Manila, Philippines.

SCRAPE RUN SUMMARY:
- Run ID: ${data.runId}
- Started: ${data.runStartedAt}
- Status: ${data.runStatus}
- Total posts processed: ${data.totalPosts}

METRICS:
- Events detected: ${data.metrics.eventsDetected} (${eventRate}%)
- Not events: ${data.metrics.notEvents}
- Geocoding success: ${data.metrics.geocodeSuccess} (${geocodeRate}%)
- Geocoding failures: ${data.metrics.geocodeFailures}
- Historical posts rejected: ${data.metrics.historicalRejected}
- Pre-filter skipped: ${data.metrics.preFilterSkipped}
- Images stored: ${data.metrics.imagesStored}
- Images failed: ${data.metrics.imagesFailed}

CATEGORY BREAKDOWN:
${JSON.stringify(data.categoryBreakdown, null, 2)}

TOP SUCCESSFUL VENUE MATCHES:
${data.topVenueMatches.map(v => `- "${v.venue}" (${v.count}x)`).join('\n')}

FAILED VENUE MATCHES (need to add to database):
${data.failedVenueMatches.map(v => `- "${v.venue}" (${v.count}x)`).join('\n')}

REJECTION REASONS:
${data.rejectionReasons.map(r => `- ${r.reason}: ${r.count}`).join('\n')}

VALIDATION WARNINGS:
${data.validationWarnings.map(w => `- ${w.warning}: ${w.count}`).join('\n')}

SAMPLE ERRORS:
${data.sampleLogs.errors.slice(0, 10).map(e => `- ${e.message}`).join('\n')}

SAMPLE WARNINGS:
${data.sampleLogs.warnings.slice(0, 15).map(w => `- ${w.message}`).join('\n')}

Based on this data, provide a comprehensive analysis. Consider:
1. Overall quality assessment
2. What went well vs what needs improvement
3. Specific venues that should be added to known_venues database
4. Any concerning patterns or anomalies
5. Actionable next steps

Return ONLY valid JSON matching this structure:
{
  "overallQuality": "excellent" | "good" | "fair" | "poor",
  "summary": "2-3 sentence summary of the run quality",
  "keyMetrics": {
    "eventDetectionRate": "analysis of ${eventRate}% detection rate",
    "geocodingRate": "analysis of ${geocodeRate}% geocoding success",
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
      overallQuality: geocodeRate >= 90 ? 'excellent' : geocodeRate >= 70 ? 'good' : geocodeRate >= 50 ? 'fair' : 'poor',
      summary: `Processed ${data.totalPosts} posts with ${eventRate}% event detection and ${geocodeRate}% geocoding success.`,
      keyMetrics: {
        eventDetectionRate: `${eventRate}% of posts identified as events`,
        geocodingRate: `${geocodeRate}% venue geocoding success`,
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
