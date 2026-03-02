import { describe, it, expect } from 'vitest';
import os from 'os';
import { resolveTildePath } from '../../src/lib/autonomous/cycle-engine';

describe('resolveTildePath', () => {
  it('resolves ~ at the start to os.homedir()', () => {
    const result = resolveTildePath('~/source/numgye');
    expect(result).toBe(`${os.homedir()}/source/numgye`);
  });

  it('resolves bare ~ to os.homedir()', () => {
    const result = resolveTildePath('~');
    expect(result).toBe(os.homedir());
  });

  it('leaves absolute paths unchanged', () => {
    const result = resolveTildePath('/Users/dev/project');
    expect(result).toBe('/Users/dev/project');
  });

  it('leaves relative paths unchanged', () => {
    const result = resolveTildePath('some/relative/path');
    expect(result).toBe('some/relative/path');
  });

  it('does not resolve ~ in the middle of a path', () => {
    const result = resolveTildePath('/some/path/~/nested');
    expect(result).toBe('/some/path/~/nested');
  });
});
