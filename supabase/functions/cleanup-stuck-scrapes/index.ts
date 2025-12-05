import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Cleanup Stuck Scrapes
 * 
 * Marks scrape runs as 'failed' if they've been running without a heartbeat
 * for more than the specified timeout. Can be called manually or via cron.
 * 
 * Logic:
 * - Find all scrape_runs with status = 'running'
 * - Check if last_heartbeat is older than HEARTBEAT_TIMEOUT_MINUTES
 * - Mark those as 'failed' with appropriate error message
 */

// Heartbeat timeout in minutes - runs without heartbeat for this long are considered stuck
const HEARTBEAT_TIMEOUT_MINUTES = 5;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse optional timeout override from request
    let timeoutMinutes = HEARTBEAT_TIMEOUT_MINUTES;
    try {
      const body = await req.json();
      if (body.timeoutMinutes && typeof body.timeoutMinutes === 'number') {
        timeoutMinutes = body.timeoutMinutes;
      }
    } catch {
      // No body or invalid JSON, use defaults
    }

    console.log(`[CleanupStuckScrapes] Looking for runs with no heartbeat for ${timeoutMinutes} minutes`);

    // Calculate the cutoff time
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - timeoutMinutes);
    const cutoffISO = cutoffTime.toISOString();

    // Find stuck runs - running with old heartbeat or null heartbeat
    const { data: stuckRuns, error: selectError } = await supabase
      .from('scrape_runs')
      .select('id, started_at, last_heartbeat, run_type, dataset_id')
      .eq('status', 'running')
      .or(`last_heartbeat.is.null,last_heartbeat.lt.${cutoffISO}`);

    if (selectError) {
      console.error('[CleanupStuckScrapes] Error fetching stuck runs:', selectError.message);
      return new Response(
        JSON.stringify({ error: selectError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!stuckRuns || stuckRuns.length === 0) {
      console.log('[CleanupStuckScrapes] No stuck runs found');
      return new Response(
        JSON.stringify({ 
          message: 'No stuck scrape runs found',
          cleaned: 0,
          cutoffTime: cutoffISO,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[CleanupStuckScrapes] Found ${stuckRuns.length} stuck runs to clean up`);

    // Mark each stuck run as failed
    const cleanedIds: string[] = [];
    for (const run of stuckRuns) {
      const lastHeartbeat = run.last_heartbeat || run.started_at;
      const stuckDuration = Math.round((Date.now() - new Date(lastHeartbeat).getTime()) / 60000);
      
      const errorMessage = run.last_heartbeat 
        ? `Auto-marked as failed: no heartbeat for ${stuckDuration} minutes (last: ${run.last_heartbeat})`
        : `Auto-marked as failed: no heartbeat received since start (${stuckDuration} minutes ago)`;

      const { error: updateError } = await supabase
        .from('scrape_runs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: errorMessage,
        })
        .eq('id', run.id);

      if (updateError) {
        console.error(`[CleanupStuckScrapes] Failed to update run ${run.id}:`, updateError.message);
      } else {
        cleanedIds.push(run.id);
        console.log(`[CleanupStuckScrapes] Marked run ${run.id} as failed (stuck for ${stuckDuration} mins)`);
      }
    }

    return new Response(
      JSON.stringify({
        message: `Cleaned up ${cleanedIds.length} stuck scrape runs`,
        cleaned: cleanedIds.length,
        cleanedIds,
        cutoffTime: cutoffISO,
        timeoutMinutes,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[CleanupStuckScrapes] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
