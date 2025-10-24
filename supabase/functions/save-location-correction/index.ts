import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LocationCorrectionRequest {
  eventId: string;
  locationId: string | null;
  correction: {
    venueName: string;
    streetAddress: string;
    lat: number | null;
    lng: number | null;
  };
  originalOCR: {
    venue: string;
    address: string;
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { eventId, locationId, correction, originalOCR } = await req.json() as LocationCorrectionRequest;

    console.log('Saving location correction for event:', eventId);

    let finalLocationId = locationId;

    if (locationId) {
      // Update existing location
      const { error: updateError } = await supabase
        .from('locations')
        .update({
          location_name: correction.venueName,
          formatted_address: correction.streetAddress,
          location_lat: correction.lat,
          location_lng: correction.lng,
          manual_override: true,
          needs_review: false,
          verified: true,
        })
        .eq('id', locationId);

      if (updateError) {
        console.error('Failed to update location:', updateError);
        throw updateError;
      }
    } else {
      // Create new location
      const { data: newLocation, error: insertError } = await supabase
        .from('locations')
        .insert({
          location_name: correction.venueName,
          formatted_address: correction.streetAddress,
          location_lat: correction.lat,
          location_lng: correction.lng,
          manual_override: true,
          needs_review: false,
          verified: true,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Failed to create location:', insertError);
        throw insertError;
      }

      finalLocationId = newLocation.id;

      // Note: No need to update events_enriched as it no longer exists
      // Location will be linked when event is published
    }

    // Save to location_corrections for learning
    const { error: correctionError } = await supabase
      .from('location_corrections')
      .insert({
        original_location_name: originalOCR.venue,
        original_location_address: originalOCR.address,
        corrected_venue_name: correction.venueName,
        corrected_street_address: correction.streetAddress,
        manual_lat: correction.lat,
        manual_lng: correction.lng,
        corrected_by: user.id,
        applied_to_event_id: eventId,
        match_pattern: correction.streetAddress?.toLowerCase().replace(/[^a-z0-9\s]/g, ''),
      });

    if (correctionError) {
      console.warn('Failed to save correction history:', correctionError);
    }

    console.log('Location correction saved successfully');

    return new Response(
      JSON.stringify({ success: true, locationId: finalLocationId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error saving location correction:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});