#!/usr/bin/env node

/**
 * Test script for AI Event Extraction function
 * Tests OCR and Gemini AI capabilities
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://azdcshjzkcidqmkpxuqz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6ZGNzaGp6a2NpZHFta3B4dXF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5ODk0NTEsImV4cCI6MjA4MTU2NTQ1MX0.iFQi_eCmiWkkzF8VxasSl7PUzhdVz0pwagEEDo_MfbE';

// Test cases with various event types
const testCases = [
    {
        name: 'Simple Nightlife Event',
        payload: {
            caption: "🎉 FREAKY FRIDAY! Dec 20, 2024 @ 10PM at The Red Room, Poblacion. ₱500 entrance. DJs: @djfred @djanna",
            imageUrls: [],
            postTimestamp: new Date().toISOString(),
            ownerUsername: 'theroomph'
        },
        expected: {
            isEvent: true,
            eventDate: '2024-12-20',
            category: 'nightlife'
        }
    },
    {
        name: 'Filipino Date Format (DD.MM)',
        payload: {
            caption: "Sa 13.12 at Radius Katipunan! 9PM onwards. Libre ang entrance! 🎸",
            imageUrls: [],
            postTimestamp: '2024-12-10T12:00:00Z',
            ownerUsername: 'radiusbar'
        },
        expected: {
            isEvent: true,
            eventDate: '2024-12-13',
            isFree: true
        }
    },
    {
        name: 'Multi-day Event',
        payload: {
            caption: "Christmas Bazaar! DEC 21-22, 2024 at Legazpi Village. 10AM-8PM. Free admission, 50+ vendors!",
            imageUrls: [],
            postTimestamp: '2024-12-15T10:00:00Z'
        },
        expected: {
            isEvent: true,
            eventDate: '2024-12-21',
            eventEndDate: '2024-12-22',
            category: 'markets'
        }
    },
    {
        name: 'NOT an Event - Operating Hours',
        payload: {
            caption: "Visit us! Open 6PM - 2AM, Tuesday to Saturday. Best cocktails in BGC! 🍸",
            imageUrls: [],
            postTimestamp: new Date().toISOString()
        },
        expected: {
            isEvent: false
        }
    },
    {
        name: 'Event with Image (OCR Test)',
        payload: {
            caption: "Check out our poster! 👆",
            imageUrls: ['https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=800'],
            postTimestamp: new Date().toISOString(),
            ownerUsername: 'eventph'
        },
        expected: {
            // With OCR/Vision, should try to extract from image
        }
    }
];

async function testAIExtraction(testCase) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`TEST: ${testCase.name}`);
    console.log(`${'='.repeat(60)}`);

    try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-extract-event`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'apikey': SUPABASE_KEY
            },
            body: JSON.stringify(testCase.payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.log(`❌ HTTP Error: ${response.status}`);
            console.log(`Error: ${errorText}`);
            return { success: false, error: errorText };
        }

        const result = await response.json();
        console.log('\n📊 EXTRACTION RESULT:');
        console.log(JSON.stringify(result, null, 2));

        // Validate expected fields (check inside extraction object)
        let passed = true;
        if (testCase.expected) {
            console.log('\n✅ VALIDATION:');
            const extraction = result.extraction || result;
            for (const [key, expectedValue] of Object.entries(testCase.expected)) {
                const actualValue = extraction[key];
                const match = actualValue === expectedValue;
                console.log(`  ${match ? '✓' : '✗'} ${key}: expected=${expectedValue}, got=${actualValue}`);
                if (!match) passed = false;
            }
        }

        return { success: true, passed, result };
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

async function runAllTests() {
    console.log('🧪 AI EXTRACTION TEST SUITE');
    console.log(`Supabase URL: ${SUPABASE_URL}`);
    console.log(`Testing ${testCases.length} cases\n`);

    const results = [];
    for (const testCase of testCases) {
        const result = await testAIExtraction(testCase);
        results.push({ name: testCase.name, ...result });
        // Small delay between requests
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log('\n' + '='.repeat(60));
    console.log('📋 SUMMARY');
    console.log('='.repeat(60));

    let passed = 0, failed = 0;
    for (const r of results) {
        const status = r.success ? (r.passed ? '✅ PASS' : '⚠️ PARTIAL') : '❌ FAIL';
        console.log(`${status}: ${r.name}`);
        if (r.success && r.passed) passed++;
        else failed++;
    }

    console.log(`\nTotal: ${passed}/${results.length} passed`);
}

runAllTests().catch(console.error);
