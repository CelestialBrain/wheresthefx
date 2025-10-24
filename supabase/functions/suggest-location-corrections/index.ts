import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { locationName, locationAddress } = await req.json();

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    console.log('Searching for location corrections:', { locationName, locationAddress });

    // Build query with fuzzy matching using pg_trgm similarity
    let query = supabaseClient
      .from('location_corrections')
      .select('*');

    // If address provided, prioritize street address matching
    if (locationAddress && locationAddress.length > 5) {
      const { data: addressMatches } = await supabaseClient
        .rpc('find_similar_addresses', {
          search_address: locationAddress,
          similarity_threshold: 0.5
        })
        .limit(5);

      if (addressMatches && addressMatches.length > 0) {
        console.log('Found address matches:', addressMatches.length);
        return new Response(
          JSON.stringify({ suggestions: addressMatches }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // If venue name provided, search for venue matches
    if (locationName && locationName.length > 2) {
      const { data: venueMatches } = await supabaseClient
        .rpc('find_similar_venues', {
          search_venue: locationName,
          similarity_threshold: 0.5
        })
        .limit(5);

      if (venueMatches && venueMatches.length > 0) {
        console.log('Found venue matches:', venueMatches.length);
        return new Response(
          JSON.stringify({ suggestions: venueMatches }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // No matches found
    console.log('No matches found');
    return new Response(
      JSON.stringify({ suggestions: [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in suggest-location-corrections:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});