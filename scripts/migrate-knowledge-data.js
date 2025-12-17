#!/usr/bin/env node

/**
 * Migrate knowledge data from old Supabase to new Supabase
 * - known_venues
 * - instagram_accounts
 * - extraction patterns
 */

const { createClient } = require('@supabase/supabase-js');

const OLD_SUPABASE_URL = 'https://ltgxvskqotbuclrinhej.supabase.co';
const OLD_SUPABASE_KEY = process.env.OLD_SUPABASE_KEY;

const NEW_SUPABASE_URL = process.env.SUPABASE_URL || 'https://azdcshjzkcidqmkpxuqz.supabase.co';
const NEW_SUPABASE_KEY = process.env.NEW_SUPABASE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!OLD_SUPABASE_KEY) {
  console.error('❌ OLD_SUPABASE_KEY environment variable not set');
  console.error('Usage: OLD_SUPABASE_KEY=your-old-key node migrate-knowledge-data.js');
  process.exit(1);
}

if (!NEW_SUPABASE_KEY) {
  console.error('❌ NEW_SUPABASE_KEY not set');
  process.exit(1);
}

const oldSupabase = createClient(OLD_SUPABASE_URL, OLD_SUPABASE_KEY);
const newSupabase = createClient(NEW_SUPABASE_URL, NEW_SUPABASE_KEY);

async function migrateTable(tableName, options = {}) {
  console.log(`\n📦 Migrating ${tableName}...`);

  try {
    // Fetch all data from old database
    let query = oldSupabase.from(tableName).select('*');

    if (options.orderBy) {
      query = query.order(options.orderBy);
    }

    const { data: oldData, error: fetchError } = await query;

    if (fetchError) {
      console.error(`❌ Error fetching ${tableName}:`, fetchError.message);
      return { success: false, count: 0 };
    }

    if (!oldData || oldData.length === 0) {
      console.log(`⚠️  No data found in ${tableName}`);
      return { success: true, count: 0 };
    }

    console.log(`Found ${oldData.length} records in old database`);

    // Transform data if needed
    let dataToInsert = oldData;
    if (options.transform) {
      dataToInsert = oldData.map(options.transform);
    }

    // Remove id, created_at, updated_at if preserveIds is false
    if (!options.preserveIds) {
      dataToInsert = dataToInsert.map(row => {
        const { id, created_at, updated_at, ...rest } = row;
        return rest;
      });
    }

    // Insert into new database in batches
    const batchSize = 100;
    let inserted = 0;

    for (let i = 0; i < dataToInsert.length; i += batchSize) {
      const batch = dataToInsert.slice(i, i + batchSize);

      const { error: insertError, count } = await newSupabase
        .from(tableName)
        .upsert(batch, {
          onConflict: options.conflictKey || 'id',
          ignoreDuplicates: false
        })
        .select('id', { count: 'exact' });

      if (insertError) {
        console.error(`❌ Error inserting batch ${i / batchSize + 1}:`, insertError.message);
        console.error('First row of failed batch:', JSON.stringify(batch[0], null, 2));
      } else {
        inserted += batch.length;
        console.log(`✅ Inserted batch ${i / batchSize + 1} (${batch.length} records)`);
      }
    }

    console.log(`✅ Migrated ${inserted}/${oldData.length} records from ${tableName}`);
    return { success: true, count: inserted };

  } catch (error) {
    console.error(`❌ Unexpected error migrating ${tableName}:`, error.message);
    return { success: false, count: 0 };
  }
}

async function main() {
  console.log('🚀 Starting knowledge data migration');
  console.log(`Old DB: ${OLD_SUPABASE_URL}`);
  console.log(`New DB: ${NEW_SUPABASE_URL}\n`);

  const results = {};

  // 1. Migrate known_venues
  results.known_venues = await migrateTable('known_venues', {
    conflictKey: 'name',
    orderBy: 'created_at'
  });

  // 2. Migrate instagram_accounts
  results.instagram_accounts = await migrateTable('instagram_accounts', {
    conflictKey: 'username',
    orderBy: 'created_at',
    transform: (account) => {
      // Ensure username is lowercase
      return {
        ...account,
        username: account.username.toLowerCase()
      };
    }
  });

  // 3. Migrate extraction_patterns (if exists)
  results.extraction_patterns = await migrateTable('extraction_patterns', {
    conflictKey: 'pattern',
    orderBy: 'created_at'
  });

  // 4. Migrate location_aliases (if exists)
  results.location_aliases = await migrateTable('location_aliases', {
    orderBy: 'created_at'
  });

  // 5. Migrate venue_name_patterns (if exists)
  results.venue_name_patterns = await migrateTable('venue_name_patterns', {
    orderBy: 'created_at'
  });

  console.log('\n' + '='.repeat(60));
  console.log('📊 MIGRATION SUMMARY');
  console.log('='.repeat(60));

  for (const [table, result] of Object.entries(results)) {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${table}: ${result.count} records`);
  }

  const totalMigrated = Object.values(results).reduce((sum, r) => sum + r.count, 0);
  console.log(`\n✅ Total records migrated: ${totalMigrated}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
