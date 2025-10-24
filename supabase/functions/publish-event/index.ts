import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PublishEventRequest {
  postId: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { postId } = await req.json() as PublishEventRequest;

    console.log('Publishing event from post:', postId);

    // Fetch Instagram post with account details
    const { data: post, error: fetchError } = await supabase
      .from('instagram_posts')
      .select(`
        *,
        instagram_account:instagram_accounts(username)
      `)
      .eq('id', postId)
      .single();

    if (fetchError) {
      console.error('Failed to fetch post:', fetchError);
      throw new Error(`Post not found: ${fetchError.message}`);
    }

    // Validate required fields
    if (!post.location_lat || !post.location_lng) {
      throw new Error('Event must have valid GPS coordinates before publishing');
    }

    if (!post.event_date) {
      throw new Error('Event must have a date before publishing');
    }

    if (!post.event_title) {
      throw new Error('Event must have a title before publishing');
    }

    // Check if already published (prevent duplicates)
    const { data: existing } = await supabase
      .from('published_events')
      .select('id')
      .eq('source_post_id', postId)
      .maybeSingle();

    if (existing) {
      console.log('Event already published, updating instead');
      // Update existing
      const { error: updateError } = await supabase
        .from('published_events')
        .update({
          event_title: post.event_title,
          event_date: post.event_date,
          event_time: post.event_time,
          description: post.caption,
          signup_url: post.signup_url,
          is_free: post.is_free,
          price: post.price,
          location_lat: post.location_lat,
          location_lng: post.location_lng,
          location_name: post.location_name,
          location_address: post.location_address,
          image_url: post.image_url,
          instagram_account_username: post.instagram_account?.username,
          instagram_post_url: post.post_url,
          caption: post.caption,
          topic_label: post.topic_label,
          likes_count: post.likes_count || 0,
          comments_count: post.comments_count || 0,
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
        event_title: post.event_title,
        event_date: post.event_date,
        event_time: post.event_time,
        description: post.caption,
        signup_url: post.signup_url,
        is_free: post.is_free,
        price: post.price,
        location_lat: post.location_lat,
        location_lng: post.location_lng,
        location_name: post.location_name,
        location_address: post.location_address,
        source_post_id: post.id,
        image_url: post.image_url,
        instagram_account_username: post.instagram_account?.username,
        instagram_post_url: post.post_url,
        caption: post.caption,
        topic_label: post.topic_label,
        likes_count: post.likes_count || 0,
        comments_count: post.comments_count || 0,
        verified: true,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to publish event:', insertError);
      throw insertError;
    }

    // Mark instagram post as published
    await supabase
      .from('instagram_posts')
      .update({ needs_review: false })
      .eq('id', postId);

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