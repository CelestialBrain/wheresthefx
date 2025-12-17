#!/usr/bin/env node

/**
 * Seed extraction patterns from old database into new Supabase
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://azdcshjzkcidqmkpxuqz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_KEY) {
  console.error('❌ SUPABASE_KEY not set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// High-quality patterns from old database (70%+ success rate)
const QUALITY_PATTERNS = [
  // Date patterns - HIGH PERFORMERS (90%+)
  {
    field: 'date',
    pattern: String.raw`(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[a-z]*\s*\d{1,2}(?:, \d{4})?`,
    format_type: 'month_first',
    source: 'ai',
    confidence: 0.97,
    success_count: 246,
    failure_count: 8,
    priority: 115,
    notes: 'Month-first dates with full/abbreviated names, optional year'
  },
  {
    field: 'date',
    pattern: String.raw`(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[a-z]*\s*\d{1,2}(?:,?\s*\d{4})?`,
    format_type: 'month_first',
    source: 'ai',
    confidence: 0.91,
    success_count: 301,
    failure_count: 28,
    priority: 125,
    notes: 'Month-first with optional comma before year'
  },
  {
    field: 'date',
    pattern: String.raw`((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?[\s]*\d{1,2}(?:, \d{4})?)`,
    format_type: 'month_first',
    source: 'ai',
    confidence: 0.90,
    success_count: 321,
    failure_count: 34,
    priority: 130,
    notes: 'Month-first with optional period and comma+year'
  },
  {
    field: 'date',
    pattern: String.raw`((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{1,2},?\s*\d{0,4})`,
    format_type: 'month_first',
    source: 'ai',
    confidence: 0.94,
    success_count: 131,
    failure_count: 8,
    priority: 120,
    notes: 'Month-first with optional period, comma, year'
  },
  {
    field: 'date',
    pattern: String.raw`(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*(\d{1,2})`,
    format_type: 'month_first',
    source: 'ai',
    confidence: 0.89,
    success_count: 130,
    failure_count: 16,
    priority: 135,
    notes: 'Simple month-first with optional period'
  },
  {
    field: 'date',
    pattern: String.raw`(\d{1,2})\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*`,
    format_type: 'day_first',
    source: 'ai',
    confidence: 0.69,
    success_count: 22,
    failure_count: 10,
    priority: 145,
    notes: 'Day-first format (7 Dec, 7th December)'
  },
  {
    field: 'date',
    pattern: String.raw`(\d{1,2})(?:st|nd|rd|th)?\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*`,
    format_type: 'day_first',
    source: 'ai',
    confidence: 0.54,
    success_count: 29,
    failure_count: 25,
    priority: 140,
    notes: 'Day-first with ordinal suffixes'
  },

  // Time patterns - HIGH PERFORMERS (80%+)
  {
    field: 'time',
    pattern: String.raw`([Mm]idnight|[0-9]+)`,
    format_type: 'other_time',
    source: 'ai',
    confidence: 0.99,
    success_count: 507,
    failure_count: 4,
    priority: 110,
    notes: 'Matches midnight or numeric time'
  },
  {
    field: 'time',
    pattern: String.raw`([01]?\d|2[0-3]):[0-5]\d`,
    format_type: '24h',
    source: 'ai',
    confidence: 0.80,
    success_count: 4,
    failure_count: 1,
    priority: 120,
    notes: '24-hour format HH:MM'
  },
  {
    field: 'time',
    pattern: String.raw`([01]?\d|2[0-3]):([0-5]\d)`,
    format_type: '24h',
    source: 'ai',
    confidence: 0.58,
    success_count: 15,
    failure_count: 11,
    priority: 125,
    notes: '24-hour format with captured minutes'
  },

  // Price patterns - HIGH PERFORMERS (95%+)
  {
    field: 'price',
    pattern: String.raw`(₱\s*\d+(?:,\d{3})*(?:\.\d{2})?)`,
    format_type: 'peso_sign',
    source: 'ai',
    confidence: 0.96,
    success_count: 24,
    failure_count: 1,
    priority: 135,
    notes: 'Peso sign with thousands separators and decimals'
  },
  {
    field: 'price',
    pattern: String.raw`[Pp][Hh][Pp]\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)`,
    format_type: 'php_prefix',
    source: 'ai',
    confidence: 0.95,
    success_count: 36,
    failure_count: 2,
    priority: 140,
    notes: 'PHP prefix (case-insensitive) with numeric value'
  },
  {
    field: 'price',
    pattern: String.raw`(P\d{1,3}(?:,\d{3})*(?:\.\d{2})?)`,
    format_type: 'p_prefix',
    source: 'ai',
    confidence: 0.97,
    success_count: 32,
    failure_count: 1,
    priority: 130,
    notes: 'P prefix (avoids PM false positives)'
  },
  {
    field: 'price',
    pattern: String.raw`(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*pesos?`,
    format_type: 'peso_word',
    source: 'ai',
    confidence: 0.80,
    success_count: 4,
    failure_count: 1,
    priority: 155,
    notes: 'Numeric value followed by "peso" or "pesos"'
  },
  {
    field: 'price',
    pattern: String.raw`([0-9,]+(?:[.,][0-9]+)?)|(?:free|FREE)`,
    format_type: 'other_price',
    source: 'ai',
    confidence: 0.98,
    success_count: 4011,
    failure_count: 67,
    priority: 125,
    notes: 'Generic price or FREE keyword'
  },
  {
    field: 'price',
    pattern: String.raw`([Ff][Rr][Ee][Ee]|[0-9]+(?:php)?)`,
    format_type: 'other_price',
    source: 'ai',
    confidence: 0.86,
    success_count: 2386,
    failure_count: 373,
    priority: 145,
    notes: 'Free or number with optional php suffix'
  },
  {
    field: 'price',
    pattern: String.raw`(FREE(?: ENTRANCE)?)`,
    format_type: 'other_price',
    source: 'ai',
    confidence: 0.79,
    success_count: 350,
    failure_count: 91,
    priority: 120,
    notes: 'FREE or FREE ENTRANCE exactly'
  },
  {
    field: 'price',
    pattern: String.raw`(?:Entrance Fee:|₱|PHP|P|Php)\s*([\d,]+)`,
    format_type: 'other_price',
    source: 'ai',
    confidence: 0.70,
    success_count: 7,
    failure_count: 3,
    priority: 165,
    notes: 'Entrance fee indicators followed by numeric value'
  },

  // Signup URL patterns - MODERATE PERFORMERS (30%+)
  {
    field: 'signup_url',
    pattern: String.raw`(forms\.gle\/[a-zA-Z0-9]+)`,
    format_type: 'other_url',
    source: 'ai',
    confidence: 0.27,
    success_count: 3,
    failure_count: 8,
    priority: 120,
    notes: 'Google Forms shortlinks'
  },
  {
    field: 'signup_url',
    pattern: String.raw`(bit\.ly\/[a-zA-Z0-9]+|tippleandslaw\.klikit\.io\/reserve)`,
    format_type: 'shortener',
    source: 'ai',
    confidence: 0.31,
    success_count: 30,
    failure_count: 68,
    priority: 120,
    notes: 'bit.ly and specific reservation links'
  },
  {
    field: 'signup_url',
    pattern: String.raw`(https?://[^\s<>"{}|\\^\[\]]+)`,
    format_type: 'full_url',
    source: 'ai',
    confidence: 0.29,
    success_count: 12,
    failure_count: 29,
    priority: 120,
    notes: 'Full HTTP/HTTPS URLs'
  },
  {
    field: 'signup_url',
    pattern: String.raw`((?:bit\.ly|tinyurl\.com|goo\.gl)/[^\s]+)`,
    format_type: 'shortener',
    source: 'ai',
    confidence: 0.20,
    success_count: 2,
    failure_count: 8,
    priority: 120,
    notes: 'Common URL shorteners'
  },

  // Venue patterns - MODERATE PERFORMERS (38%+)
  {
    field: 'venue',
    pattern: String.raw`📍\s*([^\r\n]+?)(?:[\r\n]|$)`,
    format_type: 'pin_emoji',
    source: 'default',
    confidence: 0.38,
    success_count: 151,
    failure_count: 250,
    priority: 100,
    notes: 'Pin emoji followed by venue name'
  },
];

async function seedPatterns() {
  console.log('🌱 Seeding extraction patterns...');
  console.log(`Database: ${SUPABASE_URL}\n`);

  let inserted = 0;
  let failed = 0;

  for (const pattern of QUALITY_PATTERNS) {
    try {
      // Map to actual database schema
      const patternData = {
        pattern_type: pattern.field,  // Maps to: time, date, venue, price, signup_url
        pattern_regex: pattern.pattern,
        pattern_description: `${pattern.notes} [${pattern.format_type}]`,
        confidence_score: pattern.confidence,
        success_count: pattern.success_count,
        failure_count: pattern.failure_count,
        source: pattern.source === 'ai' ? 'learned' : pattern.source,
        is_active: true,
      };

      // Check if pattern already exists
      const { data: existing } = await supabase
        .from('extraction_patterns')
        .select('id')
        .eq('pattern_regex', pattern.pattern)
        .maybeSingle();

      let error;
      if (existing) {
        // Update existing pattern
        const result = await supabase
          .from('extraction_patterns')
          .update(patternData)
          .eq('id', existing.id);
        error = result.error;
      } else {
        // Insert new pattern
        const result = await supabase
          .from('extraction_patterns')
          .insert(patternData);
        error = result.error;
      }

      if (error) {
        console.error(`❌ Failed to insert ${pattern.field} pattern:`, error.message);
        console.error(`   Pattern: ${pattern.pattern.substring(0, 60)}...`);
        failed++;
      } else {
        console.log(`✅ Inserted ${pattern.field} pattern (${pattern.format_type}): ${(pattern.confidence * 100).toFixed(0)}% confidence, ${pattern.success_count}/${pattern.success_count + pattern.failure_count} success`);
        inserted++;
      }
    } catch (err) {
      console.error(`❌ Error inserting pattern:`, err.message);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 SEEDING SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Inserted: ${inserted} patterns`);
  console.log(`❌ Failed: ${failed} patterns`);
  console.log(`\nPattern breakdown:`);

  const byField = QUALITY_PATTERNS.reduce((acc, p) => {
    acc[p.field] = (acc[p.field] || 0) + 1;
    return acc;
  }, {});

  for (const [field, count] of Object.entries(byField)) {
    console.log(`  - ${field}: ${count} patterns`);
  }
}

seedPatterns().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
