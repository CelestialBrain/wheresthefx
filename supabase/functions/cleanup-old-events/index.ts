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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting cleanup of old events...');

    // Calculate the cutoff date (yesterday)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const cutoffDate = yesterday.toISOString().split('T')[0];

    console.log(`Deleting events with event_date before ${cutoffDate}`);

    // Delete old instagram_posts
    const { data: deletedPosts, error: postsError } = await supabase
      .from('instagram_posts')
      .delete()
      .lt('event_date', cutoffDate)
      .select('id');

    if (postsError) {
      console.error('Error deleting instagram_posts:', postsError);
      throw postsError;
    }

    const postsDeleted = deletedPosts?.length || 0;
    console.log(`Deleted ${postsDeleted} old Instagram posts`);

    // Delete old events from events table
    const { data: deletedEvents, error: eventsError } = await supabase
      .from('events')
      .delete()
      .lt('event_date', cutoffDate)
      .select('id');

    if (eventsError) {
      console.error('Error deleting events:', eventsError);
      throw eventsError;
    }

    const eventsDeleted = deletedEvents?.length || 0;
    console.log(`Deleted ${eventsDeleted} old events`);

    return new Response(
      JSON.stringify({
        message: 'Cleanup completed successfully',
        instagramPostsDeleted: postsDeleted,
        eventsDeleted: eventsDeleted,
        cutoffDate: cutoffDate,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in cleanup-old-events function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
