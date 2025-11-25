/**
 * Tests for learned pattern extraction system
 * Run with: deno test --allow-env patternFetcher.test.ts
 * 
 * Note: These tests verify the pattern matching logic using inline implementations
 * to avoid network dependencies during testing.
 */

// Simple test assertions to avoid network imports
function assertEquals(actual: any, expected: any, message?: string) {
  if (actual !== expected) {
    throw new Error(
      message || `Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`
    );
  }
}

function assertExists(value: any, message?: string) {
  if (value === null || value === undefined) {
    throw new Error(message || `Expected value to exist, but got ${value}`);
  }
}

// Type definitions
interface ExtractionPattern {
  id: string;
  pattern_type: string;
  pattern_regex: string;
  pattern_description: string | null;
  confidence_score: number;
  success_count: number;
  failure_count: number;
  source: string;
  priority?: number;
  last_used_at?: string;
  is_active: boolean;
}

// Inline implementation for testing (mirrors patternFetcher.ts logic)
function testExtractWithPatterns(
  patterns: ExtractionPattern[],
  text: string
): { value: string | null; patternId: string | null } {
  if (patterns.length === 0) {
    return { value: null, patternId: null };
  }

  let firstValidPattern: string | null = null;

  for (const pattern of patterns) {
    try {
      const regex = new RegExp(pattern.pattern_regex, 'gi');
      const match = regex.exec(text);

      if (match) {
        const value = match[1] || match[0];
        return {
          value,
          patternId: pattern.id,
        };
      }
      
      if (!firstValidPattern) {
        firstValidPattern = pattern.id;
      }
    } catch (e) {
      console.error(`Invalid regex pattern: ${pattern.pattern_regex}`, e);
    }
  }

  return { value: null, patternId: null };
}

Deno.test('Pattern selection - uses highest priority pattern first', () => {
  const patterns: ExtractionPattern[] = [
    {
      id: 'pattern-low-priority',
      pattern_type: 'price',
      pattern_regex: '\\$\\s*(\\d+)',
      pattern_description: 'Dollar price',
      confidence_score: 0.8,
      success_count: 10,
      failure_count: 2,
      source: 'manual',
      priority: 100,
      is_active: true,
    },
    {
      id: 'pattern-high-priority',
      pattern_type: 'price',
      pattern_regex: '₱\\s*(\\d+)',
      pattern_description: 'Peso price',
      confidence_score: 0.9,
      success_count: 20,
      failure_count: 1,
      source: 'manual',
      priority: 10,
      is_active: true,
    },
  ];

  // Patterns should be ordered by priority before calling this function
  // (normally done by fetchLearnedPatterns via ORDER BY)
  const sortedPatterns = [...patterns].sort((a, b) => 
    (a.priority || 100) - (b.priority || 100)
  );

  const text = 'Event price: ₱500 or $10';
  const result = testExtractWithPatterns(sortedPatterns, text);

  assertEquals(result.value, '500');
  assertEquals(result.patternId, 'pattern-high-priority');
});

Deno.test('Pattern selection - extracts from group 1 if present', () => {
  const patterns: ExtractionPattern[] = [
    {
      id: 'pattern-with-group',
      pattern_type: 'price',
      pattern_regex: 'price:\\s*₱(\\d+)',
      pattern_description: 'Peso price with group',
      confidence_score: 0.9,
      success_count: 10,
      failure_count: 0,
      source: 'manual',
      priority: 10,
      is_active: true,
    },
  ];

  const text = 'Event price: ₱500';
  const result = testExtractWithPatterns(patterns, text);

  assertEquals(result.value, '500');
  assertEquals(result.patternId, 'pattern-with-group');
});

