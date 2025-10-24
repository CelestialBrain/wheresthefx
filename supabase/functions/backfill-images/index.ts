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

    console.log('Starting image backfill process...');

    // Fetch posts without stored images
    const { data: posts, error: fetchError } = await supabase
      .from('instagram_posts')
      .select('id, post_id, image_url')
      .is('stored_image_url', null)
      .not('image_url', 'is', null)
      .limit(50);

    if (fetchError) {
      throw new Error(`Failed to fetch posts: ${fetchError.message}`);
    }

    if (!posts || posts.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: 'No posts need image backfill',
          processed: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${posts.length} posts needing image storage`);

    let successCount = 0;
    let failCount = 0;

    // Process in batches of 10 to avoid timeouts
    for (const post of posts) {
      try {
        console.log(`Processing post ${post.post_id}...`);
        
        // Download image from Instagram CDN
        const imageResponse = await fetch(post.image_url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        if (!imageResponse.ok) {
          console.error(`Failed to download image for ${post.post_id}: ${imageResponse.status}`);
          failCount++;
          continue;
        }

        const imageBlob = await imageResponse.blob();
        const arrayBuffer = await imageBlob.arrayBuffer();

        // Upload to storage
        const fileName = `instagram-posts/${post.post_id}.jpg`;
        
        const { error: uploadError } = await supabase.storage
          .from('event-images')
          .upload(fileName, arrayBuffer, {
            contentType: 'image/jpeg',
            upsert: true,
          });

        if (uploadError) {
          console.error(`Failed to upload image for ${post.post_id}:`, uploadError);
          failCount++;
          continue;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('event-images')
          .getPublicUrl(fileName);

        // Update post with stored_image_url
        const { error: updateError } = await supabase
          .from('instagram_posts')
          .update({ 
            stored_image_url: urlData.publicUrl,
            ocr_processed: false // Reset OCR flag so it can be reprocessed
          })
          .eq('id', post.id);

        if (updateError) {
          console.error(`Failed to update post ${post.post_id}:`, updateError);
          failCount++;
          continue;
        }

        console.log(`✓ Backfilled image for ${post.post_id}`);
        successCount++;

      } catch (error) {
        console.error(`Error processing post ${post.post_id}:`, error);
        failCount++;
      }
    }

    return new Response(
      JSON.stringify({
        message: 'Image backfill completed',
        total: posts.length,
        success: successCount,
        failed: failCount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Backfill error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
