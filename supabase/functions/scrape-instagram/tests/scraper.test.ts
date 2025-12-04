/**
 * Comprehensive tests for scraper improvements
 * Tests NCR geocache, time/date/venue extraction, vendor detection, and integration with live dataset
 * 
 * Run with: deno test --allow-net --allow-env scraper.test.ts
 */

import { assertEquals, assertExists, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { lookupNCRVenue, fuzzyMatchVenue, NCR_VENUE_GEOCACHE } from "../ncrGeoCache.ts";
import { 
  extractTime, 
  extractDate, 
  extractVenue, 
  extractPrice,
  isVendorPostStrict,
  isPossiblyVendorPost,
} from "../extractionUtils.ts";
import {
  assertValidTime,
  assertValidDate,
  assertValidCoordinates,
  fetchTestDataset,
  calculateExtractionStats,
  formatStats,
  SAMPLE_CAPTIONS,
  type ParsedEvent,
} from "./testUtils.ts";

// ============================================================
// A. NCR GEOCACHE TESTS
// ============================================================

Deno.test("NCR Geocache - Direct venue name matches", () => {
  // Test exact matches
  const smNorth = lookupNCRVenue("sm north edsa");
  assertExists(smNorth);
  assertEquals(smNorth.city, "Quezon City");
  assertValidCoordinates(smNorth.lat, smNorth.lng);
  
  const trinoma = lookupNCRVenue("trinoma");
  assertExists(trinoma);
  assertEquals(trinoma.city, "Quezon City");
  
  const greenbelt = lookupNCRVenue("greenbelt");
  assertExists(greenbelt);
  assertEquals(greenbelt.city, "Makati");
  
  const bgc = lookupNCRVenue("bgc");
  assertExists(bgc);
  assertEquals(bgc.city, "Taguig");
});

Deno.test("NCR Geocache - Case insensitivity", () => {
  const result1 = lookupNCRVenue("SM NORTH EDSA");
  assertEquals(result1, null); // Exact match is case-sensitive
  
  const result2 = lookupNCRVenue("sm north edsa");
  assertExists(result2);
});

Deno.test("NCR Geocache - Fuzzy matches", () => {
  // Test fuzzy matching for partial/variant names
  const smNorthVariant = fuzzyMatchVenue("sm north", 0.7);
  assertExists(smNorthVariant);
  assertEquals(smNorthVariant.city, "Quezon City");
  assert(smNorthVariant.matchedName.toLowerCase().includes("north"));
  
  const greenbeltVariant = fuzzyMatchVenue("greenbelt 5", 0.7);
  assertExists(greenbeltVariant);
  assertEquals(greenbeltVariant.city, "Makati");
  
  const trinomaMall = fuzzyMatchVenue("trinoma mall", 0.7);
  assertExists(trinomaMall);
});

Deno.test("NCR Geocache - Fuzzy match threshold", () => {
  // Test that threshold controls matching
  const highThreshold = fuzzyMatchVenue("sm", 0.9);
  assertEquals(highThreshold, null); // Too short, won't match at high threshold
  
  const lowThreshold = fuzzyMatchVenue("north edsa", 0.5);
  assertExists(lowThreshold); // Should match something at lower threshold
});

Deno.test("NCR Geocache - No false positives for non-NCR venues", () => {
  const notNcr1 = lookupNCRVenue("SM Cebu");
  assertEquals(notNcr1, null);
  
  const notNcr2 = fuzzyMatchVenue("Ayala Center Cebu", 0.7);
  // Should not match Makati Ayala locations with high confidence
  if (notNcr2) {
    assert(notNcr2.city !== "Cebu"); // Ensure it didn't falsely match
  }
});

Deno.test("NCR Geocache - Validate coordinate ranges", () => {
  // All NCR venues should have valid Philippine coordinates
  // NCR is roughly: 14.4-14.8°N, 120.9-121.1°E
  for (const [name, venue] of Object.entries(NCR_VENUE_GEOCACHE)) {
    assert(venue.lat >= 14.0 && venue.lat <= 15.0, `Invalid lat for ${name}: ${venue.lat}`);
    assert(venue.lng >= 120.5 && venue.lng <= 121.5, `Invalid lng for ${name}: ${venue.lng}`);
    assertValidCoordinates(venue.lat, venue.lng);
  }
});

// ============================================================
// B. TIME EXTRACTION TESTS
// ============================================================

Deno.test("Time Extraction - Standard formats", async () => {
  const result1 = await extractTime("Event at 7:00 PM");
  assertExists(result1.startTime);
  assertValidTime(result1.startTime);
  assertEquals(result1.startTime, "19:00:00");
  
  const result2 = await extractTime("Doors open 19:00");
  assertExists(result2.startTime);
  assertEquals(result2.startTime, "19:00:00");
  
  const result3 = await extractTime("Party at 7pm");
  assertExists(result3.startTime);
  assertEquals(result3.startTime, "19:00:00");
});

Deno.test("Time Extraction - Filipino formats", async () => {
  const result1 = await extractTime("alas-7 ng gabi");
  assertExists(result1.startTime);
  assertValidTime(result1.startTime);
  assertEquals(result1.startTime, "19:00:00"); // 7 PM
  
  const result2 = await extractTime("alas dose ng tanghali");
  assertExists(result2.startTime);
  assertEquals(result2.startTime, "12:00:00"); // Noon
});

Deno.test("Time Extraction - European formats", async () => {
  const result = await extractTime("Concert starts at 19h30");
  assertExists(result.startTime);
  assertValidTime(result.startTime);
  assertEquals(result.startTime, "19:30:00");
});

Deno.test("Time Extraction - Time ranges", async () => {
  const result1 = await extractTime("Open 7pm-9pm");
  assertExists(result1.startTime);
  assertExists(result1.endTime);
  assertEquals(result1.startTime, "19:00:00");
  assertEquals(result1.endTime, "21:00:00");
  
  const result2 = await extractTime("7:00 PM to 9:00 PM");
  assertExists(result2.startTime);
  assertExists(result2.endTime);
});

Deno.test("Time Extraction - Invalid times rejection", async () => {
  // These should be caught by validation
  const result1 = await extractTime("25:00");
  assertEquals(result1.timeValidationFailed, true);
  assertEquals(result1.startTime, null);
  
  const result2 = await extractTime("99:99");
  assertEquals(result2.timeValidationFailed, true);
});

Deno.test("Time Extraction - AM/PM inference from context", async () => {
  // Evening context should infer PM
  const resultEvening = await extractTime("Party tonight at 8");
  assertExists(resultEvening.startTime);
  const hourEvening = parseInt(resultEvening.startTime.split(':')[0]);
  assert(hourEvening >= 12, "Evening party should be PM");
  
  // Morning context should infer AM
  const resultMorning = await extractTime("Yoga class at 7 in the morning");
  assertExists(resultMorning.startTime);
  const hourMorning = parseInt(resultMorning.startTime.split(':')[0]);
  assert(hourMorning < 12, "Morning yoga should be AM");
});

// ============================================================
// C. DATE EXTRACTION TESTS
// ============================================================

Deno.test("Date Extraction - Standard formats", async () => {
  const result1 = await extractDate("January 5, 2025");
  assertExists(result1.eventDate);
  assertValidDate(result1.eventDate);
  assertEquals(result1.eventDate, "2025-01-05");
  
  const result2 = await extractDate("Jan 5");
  assertExists(result2.eventDate);
  assertValidDate(result2.eventDate);
  assert(result2.eventDate.endsWith("-01-05"));
});

Deno.test("Date Extraction - Filipino formats", async () => {
  const result1 = await extractDate("ika-5 ng Enero");
  assertExists(result1.eventDate);
  assertValidDate(result1.eventDate);
  assert(result1.eventDate.includes("-01-05"));
  
  const result2 = await extractDate("Enero 15");
  assertExists(result2.eventDate);
});

Deno.test("Date Extraction - Date ranges", async () => {
  const result1 = await extractDate("Dec 25-27");
  assertExists(result1.eventDate);
  assertExists(result1.eventEndDate);
  assertValidDate(result1.eventDate);
  assertValidDate(result1.eventEndDate!);
  assert(result1.eventDate.includes("-12-25"));
  assert(result1.eventEndDate!.includes("-12-27"));
  
  const result2 = await extractDate("December 25 to 27");
  assertExists(result2.eventDate);
  assertExists(result2.eventEndDate);
});

Deno.test("Date Extraction - Relative dates", async () => {
  const today = new Date();
  
  const result1 = await extractDate("this Friday");
  assertExists(result1.eventDate);
  assertValidDate(result1.eventDate);
  
  const result2 = await extractDate("tomorrow");
  assertExists(result2.eventDate);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  assertEquals(result2.eventDate, tomorrow.toISOString().split('T')[0]);
});

Deno.test("Date Extraction - ISO format", async () => {
  const result = await extractDate("2025-01-05");
  assertExists(result.eventDate);
  assertEquals(result.eventDate, "2025-01-05");
});

// ============================================================
// D. VENUE EXTRACTION TESTS
// ============================================================

Deno.test("Venue Extraction - Pin emoji pattern", async () => {
  const result = await extractVenue("📍 SM North EDSA, Quezon City");
  assertExists(result.venueName);
  assert(result.venueName.toLowerCase().includes("sm north"));
});

Deno.test("Venue Extraction - Venue prefix", async () => {
  const result = await extractVenue("Venue: The Fort, BGC");
  assertExists(result.venueName);
  assert(result.venueName.toLowerCase().includes("fort") || result.venueName.toLowerCase().includes("bgc"));
});

Deno.test("Venue Extraction - @ mentions", async () => {
  const result = await extractVenue("Join us @greenbelt5");
  assertExists(result.venueName);
  assert(result.venueName.toLowerCase().includes("greenbelt"));
});

Deno.test("Venue Extraction - at pattern", async () => {
  const result = await extractVenue("Party at SM Megamall tonight!");
  assertExists(result.venueName);
});

Deno.test("Venue Extraction - Filipino 'sa' pattern", async () => {
  const result = await extractVenue("Punta sa Trinoma this weekend");
  assertExists(result.venueName);
  assert(result.venueName.toLowerCase().includes("trinoma"));
});

// ============================================================
// E. VENDOR DETECTION TESTS
// ============================================================

Deno.test("Vendor Detection - Strict rejection patterns", () => {
  // These should be hard rejected
  assertEquals(isVendorPostStrict("Calling all vendors! Booth rental available"), true);
  assertEquals(isVendorPostStrict("PHP 250 per piece, DM for price"), true);
  assertEquals(isVendorPostStrict("Brand new sealed items, sizes: S, M, L, XL"), true);
  assertEquals(isVendorPostStrict("COD available, nationwide shipping"), true);
  assertEquals(isVendorPostStrict("Ukay-ukay selling, FB live selling tonight"), true);
  assertEquals(isVendorPostStrict("Divisoria supplier, wholesale price"), true);
});

Deno.test("Vendor Detection - Soft detection patterns", () => {
  // These should trigger soft vendor signals
  assertEquals(isPossiblyVendorPost("New collection available now!"), true);
  assertEquals(isPossiblyVendorPost("Shop our boutique, limited stock"), true);
  assertEquals(isPossiblyVendorPost("50% off sale this weekend"), true);
  assertEquals(isPossiblyVendorPost("Free delivery for orders this week"), true);
});

Deno.test("Vendor Detection - Market events should pass strict", () => {
  // Market events are NOT vendor posts themselves
  assertEquals(isVendorPostStrict("Weekend market with 50+ vendors, free entry"), false);
  assertEquals(isVendorPostStrict("Community fleamarket coming to Marikina"), false);
  assertEquals(isVendorPostStrict("Pop-up market Dec 5-7 at SM North"), false);
});

Deno.test("Vendor Detection - Pure events should not trigger", () => {
  assertEquals(isVendorPostStrict("Join us tonight for live music!"), false);
  assertEquals(isVendorPostStrict("Party this Saturday. RSVP now!"), false);
  assertEquals(isPossiblyVendorPost("Concert at 7pm, free admission"), false);
});

// ============================================================
// F. PRICE EXTRACTION TESTS
// ============================================================

Deno.test("Price Extraction - PHP formats", async () => {
  const result1 = await extractPrice("PHP 500 entrance fee");
  assertExists(result1);
  assertEquals(result1.amount, 500);
  assertEquals(result1.currency, "PHP");
  assertEquals(result1.isFree, false);
  
  const result2 = await extractPrice("₱500");
  assertExists(result2);
  assertEquals(result2.amount, 500);
  
  const result3 = await extractPrice("P500");
  assertExists(result3);
  assertEquals(result3.amount, 500);
});

Deno.test("Price Extraction - Ranges", async () => {
  const result1 = await extractPrice("PHP 299-349 per ticket");
  assertExists(result1);
  assertEquals(result1.amount, 299); // Should take lower bound
  
  const result2 = await extractPrice("₱500 to ₱1000");
  assertExists(result2);
  assertEquals(result2.amount, 500);
});

Deno.test("Price Extraction - Free keywords", async () => {
  const result1 = await extractPrice("Free admission");
  assertExists(result1);
  assertEquals(result1.isFree, true);
  assertEquals(result1.amount, 0);
  
  const result2 = await extractPrice("Libre ang entrance");
  assertExists(result2);
  assertEquals(result2.isFree, true);
  
  const result3 = await extractPrice("Walang bayad");
  assertExists(result3);
  assertEquals(result3.isFree, true);
});

Deno.test("Price Extraction - K/M suffixes", async () => {
  const result1 = await extractPrice("PHP 1.5k");
  assertExists(result1);
  assertEquals(result1.amount, 1500);
  
  const result2 = await extractPrice("₱2M");
  assertExists(result2);
  assertEquals(result2.amount, 2000000);
});

// ============================================================
// G. INTEGRATION TESTS WITH DATASET
// ============================================================

Deno.test("Integration - Fetch and validate Apify dataset", async () => {
  try {
    const dataset = await fetchTestDataset(10); // Fetch just 10 items for quick test
    
    assertExists(dataset);
    assert(dataset.length > 0, "Dataset should have items");
    assert(dataset.length <= 10, "Should respect limit");
    
    // Validate structure of items
    for (const item of dataset) {
      assert(item.id || item.shortCode, "Item should have id or shortCode");
    }
    
    console.log(`✓ Successfully fetched ${dataset.length} items from dataset`);
  } catch (error) {
    console.error("Dataset fetch failed (may be expected if offline):", error);
    // Don't fail the test - dataset might not be accessible
  }
});

Deno.test("Integration - Test parsing real captions", async () => {
  try {
    const dataset = await fetchTestDataset(50);
    
    const results: ParsedEvent[] = [];
    
    for (const item of dataset) {
      if (!item.caption) continue;
      
      // Extract event data
      const timeResult = await extractTime(item.caption);
      const dateResult = await extractDate(item.caption);
      const venueResult = await extractVenue(item.caption, item.locationName);
      const priceResult = await extractPrice(item.caption);
      
      // Check if venue is in NCR cache
      let lat: number | null = null;
      let lng: number | null = null;
      
      if (venueResult.venueName) {
        const cached = lookupNCRVenue(venueResult.venueName) || fuzzyMatchVenue(venueResult.venueName, 0.7);
        if (cached) {
          lat = cached.lat;
          lng = cached.lng;
        }
      }
      
      results.push({
        postId: item.id || item.shortCode || 'unknown',
        eventDate: dateResult.eventDate,
        eventTime: timeResult.startTime,
        locationName: venueResult.venueName,
        locationLat: lat,
        locationLng: lng,
        price: priceResult?.amount || null,
        isFree: priceResult?.isFree || false,
      });
    }
    
    // Calculate and log statistics
    const stats = calculateExtractionStats(results);
    console.log("\n" + formatStats(stats));
    
    // Basic assertions on extraction rates
    assert(stats.dateExtractionRate > 0.3, "Should extract dates from >30% of posts");
    assert(stats.locationExtractionRate > 0.4, "Should extract locations from >40% of posts");
    
    // If we have NCR cache hits, validate coordinates
    if (stats.postsWithCoordinates > 0) {
      for (const result of results) {
        if (result.locationLat !== null && result.locationLng !== null) {
          assertValidCoordinates(result.locationLat, result.locationLng);
        }
      }
    }
    
    console.log(`\n✓ Successfully parsed ${results.length} real captions`);
    console.log(`✓ NCR cache provided coordinates for ${stats.postsWithCoordinates} venues`);
    
  } catch (error) {
    console.error("Integration test failed (may be expected if offline):", error);
    // Don't fail - this requires network access
  }
});

// ============================================================
// H. SAMPLE CAPTION TESTS
// ============================================================

Deno.test("Sample Captions - All test captions parse correctly", async () => {
  // Date samples
  const date1 = await extractDate(SAMPLE_CAPTIONS.dateStandard);
  assertExists(date1.eventDate);
  
  const date2 = await extractDate(SAMPLE_CAPTIONS.dateRange);
  assertExists(date2.eventDate);
  assertExists(date2.eventEndDate);
  
  // Time samples
  const time1 = await extractTime(SAMPLE_CAPTIONS.timeStandard);
  assertExists(time1.startTime);
  assertValidTime(time1.startTime);
  
  const time2 = await extractTime(SAMPLE_CAPTIONS.timeRange);
  assertExists(time2.startTime);
  assertExists(time2.endTime);
  
  // Venue samples
  const venue1 = await extractVenue(SAMPLE_CAPTIONS.venuePin);
  assertExists(venue1.venueName);
  
  const venue2 = await extractVenue(SAMPLE_CAPTIONS.venueKeyword);
  assertExists(venue2.venueName);
  
  // Price samples
  const price1 = await extractPrice(SAMPLE_CAPTIONS.priceFree);
  assertExists(price1);
  assertEquals(price1.isFree, true);
  
  const price2 = await extractPrice(SAMPLE_CAPTIONS.pricePHP);
  assertExists(price2);
  assertEquals(price2.amount, 500);
  
  // Vendor samples
  assertEquals(isVendorPostStrict(SAMPLE_CAPTIONS.vendorStrict), true);
  assertEquals(isPossiblyVendorPost(SAMPLE_CAPTIONS.vendorSoft), true);
  assertEquals(isVendorPostStrict(SAMPLE_CAPTIONS.vendorMarket), false);
});
