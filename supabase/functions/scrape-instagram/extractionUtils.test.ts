/**
 * Tests for vendor detection and event classification improvements
 * Run with: deno test --allow-env extractionUtils.test.ts
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  isVendorPostStrict,
  isPossiblyVendorPost,
  isVendorPost,
  autoTagPost,
  preNormalizeText,
} from "./extractionUtils.ts";

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
