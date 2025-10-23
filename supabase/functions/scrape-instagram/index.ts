import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Interface for instagram-post-scraper actor output
interface InstagramPostScraperOutput {
  id: string;
  shortCode: string;
  type: 'Sidecar' | 'Image' | 'Video';
  caption?: string;
  commentsCount: number;
  dimensionsHeight: number;
  dimensionsWidth: number;
  displayUrl: string;
  likesCount: number;
  timestamp: string;
  locationName?: string | null;
  locationSlug?: string | null;
  ownerFullName?: string;
  ownerUsername: string;
  ownerIsVerified: boolean;
  url: string;
  hashtags?: string[];
  mentions?: string[];
}

// Extract dataset ID from full Apify URL or just the ID
function extractDatasetId(input: string): string {
  const match = input.match(/datasets\/([a-zA-Z0-9]+)/);
  return match ? match[1] : input.trim();
}

// Enhanced event parser for captions
function parseEventFromCaption(caption: string): {
  eventTitle?: string;
  eventDate?: string;
  eventTime?: string;
  locationName?: string;
  locationAddress?: string;
  signupUrl?: string;
  isEvent: boolean;
} {
  if (!caption) {
    return { isEvent: false };
  }

  const lowercaseCaption = caption.toLowerCase();
  
  // Event indicators
  const eventKeywords = [
    'party', 'event', 'happening', 'tonight', 'tomorrow', 'this weekend',
    'join us', 'rsvp', 'free entry', 'entrance', 'tickets', 'doors open',
    'gig', 'concert', 'show', 'performance', 'dj', 'live music',
    'workshop', 'seminar', 'meetup', 'gathering', 'celebration'
  ];
  const isEvent = eventKeywords.some(keyword => lowercaseCaption.includes(keyword));

  if (!isEvent) {
    return { isEvent: false };
  }

  // Extract title (first line or first sentence, max 100 chars)
  const lines = caption.split('\n').filter(line => line.trim());
  const eventTitle = lines[0]?.substring(0, 100) || undefined;

  // Extract URLs (signup links)
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = caption.match(urlRegex);
  const signupUrl = urls?.[0];

  // Enhanced date patterns
  const datePatterns = [
    /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2}(?:st|nd|rd|th)?(?:,? \d{4})?/i,
    /\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/,
    /(?:january|february|march|april|may|june|july|august|september|october|november|december) \d{1,2}(?:st|nd|rd|th)?(?:,? \d{4})?/i,
    /\d{1,2}-\d{1,2}-\d{2,4}/,
  ];
  
  let eventDate: string | undefined;
  for (const pattern of datePatterns) {
    const match = caption.match(pattern);
    if (match) {
      eventDate = match[0];
      break;
    }
  }

  // Enhanced time patterns
  const timePattern = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)?\b/;
  const timeMatch = caption.match(timePattern);
  const eventTime = timeMatch?.[0];

  // Extract location (look for common location indicators)
  const locationPattern = /(?:at|@|location:|venue:|place:)\s*([^\n,]+)/i;
  const locationMatch = caption.match(locationPattern);
  const locationName = locationMatch?.[1]?.trim();

  return {
    eventTitle,
    eventDate,
    eventTime,
    locationName,
    signupUrl,
    isEvent: true,
  };
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const apifyApiKey = Deno.env.get('APIFY_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    let body: { datasetId?: string; automated?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      // No body provided, that's okay
    }

    const rawDatasetId = body.datasetId;
    const isAutomated = body.automated || false;
    const datasetId = rawDatasetId ? extractDatasetId(rawDatasetId) : undefined;

    // Determine run type
    const runType = datasetId ? 'manual_dataset' : (isAutomated ? 'automated' : 'manual_scrape');

    // Create scrape run record
    const { data: scrapeRun, error: runError } = await supabase
      .from('scrape_runs')
      .insert({
        run_type: runType,
        dataset_id: datasetId,
        status: 'running',
      })
      .select()
      .single();

    if (runError) {
      console.error('Failed to create scrape run record:', runError);
    }

    const runId = scrapeRun?.id;

    console.log(`Starting Instagram data import... Run ID: ${runId}, Type: ${runType}`);

    let totalScrapedPosts = 0;
    let totalUpdatedPosts = 0;
    const accountsFound = new Set<string>();

    // MODE 1: Dataset Import
    if (datasetId) {
      console.log(`Fetching data from dataset: ${datasetId}`);
      
      const apifyResponse = await fetch(
        `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyApiKey}`
      );

      if (!apifyResponse.ok) {
        const errorMsg = `Failed to fetch dataset: ${apifyResponse.statusText}`;
        console.error(errorMsg);
        
        if (runId) {
          await supabase.from('scrape_runs').update({
            status: 'failed',
            error_message: errorMsg,
            completed_at: new Date().toISOString(),
          }).eq('id', runId);
        }
        
        throw new Error(errorMsg);
      }

      const apifyData = await apifyResponse.json();
      console.log(`Dataset returned ${apifyData.length} items`);

      const posts: InstagramPostScraperOutput[] = apifyData;

      // Group posts by username and auto-create accounts
      const postsByUsername = new Map<string, InstagramPostScraperOutput[]>();
      for (const post of posts) {
        const username = post.ownerUsername?.toLowerCase();
        if (username) {
          if (!postsByUsername.has(username)) {
            postsByUsername.set(username, []);
          }
          postsByUsername.get(username)!.push(post);
        }
      }

      console.log(`Found ${postsByUsername.size} unique accounts in dataset`);

      // Process posts for each username found
      for (const [username, accountPosts] of postsByUsername.entries()) {
        accountsFound.add(username);
        
        // Check if account exists, if not create it
        let { data: account } = await supabase
          .from('instagram_accounts')
          .select('id')
          .eq('username', username)
          .maybeSingle();

        if (!account) {
          console.log(`Creating new account for @${username}`);
          const firstPost = accountPosts[0];
          const { data: newAccount, error: createError } = await supabase
            .from('instagram_accounts')
            .insert({
              username: username,
              display_name: firstPost.ownerFullName,
              is_verified: firstPost.ownerIsVerified || false,
              is_active: true,
              last_scraped_at: new Date().toISOString(),
            })
            .select('id')
            .single();

          if (createError) {
            console.error(`Failed to create account ${username}:`, createError.message);
            continue;
          }
          account = newAccount;
        } else {
          // Update existing account info
          const firstPost = accountPosts[0];
          await supabase
            .from('instagram_accounts')
            .update({
              display_name: firstPost.ownerFullName,
              is_verified: firstPost.ownerIsVerified || false,
              last_scraped_at: new Date().toISOString(),
            })
            .eq('id', account.id);
        }

        console.log(`Processing ${accountPosts.length} posts for @${username}`);

        // Process each post
        for (const post of accountPosts) {
          const postId = post.id || post.shortCode || 'unknown';
          
          try {
            // Check if post already exists
            const { data: existingPost } = await supabase
              .from('instagram_posts')
              .select('id, likes_count, comments_count')
              .eq('post_id', postId)
              .maybeSingle();

            if (existingPost) {
              // Update likes and comments if they changed
              if (existingPost.likes_count !== post.likesCount || 
                  existingPost.comments_count !== post.commentsCount) {
                await supabase
                  .from('instagram_posts')
                  .update({
                    likes_count: post.likesCount || 0,
                    comments_count: post.commentsCount || 0,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', existingPost.id);
                
                totalUpdatedPosts++;
                console.log(`Updated post ${postId} engagement metrics`);
              } else {
                console.log(`Post ${postId} already exists, no changes`);
              }
              continue;
            }

            // Parse event information from caption
            const eventInfo = parseEventFromCaption(post.caption || '');

            // Insert new post
            const { error: insertError } = await supabase
              .from('instagram_posts')
              .insert({
                instagram_account_id: account.id,
                post_id: postId,
                caption: post.caption,
                post_url: post.url || `https://www.instagram.com/p/${post.shortCode}/`,
                posted_at: post.timestamp,
                likes_count: post.likesCount || 0,
                comments_count: post.commentsCount || 0,
                hashtags: post.hashtags,
                mentions: post.mentions,
                is_event: eventInfo.isEvent,
                event_title: eventInfo.eventTitle,
                event_date: eventInfo.eventDate,
                event_time: eventInfo.eventTime,
                location_name: eventInfo.locationName || post.locationName,
                location_address: eventInfo.locationAddress,
                signup_url: eventInfo.signupUrl,
              });

            if (insertError) {
              console.error(`Failed to insert post ${postId}:`, insertError.message);
            } else {
              totalScrapedPosts++;
              console.log(`Successfully inserted post ${postId}`);
            }
          } catch (postError) {
            console.error(`Error processing post ${postId}:`, postError);
          }
        }
      }
    } else {
      // MODE 2 & 3: Manual or Automated Scraping
      // Get active Instagram accounts
      const { data: accounts, error: accountsError } = await supabase
        .from('instagram_accounts')
        .select('*')
        .eq('is_active', true);

      if (accountsError) {
        throw new Error(`Failed to fetch accounts: ${accountsError.message}`);
      }

      if (!accounts || accounts.length === 0) {
        console.log('No active Instagram accounts configured');
        
        if (runId) {
          await supabase.from('scrape_runs').update({
            status: 'completed',
            completed_at: new Date().toISOString(),
          }).eq('id', runId);
        }
        
        return new Response(
          JSON.stringify({ message: 'No active accounts configured', newPostsAdded: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Found ${accounts.length} active accounts to scrape`);

      // Calculate 30 days ago for filtering
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Scrape each account using instagram-post-scraper actor
      for (const account of accounts) {
        accountsFound.add(account.username);
        
        try {
          console.log(`Scraping account: @${account.username}`);

          const apifyResponse = await fetch(
            `https://api.apify.com/v2/acts/nH2AHrwxeTRJoN5hX/run-sync-get-dataset-items?token=${apifyApiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: [account.username],
                resultsLimit: 5, // Last 5 posts per account
              }),
            }
          );

          if (!apifyResponse.ok) {
            console.error(`Apify error for ${account.username}: ${apifyResponse.statusText}`);
            continue;
          }

          const apifyData = await apifyResponse.json();
          console.log(`Apify returned ${apifyData.length} results for @${account.username}`);

          if (!apifyData || apifyData.length === 0) {
            continue;
          }

          const posts: InstagramPostScraperOutput[] = apifyData;

          // Filter posts from last 30 days
          const recentPosts = posts.filter(post => {
            const postDate = new Date(post.timestamp);
            return postDate >= thirtyDaysAgo;
          });

          console.log(`Processing ${recentPosts.length} recent posts (last 30 days) for @${account.username}`);

          // Update account info
          if (recentPosts.length > 0) {
            const firstPost = recentPosts[0];
            await supabase
              .from('instagram_accounts')
              .update({
                display_name: firstPost.ownerFullName,
                is_verified: firstPost.ownerIsVerified || false,
                last_scraped_at: new Date().toISOString(),
              })
              .eq('id', account.id);
          }

          // Process each post
          for (const post of recentPosts) {
            const postId = post.id || post.shortCode || 'unknown';
            
            try {
              // Check if post already exists
              const { data: existingPost } = await supabase
                .from('instagram_posts')
                .select('id, likes_count, comments_count')
                .eq('post_id', postId)
                .maybeSingle();

              if (existingPost) {
                // Update engagement metrics if changed
                if (existingPost.likes_count !== post.likesCount || 
                    existingPost.comments_count !== post.commentsCount) {
                  await supabase
                    .from('instagram_posts')
                    .update({
                      likes_count: post.likesCount || 0,
                      comments_count: post.commentsCount || 0,
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', existingPost.id);
                  
                  totalUpdatedPosts++;
                  console.log(`Updated post ${postId} engagement metrics`);
                }
                continue;
              }

              // Parse event information
              const eventInfo = parseEventFromCaption(post.caption || '');

              // Insert new post
              const { error: insertError } = await supabase
                .from('instagram_posts')
                .insert({
                  instagram_account_id: account.id,
                  post_id: postId,
                  caption: post.caption,
                  post_url: post.url || `https://www.instagram.com/p/${post.shortCode}/`,
                  posted_at: post.timestamp,
                  likes_count: post.likesCount || 0,
                  comments_count: post.commentsCount || 0,
                  hashtags: post.hashtags,
                  mentions: post.mentions,
                  is_event: eventInfo.isEvent,
                  event_title: eventInfo.eventTitle,
                  event_date: eventInfo.eventDate,
                  event_time: eventInfo.eventTime,
                  location_name: eventInfo.locationName || post.locationName,
                  location_address: eventInfo.locationAddress,
                  signup_url: eventInfo.signupUrl,
                });

              if (insertError) {
                console.error(`Failed to insert post ${postId}:`, insertError.message);
              } else {
                totalScrapedPosts++;
                console.log(`Successfully inserted post ${postId}`);
              }
            } catch (postError) {
              console.error(`Error processing post ${postId}:`, postError);
            }
          }
        } catch (accountError) {
          console.error(`Error scraping account ${account.username}:`, accountError);
        }
      }
    }

    console.log(`Import completed. New posts: ${totalScrapedPosts}, Updated: ${totalUpdatedPosts}`);

    // Update scrape run record
    if (runId) {
      await supabase.from('scrape_runs').update({
        status: 'completed',
        posts_added: totalScrapedPosts,
        posts_updated: totalUpdatedPosts,
        accounts_found: accountsFound.size,
        completed_at: new Date().toISOString(),
      }).eq('id', runId);
    }

    return new Response(
      JSON.stringify({ 
        message: datasetId ? 'Dataset import completed' : 'Scraping completed',
        accountsProcessed: accountsFound.size,
        newPostsAdded: totalScrapedPosts,
        postsUpdated: totalUpdatedPosts,
        datasetId: datasetId || null,
        runId: runId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in scrape-instagram function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    // Update scrape run as failed if we have a runId
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      // Try to extract runId from earlier in the function
      const bodyText = await new Response(req.body).text();
      let runId: string | undefined;
      try {
        const parsedBody = JSON.parse(bodyText);
        // We'd need to track this better, but for now just log the error
      } catch {}
      
      // Log the error for debugging
      console.error('Failed scrape run, error:', errorMessage);
    } catch (updateError) {
      console.error('Failed to update scrape run status:', updateError);
    }
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
