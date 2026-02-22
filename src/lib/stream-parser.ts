import type { ClaudeEvent } from './types';

export class StreamParser {
  private buffer: string = '';

  parse(chunk: string): ClaudeEvent[] {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    const events: ClaudeEvent[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        events.push(JSON.parse(trimmed));
      } catch {
        // Skip unparseable lines
      }
    }
    return events;
  }

  flush(): ClaudeEvent[] {
    if (!this.buffer.trim()) return [];
    try {
      return [JSON.parse(this.buffer.trim())];
    } catch {
      return [];
    } finally {
      this.buffer = '';
    }
  }
}
