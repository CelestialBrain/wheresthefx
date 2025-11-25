/**
 * Tests for the logger module, specifically the rejected post logging types
 * Run with: deno test --allow-env --allow-net logger.test.ts
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { 
  RejectedPostReason, 
  RejectedPostLogData,
  LogEntry,
} from "./logger.ts";

// ============================================================
// REJECTED POST REASON TESTS
// ============================================================

Deno.test("RejectedPostReason - should support all expected reason types", () => {
  // These are type-level tests - if the types are wrong, this won't compile
  const reasons: RejectedPostReason[] = [
    'NOT_EVENT',
    'EVENT_ENDED',
    'VENUE_VALIDATION_FAILED',
    'PARSE_FAILED',
    'TIME_VALIDATION_FAILED',
  ];
  
  assertEquals(reasons.length, 5);
  assertEquals(reasons.includes('NOT_EVENT'), true);
  assertEquals(reasons.includes('EVENT_ENDED'), true);
  assertEquals(reasons.includes('VENUE_VALIDATION_FAILED'), true);
  assertEquals(reasons.includes('PARSE_FAILED'), true);
  assertEquals(reasons.includes('TIME_VALIDATION_FAILED'), true);
});

Deno.test("RejectedPostLogData - should accept minimal required fields", () => {
  const minimalData: RejectedPostLogData = {
    postId: 'abc123',
    reason: 'NOT_EVENT',
    reasonMessage: 'Post classified as not an event',
  };
  
  assertExists(minimalData.postId);
  assertExists(minimalData.reason);
  assertExists(minimalData.reasonMessage);
});

Deno.test("RejectedPostLogData - should accept all optional fields", () => {
  const fullData: RejectedPostLogData = {
    postId: 'abc123',
    instagramPostId: 'ig_abc123',
    reason: 'TIME_VALIDATION_FAILED',
    reasonMessage: 'Invalid time format: 34:00:00',
    eventDate: '2025-01-15',
    eventTime: '34:00:00',
    endTime: '36:00:00',
    locationName: 'The Victor',
    locationAddress: 'Bridgetowne, Pasig City',
    captionPreview: 'Join us for an amazing event...',
    extra: {
      rawEventTime: '34:00:00',
      rawEndTime: '36:00:00',
    },
  };
  
  assertEquals(fullData.postId, 'abc123');
  assertEquals(fullData.instagramPostId, 'ig_abc123');
  assertEquals(fullData.reason, 'TIME_VALIDATION_FAILED');
  assertEquals(fullData.eventDate, '2025-01-15');
  assertEquals(fullData.eventTime, '34:00:00');
  assertEquals(fullData.endTime, '36:00:00');
  assertEquals(fullData.locationName, 'The Victor');
  assertEquals(fullData.locationAddress, 'Bridgetowne, Pasig City');
  assertExists(fullData.captionPreview);
  assertExists(fullData.extra);
});

Deno.test("RejectedPostLogData - NOT_EVENT reason example", () => {
  const data: RejectedPostLogData = {
    postId: 'post_001',
    reason: 'NOT_EVENT',
    reasonMessage: 'Post classified as not an event',
    captionPreview: 'Check out our new menu!',
  };
  
  assertEquals(data.reason, 'NOT_EVENT');
});

Deno.test("RejectedPostLogData - EVENT_ENDED reason example", () => {
  const data: RejectedPostLogData = {
    postId: 'post_002',
    reason: 'EVENT_ENDED',
    reasonMessage: 'Event has ended (date: 2024-12-01)',
    eventDate: '2024-12-01',
    captionPreview: 'Thanks to everyone who joined our event!',
  };
  
  assertEquals(data.reason, 'EVENT_ENDED');
  assertEquals(data.eventDate, '2024-12-01');
});

Deno.test("RejectedPostLogData - VENUE_VALIDATION_FAILED reason example", () => {
  const data: RejectedPostLogData = {
    postId: 'post_003',
    reason: 'VENUE_VALIDATION_FAILED',
    reasonMessage: 'No valid coordinates returned',
    locationName: 'Unknown Venue',
    locationAddress: 'Some noisy address text...',
  };
  
  assertEquals(data.reason, 'VENUE_VALIDATION_FAILED');
  assertExists(data.locationName);
});

Deno.test("RejectedPostLogData - PARSE_FAILED reason example", () => {
  const data: RejectedPostLogData = {
    postId: 'post_004',
    reason: 'PARSE_FAILED',
    reasonMessage: 'Caption parsing error: Unexpected token',
    captionPreview: null,
  };
  
  assertEquals(data.reason, 'PARSE_FAILED');
  assertEquals(data.captionPreview, null);
});

Deno.test("RejectedPostLogData - TIME_VALIDATION_FAILED reason example", () => {
  const data: RejectedPostLogData = {
    postId: 'post_005',
    reason: 'TIME_VALIDATION_FAILED',
    reasonMessage: 'Invalid time format: 34:00:00',
    eventTime: '34:00:00',
    eventDate: '2025-01-15',
    extra: {
      rawEventTime: '34:00:00',
    },
  };
  
  assertEquals(data.reason, 'TIME_VALIDATION_FAILED');
  assertEquals(data.eventTime, '34:00:00');
  assertExists(data.extra);
});

// ============================================================
// LOG ENTRY STAGE TESTS
// ============================================================

Deno.test("LogEntry - should support 'rejection' stage", () => {
  // Type-level test for the 'rejection' stage
  const stages: LogEntry['stage'][] = [
    'fetch', 'ocr', 'parse', 'extraction', 'validation', 'save', 'skip', 'rejection'
  ];
  
  assertEquals(stages.includes('rejection'), true);
  assertEquals(stages.length, 8);
});
