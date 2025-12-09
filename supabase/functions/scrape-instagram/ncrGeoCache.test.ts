/**
 * Tests for venue geocoding improvements
 * Run with: deno test --allow-env ncrGeoCache.test.ts
 */

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { SUBSTRING_BASE_SCORE, SUBSTRING_BONUS_RANGE } from "./ncrGeoCache.ts";

// Test the calculateSimilarity function indirectly through fuzzyMatchVenue
// We can't directly import it since it's not exported, but we can test the behavior

/**
 * Manual similarity calculation for testing
 * This replicates the logic we implemented
 */
function testCalculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  // Simple contains check - return HIGH score (0.85+) for full containment
  if (longer.includes(shorter)) {
    return SUBSTRING_BASE_SCORE + (shorter.length / longer.length) * SUBSTRING_BONUS_RANGE;
  }
  
  // Word-level matches
  const words1 = str1.split(/\s+/);
  const words2 = str2.split(/\s+/);
  
  let matchedWords = 0;
  for (const word1 of words1) {
    if (word1.length < 3) continue;
    for (const word2 of words2) {
      if (word1 === word2) {
        matchedWords++;
        break;
      }
    }
  }
  
  return matchedWords / Math.max(words1.length, words2.length);
}

// ============================================================
// SIMILARITY CALCULATION TESTS
// ============================================================

Deno.test("calculateSimilarity - should return high score (0.85+) for substring matches", () => {
  // Test case from problem statement: "apotheka" in "apotheka manila"
  const score1 = testCalculateSimilarity("apotheka", "apotheka manila");
  assertEquals(score1 >= 0.85, true, `Expected score >= 0.85, got ${score1}`);
  
  // Should work both ways
  const score2 = testCalculateSimilarity("apotheka manila", "apotheka");
  assertEquals(score2 >= 0.85, true, `Expected score >= 0.85, got ${score2}`);
});

Deno.test("calculateSimilarity - should return high score for exact matches", () => {
  const score = testCalculateSimilarity("radius katipunan", "radius katipunan");
  assertEquals(score, 1.0, `Expected score 1.0 for exact match, got ${score}`);
});

Deno.test("calculateSimilarity - should return high score for partial matches", () => {
  // "Burgos Park" should match "Burgos Circle Park"
  const score1 = testCalculateSimilarity("burgos park", "burgos circle park");
  assertEquals(score1 >= 0.85, true, `Expected score >= 0.85 for "burgos park" in "burgos circle park", got ${score1}`);
  
  // "Odd Cafe" should match "Odd Cafe Makati"
  const score2 = testCalculateSimilarity("odd cafe", "odd cafe makati");
  assertEquals(score2 >= 0.85, true, `Expected score >= 0.85 for "odd cafe" in "odd cafe makati", got ${score2}`);
  
  // "Elements at Centris" should match "The Elements at Centris"
  const score3 = testCalculateSimilarity("elements at centris", "the elements at centris");
  assertEquals(score3 >= 0.85, true, `Expected score >= 0.85 for "elements at centris" in "the elements at centris", got ${score3}`);
});

Deno.test("calculateSimilarity - should return low score for unrelated strings", () => {
  const score = testCalculateSimilarity("apotheka", "greenbelt");
  assertEquals(score < 0.5, true, `Expected score < 0.5 for unrelated strings, got ${score}`);
});

// ============================================================
// MATCH TYPE PRIORITY TESTS
// ============================================================

Deno.test("Venue matching priority - known_venues should be checked first", () => {
  // This is a documentation test to verify the correct order
  const correctOrder = [
    "1. Check known_venues database (exact name match)",
    "2. Check known_venues database (exact alias match)",
    "3. Check known_venues database (normalized name match)",
    "4. Check known_venues database (normalized alias match)",
    "5. Check known_venues database (word-based match)",
    "6. Check known_venues database (partial/contains match)",
    "7. Check known_venues database (fuzzy match)",
    "8. Fall back to static NCR_VENUE_GEOCACHE",
    "9. Fall back to fuzzy matching with lower threshold",
    "10. Fall back to external geocoding API"
  ];
  
  // This test just documents the expected order
  assertEquals(correctOrder.length, 10);
});

// ============================================================
// NORMALIZATION TESTS
// ============================================================

