import { describe, it, expect, beforeEach } from 'vitest';
import { StreamParser } from '@/lib/stream-parser';

describe('StreamParser', () => {
  let parser: StreamParser;

  beforeEach(() => {
    parser = new StreamParser();
  });

  it('should parse a single complete JSON line', () => {
    const events = parser.parse('{"type":"system","subtype":"init"}\n');
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'system', subtype: 'init' });
  });

  it('should parse multiple JSON lines in a single chunk', () => {
    const events = parser.parse(
      '{"type":"system","subtype":"init"}\n{"type":"result","subtype":"done"}\n'
    );
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('system');
    expect(events[1].type).toBe('result');
  });

  it('should handle partial lines across multiple chunks', () => {
    const events1 = parser.parse('{"type":"sys');
    expect(events1).toHaveLength(0);

    const events2 = parser.parse('tem","subtype":"init"}\n');
    expect(events2).toHaveLength(1);
    expect(events2[0]).toEqual({ type: 'system', subtype: 'init' });
  });

  it('should skip empty lines', () => {
    const events = parser.parse('\n\n{"type":"system","subtype":"init"}\n\n');
    expect(events).toHaveLength(1);
  });

  it('should skip unparseable lines', () => {
    const events = parser.parse('not json\n{"type":"system","subtype":"init"}\n');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('system');
  });

  describe('flush', () => {
    it('should return remaining buffer content as event', () => {
      parser.parse('{"type":"result","subtype":"done"}');
      const events = parser.flush();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('result');
    });

    it('should return empty array if buffer is empty', () => {
      const events = parser.flush();
      expect(events).toHaveLength(0);
    });

    it('should return empty array if buffer has invalid JSON', () => {
      parser.parse('not valid json');
      const events = parser.flush();
      expect(events).toHaveLength(0);
    });

    it('should clear buffer after flush', () => {
      parser.parse('{"type":"result","subtype":"done"}');
      parser.flush();
      const events = parser.flush();
      expect(events).toHaveLength(0);
    });
  });
});
