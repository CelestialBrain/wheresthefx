import fs from 'fs';
import path from 'path';

const datasetUrl = process.argv[2];

if (!datasetUrl) {
  console.error('❌ Dataset URL required');
  console.error('Usage: node fetch-dataset.js <dataset_url>');
  console.error('Example: node fetch-dataset.js "https://api.apify.com/v2/datasets/ABC123/items?format=json"');
  process.exit(1);
}

async function main() {
  console.log(`📥 Fetching dataset from URL: ${datasetUrl}`);
  
  const response = await fetch(datasetUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
  }
  
  const items = await response.json();
  
  if (!Array.isArray(items)) {
    throw new Error('Dataset did not return an array');
  }
  
  console.log(`✅ Fetched ${items.length} posts`);
  
  const dataDir = path.join(process.cwd(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  
  const filePath = path.join(dataDir, 'posts.json');
  fs.writeFileSync(filePath, JSON.stringify(items, null, 2));
  
  console.log(`💾 Saved to ${filePath}`);
  
  const metaPath = path.join(dataDir, 'metadata.json');
  fs.writeFileSync(metaPath, JSON.stringify({
    datasetUrl,
    totalPosts: items.length,
    fetchedAt: new Date().toISOString(),
  }, null, 2));
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