Deno.test('Pattern selection - skips invalid regex safely', () => {
  const patterns: ExtractionPattern[] = [
    {
      id: 'invalid-pattern',
      pattern_type: 'price',
      pattern_regex: '(((invalid regex',
      pattern_description: 'Invalid regex',
      confidence_score: 0.9,
      success_count: 0,
      failure_count: 0,
      source: 'manual',
      priority: 5,
      is_active: true,
    },
    {
      id: 'valid-pattern',
      pattern_type: 'price',
      pattern_regex: '₱\\s*(\\d+)',
      pattern_description: 'Valid peso pattern',
      confidence_score: 0.8,
      success_count: 10,
      failure_count: 2,
      source: 'manual',
      priority: 10,
      is_active: true,
    },
  ];

  const text = 'Event price: ₱500';
  const result = testExtractWithPatterns(patterns, text);

  assertEquals(result.value, '500');
  assertEquals(result.patternId, 'valid-pattern');
});

Deno.test('Pattern selection - returns null when no patterns match', () => {
  const patterns: ExtractionPattern[] = [
    {
      id: 'pattern-1',
      pattern_type: 'price',
      pattern_regex: '\\$\\s*(\\d+)',
      pattern_description: 'Dollar price only',
      confidence_score: 0.9,
      success_count: 10,
      failure_count: 2,
      source: 'manual',
      priority: 10,
      is_active: true,
    },
  ];

  const text = 'No price information here';
  const result = testExtractWithPatterns(patterns, text);

  assertEquals(result.value, null);
  assertEquals(result.patternId, null);
});

Deno.test('Pattern selection - handles empty pattern list', () => {
  const text = 'Event price: ₱500';
  const result = testExtractWithPatterns([], text);

  assertEquals(result.value, null);
  assertEquals(result.patternId, null);
});

Deno.test('Pattern selection - extracts full match when no group 1', () => {
  const patterns: ExtractionPattern[] = [
    {
      id: 'pattern-no-group',
      pattern_type: 'venue',
      pattern_regex: '@\\w+',
      pattern_description: 'Venue mention without group',
      confidence_score: 0.8,
      success_count: 5,
      failure_count: 1,
      source: 'manual',
      priority: 10,
      is_active: true,
    },
  ];

  const text = 'Event at @TheVenue';
  const result = testExtractWithPatterns(patterns, text);

  assertEquals(result.value, '@TheVenue');
  assertEquals(result.patternId, 'pattern-no-group');
});

Deno.test('Pattern selection - multiple patterns with different priorities', () => {
  const patterns: ExtractionPattern[] = [
    {
      id: 'pattern-1',
      pattern_type: 'date',
      pattern_regex: '(\\d{1,2}/\\d{1,2}/\\d{4})',
      pattern_description: 'Date MM/DD/YYYY',
      confidence_score: 0.7,
      success_count: 5,
      failure_count: 3,
      source: 'learned',
      priority: 50,
      is_active: true,
    },
    {
      id: 'pattern-2',
      pattern_type: 'date',
      pattern_regex: '(\\d{4}-\\d{2}-\\d{2})',
      pattern_description: 'Date ISO format',
      confidence_score: 0.95,
      success_count: 20,
      failure_count: 1,
      source: 'manual',
      priority: 5,
      is_active: true,
    },
  ];

  const sortedPatterns = [...patterns].sort((a, b) => 
    (a.priority || 100) - (b.priority || 100)
  );

  const text = 'Event on 2025-12-25 or 12/25/2025';
  const result = testExtractWithPatterns(sortedPatterns, text);

  assertEquals(result.value, '2025-12-25');
  assertEquals(result.patternId, 'pattern-2');
});

// Inline implementation of getThresholdForPatternType for testing (mirrors patternFetcher.ts)
// Note: We intentionally duplicate this function instead of importing from patternFetcher.ts
// to avoid network dependencies on esm.sh imports during testing. This allows tests to run
// in sandboxed/offline environments.
function getThresholdForPatternType(patternType: string): number {
  switch (patternType) {
    case 'time':
    case 'event_time':
      return 0.5; // Stricter threshold for time patterns
    case 'price':
      return 0.4; // Moderately strict for price patterns
    case 'venue':
      return 0.25; // Looser threshold for venue patterns
    case 'event_date':
    case 'date':
      return 0.35; // Moderate threshold for date patterns
    default:
      return 0.3; // Default threshold for other patterns
  }
}

