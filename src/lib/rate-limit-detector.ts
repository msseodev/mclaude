import type { ClaudeEvent, RateLimitInfo } from './types';

export class RateLimitDetector {
  private rateLimitPatterns = [
    /usage limit reached/i,
    /rate_limit_error/i,
    /rate limit/i,
    /too many requests/i,
    /overloaded/i,
  ];

  checkExitCode(code: number | null): RateLimitInfo {
    // Exit code alone is not a reliable rate limit indicator.
    // Code 124 is timeout, not rate limit. Other non-zero codes
    // could be various errors, not necessarily rate limits.
    return {
      detected: false,
      source: null,
      message: null,
      retryAfterMs: null,
    };
  }

  checkStreamEvent(event: ClaudeEvent): RateLimitInfo {
    const notDetected: RateLimitInfo = {
      detected: false,
      source: null,
      message: null,
      retryAfterMs: null,
    };

    // Check for error-type events
    if (event.type === 'error' || (event.type === 'result' && 'is_error' in event && event.is_error)) {
      const eventStr = JSON.stringify(event);
      for (const pattern of this.rateLimitPatterns) {
        if (pattern.test(eventStr)) {
          return {
            detected: true,
            source: 'stream_event',
            message: eventStr,
            retryAfterMs: null,
          };
        }
      }
    }

    // Check subtype for rate_limit
    if ('subtype' in event && typeof event.subtype === 'string' && event.subtype === 'rate_limit') {
      return {
        detected: true,
        source: 'stream_event',
        message: JSON.stringify(event),
        retryAfterMs: null,
      };
    }

    return notDetected;
  }

  checkText(text: string): RateLimitInfo {
    for (const pattern of this.rateLimitPatterns) {
      if (pattern.test(text)) {
        return {
          detected: true,
          source: 'text_pattern',
          message: text.slice(0, 500),
          retryAfterMs: null,
        };
      }
    }

    return {
      detected: false,
      source: null,
      message: null,
      retryAfterMs: null,
    };
  }
}
