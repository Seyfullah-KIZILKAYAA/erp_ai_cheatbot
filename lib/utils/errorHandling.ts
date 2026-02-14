/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * ERROR HANDLING UTILITIES
 * Provides retry logic with exponential backoff and timeout controls
 */

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    retryableErrors?: string[];
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    retryableErrors = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'fetch failed', 'network']
  } = options;

  let lastError: Error;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check if error is retryable
      const isRetryable = retryableErrors.some(msg =>
        error.message?.toLowerCase().includes(msg.toLowerCase()) ||
        error.code?.toLowerCase().includes(msg.toLowerCase())
      );

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff with jitter
      const delay = Math.min(
        baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
        maxDelay
      );

      console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay.toFixed(0)}ms delay`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError!;
}

export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  timeoutMessage?: string
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(timeoutMessage || `Operation timed out after ${timeoutMs}ms`)),
        timeoutMs
      )
    )
  ]);
}
