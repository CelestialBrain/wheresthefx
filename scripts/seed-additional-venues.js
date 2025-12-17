#!/usr/bin/env node

/**
 * Seed additional known venues
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://azdcshjzkcidqmkpxuqz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_KEY) {
  console.error('❌ SUPABASE_KEY not set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const additionalVenues = [
  { name: 'The Fifth at Rockwell', lat: 14.5649, lng: 121.0545, address: 'Power Plant Mall', city: 'Makati', aliases: ['The Fifth', 'Fifth Rockwell'] },
  { name: 'Burgos Park', lat: 14.5528, lng: 121.0502, address: 'Forbes Town, BGC', city: 'Taguig', aliases: ['Burgos Park BGC'] },
  { name: 'Gyud Food UP', lat: 14.6537, lng: 121.0686, address: 'UP Diliman', city: 'Quezon City', aliases: ['Gyud Food', 'Gyud UP Diliman'] },
  { name: '3 Torre Lorenzo', lat: 14.5574, lng: 120.9878, address: 'Taft Avenue', city: 'Manila', aliases: ['Torre Lorenzo', '3TL'] },
  { name: 'Salcedo Market', lat: 14.5608, lng: 121.0186, address: 'Jaime Velasquez Park', city: 'Makati', aliases: ['Salcedo Weekend Market'] },
  { name: 'Nokal', lat: 14.5641, lng: 121.0313, address: 'Makati Cinema Square', city: 'Makati', aliases: ['Nokal Manila'] },
  { name: 'New Frontier Theater', lat: 14.6202, lng: 121.0531, address: 'Araneta City', city: 'Quezon City', aliases: ['New Frontier'] },
  { name: 'The Filinvest Tent', lat: 14.4156, lng: 121.0392, address: 'Filinvest City', city: 'Muntinlupa', aliases: ['Filinvest Tent'] },
  { name: 'Estancia Mall', lat: 14.5826, lng: 121.0603, address: 'Capitol Commons', city: 'Pasig', aliases: ['Estancia'] },
  { name: 'Cinema 76', lat: 14.5994, lng: 121.0338, address: 'San Juan', city: 'San Juan', aliases: ['Cinema76'] },
  { name: 'Ayala Triangle', lat: 14.5574, lng: 121.0234, address: 'Ayala Triangle', city: 'Makati', aliases: ['Ayala Triangle Gardens'] },
  { name: 'Circuit Makati', lat: 14.5673, lng: 121.0396, address: 'Circuit Makati', city: 'Makati', aliases: ['Circuit', 'Ayala Circuit'] }
];

async function seedAdditionalVenues() {
  console.log('🌱 Seeding additional known venues...');
  console.log(`Database: ${SUPABASE_URL}\n`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const venue of additionalVenues) {
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
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Inserted: ${inserted} venues`);
  console.log(`🔄 Updated: ${updated} venues`);
  console.log(`⏭️  Skipped: ${skipped} venues`);
  console.log(`📍 Total: ${additionalVenues.length} venues processed`);
}

seedAdditionalVenues();
