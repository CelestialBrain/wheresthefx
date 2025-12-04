/**
 * Tests for parallel extraction module
 * Run with: deno test --allow-env parallelExtraction.test.ts
 */

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { valuesMatch, mergeResults, ExtractionResult, MergedExtractionResult } from "./parallelExtraction.ts";

// ============================================================
// valuesMatch TESTS
// ============================================================

Deno.test("valuesMatch - dates should match exactly", () => {
  assertEquals(valuesMatch("2025-12-07", "2025-12-07", "date"), true);
  assertEquals(valuesMatch("2025-12-07", "2025-12-08", "date"), false);
  assertEquals(valuesMatch(null, null, "date"), true);
  assertEquals(valuesMatch("2025-12-07", null, "date"), false);
  assertEquals(valuesMatch(null, "2025-12-07", "date"), false);
});

Deno.test("valuesMatch - times should match HH:MM", () => {
  // Same time
  assertEquals(valuesMatch("15:00:00", "15:00:00", "time"), true);
  assertEquals(valuesMatch("15:00", "15:00:00", "time"), true);
  assertEquals(valuesMatch("15:00:00", "15:00", "time"), true);
  
  // Different times
  assertEquals(valuesMatch("15:00:00", "16:00:00", "time"), false);
  assertEquals(valuesMatch("15:00:00", "15:30:00", "time"), false);
  
  // Null handling
  assertEquals(valuesMatch(null, null, "time"), true);
  assertEquals(valuesMatch("15:00:00", null, "time"), false);
});

Deno.test("valuesMatch - venues should fuzzy match", () => {
  // Exact match
  assertEquals(valuesMatch("The Victor", "The Victor", "venue"), true);
  
  // Case insensitive
  assertEquals(valuesMatch("THE VICTOR", "the victor", "venue"), true);
  
  // Substring match
  assertEquals(valuesMatch("The Victor Art Installation", "The Victor", "venue"), true);
  assertEquals(valuesMatch("The Victor", "The Victor Art Installation", "venue"), true);
  
  // Word overlap match
  assertEquals(valuesMatch("Victor Art Gallery", "The Victor", "venue"), true);
  assertEquals(valuesMatch("Mall of Asia Arena", "MOA Arena", "venue"), false); // Different words
  
  // Different venues
  assertEquals(valuesMatch("The Victor", "Radius Katipunan", "venue"), false);
  
  // Null handling
  assertEquals(valuesMatch(null, null, "venue"), true);
  assertEquals(valuesMatch("The Victor", null, "venue"), false);
});

Deno.test("valuesMatch - prices should match exactly", () => {
  assertEquals(valuesMatch(500, 500, "price"), true);
  assertEquals(valuesMatch("500", 500, "price"), true);
  assertEquals(valuesMatch(500, 300, "price"), false);
  assertEquals(valuesMatch(null, null, "price"), true);
  assertEquals(valuesMatch(500, null, "price"), false);
});

Deno.test("valuesMatch - URLs should normalize and match", () => {
  // Exact match
  assertEquals(valuesMatch("https://example.com", "https://example.com", "url"), true);
  
  // Trailing slash normalization
  assertEquals(valuesMatch("https://example.com/", "https://example.com", "url"), true);
  assertEquals(valuesMatch("https://example.com", "https://example.com/", "url"), true);
  
  // Case insensitive
  assertEquals(valuesMatch("HTTPS://Example.COM", "https://example.com", "url"), true);
  
  // Different URLs
  assertEquals(valuesMatch("https://example.com", "https://other.com", "url"), false);
  
  // Null handling
  assertEquals(valuesMatch(null, null, "url"), true);
  assertEquals(valuesMatch("https://example.com", null, "url"), false);
});

Deno.test("valuesMatch - text should normalize and match", () => {
  // Exact match
  assertEquals(valuesMatch("Hello World", "Hello World", "text"), true);
  
  // Case insensitive
  assertEquals(valuesMatch("HELLO WORLD", "hello world", "text"), true);
  
  // Extra spaces
  assertEquals(valuesMatch("Hello  World", "Hello World", "text"), true);
  
  // Different text
  assertEquals(valuesMatch("Hello", "World", "text"), false);
});

