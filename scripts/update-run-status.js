import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const runId = process.argv[2];
const status = process.argv[3];
const message = process.argv[4];

if (!runId) {
  console.log('⚠️ No run_id provided, skipping status update');
  process.exit(0);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  console.log(`📊 Updating run ${runId} status to: ${status}`);
  
  const updateData = {
    last_heartbeat: new Date().toISOString(),
  };
  
  // Handle status changes
  if (status === 'processing') {
    // Don't change status enum, just update heartbeat
  } else if (status === 'completed') {
    updateData.status = 'completed';
    updateData.completed_at = new Date().toISOString();
  } else if (status === 'failed') {
    updateData.status = 'failed';
    updateData.completed_at = new Date().toISOString();
    updateData.error_message = message || 'Processing failed';
  }
  
  const { error } = await supabase
    .from('scrape_runs')
    .update(updateData)
    .eq('id', runId);
    
  if (error) {
    console.error('❌ Failed to update status:', error.message);
    process.exit(1);
  }
  
  console.log(`✅ Status updated: ${status}${message ? ` - ${message}` : ''}`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
