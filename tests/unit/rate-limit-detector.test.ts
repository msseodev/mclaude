import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimitDetector } from '@/lib/rate-limit-detector';
import type { ClaudeEvent } from '@/lib/types';

describe('RateLimitDetector', () => {
  let detector: RateLimitDetector;

  beforeEach(() => {
    detector = new RateLimitDetector();
  });

  describe('checkExitCode', () => {
    it('should not detect rate limit for any exit code', () => {
      expect(detector.checkExitCode(0).detected).toBe(false);
      expect(detector.checkExitCode(1).detected).toBe(false);
      expect(detector.checkExitCode(124).detected).toBe(false);
      expect(detector.checkExitCode(null).detected).toBe(false);
    });

    it('should return proper structure', () => {
      const result = detector.checkExitCode(1);
      expect(result).toEqual({
        detected: false,
        source: null,
        message: null,
        retryAfterMs: null,
      });
    });
  });

  describe('checkStreamEvent', () => {
    it('should detect rate limit in error events', () => {
      const event: ClaudeEvent = {
        type: 'error',
        message: 'rate_limit_error: too many requests',
      };
      const result = detector.checkStreamEvent(event);
      expect(result.detected).toBe(true);
      expect(result.source).toBe('stream_event');
    });

    it('should detect rate limit in result error events', () => {
      const event: ClaudeEvent = {
        type: 'result',
        subtype: 'error',
        is_error: true,
        result: 'usage limit reached',
      };
      const result = detector.checkStreamEvent(event);
      expect(result.detected).toBe(true);
      expect(result.source).toBe('stream_event');
    });

    it('should detect rate_limit subtype', () => {
      const event: ClaudeEvent = {
        type: 'system',
        subtype: 'rate_limit',
      };
      const result = detector.checkStreamEvent(event);
      expect(result.detected).toBe(true);
      expect(result.source).toBe('stream_event');
    });

    it('should not detect rate limit in normal events', () => {
      const event: ClaudeEvent = {
        type: 'system',
        subtype: 'init',
      };
      const result = detector.checkStreamEvent(event);
      expect(result.detected).toBe(false);
    });

    it('should detect "too many requests" pattern', () => {
      const event: ClaudeEvent = {
        type: 'error',
        message: 'Too Many Requests - please slow down',
      };
      const result = detector.checkStreamEvent(event);
      expect(result.detected).toBe(true);
    });

    it('should detect "overloaded" pattern', () => {
      const event: ClaudeEvent = {
        type: 'error',
        message: 'API overloaded',
      };
      const result = detector.checkStreamEvent(event);
      expect(result.detected).toBe(true);
    });

    it('should not detect rate limit in content_block_delta', () => {
      const event: ClaudeEvent = {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'rate limit' },
      };
      const result = detector.checkStreamEvent(event);
      expect(result.detected).toBe(false);
    });

    it('should detect "hit your limit" pattern', () => {
      const event: ClaudeEvent = {
        type: 'result',
        subtype: 'error',
        is_error: true,
        result: "You've hit your limit. resets 11am (Asia/Seoul)",
      };
      const result = detector.checkStreamEvent(event);
      expect(result.detected).toBe(true);
      expect(result.source).toBe('stream_event');
      expect(result.retryAfterMs).toBeTypeOf('number');
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });
  });

  describe('checkText', () => {
    it('should detect "usage limit reached"', () => {
      const result = detector.checkText('Error: Usage limit reached for this billing period');
      expect(result.detected).toBe(true);
      expect(result.source).toBe('text_pattern');
    });

    it('should detect "rate limit" (case insensitive)', () => {
      const result = detector.checkText('RATE LIMIT exceeded');
      expect(result.detected).toBe(true);
    });

    it('should detect "too many requests"', () => {
      const result = detector.checkText('Error 429: Too Many Requests');
      expect(result.detected).toBe(true);
    });

    it('should detect "overloaded"', () => {
      const result = detector.checkText('The API is currently overloaded');
      expect(result.detected).toBe(true);
    });

    it('should detect "hit your limit"', () => {
      const result = detector.checkText("You've hit your limit. resets 3pm (Asia/Seoul)");
      expect(result.detected).toBe(true);
      expect(result.source).toBe('text_pattern');
    });

    it('should not detect rate limit in normal text', () => {
      const result = detector.checkText('Hello, this is a normal response');
      expect(result.detected).toBe(false);
    });

    it('should truncate message to 500 chars', () => {
      const longText = 'rate limit ' + 'a'.repeat(600);
      const result = detector.checkText(longText);
      expect(result.detected).toBe(true);
      expect(result.message!.length).toBe(500);
    });

    it('should parse retryAfterMs from reset time in text', () => {
      const result = detector.checkText("You've hit your limit. resets 11am (Asia/Seoul)");
      expect(result.detected).toBe(true);
      expect(result.retryAfterMs).toBeTypeOf('number');
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });
  });

  describe('parseResetTime', () => {
    it('should parse "resets 11am (Asia/Seoul)"', () => {
      const ms = detector.parseResetTime("You've hit your limit. resets 11am (Asia/Seoul)");
      expect(ms).toBeTypeOf('number');
      expect(ms).toBeGreaterThan(0);
      // Should be at most 24 hours
      expect(ms).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 60 * 1000);
    });

    it('should parse "resets 2:30pm (US/Eastern)"', () => {
      const ms = detector.parseResetTime('resets 2:30pm (US/Eastern)');
      expect(ms).toBeTypeOf('number');
      expect(ms).toBeGreaterThan(0);
    });

    it('should parse "resets 12am (UTC)"', () => {
      const ms = detector.parseResetTime('resets 12am (UTC)');
      expect(ms).toBeTypeOf('number');
      expect(ms).toBeGreaterThan(0);
    });

    it('should parse "resets 12pm (Asia/Tokyo)"', () => {
      const ms = detector.parseResetTime('resets 12pm (Asia/Tokyo)');
      expect(ms).toBeTypeOf('number');
      expect(ms).toBeGreaterThan(0);
    });

    it('should return null for invalid timezone', () => {
      const ms = detector.parseResetTime('resets 11am (Invalid/Zone)');
      expect(ms).toBeNull();
    });

    it('should return null for text without reset time', () => {
      const ms = detector.parseResetTime('rate limit exceeded');
      expect(ms).toBeNull();
    });

    it('should include buffer time (at least 60s added)', () => {
      // Construct a reset time exactly 2 hours and 0 minutes from now in UTC
      const now = new Date();
      const futureHour = (now.getUTCHours() + 2) % 24;
      const futureMinute = now.getUTCMinutes();
      const ampm = futureHour >= 12 ? 'pm' : 'am';
      const displayHour = futureHour === 0 ? 12 : futureHour > 12 ? futureHour - 12 : futureHour;
      const text = `resets ${displayHour}:${String(futureMinute).padStart(2, '0')}${ampm} (UTC)`;

      const ms = detector.parseResetTime(text);
      expect(ms).toBeTypeOf('number');
      // Should be roughly 2 hours + 60s buffer
      const twoHoursMs = 2 * 60 * 60 * 1000;
      // Allow ±2 min tolerance for seconds rounding, but must be > 2h (buffer)
      expect(ms).toBeGreaterThan(twoHoursMs);
      expect(ms).toBeLessThan(twoHoursMs + 3 * 60 * 1000);
    });
  });
});
