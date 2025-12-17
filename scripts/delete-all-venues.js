#!/usr/bin/env node

/**
 * Delete all data from known_venues table
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://azdcshjzkcidqmkpxuqz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_KEY) {
    console.error('❌ SUPABASE_KEY not set. Please set SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_PUBLISHABLE_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function deleteAllVenues() {
    console.log('🗑️  Deleting all data from known_venues table...');
    console.log(`Database: ${SUPABASE_URL}\n`);

    // First, get the count
    const { count: beforeCount } = await supabase
        .from('known_venues')
        .select('*', { count: 'exact', head: true });

    console.log(`Found ${beforeCount} venues to delete\n`);

    if (beforeCount === 0) {
        console.log('✅ Table is already empty!');
        return;
    }

    // Delete all records - using a condition that matches all
    const { error } = await supabase
        .from('known_venues')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // This matches all real UUIDs

    if (error) {
        console.error('❌ Error deleting venues:', error.message);
        process.exit(1);
    }

    // Verify deletion
    const { count: afterCount } = await supabase
        .from('known_venues')
        .select('*', { count: 'exact', head: true });

    console.log('✅ Deletion complete!');
    console.log(`Deleted: ${beforeCount} venues`);
    console.log(`Remaining: ${afterCount} venues`);
}

deleteAllVenues().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
