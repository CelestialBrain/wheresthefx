const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GeocodeResponse {
  place_id?: string;
  lat: number;
  lng: number;
  formatted_address: string;
  confidence: 'high' | 'medium' | 'low';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { locationName } = await req.json();

    if (!locationName) {
      return new Response(
        JSON.stringify({ error: 'locationName is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Geocoding location: ${locationName}`);

    // Try Google Places API first (most accurate)
    const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    
    if (googleApiKey) {
      try {
        const googleResponse = await fetch(
          `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(locationName)}&inputtype=textquery&fields=place_id,formatted_address,geometry&key=${googleApiKey}`
        );
        
        const googleData = await googleResponse.json();
        
        if (googleData.candidates && googleData.candidates.length > 0) {
          const place = googleData.candidates[0];
          const result: GeocodeResponse = {
            place_id: place.place_id,
            lat: place.geometry.location.lat,
            lng: place.geometry.location.lng,
            formatted_address: place.formatted_address,
            confidence: 'high',
          };
          
          console.log('Google Places API success:', result);
          return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (error) {
        console.error('Google Places API error:', error);
      }
    }

    // Fallback to Nominatim (OpenStreetMap) - Free, no API key needed
    console.log('Falling back to Nominatim API');
    const nominatimResponse = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationName)}&format=json&limit=1`,
      {
        headers: {
          'User-Agent': 'EventMapApp/1.0',
        },
      }
    );

    const nominatimData = await nominatimResponse.json();

    if (nominatimData && nominatimData.length > 0) {
      const place = nominatimData[0];
      const result: GeocodeResponse = {
        place_id: `osm_${place.place_id}`,
        lat: parseFloat(place.lat),
        lng: parseFloat(place.lon),
        formatted_address: place.display_name,
        confidence: place.importance > 0.5 ? 'medium' : 'low',
      };

      console.log('Nominatim API success:', result);
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // No results found
    console.warn('No geocoding results found for:', locationName);
    return new Response(
      JSON.stringify({ 
        error: 'Location not found',
        locationName,
      }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Geocoding error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
