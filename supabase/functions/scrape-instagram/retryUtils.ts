/**
 * Retry utilities for reliable API calls with exponential backoff
 * 
 * Features:
 * - Configurable retry attempts
 * - Exponential backoff with jitter
 * - Timeout support for fetch operations
 * - Error handling and logging
 */

/**
 * Options for retry behavior
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in milliseconds (default: 1000) */
  baseDelay?: number;
  /** Maximum delay in milliseconds (default: 10000) */
  maxDelay?: number;
  /** Callback invoked on each retry attempt */
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay with jitter
 * 
 * @param attempt - Current attempt number (0-indexed)
 * @param baseDelay - Base delay in milliseconds
 * @param maxDelay - Maximum delay in milliseconds
 * @returns Delay in milliseconds
 */
function calculateBackoff(attempt: number, baseDelay: number, maxDelay: number): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  
  // Add jitter (±25% randomness) to avoid thundering herd
  const jitter = exponentialDelay * 0.25 * (Math.random() - 0.5);
  const delayWithJitter = exponentialDelay + jitter;
  
  // Cap at maxDelay
  return Math.min(delayWithJitter, maxDelay);
}

/**
 * Retry a function with exponential backoff
 * 
 * @param fn - Async function to retry
 * @param options - Retry configuration options
 * @returns Promise resolving to function result
 * @throws Last error if all retries exhausted
 * 
 * @example
 * ```typescript
 * const data = await fetchWithRetry(
 *   async () => {
 *     const response = await fetch('https://api.example.com/data');
 *     if (!response.ok) throw new Error('API error');
 *     return response.json();
 *   },
 *   {
 *     maxRetries: 3,
 *     baseDelay: 1000,
 *     onRetry: (attempt, error) => console.log(`Retry ${attempt}: ${error.message}`)
 *   }
 * );
 * ```
 */
export async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    onRetry,
  } = options;
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Attempt the operation
      const result = await fn();
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // If this was the last attempt, throw the error
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      // Calculate backoff delay
      const delay = calculateBackoff(attempt, baseDelay, maxDelay);
      
      // Invoke retry callback if provided
      if (onRetry) {
        onRetry(attempt + 1, lastError);
      }
      
      // Wait before retrying
      await sleep(delay);
    }
  }
  
  // This should never be reached, but TypeScript needs it
  throw lastError || new Error('Retry failed without error');
}

/**
 * Fetch with timeout support
 * 
 * @param url - URL to fetch
 * @param options - Fetch options including optional timeout
 * @returns Promise resolving to Response
 * @throws Error if timeout exceeded or fetch fails
 * 
 * @example
 * ```typescript
 * const response = await fetchWithTimeout('https://api.example.com/data', {
 *   timeout: 5000, // 5 second timeout
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ key: 'value' })
 * });
 * ```
 */
export async function fetchWithTimeout(
  url: string,
  options?: RequestInit & { timeout?: number }
): Promise<Response> {
  const { timeout, ...fetchOptions } = options || {};
  
  // If no timeout specified, use regular fetch
  if (!timeout) {
    return fetch(url, fetchOptions);
  }
  
  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    // Check if error was due to abort (timeout)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms: ${url}`);
    }
    
    throw error;
  }
}

/**
 * Combine retry logic with timeout for robust API calls
 * 
 * @param url - URL to fetch
 * @param options - Combined fetch and retry options
 * @returns Promise resolving to Response
 * 
 * @example
 * ```typescript
 * const response = await fetchWithRetryAndTimeout('https://api.example.com/data', {
 *   timeout: 5000,
 *   maxRetries: 3,
 *   baseDelay: 1000,
 *   method: 'GET',
 *   headers: { 'Authorization': 'Bearer token' },
 *   onRetry: (attempt, error) => console.log(`Retry attempt ${attempt}: ${error.message}`)
 * });
 * ```
 */
export async function fetchWithRetryAndTimeout(
  url: string,
  options?: RequestInit & { timeout?: number } & RetryOptions
): Promise<Response> {
  const { maxRetries, baseDelay, maxDelay, onRetry, ...fetchOptions } = options || {};
  
  return fetchWithRetry(
    () => fetchWithTimeout(url, fetchOptions),
    { maxRetries, baseDelay, maxDelay, onRetry }
  );
}
