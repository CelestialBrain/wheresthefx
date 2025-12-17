#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://azdcshjzkcidqmkpxuqz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function analyze() {
    const { data: events } = await supabase
        .from('instagram_posts')
        .select('event_title, event_date, event_time, location_name, location_lat, location_lng, price, signup_url, ai_confidence, review_tier, category, post_url')
        .eq('is_event', true);

    console.log('📊 EVENT QUALITY ANALYSIS (' + events.length + ' events)');
    console.log('='.repeat(60));

    let hasTitle = 0, hasDate = 0, hasTime = 0, hasLocation = 0, hasGeocode = 0, hasPrice = 0, hasSignup = 0;
    let confTotal = 0, confCount = 0;
    const missingLoc = [];
    const ungeoVenues = {};

    events.forEach(e => {
        if (e.event_title) hasTitle++;
        if (e.event_date) hasDate++;
        if (e.event_time) hasTime++;
        if (e.location_name) hasLocation++;
        else missingLoc.push(e);
        if (e.location_lat && e.location_lng) hasGeocode++;
        else if (e.location_name) {
            ungeoVenues[e.location_name] = (ungeoVenues[e.location_name] || 0) + 1;
        }
        if (e.price > 0) hasPrice++;
        if (e.signup_url) hasSignup++;
        if (e.ai_confidence) { confTotal += e.ai_confidence; confCount++; }
    });

    const n = events.length;
    console.log('\n📋 FIELD COMPLETENESS:');
    console.log('  Title:', hasTitle + '/' + n, '(' + Math.round(hasTitle / n * 100) + '%)');
    console.log('  Date:', hasDate + '/' + n, '(' + Math.round(hasDate / n * 100) + '%)');
    console.log('  Time:', hasTime + '/' + n, '(' + Math.round(hasTime / n * 100) + '%)');
    console.log('  Location:', hasLocation + '/' + n, '(' + Math.round(hasLocation / n * 100) + '%)');
    console.log('  Geocoded:', hasGeocode + '/' + n, '(' + Math.round(hasGeocode / n * 100) + '%)');
    console.log('  Price (>0):', hasPrice + '/' + n, '(' + Math.round(hasPrice / n * 100) + '%)');
    console.log('  Signup URL:', hasSignup + '/' + n, '(' + Math.round(hasSignup / n * 100) + '%)');
    console.log('\n🤖 AVG AI CONFIDENCE:', (confTotal / confCount).toFixed(2));

    const tiers = {};
    events.forEach(e => { tiers[e.review_tier || 'none'] = (tiers[e.review_tier || 'none'] || 0) + 1; });
    console.log('\n📋 REVIEW TIERS:');
    Object.entries(tiers).sort((a, b) => b[1] - a[1]).forEach(([t, c]) => console.log('  ' + t + ': ' + c));

    const cats = {};
    events.forEach(e => { cats[e.category || 'none'] = (cats[e.category || 'none'] || 0) + 1; });
    console.log('\n🏷️ CATEGORIES:');
    Object.entries(cats).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => console.log('  ' + c + ': ' + n));

    console.log('\n📍 TOP UNGEOCODED VENUES (add to known_venues):');
    Object.entries(ungeoVenues).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([v, c]) => console.log('  ' + c + 'x ' + v));

    if (missingLoc.length > 0) {
        console.log('\n⚠️ MISSING LOCATION (' + missingLoc.length + '):');
        missingLoc.slice(0, 5).forEach(e => console.log('  - ' + (e.event_title || 'untitled').slice(0, 40)));
    }
}

analyze().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
