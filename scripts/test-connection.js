import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GITHUB_INGEST_TOKEN = process.env.GITHUB_INGEST_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

console.log('🔍 Testing connections...\n');

// Test Supabase connection (direct DB access)
async function testSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Supabase Direct: SUPABASE_URL and SUPABASE_SERVICE_KEY not set');
    return false;
  }
  
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    // Test query
    const { data, error } = await supabase
      .from('instagram_accounts')
      .select('count')
      .limit(1);
    
    if (error) throw error;
    
    console.log('✅ Supabase Direct: Connected successfully');
    return true;
  } catch (err) {
    console.error('❌ Supabase Direct:', err.message);
    return false;
  }
}

// Test Edge Function with GITHUB_INGEST_TOKEN (ping mode)
async function testEdgeFunctionToken() {
  if (!SUPABASE_URL) {
    console.error('❌ Edge Function Token: SUPABASE_URL not set');
    return false;
  }
  
  if (!GITHUB_INGEST_TOKEN) {
    console.warn('⚠️ Edge Function Token: GITHUB_INGEST_TOKEN not set (skipping)');
    return true; // Not a failure if token is not configured
  }
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/scrape-instagram`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_INGEST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mode: 'ping' }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    if (result.success && result.message === 'pong') {
      console.log('✅ Edge Function Token: Authenticated successfully');
      return true;
    }
    
    throw new Error('Unexpected response from ping');
  } catch (err) {
    console.error('❌ Edge Function Token:', err.message);
    return false;
  }
}

// Test Gemini connection
async function testGemini() {
  if (!GEMINI_API_KEY) {
    console.error('❌ Gemini: GEMINI_API_KEY not set');
    return false;
  }
  
  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    // Simple test prompt
    const result = await model.generateContent('Say "connected" in one word');
    const response = await result.response;
    const text = response.text();
    
    console.log(`✅ Gemini: Connected (response: "${text.trim()}")`);
    return true;
  } catch (err) {
    console.error('❌ Gemini:', err.message);
    return false;
  }
}

async function main() {
  const results = await Promise.all([
    testSupabase(),
    testEdgeFunctionToken(),
    testGemini(),
  ]);
  
  console.log('\n---');
  
  if (results.every(r => r)) {
    console.log('✅ All connections successful!');
    process.exit(0);
  } else {
    console.log('❌ Some connections failed');
    process.exit(1);
  }
}

main();
