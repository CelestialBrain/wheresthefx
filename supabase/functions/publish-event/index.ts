import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

interface PublishEventRequest {
  postId: string;
}

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { postId } = await req.json() as PublishEventRequest;

    console.log('Publishing event from post:', postId);

    // Fetch the Instagram post
    const { data: post, error: fetchError } = await supabase
      .from('instagram_posts')
      .select('*')
      .eq('id', postId)
      .single();

    if (fetchError) {
      console.error('Error fetching post:', fetchError);
      throw new Error(`Failed to fetch post: ${fetchError.message}`);
    }

    if (!post) {
      throw new Error('Post not found');
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

    console.log('Post validation passed, fetching Instagram account details');

    // Fetch the actual username from instagram_accounts
    const { data: accountData } = await supabase
      .from('instagram_accounts')
      .select('username')
      .eq('id', post.instagram_account_id)
      .single();

    if (!accountData) {
      console.error('Instagram account not found for id:', post.instagram_account_id);
    }

    console.log('Checking for existing published event');
    const { data: existingEvent } = await supabase
      .from('published_events')
      .select('id')
      .eq('source_post_id', postId)
      .maybeSingle();

    let eventId: string;
    let action: string;

    const eventData = {
      event_title: post.event_title,
      event_date: post.event_date,
      event_time: post.event_time,
      event_end_date: post.event_end_date,
      end_time: post.end_time,
      location_name: post.location_name,
      location_address: post.location_address,
      location_lat: post.location_lat,
      location_lng: post.location_lng,
      description: post.caption,
      signup_url: post.signup_url,
      is_free: post.is_free,
      price: post.price,
      price_min: post.price_min,
      price_max: post.price_max,
      price_notes: post.price_notes,
      event_status: post.event_status || 'confirmed',
      availability_status: post.availability_status || 'available',
      is_recurring: post.is_recurring || false,
      recurrence_pattern: post.recurrence_pattern,
      image_url: post.image_url,
      stored_image_url: post.stored_image_url,
      instagram_post_url: post.post_url,
      instagram_account_username: accountData?.username || null,
      topic_label: post.topic_label,
      category: post.category || 'other',
      likes_count: post.likes_count || 0,
      comments_count: post.comments_count || 0,
      source_post_id: postId,
    };

    if (existingEvent) {
      // Update existing published event
      console.log('Updating existing published event:', existingEvent.id);
      const { error: updateError } = await supabase
        .from('published_events')
        .update(eventData)
        .eq('id', existingEvent.id);

      if (updateError) {
        console.error('Error updating published event:', updateError);
        throw updateError;
      }

      eventId = existingEvent.id;
      action = 'updated';
    } else {
      // Create new published event
      console.log('Creating new published event');
      const { data: newEvent, error: insertError } = await supabase
        .from('published_events')
        .insert(eventData)
        .select('id')
        .single();

      if (insertError) {
        console.error('Error inserting published event:', insertError);
        throw insertError;
      }

      eventId = newEvent.id;
      action = 'created';
    }

    // Mark the Instagram post as reviewed
    const { error: reviewError } = await supabase
      .from('instagram_posts')
      .update({ needs_review: false })
      .eq('id', postId);

    if (reviewError) {
      console.error('Error marking post as reviewed:', reviewError);
      // Don't throw - the event was published successfully
    }

    // Copy event_dates from instagram_posts to published_events
    console.log('Copying event_dates to published event');
    const { data: sourceDates, error: fetchDatesError } = await supabase
      .from('event_dates')
      .select('*')
      .eq('instagram_post_id', postId);

    if (fetchDatesError) {
      console.error('Error fetching source event_dates:', fetchDatesError);
    } else if (sourceDates && sourceDates.length > 0) {
      console.log(`Found ${sourceDates.length} event_dates to copy`);
      
      // Delete any existing dates for this published event
      const { error: deleteDatesError } = await supabase
        .from('event_dates')
        .delete()
        .eq('published_event_id', eventId);

      if (deleteDatesError) {
        console.error('Error deleting existing published event_dates:', deleteDatesError);
      }

      // Insert copied dates with published_event_id
      const publishedDates = sourceDates.map(d => ({
        event_date: d.event_date,
        event_time: d.event_time,
        venue_name: d.venue_name,
        venue_address: d.venue_address,
        published_event_id: eventId,
        instagram_post_id: null, // Clear old reference for published copies
      }));
      
      const { error: insertDatesError } = await supabase
        .from('event_dates')
        .insert(publishedDates);

      if (insertDatesError) {
        console.error('Error inserting published event_dates:', insertDatesError);
      } else {
        console.log(`Copied ${publishedDates.length} event_dates to published event`);
      }
    } else {
      console.log('No event_dates found for this post');
    }

    console.log(`Event ${action} successfully:`, eventId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        eventId, 
        action,
        message: `Event ${action} successfully`
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error in publish-event function:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'An error occurred while publishing the event'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