// ============================================================
// mergeResults TESTS
// ============================================================

Deno.test("mergeResults - both agree scenario", () => {
  const regexResult: ExtractionResult = {
    eventDate: "2025-12-07",
    eventTime: "15:00:00",
    locationName: "The Victor",
    price: 500,
  };

  const aiResult: ExtractionResult = {
    eventDate: "2025-12-07",
    eventTime: "15:00:00",
    locationName: "The Victor",
    price: 500,
    confidence: 0.9,
    isEvent: true,
  };

  const merged = mergeResults(regexResult, aiResult);

  assertEquals(merged.eventDate, "2025-12-07");
  assertEquals(merged.eventTime, "15:00:00");
  assertEquals(merged.locationName, "The Victor");
  assertEquals(merged.price, 500);
  assertEquals(merged.conflicts.length, 0);
  assertEquals(merged.overallSource, "both");
});

Deno.test("mergeResults - AI only scenario", () => {
  const regexResult: ExtractionResult = {
    eventDate: null,
    eventTime: null,
    locationName: null,
    price: null,
  };

  const aiResult: ExtractionResult = {
    eventDate: "2025-12-07",
    eventTime: "15:00:00",
    locationName: "The Victor",
    price: 500,
    confidence: 0.85,
    isEvent: true,
  };

  const merged = mergeResults(regexResult, aiResult);

  assertEquals(merged.eventDate, "2025-12-07");
  assertEquals(merged.eventTime, "15:00:00");
  assertEquals(merged.locationName, "The Victor");
  assertEquals(merged.price, 500);
  assertEquals(merged.overallSource, "ai_only");
  assertEquals(merged.confidence, 0.85);
});

Deno.test("mergeResults - regex only scenario (no AI result)", () => {
  const regexResult: ExtractionResult = {
    eventDate: "2025-12-07",
    eventTime: "15:00:00",
    locationName: "The Victor",
    price: 500,
    datePatternId: "pattern-123",
  };

  const merged = mergeResults(regexResult, null);

  assertEquals(merged.eventDate, "2025-12-07");
  assertEquals(merged.eventTime, "15:00:00");
  assertEquals(merged.locationName, "The Victor");
  assertEquals(merged.price, 500);
  assertEquals(merged.overallSource, "regex_only");
  assertEquals(merged.datePatternId, "pattern-123");
});

Deno.test("mergeResults - conflict scenario (prefers AI)", () => {
  const regexResult: ExtractionResult = {
    eventDate: "2025-12-07",
    eventTime: "15:00:00",
    locationName: "Wrong Venue",
    price: 300,
  };

  const aiResult: ExtractionResult = {
    eventDate: "2025-12-08",  // Different date
    eventTime: "15:00:00",    // Same time
    locationName: "The Victor",  // Different venue
    price: 500,               // Different price
    confidence: 0.9,
    isEvent: true,
  };

  const merged = mergeResults(regexResult, aiResult);

  // AI is preferred for high-confidence conflicts
  assertEquals(merged.eventDate, "2025-12-08");  // AI preferred
  assertEquals(merged.eventTime, "15:00:00");    // Both agree
  assertEquals(merged.locationName, "The Victor");  // AI preferred
  assertEquals(merged.price, 500);               // AI preferred
  
  // Should track conflicts
  assertEquals(merged.conflicts.length > 0, true);
  assertEquals(merged.overallSource, "conflict");
  
  // Check conflict tracking
  const dateConflict = merged.conflicts.find(c => c.field === "eventDate");
  assertEquals(dateConflict?.regexValue, "2025-12-07");
  assertEquals(dateConflict?.aiValue, "2025-12-08");
});

Deno.test("mergeResults - conflict with low AI confidence (prefers regex)", () => {
  const regexResult: ExtractionResult = {
    eventDate: "2025-12-07",
    price: 500,
  };

  const aiResult: ExtractionResult = {
    eventDate: "2025-12-08",
    price: 300,
    confidence: 0.4,  // Low confidence
    isEvent: true,
  };

  const merged = mergeResults(regexResult, aiResult);

  // Regex preferred due to low AI confidence
  assertEquals(merged.eventDate, "2025-12-07");
  assertEquals(merged.price, 500);
});