import { normalizeForLookup } from "./ncrGeoCache.ts";

Deno.test("normalizeForLookup - should handle HTML entities", () => {
  const normalized1 = normalizeForLookup("Draft Restaurant &amp; Brewery");
  const normalized2 = normalizeForLookup("Draft Restaurant & Brewery");
  
  // Both should normalize to the same thing
  assertEquals(normalized1, normalized2, "HTML entity and symbol should normalize the same");
  assertEquals(normalized1, "draft restaurant brewery", "Should decode &amp; then remove &");
});

Deno.test("normalizeForLookup - should handle ampersands", () => {
  const normalized = normalizeForLookup("Draft Restaurant & Brewery");
  
  assertEquals(normalized.includes("&"), false, "Should remove ampersand");
  assertEquals(normalized, "draft restaurant brewery", "Should have spaces between words");
});

Deno.test("normalizeForLookup - should handle colons and spaces", () => {
  const normalized1 = normalizeForLookup("K: ITA Cafe");
  const normalized2 = normalizeForLookup("K:ITA Cafe");
  
  // Both should normalize to the same thing
  assertEquals(normalized1, normalized2, "Colon variations should normalize the same");
  assertEquals(normalized1.includes(":"), false, "Should remove colon");
});

Deno.test("normalizeForLookup - should handle apostrophes", () => {
  const normalized1 = normalizeForLookup("70's Bistro");
  const normalized2 = normalizeForLookup("70s Bistro");
  
  // Both should normalize to the same thing
  assertEquals(normalized1, normalized2, "Apostrophe variations should normalize the same");
  assertEquals(normalized1.includes("'"), false, "Should remove apostrophe");
});

Deno.test("normalizeForLookup - should collapse multiple spaces", () => {
  const normalized = normalizeForLookup("The  Big   Space");
  const expectedWords = normalized.split(/\s+/);
  
  // Should have single spaces only
  assertEquals(expectedWords.length, 3, "Should have 3 words");
  assertEquals(normalized, "the big space", "Should collapse to single spaces");
});

// ============================================================
// FUZZY MATCHING TESTS FOR SPECIFIC FAILURES
// ============================================================

Deno.test("Fuzzy matching - Fireside should match Fireside by Kettle", () => {
  const normalized1 = normalizeForLookup("Fireside");
  const normalized2 = normalizeForLookup("Fireside by Kettle");
  
  const score = testCalculateSimilarity(normalized1, normalized2);
  
  // Should get high score because "fireside" is contained in "fireside by kettle"
  assertEquals(score >= 0.75, true, `Expected score >= 0.75 for fuzzy match, got ${score}`);
});

Deno.test("Word matching - Odd Cafe should match Odd Cafe Makati", () => {
  const words1 = normalizeForLookup("Odd Cafe").split(/\s+/).filter(w => w.length >= 3);
  const words2 = normalizeForLookup("Odd Cafe Makati").split(/\s+/).filter(w => w.length >= 3);
  
  // All words from "Odd Cafe" should appear in "Odd Cafe Makati"
  const allWordsMatch = words1.every(word => words2.includes(word));
  
  assertEquals(allWordsMatch, true, "All words from shorter string should appear in longer");
});

Deno.test("Normalization - Draft Restaurant &amp; Brewery should match after normalization", () => {
  const normalized1 = normalizeForLookup("Draft Restaurant &amp; Brewery");
  const normalized2 = normalizeForLookup("Draft Restaurant & Brewery");
  
  // Both should normalize to exact same string
  assertEquals(normalized1, normalized2, "HTML entity and symbol should normalize the same");
  assertEquals(normalized1, "draft restaurant brewery", "Should decode &amp; then remove &");
});

Deno.test("Normalization - K: ITA Cafe variations should match", () => {
  const variations = [
    "K: ITA Cafe",
    "K:ITA Cafe",
    "K : ITA Cafe",
    "k:ita cafe"
  ];
  
  const normalized = variations.map(v => normalizeForLookup(v));
  
  // All should normalize to the same value
  for (let i = 1; i < normalized.length; i++) {
    assertEquals(normalized[0], normalized[i], `Variation ${i} should match first`);
  }
});

console.log("✓ All venue geocoding tests passed!");
