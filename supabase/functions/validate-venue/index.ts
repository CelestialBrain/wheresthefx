import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GeocodeResponse {
  lat?: number;
  lng?: number;
  formatted_address?: string;
  confidence?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { venue, address } = await req.json();
    
    if (!venue) {
      return new Response(
        JSON.stringify({ error: 'Venue name is required' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Construct search query - combine venue and address if available
    const searchQuery = address ? `${venue}, ${address}` : venue;
    
    console.log(`Validating venue: ${searchQuery}`);

    // Call geocode-location function to validate and get coordinates
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    const geocodeResponse = await fetch(`${supabaseUrl}/functions/v1/geocode-location`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ locationName: searchQuery }),
    });

    if (!geocodeResponse.ok) {
      console.error('Geocoding failed:', await geocodeResponse.text());
      return new Response(
        JSON.stringify({ 
          isValid: false,
          error: 'Geocoding service unavailable' 
        }), 
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const geocodeData: GeocodeResponse = await geocodeResponse.json();
    
    // Consider valid if we got coordinates
    const isValid = !!(geocodeData.lat && geocodeData.lng);
    
    return new Response(JSON.stringify({
      isValid,
      lat: geocodeData.lat || null,
      lng: geocodeData.lng || null,
      formattedAddress: geocodeData.formatted_address || null,
      confidence: geocodeData.confidence || 0.5,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Venue validation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        isValid: false,
        error: errorMessage
      }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