Deno.test("mergeResults - mixed sources scenario", () => {
  const regexResult: ExtractionResult = {
    eventDate: "2025-12-07",
    eventTime: null,
    locationName: "Regex Venue",
    price: null,
  };

  const aiResult: ExtractionResult = {
    eventDate: null,
    eventTime: "15:00:00",
    locationName: "AI Venue",  // Different venue
    price: 500,
    confidence: 0.8,
    isEvent: true,
  };

  const merged = mergeResults(regexResult, aiResult);

  // Date from regex (AI had null)
  assertEquals(merged.eventDate, "2025-12-07");
  assertEquals(merged.sources.eventDate, "regex");
  
  // Time from AI (regex had null)
  assertEquals(merged.eventTime, "15:00:00");
  assertEquals(merged.sources.eventTime, "ai");
  
  // Price from AI (regex had null)
  assertEquals(merged.price, 500);
  assertEquals(merged.sources.price, "ai");
  
  // Venue conflict - AI preferred
  assertEquals(merged.locationName, "AI Venue");
  
  assertEquals(merged.overallSource, "conflict");  // Due to venue conflict
});

Deno.test("mergeResults - preserves pattern IDs from regex", () => {
  const regexResult: ExtractionResult = {
    eventDate: "2025-12-07",
    datePatternId: "date-pattern-123",
    timePatternId: "time-pattern-456",
    venuePatternId: null,
    pricePatternId: "price-pattern-789",
  };

  const aiResult: ExtractionResult = {
    eventDate: "2025-12-07",
    confidence: 0.9,
    isEvent: true,
  };

  const merged = mergeResults(regexResult, aiResult);

  assertEquals(merged.datePatternId, "date-pattern-123");
  assertEquals(merged.timePatternId, "time-pattern-456");
  assertEquals(merged.venuePatternId, null);
  assertEquals(merged.pricePatternId, "price-pattern-789");
});

Deno.test("mergeResults - isEvent from AI when available", () => {
  const regexResult: ExtractionResult = {
    eventDate: "2025-12-07",
    isEvent: undefined,
  };

  const aiResult: ExtractionResult = {
    eventDate: "2025-12-07",
    isEvent: true,
    confidence: 0.9,
  };

  const merged = mergeResults(regexResult, aiResult);
  assertEquals(merged.isEvent, true);
});

Deno.test("mergeResults - handles all null values", () => {
  const regexResult: ExtractionResult = {
    eventDate: null,
    eventTime: null,
    locationName: null,
    price: null,
  };

  const aiResult: ExtractionResult = {
    eventDate: null,
    eventTime: null,
    locationName: null,
    price: null,
    confidence: 0.3,
    isEvent: false,
  };

  const merged = mergeResults(regexResult, aiResult);

  assertEquals(merged.eventDate, null);
  assertEquals(merged.eventTime, null);
  assertEquals(merged.locationName, null);
  assertEquals(merged.price, null);
  assertEquals(merged.conflicts.length, 0);
});

// ============================================================
// EDGE CASES
// ============================================================

Deno.test("valuesMatch - empty strings", () => {
  assertEquals(valuesMatch("", "", "text"), true);
  assertEquals(valuesMatch("Hello", "", "text"), false);
  assertEquals(valuesMatch("", "World", "text"), false);
});

Deno.test("valuesMatch - undefined vs null", () => {
  assertEquals(valuesMatch(undefined, null, "text"), true);
  assertEquals(valuesMatch(null, undefined, "text"), true);
  assertEquals(valuesMatch(undefined, undefined, "text"), true);
});

Deno.test("mergeResults - venue substring match treated as agreement", () => {
  const regexResult: ExtractionResult = {
    locationName: "The Victor",
  };

  const aiResult: ExtractionResult = {
    locationName: "The Victor Art Installation, Bridgetowne",
    confidence: 0.9,
    isEvent: true,
  };

  const merged = mergeResults(regexResult, aiResult);

  // Should be treated as agreement (both), using the regex value
  assertEquals(merged.sources.locationName, "both");
  assertEquals(merged.locationName, "The Victor");
  assertEquals(merged.conflicts.length, 0);
});
