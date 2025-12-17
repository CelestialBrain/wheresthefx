#!/usr/bin/env node

/**
 * Seed known venues from SQL file into Supabase
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://azdcshjzkcidqmkpxuqz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_KEY) {
  console.error('❌ SUPABASE_KEY not set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Parse SQL INSERT statements from the seed file
function parseSQLInserts(sqlContent) {
  const venues = [];

  // Match all INSERT INTO statements
  const insertRegex = /INSERT INTO public\.known_venues \(name, aliases, address, city, lat, lng\) VALUES\s*([\s\S]*?)(?:ON CONFLICT|;)/gi;

  let match;
  while ((match = insertRegex.exec(sqlContent)) !== null) {
    const valuesBlock = match[1];

    // Parse individual value rows: ('Name', ARRAY['alias1', 'alias2'], 'Address', 'City', lat, lng)
    const rowRegex = /\('([^']+)',\s*ARRAY\[((?:'[^']*'(?:,\s*'[^']*')*)?)\],\s*(?:'([^']*)'|NULL),\s*'([^']*)',\s*([\d.]+),\s*([\d.]+)\)/g;

    let rowMatch;
    while ((rowMatch = rowRegex.exec(valuesBlock)) !== null) {
      const [, name, aliasesStr, address, city, lat, lng] = rowMatch;

      // Parse aliases array
      const aliases = aliasesStr
        ? aliasesStr.split(',').map(a => a.trim().replace(/^'|'$/g, ''))
        : [];

      venues.push({
        name,
        aliases,
        address: address || null,
        city,
        lat: parseFloat(lat),
        lng: parseFloat(lng)
      });
    }
  }

  return venues;
}

async function seedVenues() {
  console.log('🌱 Seeding known venues...');
  console.log(`Database: ${SUPABASE_URL}\n`);

  try {
    // Read the SQL file
    const sqlPath = join(__dirname, '..', 'supabase', 'seed', 'known_venues.sql');
    const sqlContent = readFileSync(sqlPath, 'utf8');

    // Parse venues from SQL
    const venues = parseSQLInserts(sqlContent);
    console.log(`Found ${venues.length} venues in seed file\n`);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const venue of venues) {
      try {
        // Check if venue already exists
        const { data: existing } = await supabase
          .from('known_venues')
          .select('id, name')
          .eq('name', venue.name)
          .maybeSingle();

        if (existing) {
          // Update existing venue
          const { error } = await supabase
            .from('known_venues')
            .update(venue)
            .eq('id', existing.id);

          if (error) {
            console.error(`❌ Failed to update ${venue.name}:`, error.message);
            skipped++;
          } else {
            console.log(`✅ Updated: ${venue.name} (${venue.city})`);
            updated++;
          }
        } else {
          // Insert new venue
          const { error } = await supabase
            .from('known_venues')
            .insert(venue);

          if (error) {
            console.error(`❌ Failed to insert ${venue.name}:`, error.message);
            skipped++;
          } else {
            console.log(`✅ Inserted: ${venue.name} (${venue.city})`);
            inserted++;
          }
        }
      } catch (err) {
        console.error(`❌ Error processing ${venue.name}:`, err.message);
        skipped++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 SEEDING SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Inserted: ${inserted} venues`);
    console.log(`🔄 Updated: ${updated} venues`);
    console.log(`⏭️  Skipped: ${skipped} venues`);
    console.log(`📍 Total: ${venues.length} venues processed`);

    // Group by city
    const byCity = venues.reduce((acc, v) => {
      acc[v.city] = (acc[v.city] || 0) + 1;
      return acc;
    }, {});

    console.log('\nVenues by city:');
    for (const [city, count] of Object.entries(byCity).sort((a, b) => b[1] - a[1])) {
      console.log(`  - ${city}: ${count} venues`);
    }

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

seedVenues();
