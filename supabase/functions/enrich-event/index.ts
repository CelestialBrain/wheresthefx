const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { postId } = await req.json();

    if (!postId) {
      return new Response(
        JSON.stringify({ error: 'postId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Enriching event from post: ${postId}`);

    // Fetch the Instagram post
    const { data: post, error: postError } = await supabase
      .from('instagram_posts')
      .select('*')
      .eq('id', postId)
      .single();

    if (postError || !post) {
      console.error('Post not found:', postError);
      return new Response(
        JSON.stringify({ error: 'Post not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!post.is_event) {
      return new Response(
        JSON.stringify({ error: 'Post is not an event' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if event already exists
    const { data: existingEvent } = await supabase
      .from('events_enriched')
      .select('id')
      .eq('instagram_post_id', postId)
      .maybeSingle();

    if (existingEvent) {
      console.log('Event already exists:', existingEvent.id);
      return new Response(
        JSON.stringify({ 
          message: 'Event already exists',
          eventId: existingEvent.id,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let locationId = null;
    let needsReview = false;

    // Handle location if provided
    if (post.location_name) {
      console.log(`Processing location: ${post.location_name}`);

      // Check if location already exists by name
      const { data: existingLocation } = await supabase
        .from('locations')
        .select('id, location_lat, location_lng')
        .ilike('location_name', post.location_name)
        .maybeSingle();

      if (existingLocation) {
        console.log('Using existing location:', existingLocation.id);
        locationId = existingLocation.id;
        
        // If existing location has no coords, mark for review
        if (!existingLocation.location_lat || !existingLocation.location_lng) {
          needsReview = true;
        }
      } else {
        // Create new location
        const locationData: any = {
          location_name: post.location_name,
          location_lat: post.location_lat || null,
          location_lng: post.location_lng || null,
          formatted_address: post.location_address || null,
          needs_review: !post.location_lat || !post.location_lng,
        };

        // Try to geocode if we don't have coordinates
        if (!post.location_lat || !post.location_lng) {
          console.log('Attempting to geocode location...');
          try {
            const geocodeResponse = await supabase.functions.invoke('geocode-location', {
              body: { locationName: post.location_name },
            });

            if (geocodeResponse.data && !geocodeResponse.error) {
              locationData.location_lat = geocodeResponse.data.lat;
              locationData.location_lng = geocodeResponse.data.lng;
              locationData.place_id = geocodeResponse.data.place_id;
              locationData.formatted_address = geocodeResponse.data.formatted_address;
              locationData.needs_review = geocodeResponse.data.confidence === 'low';
              
              console.log('Geocoding successful:', geocodeResponse.data);
            } else {
              console.warn('Geocoding failed:', geocodeResponse.error);
              needsReview = true;
            }
          } catch (geocodeError) {
            console.error('Geocoding error:', geocodeError);
            needsReview = true;
          }
        }

        const { data: newLocation, error: locationError } = await supabase
          .from('locations')
          .insert(locationData)
          .select('id')
          .single();

        if (locationError) {
          console.error('Failed to create location:', locationError);
          needsReview = true;
        } else {
          locationId = newLocation.id;
          console.log('Created new location:', locationId);
        }
      }
    } else {
      // No location provided
      needsReview = true;
    }

    // Check if required event data is missing
    if (!post.event_title || !post.event_date) {
      needsReview = true;
    }

    // Create event record
    const eventData = {
      instagram_post_id: postId,
      event_title: post.event_title || 'Untitled Event',
      event_date: post.event_date,
      event_time: post.event_time || null,
      description: post.caption || null,
      location_id: locationId,
      signup_url: post.signup_url || null,
      is_free: true, // Default to free
      status: needsReview ? 'draft' : 'published',
      needs_review: needsReview,
      likes_count: post.likes_count || 0,
      comments_count: post.comments_count || 0,
    };

    const { data: newEvent, error: eventError } = await supabase
      .from('events_enriched')
      .insert(eventData)
      .select()
      .single();

    if (eventError) {
      console.error('Failed to create event:', eventError);
      return new Response(
        JSON.stringify({ error: 'Failed to create event', details: eventError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Event created successfully:', newEvent.id);

    return new Response(
      JSON.stringify({
        message: 'Event enriched successfully',
        event: newEvent,
        needsReview,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Enrichment error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
