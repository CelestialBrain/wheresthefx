/**
 * Lightweight Edge Function to Trigger GitHub Actions for Instagram Scrape Processing
 * 
 * This function:
 * 1. Receives dataset_id from admin UI
 * 2. Creates a scrape_run record
 * 3. Triggers GitHub Actions via repository_dispatch
 * 4. Returns run_id for tracking
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const githubToken = Deno.env.get('GITHUB_PAT');
    const githubRepo = Deno.env.get('GITHUB_REPO') || 'CelestialBrain/wheresthefx';

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const body = await req.json();
    const { datasetId } = body;

    if (!datasetId) {
      return new Response(
        JSON.stringify({ error: 'datasetId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!githubToken) {
      return new Response(
        JSON.stringify({ 
          error: 'GITHUB_PAT not configured',
          message: 'Please set the GITHUB_PAT secret in Supabase to enable GitHub Actions triggers'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract clean dataset ID from URL if needed
    const datasetMatch = datasetId.match(/datasets\/([a-zA-Z0-9]+)/);
    const cleanDatasetId = datasetMatch ? datasetMatch[1] : datasetId.trim();

    console.log(`Creating scrape run for dataset: ${cleanDatasetId}`);

    // Create scrape_run record
    const { data: scrapeRun, error: runError } = await supabase
      .from('scrape_runs')
      .insert({
        run_type: 'manual_dataset',
        dataset_id: cleanDatasetId,
        status: 'running',
      })
      .select()
      .single();

    if (runError) {
      console.error('Failed to create scrape run:', runError);
      return new Response(
        JSON.stringify({ error: `Failed to create scrape run: ${runError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const runId = scrapeRun.id;
    console.log(`Created scrape run: ${runId}`);

    // Trigger GitHub Actions via repository_dispatch
    const [owner, repo] = githubRepo.split('/');
    const dispatchUrl = `https://api.github.com/repos/${owner}/${repo}/dispatches`;

    console.log(`Triggering GitHub Actions: ${dispatchUrl}`);

    const dispatchResponse = await fetch(dispatchUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${githubToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: 'process-scrape',
        client_payload: {
          dataset_id: cleanDatasetId,
          run_id: runId,
        },
      }),
    });

    if (!dispatchResponse.ok) {
      const errorText = await dispatchResponse.text();
      console.error(`GitHub dispatch failed: ${dispatchResponse.status} - ${errorText}`);
      
      // Update run as failed
      await supabase
        .from('scrape_runs')
        .update({
          status: 'failed',
          error_message: `GitHub Actions trigger failed: ${dispatchResponse.status}`,
          completed_at: new Date().toISOString(),
        })
        .eq('id', runId);

      return new Response(
        JSON.stringify({ 
          error: 'Failed to trigger GitHub Actions',
          details: errorText,
          status: dispatchResponse.status,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('GitHub Actions triggered successfully');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'GitHub Actions workflow triggered',
        runId,
        datasetId: cleanDatasetId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in trigger-github-scrape:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
