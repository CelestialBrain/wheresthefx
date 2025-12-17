import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://azdcshjzkcidqmkpxuqz.supabase.co';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceRoleKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function checkStatus() {
  console.log('=== WheresTheFX Status Report ===\n');
  console.log(`Database: ${supabaseUrl}\n`);

  // Check database tables
  const tables = [
    'instagram_posts',
    'instagram_accounts',
    'known_venues',
    'extraction_patterns',
    'geo_configuration',
    'scrape_runs',
    'scraper_logs',
    'events'
  ];

  console.log('📊 Database Tables:\n');

  for (const table of tables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.log(`  ❌ ${table}: Error - ${error.message}`);
      } else {
        console.log(`  ✅ ${table}: ${count} records`);
      }
    } catch (err) {
      console.log(`  ❌ ${table}: ${err.message}`);
    }
  }

  // Check scraper status
  console.log('\n🤖 Scraper Status:\n');

  const { data: lastRun } = await supabase
    .from('scrape_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .single();

  if (lastRun) {
    console.log(`  Last run: ${new Date(lastRun.started_at).toLocaleString()}`);
    console.log(`  Status: ${lastRun.status}`);
    console.log(`  Posts added: ${lastRun.posts_added}`);
    console.log(`  Posts updated: ${lastRun.posts_updated}`);
  } else {
    console.log('  ⚠️  No scrape runs found yet');
    console.log('  💡 Trigger a scrape via GitHub Actions or Admin UI');
  }

  // Check GitHub Actions workflow
  console.log('\n⚙️  GitHub Actions:');
  console.log('  Workflow: .github/workflows/scrape-instagram.yml');
  console.log('  Trigger: Manual (workflow_dispatch)');
  console.log('  To run: Go to https://github.com/CelestialBrain/wheresthefx/actions');

  // Check edge functions
  console.log('\n🔧 Edge Functions:');
  console.log('  Scrape Instagram: https://azdcshjzkcidqmkpxuqz.supabase.co/functions/v1/scrape-instagram');
  console.log('  Requires: DATA_INGEST_TOKEN header');

  // Check recent activity
  const { data: recentPosts } = await supabase
    .from('instagram_posts')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  console.log('\n📅 Recent Activity:');
  if (recentPosts) {
    const lastActivity = new Date(recentPosts.created_at);
    const hoursSince = Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60));
    console.log(`  Last post ingested: ${lastActivity.toLocaleString()} (${hoursSince}h ago)`);
  } else {
    console.log('  ⚠️  No posts in database yet');
  }

  // Check UI deployment
  console.log('\n🌐 Frontend:');
  console.log('  Repo: https://github.com/CelestialBrain/wheresthefx');
  console.log('  Deploy: Via Lovable or Vercel/Netlify');
  console.log('  Latest commit: 0b9868d - Export/Import JSON buttons');

  console.log('\n✅ Status check complete!\n');
}

checkStatus().catch(console.error);
