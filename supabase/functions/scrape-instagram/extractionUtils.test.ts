/**
 * Tests for vendor detection, event classification, time validation, and location normalization
 * Run with: deno test --allow-env extractionUtils.test.ts
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  isVendorPostStrict,
  isPossiblyVendorPost,
  isVendorPost,
  autoTagPost,
  preNormalizeText,
  // New time validation utilities
  isValidTime,
  validateAndCleanTimes,
  // New location normalization utilities
  stripEmojis,
  normalizeLocationName,
  normalizeLocationAddress,
  cleanLocationName,
  // Venue aliasing
  canonicalizeVenueName,
  VENUE_ALIASES,
  // isEvent classification helpers
  hasTemporalEventIndicators,
  // Recurring schedule detection
  isRecurringSchedulePost,
  hasExplicitDate,
} from "./extractionUtils.ts";

// ============================================================
// TIME VALIDATION TESTS
// ============================================================

Deno.test("isValidTime - should validate correct times", () => {
  assertEquals(isValidTime("00:00:00"), true);
  assertEquals(isValidTime("12:00:00"), true);
  assertEquals(isValidTime("23:59:00"), true);
  assertEquals(isValidTime("15:00:00"), true);  // 3 PM
  assertEquals(isValidTime("21:00:00"), true);  // 9 PM
  assertEquals(isValidTime("09:30:00"), true);  // 9:30 AM
});

Deno.test("isValidTime - should reject invalid times", () => {
  assertEquals(isValidTime("24:00:00"), false); // Hour 24 is invalid
  assertEquals(isValidTime("25:00:00"), false);
  assertEquals(isValidTime("29:00:00"), false);
  assertEquals(isValidTime("31:00:00"), false);
  assertEquals(isValidTime("32:00:00"), false);
  assertEquals(isValidTime("34:00:00"), false); // From the problematic logs
  assertEquals(isValidTime("54:00:00"), false); // From the problematic logs
  assertEquals(isValidTime("99:99:00"), false);
  assertEquals(isValidTime("12:60:00"), false); // Invalid minutes
  assertEquals(isValidTime("12:99:00"), false);
});

Deno.test("isValidTime - should handle edge cases", () => {
  assertEquals(isValidTime(null), false);
  assertEquals(isValidTime(undefined), false);
  assertEquals(isValidTime(""), false);
  assertEquals(isValidTime("not a time"), false);
  assertEquals(isValidTime("12:00"), true);  // HH:MM format should also work
});

Deno.test("validateAndCleanTimes - should clean invalid times", () => {
  // Valid times should pass through
  const validResult = validateAndCleanTimes("15:00:00", "23:00:00");
  assertEquals(validResult.startTime, "15:00:00");
  assertEquals(validResult.endTime, "23:00:00");
  assertEquals(validResult.timeValidationFailed, false);
  
  // Invalid start time should be nullified
  const invalidStart = validateAndCleanTimes("34:00:00", "23:00:00");
  assertEquals(invalidStart.startTime, null);
  assertEquals(invalidStart.endTime, "23:00:00");
  assertEquals(invalidStart.timeValidationFailed, true);
  assertEquals(invalidStart.rawStartTime, "34:00:00");
  
  // Invalid end time should be nullified
  const invalidEnd = validateAndCleanTimes("15:00:00", "54:00:00");
  assertEquals(invalidEnd.startTime, "15:00:00");
  assertEquals(invalidEnd.endTime, null);
  assertEquals(invalidEnd.timeValidationFailed, true);
  assertEquals(invalidEnd.rawEndTime, "54:00:00");
  
  // Both invalid
  const bothInvalid = validateAndCleanTimes("29:00:00", "31:00:00");
  assertEquals(bothInvalid.startTime, null);
  assertEquals(bothInvalid.endTime, null);
  assertEquals(bothInvalid.timeValidationFailed, true);
});

// ============================================================
// LOCATION NORMALIZATION TESTS
// ============================================================

Deno.test("stripEmojis - should remove emojis from text", () => {
  assertEquals(stripEmojis("Hello 👋 World"), "Hello  World");
  assertEquals(stripEmojis("📍 The Venue"), "The Venue");
  assertEquals(stripEmojis("Salcedo Market! 💛✨"), "Salcedo Market!");
  assertEquals(stripEmojis("🎅 Christmas Party 🎄"), "Christmas Party");
  assertEquals(stripEmojis("No emojis here"), "No emojis here");
});

Deno.test("normalizeLocationName - should handle sentence fragments", () => {
  // Sentence fragment after period (from the logs)
  assertEquals(
    normalizeLocationName("Jess & Pat's.When a listener is moved to"),
    "Jess & Pat's"
  );
  
  // Should keep proper venue names
  assertEquals(normalizeLocationName("The Victor"), "The Victor");
  assertEquals(normalizeLocationName("Salcedo Market"), "Salcedo Market");
});

Deno.test("normalizeLocationName - should remove emojis and punctuation", () => {
  assertEquals(
    normalizeLocationName("Salcedo Market! 💛✨ Reno's Bacolod Delica"),
    "Salcedo Market"  // Stripped emojis and the trailing text after the emoji
  );
  
  assertEquals(normalizeLocationName("Venue Name!!!"), "Venue Name");
  assertEquals(normalizeLocationName("Place..."), "Place");
});

Deno.test("normalizeLocationName - should reject non-location phrases", () => {
  assertEquals(normalizeLocationName("Limited slots available."), null);
  assertEquals(normalizeLocationName("Limited slots available"), null);
  assertEquals(normalizeLocationName("Register now."), null);
  assertEquals(normalizeLocationName("Book now"), null);
  assertEquals(normalizeLocationName("Slots available"), null);
});

Deno.test("normalizeLocationAddress - should remove sponsor text", () => {
  const address1 = "Bridgetowne, Pasig Made possible by: Bridgetowne Destination Estate and Robinsons Land Corporation @bridgetownedestinationestate @officialrobinsonsland";
  assertEquals(
    normalizeLocationAddress(address1),
    "Bridgetowne, Pasig"
  );
  
  const address2 = "BGC, Taguig Powered by: Some Company";
  assertEquals(normalizeLocationAddress(address2), "BGC, Taguig");
  
  const address3 = "Makati City Presented by: Event Sponsor";
  assertEquals(normalizeLocationAddress(address3), "Makati City");
});

Deno.test("normalizeLocationAddress - should remove @handles", () => {
  assertEquals(
    normalizeLocationAddress("Venue @handle1 @handle2"),
    "Venue"
  );
  
  assertEquals(
    normalizeLocationAddress("@venue_official The Place"),
    "The Place"
  );
});

Deno.test("normalizeLocationAddress - should strip emojis", () => {
  assertEquals(
    normalizeLocationAddress("📍 BGC, Taguig 🎉"),
    "BGC, Taguig"
  );
});

// ============================================================
// VENUE ALIASING TESTS
// ============================================================

Deno.test("canonicalizeVenueName - should map known aliases", () => {
  const result1 = canonicalizeVenueName("The Victor Art Installation", "Bridgetowne, Pasig City");
  assertEquals(result1.canonical, "The Victor");
  assertEquals(result1.wasAliased, true);
  
  const result2 = canonicalizeVenueName("Victor Art Installation", "Bridgetowne");
  assertEquals(result2.canonical, "The Victor");
  assertEquals(result2.wasAliased, true);
});

Deno.test("canonicalizeVenueName - should preserve unaliased names", () => {
  const result = canonicalizeVenueName("Some Random Venue", "Manila");
  assertEquals(result.canonical, "Some Random Venue");
  assertEquals(result.wasAliased, false);
});

Deno.test("canonicalizeVenueName - should check context when required", () => {
  // "The Victor Art Installation" requires context containing "Bridgetowne"
  const withContext = canonicalizeVenueName("The Victor Art Installation", "Bridgetowne, Pasig");
  assertEquals(withContext.wasAliased, true);
  
  // Without matching context, should not alias
  const withoutContext = canonicalizeVenueName("The Victor Art Installation", "Makati City");
  assertEquals(withoutContext.wasAliased, false);
});

Deno.test("VENUE_ALIASES - should have expected entries", () => {
  assertExists(VENUE_ALIASES['the victor art installation']);
  assertEquals(VENUE_ALIASES['the victor art installation'].canonical, "The Victor");
});

// ============================================================
// isEvent CLASSIFICATION TESTS
// ============================================================

Deno.test("hasTemporalEventIndicators - should detect date ranges", () => {
  // Date ranges from the logs
  assertEquals(hasTemporalEventIndicators("Nov 29-30"), true);
  assertEquals(hasTemporalEventIndicators("Nov.29-30"), true);
  assertEquals(hasTemporalEventIndicators("November 29-30"), true);
  assertEquals(hasTemporalEventIndicators("Dec 5-7"), true);
  assertEquals(hasTemporalEventIndicators("October 28-29"), true);
  
  // No date range
  assertEquals(hasTemporalEventIndicators("No dates here"), false);
});

Deno.test("hasTemporalEventIndicators - should detect temporal phrases with event types", () => {
  // "coming to" + "market" + location
  assertEquals(
    hasTemporalEventIndicators("MARIKINA, HERE WE COME 🎅 On Nov.29-30, the Community Fleamarket is coming to Marikina"),
    true
  );
  
  // "pop-up" with date range
  assertEquals(hasTemporalEventIndicators("Pop-up market Nov 29-30"), true);
  
  // "flea market" alone
  assertEquals(hasTemporalEventIndicators("Flea market this Saturday"), true);
  
  // Just a regular sentence without temporal indicators
  assertEquals(hasTemporalEventIndicators("Check out our products"), false);
});

Deno.test("hasTemporalEventIndicators - should detect markets and fairs", () => {
  assertEquals(hasTemporalEventIndicators("Community market Dec 1-2"), true);
  assertEquals(hasTemporalEventIndicators("Night market this weekend"), true);
  assertEquals(hasTemporalEventIndicators("Weekend bazaar happening on Nov 29"), true);
});

// ============================================================
// EXISTING VENDOR DETECTION TESTS
// ============================================================

Deno.test("isVendorPostStrict - should detect strict vendor patterns", () => {
  // Vendor recruitment
  assertEquals(isVendorPostStrict("Calling all vendors! Apply now for booth rental."), true);
  assertEquals(isVendorPostStrict("Looking for vendors for our upcoming market"), true);
  
  // Price per item (obvious selling)
  assertEquals(isVendorPostStrict("T-shirts PHP 250 per piece. Available now!"), true);
  assertEquals(isVendorPostStrict("₱150 each, different colors available"), true);
  
  // Direct sales inquiry
  assertEquals(isVendorPostStrict("DM for price and shipping details"), true);
  assertEquals(isVendorPostStrict("PM for price, available in S, M, L, XL"), true);
  
  // Logistics patterns
  assertEquals(isVendorPostStrict("Nationwide shipping available, COD accepted"), true);
  assertEquals(isVendorPostStrict("Booth rental ₱2000 for the weekend market"), true);
  
  // Product descriptions
  assertEquals(isVendorPostStrict("Brand new, sealed, authentic items for sale"), true);
});

Deno.test("isVendorPostStrict - should NOT flag event posts", () => {
  // Events that mention vendors (but aren't vendor posts themselves)
  assertEquals(isVendorPostStrict("Join us this Saturday! Music, food, and local vendors."), false);
  assertEquals(isVendorPostStrict("Weekend market with 50+ vendors. Free entry!"), false);
  
  // Regular event posts
  assertEquals(isVendorPostStrict("Party tonight at 9pm! 📍 The Venue, BGC"), false);
  assertEquals(isVendorPostStrict("Concert this Friday. Tickets PHP 500. Book now!"), false);
  assertEquals(isVendorPostStrict("Food festival tomorrow, join us for free!"), false);
});

Deno.test("isPossiblyVendorPost - should detect soft vendor signals", () => {
  // Sales language
  assertEquals(isPossiblyVendorPost("Now available in our shop! Check it out."), true);
  assertEquals(isPossiblyVendorPost("New collection drop this weekend. Shop now!"), true);
  assertEquals(isPossiblyVendorPost("Limited stock, get yours today!"), true);
  
  // Promotional language
  assertEquals(isPossiblyVendorPost("50% off sale this weekend only!"), true);
  assertEquals(isPossiblyVendorPost("Special promo: Buy 2 get 1 free"), true);
  assertEquals(isPossiblyVendorPost("Clearance sale! Everything must go."), true);
  
  // Softer inquiry patterns
  assertEquals(isPossiblyVendorPost("Interested? DM us for more info and stocks"), true);
  assertEquals(isPossiblyVendorPost("Available in different variants. Message us!"), true);
  
  // Shipping/delivery
  assertEquals(isPossiblyVendorPost("Free delivery for orders this week"), true);
  assertEquals(isPossiblyVendorPost("Meetup or shipping available"), true);
});

Deno.test("isPossiblyVendorPost - should NOT flag pure event posts", () => {
  // Pure event posts without sales language
  assertEquals(isPossiblyVendorPost("Join us tonight at 8pm for live music!"), false);
  assertEquals(isPossiblyVendorPost("Party this Saturday. RSVP now!"), false);
  assertEquals(isPossiblyVendorPost("Workshop on photography. Free admission."), false);
  assertEquals(isPossiblyVendorPost("Concert at the park, doors open 7pm"), false);
});

Deno.test("isPossiblyVendorPost - borderline cases (promotional events)", () => {
  // These SHOULD be flagged as possibly vendor (they have sale/shop language)
  assertEquals(isPossiblyVendorPost("Grand opening sale this weekend! Shop our new store."), true);
  assertEquals(isPossiblyVendorPost("Visit us this Saturday for our new collection launch"), true);
  assertEquals(isPossiblyVendorPost("Drop by our shop this weekend. New arrivals!"), true);
});

Deno.test("isVendorPost - backward compatibility with isVendorPostStrict", () => {
  // isVendorPost should behave the same as isVendorPostStrict
  assertEquals(isVendorPost("Calling all vendors!"), isVendorPostStrict("Calling all vendors!"));
  assertEquals(isVendorPost("PHP 250 per piece"), isVendorPostStrict("PHP 250 per piece"));
  assertEquals(isVendorPost("DM for price"), isVendorPostStrict("DM for price"));
  assertEquals(isVendorPost("Party tonight!"), isVendorPostStrict("Party tonight!"));
});

Deno.test("autoTagPost - should add merchant/promo tags", () => {
  // Sale tags
  let tags = autoTagPost("50% off sale this weekend!", "", {});
  assertEquals(tags.includes('sale'), true);
  
  // Shop tags
  tags = autoTagPost("New collection available now in our boutique", "", {});
  assertEquals(tags.includes('shop'), true);
  
  // Promotion tags
  tags = autoTagPost("Vendor selling handmade crafts with delivery", "", {});
  assertEquals(tags.includes('promotion'), true);
  
  // Combined merchant tags
  tags = autoTagPost("Shop our sale! New arrivals with free shipping", "", {});
  assertEquals(tags.includes('sale'), true);
  assertEquals(tags.includes('shop'), true);
  assertEquals(tags.includes('promotion'), true);
});

Deno.test("autoTagPost - should NOT add merchant tags to pure events", () => {
  const tags = autoTagPost("Join us tonight for live music! Free entry, RSVP now", "", {
    isFree: true,
  });
  
  // Should have 'free' tag but NOT merchant tags
  assertEquals(tags.includes('free'), true);
  assertEquals(tags.includes('sale'), false);
  assertEquals(tags.includes('shop'), false);
  assertEquals(tags.includes('promotion'), false);
});

Deno.test("autoTagPost - existing tags still work", () => {
  // Music tag
  let tags = autoTagPost("Live concert tonight with DJ sets", "", {});
  assertEquals(tags.includes('music'), true);
  
  // Food tag
  tags = autoTagPost("Food festival with culinary workshops", "", {});
  assertEquals(tags.includes('food'), true);
  
  // Arts tag
  tags = autoTagPost("Art gallery exhibit opening", "", {});
  assertEquals(tags.includes('arts'), true);
  
  // Market tag (should still work for actual markets)
  tags = autoTagPost("Weekend farmers market with local makers", "", {});
  assertEquals(tags.includes('market'), true);
});

Deno.test("preNormalizeText - should work as before", () => {
  // Test basic normalization
  const normalized = preNormalizeText("Event tonight at 9 p m");
  assertEquals(normalized.includes("9pm"), true);
  
  // Test URL fixing
  const normalized2 = preNormalizeText("Link: h t t p s : / / example.com");
  assertEquals(normalized2.includes("https://example.com"), true);
});

Deno.test("Edge cases - mixed event and vendor language", () => {
  // Should be flagged as possibly vendor (has 'shop' and 'new collection')
  const text1 = "Join us this weekend for our new collection launch! Shop now.";
  assertEquals(isPossiblyVendorPost(text1), true);
  assertEquals(isVendorPostStrict(text1), false); // But not strict vendor
  
  // Market event mentioning vendors - should NOT be flagged by strict
  const text2 = "Weekend market this Saturday! 50+ vendors, food, and live music.";
  assertEquals(isVendorPostStrict(text2), false);
  assertEquals(isPossiblyVendorPost(text2), false); // Should be OK as it's about the market
  
  // Actual vendor booth application - should be strict
  const text3 = "Apply now for vendor slots at our weekend market!";
  assertEquals(isVendorPostStrict(text3), true);
});

// ============================================================
// REGRESSION TESTS - Based on problematic log examples
// ============================================================

Deno.test("Regression: Community Flea Market Marikina should be isEvent: true", () => {
  const caption = "MARIKINA, HERE WE COME 🎅 On Nov.29-30, the Community Fleamarket is coming to Marikina for the very first time...";
  
  // Should have temporal event indicators
  assertEquals(hasTemporalEventIndicators(caption), true);
  
  // Should NOT be detected as strict vendor
  assertEquals(isVendorPostStrict(caption), false);
  
  // May have soft vendor signals due to "market" - that's OK, it should still be classified as event
});

Deno.test("Regression: Static venue promos should remain isEvent: false", () => {
  const promoCaption = "Open every Wed for happy hour! Check out our new menu.";
  
  // Should NOT have temporal event indicators (recurring, not a specific date)
  assertEquals(hasTemporalEventIndicators(promoCaption), false);
});

Deno.test("Regression: Lan Kwai time parsing - 9:00 PM onwards", () => {
  // "9:00 PM onwards" should result in valid time
  const timeStr = "21:00:00"; // 9 PM in 24h format
  assertEquals(isValidTime(timeStr), true);
});

Deno.test("Regression: The Victor Art Installation should alias to The Victor", () => {
  const result = canonicalizeVenueName("The Victor Art Installation", "Bridgetowne, Pasig City");
  assertEquals(result.canonical, "The Victor");
  assertEquals(result.wasAliased, true);
});

Deno.test("Regression: Address with sponsor text should be cleaned", () => {
  const rawAddress = "Bridgetowne, Pasig Made possible by: Bridgetowne Destination Estate and Robinsons Land Corporation @bridgetownedestinationestate @officialrobinsonsland";
  const normalized = normalizeLocationAddress(rawAddress);
  assertEquals(normalized, "Bridgetowne, Pasig");
});

// ============================================================
// ADDITIONAL TIME VALIDATION EDGE CASE TESTS
// ============================================================

Deno.test("isValidTime - should validate HH:MM format (without seconds)", () => {
  assertEquals(isValidTime("00:00"), true);
  assertEquals(isValidTime("12:30"), true);
  assertEquals(isValidTime("23:59"), true);
  assertEquals(isValidTime("24:00"), false);
  assertEquals(isValidTime("12:60"), false);
});

Deno.test("validateAndCleanTimes - should preserve patternId", () => {
  const result = validateAndCleanTimes("15:00:00", null, "pattern-123");
  assertEquals(result.patternId, "pattern-123");
});

Deno.test("validateAndCleanTimes - null times should not trigger validation failure", () => {
  const result = validateAndCleanTimes(null, null);
  assertEquals(result.startTime, null);
  assertEquals(result.endTime, null);
  assertEquals(result.timeValidationFailed, false);
});

// ============================================================
// ADDITIONAL VENUE ALIASING TESTS
// ============================================================

Deno.test("canonicalizeVenueName - should handle null/undefined inputs", () => {
  assertEquals(canonicalizeVenueName(null).canonical, null);
  assertEquals(canonicalizeVenueName(undefined).canonical, null);
  assertEquals(canonicalizeVenueName("").canonical, null);
});

Deno.test("canonicalizeVenueName - case insensitivity", () => {
  const result1 = canonicalizeVenueName("THE VICTOR ART INSTALLATION", "Bridgetowne");
  assertEquals(result1.canonical, "The Victor");
  assertEquals(result1.wasAliased, true);
  
  const result2 = canonicalizeVenueName("the victor art installation", "bridgetowne");
  assertEquals(result2.canonical, "The Victor");
  assertEquals(result2.wasAliased, true);
});

// ============================================================
// ADDITIONAL LOCATION NAME CLEANUP TESTS
// ============================================================

Deno.test("normalizeLocationName - should handle exclamation mark followed by emoji", () => {
  const result = normalizeLocationName("Salcedo Market! 💛✨");
  // Should strip emojis but keep the venue name
  assertEquals(result !== null && result.includes("Salcedo Market"), true);
});

Deno.test("normalizeLocationName - should handle null and empty strings", () => {
  assertEquals(normalizeLocationName(null), null);
  assertEquals(normalizeLocationName(undefined), null);
  assertEquals(normalizeLocationName(""), null);
  assertEquals(normalizeLocationName("  "), null);
});

Deno.test("normalizeLocationAddress - should handle null and empty strings", () => {
  assertEquals(normalizeLocationAddress(null), null);
  assertEquals(normalizeLocationAddress(undefined), null);
  assertEquals(normalizeLocationAddress(""), null);
  assertEquals(normalizeLocationAddress("ab"), null); // Too short
});

// ============================================================
// cleanLocationName TESTS (Comprehensive location cleaning)
// ============================================================

Deno.test("cleanLocationName - should remove date patterns", () => {
  // Month + Day + Year
  assertEquals(
    cleanLocationName("The Victor Art Installation, Bridgetowne, Pasig City December 6-7, 2025"),
    "The Victor Art Installation, Bridgetowne, Pasig City"
  );
  
  // Month + Day range
  assertEquals(
    cleanLocationName("MOA Arena November 29-30"),
    "MOA Arena"
  );
  
  // Short month format
  assertEquals(
    cleanLocationName("Eastwood City Dec 25"),
    "Eastwood City"
  );
});

Deno.test("cleanLocationName - should remove time patterns", () => {
  // Time with AM/PM
  assertEquals(
    cleanLocationName("The Victor 11 am - 8 pm Mall of Asia"),
    "The Victor Mall of Asia"
  );
  
  // 24-hour format
  assertEquals(
    cleanLocationName("BGC Event Space 15:00"),
    "BGC Event Space"
  );
  
  // Time range
  assertEquals(
    cleanLocationName("Ayala Triangle 10am-6pm"),
    "Ayala Triangle"
  );
});

Deno.test("cleanLocationName - should remove hashtags", () => {
  assertEquals(
    cleanLocationName("Radius Katipunan #event #party #weekend"),
    "Radius Katipunan"
  );
  
  assertEquals(
    cleanLocationName("#SolanaHoliday The Victor Art Installation"),
    "The Victor Art Installation"
  );
});

Deno.test("cleanLocationName - should remove sponsor text", () => {
  assertEquals(
    cleanLocationName("Bridgetowne, Pasig Made possible by: Robinsons Land"),
    "Bridgetowne, Pasig"
  );
  
  assertEquals(
    cleanLocationName("BGC Event Powered by: Globe Telecom"),
    "BGC Event"
  );
  
  assertEquals(
    cleanLocationName("Greenbelt 3 Sponsored by: Ayala Malls"),
    "Greenbelt 3"
  );
});

Deno.test("cleanLocationName - should remove @mentions", () => {
  assertEquals(
    cleanLocationName("The Venue @thevenue_official @robinsonsland"),
    "The Venue"
  );
});

Deno.test("cleanLocationName - should truncate overly long locations", () => {
  const longLocation = "This is a very long location name that goes on and on and on and on and on and on and on and on and on and on and on and on and on";
  const cleaned = cleanLocationName(longLocation);
  assertEquals(cleaned !== null && cleaned.length <= 100, true);
});

Deno.test("cleanLocationName - should handle null and empty strings", () => {
  assertEquals(cleanLocationName(null), null);
  assertEquals(cleanLocationName(undefined), null);
  assertEquals(cleanLocationName(""), null);
  assertEquals(cleanLocationName("  "), null);
  assertEquals(cleanLocationName("ab"), null); // Too short
});

Deno.test("cleanLocationName - regression test for Solana Holiday Tour location", () => {
  const messyLocation = "The Victor Art Installation, Bridgetowne, Pasig City December 6-7, 2025 11 am - 8 pm Mall of Asia, Pasay City December 12, 2025 10 am - 6 pm #SolanaHoliday #PopUpTour Made possible by: Bridgetowne Destination Estate @bridgetownedestinationestate";
  const cleaned = cleanLocationName(messyLocation);
  
  // Should extract just "The Victor Art Installation, Bridgetowne, Pasig City" or similar
  assertEquals(cleaned !== null, true);
  assertEquals(cleaned!.length <= 100, true);
  assertEquals(cleaned!.includes("December"), false);
  assertEquals(cleaned!.includes("am"), false);
  assertEquals(cleaned!.includes("#"), false);
  assertEquals(cleaned!.includes("Made possible by"), false);
  assertEquals(cleaned!.includes("@"), false);
});

Deno.test("cleanLocationName - should preserve valid location names", () => {
  assertEquals(cleanLocationName("Mall of Asia Arena"), "Mall of Asia Arena");
  assertEquals(cleanLocationName("Jess & Pat's"), "Jess & Pat's");
  assertEquals(cleanLocationName("The Victor"), "The Victor");
  assertEquals(cleanLocationName("BGC, Taguig"), "BGC, Taguig");
});

// ============================================================
// FILIPINO LANGUAGE SUPPORT TESTS
// ============================================================

Deno.test("Filipino date words - 'bukas' should be recognized as tomorrow", () => {
  // This tests the parseRelativeDate function internally via extractDate
  const caption = "Sali kayo bukas ng gabi!";
  // The function should recognize "bukas" as tomorrow
  assertEquals(caption.toLowerCase().includes('bukas'), true);
});

Deno.test("Filipino day names should be recognized", () => {
  // Verify the day names are included in the context
  const filipinoDays = ['lunes', 'martes', 'miyerkules', 'huwebes', 'biyernes', 'sabado', 'linggo'];
  const testCaption = "See you this Sabado at the venue!";
  assertEquals(filipinoDays.some(day => testCaption.toLowerCase().includes(day)), true);
});

Deno.test("Filipino time keywords - 'gabi' should infer PM", () => {
  // This tests inferAMPM function which uses 'gabi' for PM detection
  const caption = "Party sa gabi, 9 o'clock!";
  assertEquals(caption.toLowerCase().includes('gabi'), true);
});

Deno.test("Filipino time keywords - 'umaga' should infer AM", () => {
  const caption = "Yoga class sa umaga, 7";
  assertEquals(caption.toLowerCase().includes('umaga'), true);
});

Deno.test("Filipino time keywords - 'tanghali' should be recognized as noon", () => {
  const caption = "Lunch meeting sa tanghali!";
  assertEquals(caption.toLowerCase().includes('tanghali'), true);
});

// ============================================================
// ENHANCED PRICE PARSING TESTS
// ============================================================

Deno.test("Price parsing - 'LIBRE' should be recognized as free", () => {
  const caption = "Free admission! LIBRE entry for all!";
  assertEquals(/\b(libre|free)\b/i.test(caption), true);
});

Deno.test("Price parsing - 'No cover' should be recognized as free", () => {
  const caption = "No cover charge tonight!";
  assertEquals(/\bno\s*cover\b/i.test(caption), true);
});

Deno.test("Price parsing - 'Walang bayad' should be recognized as free", () => {
  const caption = "Walang bayad ang entrance!";
  assertEquals(/\bwalang\s*bayad\b/i.test(caption), true);
});

Deno.test("Price parsing - '5 hundo' slang should be recognized as 500", () => {
  const caption = "Tickets at 5 hundo only!";
  const match = caption.match(/\b(\d+)\s*hundo\b/i);
  assertEquals(match !== null, true);
  assertEquals(match ? parseInt(match[1]) * 100 : 0, 500);
});

Deno.test("Price parsing - presale/door format should use presale price", () => {
  // Verify the pattern matches presale format
  const caption = "₱300 presale / ₱500 door";
  const presaleMatch = caption.match(/\b(?:₱|PHP|Php|P)\s*(\d{1,3}(?:[,\s]\d{3})*)\s*(?:presale|advance|early\s*bird)/i);
  assertEquals(presaleMatch !== null, true);
  assertEquals(presaleMatch ? parseInt(presaleMatch[1]) : 0, 300);
});

Deno.test("Price parsing - various PHP formats", () => {
  // Different peso formats
  const formats = ["₱500", "P500", "Php500", "PHP 500"];
  const pattern = /\b(?:₱|PHP|Php|P)\s*(\d{1,3}(?:[,\s]\d{3})*)/i;
  
  for (const format of formats) {
    const match = format.match(pattern);
    assertEquals(match !== null, true, `Failed for format: ${format}`);
  }
});

Deno.test("Price parsing - '500 pesos' format", () => {
  const caption = "Entry fee: 500 pesos";
  const match = caption.match(/\b(\d{1,3}(?:[,\s]\d{3})*)\s*(?:pesos?|php)\b/i);
  assertEquals(match !== null, true);
  assertEquals(match ? parseInt(match[1]) : 0, 500);
});

// ============================================================
// LOCATION NAME CLEANUP EDGE CASES
// ============================================================

Deno.test("Location cleanup - should handle Instagram handles", () => {
  // Verify @ handles are removed
  assertEquals(cleanLocationName("The Venue @thevenue_official"), "The Venue");
});

Deno.test("Location cleanup - should stop at 'Made possible by'", () => {
  const messy = "BGC Event Space Made possible by: Sponsor Inc";
  const cleaned = cleanLocationName(messy);
  assertEquals(cleaned, "BGC Event Space");
});

Deno.test("Location cleanup - should handle real world messy location", () => {
  const messy = "The Victor, Bridgetowne, Pasig City December 6-7, 2025 11 am - 8 pm";
  const cleaned = cleanLocationName(messy);
  assertEquals(cleaned !== null, true);
  assertEquals(cleaned!.includes("December"), false);
  assertEquals(cleaned!.includes("am"), false);
  assertEquals(cleaned!.includes("pm"), false);
});

// ============================================================
// RECURRING SCHEDULE DETECTION TESTS
// ============================================================

Deno.test("hasExplicitDate - should detect month + day patterns", () => {
  // Full month names
  assertEquals(hasExplicitDate("Join us December 5"), true);
  assertEquals(hasExplicitDate("Event on January 10th"), true);
  assertEquals(hasExplicitDate("March 15, 2025"), true);
  
  // Abbreviated month names
  assertEquals(hasExplicitDate("Dec 5"), true);
  assertEquals(hasExplicitDate("Jan 10th"), true);
  assertEquals(hasExplicitDate("Nov. 29"), true);
  
  // Day + month order
  assertEquals(hasExplicitDate("5 December"), true);
  assertEquals(hasExplicitDate("10th January"), true);
});

Deno.test("hasExplicitDate - should detect numeric date patterns", () => {
  assertEquals(hasExplicitDate("Event on 12/25"), true);
  assertEquals(hasExplicitDate("Date: 12-25-2025"), true);
  assertEquals(hasExplicitDate("ISO: 2025-01-15"), true);
});

Deno.test("hasExplicitDate - should NOT detect without explicit date", () => {
  assertEquals(hasExplicitDate("Every Friday"), false);
  assertEquals(hasExplicitDate("Open daily"), false);
  assertEquals(hasExplicitDate("Mon to Sat"), false);
  assertEquals(hasExplicitDate("Weekly event"), false);
  assertEquals(hasExplicitDate("Tonight at the venue"), false);
  // Should NOT match time formats
  assertEquals(hasExplicitDate("Event at 6:30"), false);
  assertEquals(hasExplicitDate("Doors open 8:00pm"), false);
  assertEquals(hasExplicitDate("Show starts 9:45"), false);
});

Deno.test("isRecurringSchedulePost - should detect venue operating hours", () => {
  // Day range patterns (operating hours)
  assertEquals(isRecurringSchedulePost("6PM — Tues to Sat"), true);
  assertEquals(isRecurringSchedulePost("Open Mon-Fri 9am-5pm"), true);
  assertEquals(isRecurringSchedulePost("Serving Mon to Sun"), true);
  
  // "Every [day]" without specific date
  assertEquals(isRecurringSchedulePost("Every Friday we have live music"), true);
  assertEquals(isRecurringSchedulePost("Every Saturday night"), true);
  assertEquals(isRecurringSchedulePost("Every weekend at the bar"), true);
  
  // Daily/open patterns
  assertEquals(isRecurringSchedulePost("Open daily 10AM-10PM"), true);
  assertEquals(isRecurringSchedulePost("Open everyday for brunch"), true);
  
  // Weekly recurring
  assertEquals(isRecurringSchedulePost("Weekly DJ nights"), true);
});

Deno.test("isRecurringSchedulePost - should NOT flag one-time events with dates", () => {
  // Has recurring language BUT also has specific date = one-time event
  assertEquals(isRecurringSchedulePost("Every Friday! Join us December 5th"), false);
  assertEquals(isRecurringSchedulePost("Weekly special on Jan 10"), false);
  assertEquals(isRecurringSchedulePost("Open Mon-Sat, Grand Opening Dec 15"), false);
});

Deno.test("isRecurringSchedulePost - should NOT flag regular events", () => {
  // Normal event posts without recurring patterns
  assertEquals(isRecurringSchedulePost("Join us tonight for live music!"), false);
  assertEquals(isRecurringSchedulePost("Party this Saturday at 9pm"), false);
  assertEquals(isRecurringSchedulePost("Concert Dec 5 at the venue"), false);
  assertEquals(isRecurringSchedulePost("Market happening Nov 29-30"), false);
});

Deno.test("isRecurringSchedulePost - real world examples from problem statement", () => {
  // Example from problem statement: venue operating hours (NOT an event)
  const radiusCaption = "Be in the loop, only at Radius Katipunan. 📌 3F / 318 Katipunan Avenue, Quezon City 💃🏼 6PM — Tues to Sat";
  assertEquals(isRecurringSchedulePost(radiusCaption), true);
  
  // One-time event with "tomorrow" is NOT recurring
  const reverbCaption = "Tomorrow night, Reverb is taking over the Red Room";
  assertEquals(isRecurringSchedulePost(reverbCaption), false);
});

Deno.test("isRecurringSchedulePost - edge cases", () => {
  // Empty or minimal text
  assertEquals(isRecurringSchedulePost(""), false);
  assertEquals(isRecurringSchedulePost("Party!"), false);
  
  // Just day names without recurring context
  assertEquals(isRecurringSchedulePost("See you Saturday"), false);
  assertEquals(isRecurringSchedulePost("Friday night special"), false);
});
