import { ApifyClient } from 'apify-client';
import fs from 'fs';
import path from 'path';

const APIFY_API_KEY = process.env.APIFY_API_KEY;
const datasetId = process.argv[2];

if (!datasetId) {
  console.error('❌ Dataset ID required');
  process.exit(1);
}

if (!APIFY_API_KEY) {
  console.error('❌ APIFY_API_KEY not set');
  process.exit(1);
}

async function main() {
  console.log(`📥 Fetching dataset: ${datasetId}`);
  
  const client = new ApifyClient({ token: APIFY_API_KEY });
  const dataset = client.dataset(datasetId);
  
  const { items } = await dataset.listItems();
  
  console.log(`✅ Fetched ${items.length} posts`);
  
  const dataDir = path.join(process.cwd(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  
  const filePath = path.join(dataDir, 'posts.json');
  fs.writeFileSync(filePath, JSON.stringify(items, null, 2));
  
  console.log(`💾 Saved to ${filePath}`);
  
  const metaPath = path.join(dataDir, 'metadata.json');
  fs.writeFileSync(metaPath, JSON.stringify({
    datasetId,
    totalPosts: items.length,
    fetchedAt: new Date().toISOString(),
  }, null, 2));
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
