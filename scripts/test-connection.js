import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

console.log('🔍 Testing connections...\n');

// Test Supabase connection
async function testSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Supabase: SUPABASE_URL and SUPABASE_SERVICE_KEY not set');
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
    
    console.log('✅ Supabase: Connected successfully');
    return true;
  } catch (err) {
    console.error('❌ Supabase:', err.message);
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
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
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
