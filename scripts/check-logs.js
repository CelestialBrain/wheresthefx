import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://azdcshjzkcidqmkpxuqz.supabase.co';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceRoleKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function checkLogs() {
  console.log('=== Recent Scraper Logs ===\n');

  // Get recent scrape runs
  const { data: runs, error: runsError } = await supabase
    .from('scrape_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(5);

  if (runsError) {
    console.error('Error fetching runs:', runsError);
  } else {
    console.log(`Recent ${runs.length} scrape runs:\n`);
    runs.forEach((run, i) => {
      console.log(`${i + 1}. Run ${run.id.slice(0, 8)}`);
      console.log(`   Type: ${run.run_type}`);
      console.log(`   Status: ${run.status}`);
      console.log(`   Started: ${new Date(run.started_at).toLocaleString()}`);
      console.log(`   Posts added: ${run.posts_added}, Updated: ${run.posts_updated}`);
      if (run.error_message) {
        console.log(`   ❌ Error: ${run.error_message}`);
      }
      console.log('');
    });
  }

  // Get recent errors from logs
  const { data: errorLogs, error: logsError } = await supabase
    .from('scraper_logs')
    .select('*')
    .eq('log_level', 'error')
    .order('created_at', { ascending: false })
    .limit(10);

  if (logsError) {
    console.error('Error fetching logs:', logsError);
  } else if (errorLogs && errorLogs.length > 0) {
    console.log(`\n=== Recent ${errorLogs.length} Errors ===\n`);
    errorLogs.forEach((log, i) => {
      console.log(`${i + 1}. ${log.stage}: ${log.message}`);
      console.log(`   Time: ${new Date(log.created_at).toLocaleString()}`);
      if (log.error_details) {
        console.log(`   Details: ${JSON.stringify(log.error_details, null, 2)}`);
      }
      console.log('');
    });
  } else {
    console.log('\n✅ No recent errors found\n');
  }

  // Get recent warnings
  const { data: warnings, error: warningsError } = await supabase
    .from('scraper_logs')
    .select('*')
    .eq('log_level', 'warn')
    .order('created_at', { ascending: false })
    .limit(10);

  if (!warningsError && warnings && warnings.length > 0) {
    console.log(`\n=== Recent ${warnings.length} Warnings ===\n`);
    warnings.forEach((log, i) => {
      console.log(`${i + 1}. ${log.stage}: ${log.message}`);
      console.log(`   Time: ${new Date(log.created_at).toLocaleString()}`);
      console.log('');
    });
  }

  // Check latest posts
  const { data: posts, error: postsError } = await supabase
    .from('instagram_posts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (postsError) {
    console.error('Error fetching posts:', postsError);
  } else {
    console.log(`\n=== Recent ${posts?.length || 0} Posts ===\n`);
    posts?.forEach((post, i) => {
      console.log(`${i + 1}. Post ${post.post_id}`);
      console.log(`   Owner: @${post.owner_username}`);
      console.log(`   Created: ${new Date(post.created_at).toLocaleString()}`);
      console.log(`   Timestamp: ${new Date(post.timestamp).toLocaleString()}`);
      console.log('');
    });
  }
}

checkLogs().catch(console.error);
