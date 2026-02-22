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
  });
});