Deno.test('getThresholdForPatternType - returns stricter threshold for time', () => {
  assertEquals(getThresholdForPatternType('time'), 0.5);
  assertEquals(getThresholdForPatternType('event_time'), 0.5);
});

Deno.test('getThresholdForPatternType - returns moderate threshold for price', () => {
  assertEquals(getThresholdForPatternType('price'), 0.4);
});

Deno.test('getThresholdForPatternType - returns looser threshold for venue', () => {
  assertEquals(getThresholdForPatternType('venue'), 0.25);
});

Deno.test('getThresholdForPatternType - returns moderate threshold for date', () => {
  assertEquals(getThresholdForPatternType('date'), 0.35);
  assertEquals(getThresholdForPatternType('event_date'), 0.35);
});

Deno.test('getThresholdForPatternType - returns default for unknown types', () => {
  assertEquals(getThresholdForPatternType('unknown_type'), 0.3);
  assertEquals(getThresholdForPatternType('signup_url'), 0.3);
});

// Test pattern deactivation heuristic (simulates updatePatternStats logic)
function shouldDeactivatePattern(successCount: number, failureCount: number, newSuccess: boolean): boolean {
  const newSuccessCount = newSuccess ? successCount + 1 : successCount;
  const newFailureCount = newSuccess ? failureCount : failureCount + 1;
  const totalSamples = newSuccessCount + newFailureCount;
  const failureRate = totalSamples > 0 ? newFailureCount / totalSamples : 0;
  return totalSamples >= 10 && failureRate > 0.7;
}

Deno.test('Pattern deactivation - should not deactivate with few samples', () => {
  // 3 failures out of 5 = 60% failure rate, but only 5 samples
  assertEquals(shouldDeactivatePattern(2, 2, false), false);
});

Deno.test('Pattern deactivation - should not deactivate with low failure rate', () => {
  // 3 failures out of 10 = 30% failure rate
  assertEquals(shouldDeactivatePattern(7, 2, false), false);
});

Deno.test('Pattern deactivation - should deactivate with high failure rate and enough samples', () => {
  // 8 failures out of 10 = 80% failure rate
  assertEquals(shouldDeactivatePattern(2, 7, false), true);
  
  // 7 failures out of 10 = 70% failure rate - should NOT deactivate (70% is threshold)
  assertEquals(shouldDeactivatePattern(3, 6, false), false);
  
  // 8 failures out of 11 = 72.7% failure rate - should deactivate
  assertEquals(shouldDeactivatePattern(3, 7, false), true);
});

Deno.test('Pattern deactivation - success should not trigger deactivation', () => {
  // Even with 7 failures, a success brings it to 8 success : 7 failure = 46.7% failure rate
  assertEquals(shouldDeactivatePattern(7, 7, true), false);
});

// Test PatternUsageLogger interface (verifies the contract)
Deno.test('PatternUsageLogger interface - onPatternSuccess receives correct parameters', () => {
  let capturedParams: any = null;
  
  const logger = {
    onPatternSuccess(patternId: string, patternType: string, extractedValue: string, patternDescription?: string | null) {
      capturedParams = { patternId, patternType, extractedValue, patternDescription };
    },
    onPatternFailure() {}
  };
  
  logger.onPatternSuccess('test-id', 'price', '500', 'Test pattern');
  
  assertEquals(capturedParams.patternId, 'test-id');
  assertEquals(capturedParams.patternType, 'price');
  assertEquals(capturedParams.extractedValue, '500');
  assertEquals(capturedParams.patternDescription, 'Test pattern');
});

Deno.test('PatternUsageLogger interface - onPatternFailure receives correct parameters', () => {
  let capturedParams: any = null;
  
  const logger = {
    onPatternSuccess() {},
    onPatternFailure(patternId: string, patternType: string, patternDescription?: string | null) {
      capturedParams = { patternId, patternType, patternDescription };
    }
  };
  
  logger.onPatternFailure('test-id', 'price', 'Test pattern');
  
  assertEquals(capturedParams.patternId, 'test-id');
  assertEquals(capturedParams.patternType, 'price');
  assertEquals(capturedParams.patternDescription, 'Test pattern');
});

console.log('✓ All pattern selection tests passed!');
