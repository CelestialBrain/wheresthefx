import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://azdcshjzkcidqmkpxuqz.supabase.co';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// Exact venues from migration 20251207111944_add_additional_metro_manila_venues.sql
const exactVenues = [
  {
    name: 'The Fifth at Rockwell',
    lat: 14.5649,
    lng: 121.0545,
    address: 'Power Plant Mall',
    city: 'Makati',
    aliases: ['The Fifth', 'Fifth Rockwell']
  },
  {
    name: 'Burgos Park',
    lat: 14.5528,
    lng: 121.0502,
    address: 'Forbes Town, BGC',
    city: 'Taguig',
    aliases: ['Burgos Park BGC']
  },
  {
    name: 'Gyud Food UP',
    lat: 14.6537,
    lng: 121.0686,
    address: 'UP Diliman',
    city: 'Quezon City',
    aliases: ['Gyud Food', 'Gyud UP Diliman']
  },
  {
    name: '3 Torre Lorenzo',
    lat: 14.5574,
    lng: 120.9878,
    address: 'Taft Avenue',
    city: 'Manila',
    aliases: ['Torre Lorenzo', '3TL']
  },
  {
    name: 'Salcedo Market',
    lat: 14.5608,
    lng: 121.0186,
    address: 'Jaime Velasquez Park',
    city: 'Makati',
    aliases: ['Salcedo Weekend Market']
  },
  {
    name: 'Nokal',
    lat: 14.5641,
    lng: 121.0313,
    address: 'Makati Cinema Square',
    city: 'Makati',
    aliases: ['Nokal Manila']
  },
  {
    name: 'New Frontier Theater',
    lat: 14.6202,
    lng: 121.0531,
    address: 'Araneta City',
    city: 'Quezon City',
    aliases: ['New Frontier']
  },
  {
    name: 'The Filinvest Tent',
    lat: 14.4156,
    lng: 121.0392,
    address: 'Filinvest City',
    city: 'Muntinlupa',
    aliases: ['Filinvest Tent']
  },
  {
    name: 'Estancia Mall',
    lat: 14.5826,
    lng: 121.0603,
    address: 'Capitol Commons',
    city: 'Pasig',
    aliases: ['Estancia']
  },
  {
    name: 'Cinema 76',
    lat: 14.5994,
    lng: 121.0338,
    address: 'San Juan',
    city: 'San Juan',
    aliases: ['Cinema76']
  },
  {
    name: 'Ayala Triangle',
    lat: 14.5574,
    lng: 121.0234,
    address: 'Ayala Triangle',
    city: 'Makati',
    aliases: ['Ayala Triangle Gardens']
  },
  {
    name: 'Circuit Makati',
    lat: 14.5673,
    lng: 121.0396,
    address: 'Circuit Makati',
    city: 'Makati',
    aliases: ['Circuit', 'Ayala Circuit']
  }
];

async function seedExactVenues() {
  console.log('Starting to seed exact venues from migration file...\n');

  for (const venue of exactVenues) {
    try {
      // Check if venue already exists
      const { data: existing, error: fetchError } = await supabase
        .from('known_venues')
        .select('id, name')
        .eq('name', venue.name)
        .maybeSingle();

      if (fetchError) {
        console.error(`❌ Error checking venue "${venue.name}": ${fetchError.message}`);
        continue;
      }

      if (existing) {
        // Update existing venue
        const { error: updateError } = await supabase
          .from('known_venues')
          .update({
            lat: venue.lat,
            lng: venue.lng,
            address: venue.address,
            city: venue.city,
            aliases: venue.aliases
          })
          .eq('id', existing.id);

        if (updateError) {
          console.error(`❌ Failed to update "${venue.name}": ${updateError.message}`);
        } else {
          console.log(`✅ Updated: ${venue.name}`);
        }
      } else {
        // Insert new venue
        const { error: insertError } = await supabase
          .from('known_venues')
          .insert({
            name: venue.name,
            lat: venue.lat,
            lng: venue.lng,
            address: venue.address,
            city: venue.city,
            aliases: venue.aliases
          });

        if (insertError) {
          console.error(`❌ Failed to insert "${venue.name}": ${insertError.message}`);
        } else {
          console.log(`✅ Inserted: ${venue.name}`);
        }
      }
    } catch (error) {
      console.error(`❌ Unexpected error for "${venue.name}": ${error.message}`);
    }
  }

  console.log('\n✅ Finished seeding exact venues from migration file');
}

seedExactVenues().catch(console.error);
