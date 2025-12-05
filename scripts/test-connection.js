const SUPABASE_URL = process.env.SUPABASE_URL;
const GITHUB_INGEST_TOKEN = process.env.GITHUB_INGEST_TOKEN;

async function main() {
  console.log('🔍 Testing Edge Function connection...\n');
  
  if (!SUPABASE_URL) {
    console.error('❌ SUPABASE_URL not set');
    process.exit(1);
  }
  
  if (!GITHUB_INGEST_TOKEN) {
    console.error('❌ GITHUB_INGEST_TOKEN not set');
    process.exit(1);
  }
  
  console.log(`📡 Supabase URL: ${SUPABASE_URL}`);
  console.log(`🔑 Token: ${GITHUB_INGEST_TOKEN.substring(0, 8)}...`);
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/scrape-instagram`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_INGEST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mode: 'ping' }),
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      console.log('✅ Connection successful!');
      console.log('   Response:', JSON.stringify(data));
    } else {
      console.log(`❌ Connection failed: ${response.status}`);
      console.log('   Response:', JSON.stringify(data));
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Connection error:', err.message);
    process.exit(1);
  }
}

main();
