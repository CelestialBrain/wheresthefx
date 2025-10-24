import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PublishEventRequest {
  enrichedEventId: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { enrichedEventId } = await req.json() as PublishEventRequest;

    console.log('Publishing event:', enrichedEventId);

    // Fetch enriched event with all relationships
    const { data: enrichedEvent, error: fetchError } = await supabase
      .from('events_enriched')
      .select(`
        *,
        location:locations(*),
        instagram_post:instagram_posts(
          id,
          image_url,
          likes_count,
          comments_count,
          instagram_account:instagram_accounts(username)
        )
      `)
      .eq('id', enrichedEventId)
      .single();

    if (fetchError) {
      console.error('Failed to fetch enriched event:', fetchError);
      throw new Error(`Event not found: ${fetchError.message}`);
    }

    // Validate required fields
    if (!enrichedEvent.location?.location_lat || !enrichedEvent.location?.location_lng) {
      throw new Error('Event must have valid GPS coordinates before publishing');
    }

    if (!enrichedEvent.event_date) {
      throw new Error('Event must have a date before publishing');
    }

    // Check if already published (prevent duplicates)
    const { data: existing } = await supabase
      .from('published_events')
      .select('id')
      .eq('source_event_id', enrichedEventId)
      .maybeSingle();

    if (existing) {
      console.log('Event already published, updating instead');
      // Update existing
      const { error: updateError } = await supabase
        .from('published_events')
        .update({
          event_title: enrichedEvent.event_title,
          event_date: enrichedEvent.event_date,
          event_time: enrichedEvent.event_time,
          end_time: enrichedEvent.end_time,
          description: enrichedEvent.description,
          signup_url: enrichedEvent.signup_url,
          is_free: enrichedEvent.is_free,
          price: enrichedEvent.price,
          location_lat: enrichedEvent.location.location_lat,
          location_lng: enrichedEvent.location.location_lng,
          location_name: enrichedEvent.location.location_name,
          location_address: enrichedEvent.location.formatted_address,
          image_url: enrichedEvent.instagram_post?.image_url,
          instagram_account_username: enrichedEvent.instagram_post?.instagram_account?.username,
          likes_count: enrichedEvent.instagram_post?.likes_count || 0,
          comments_count: enrichedEvent.instagram_post?.comments_count || 0,
          verified: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({ success: true, eventId: existing.id, action: 'updated' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create new published event
    const { data: published, error: insertError } = await supabase
      .from('published_events')
      .insert({
        event_title: enrichedEvent.event_title,
        event_date: enrichedEvent.event_date,
        event_time: enrichedEvent.event_time,
        end_time: enrichedEvent.end_time,
        description: enrichedEvent.description,
        signup_url: enrichedEvent.signup_url,
        is_free: enrichedEvent.is_free,
        price: enrichedEvent.price,
        location_lat: enrichedEvent.location.location_lat,
        location_lng: enrichedEvent.location.location_lng,
        location_name: enrichedEvent.location.location_name,
        location_address: enrichedEvent.location.formatted_address,
        source_post_id: enrichedEvent.instagram_post_id,
        source_event_id: enrichedEvent.id,
        image_url: enrichedEvent.instagram_post?.image_url,
        instagram_account_username: enrichedEvent.instagram_post?.instagram_account?.username,
        likes_count: enrichedEvent.instagram_post?.likes_count || 0,
        comments_count: enrichedEvent.instagram_post?.comments_count || 0,
        verified: true,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to publish event:', insertError);
      throw insertError;
    }

    // Mark enriched event as published
    await supabase
      .from('events_enriched')
      .update({ 
        status: 'published',
        needs_review: false,
        verified: true,
      })
      .eq('id', enrichedEventId);

    // Mark instagram post as published
    if (enrichedEvent.instagram_post_id) {
      await supabase
        .from('instagram_posts')
        .update({ needs_review: false })
        .eq('id', enrichedEvent.instagram_post_id);
    }

    console.log('Event published successfully:', published.id);

    return new Response(
      JSON.stringify({ success: true, eventId: published.id, action: 'created' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error publishing event:', error);
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