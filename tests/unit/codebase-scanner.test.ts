import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Mock child_process before importing the scanner
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execFileSync: vi.fn(() => '/usr/bin/claude'),
}));

// Mock the db module
vi.mock('../../src/lib/db', () => ({
  getSetting: vi.fn(() => 'claude'),
}));

import { CodebaseScanner } from '../../src/lib/autonomous/codebase-scanner';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

let tmpDir: string;

async function createFile(relativePath: string, content: string = ''): Promise<void> {
  const fullPath = path.join(tmpDir, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');
}

function mockClaudeProcess(output: string, exitCode: number = 0): void {
  const mockProc = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; killed: boolean; kill: () => void };
  mockProc.stdout = new EventEmitter();
  mockProc.stderr = new EventEmitter();
  mockProc.killed = false;
  mockProc.kill = vi.fn();

  (spawn as ReturnType<typeof vi.fn>).mockReturnValue(mockProc);

  // Emit output and close asynchronously
  setTimeout(() => {
    if (output) {
      mockProc.stdout.emit('data', Buffer.from(output));
    }
    mockProc.emit('close', exitCode);
  }, 10);
}

function mockClaudeProcessError(): void {
  const mockProc = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; killed: boolean; kill: () => void };
  mockProc.stdout = new EventEmitter();
  mockProc.stderr = new EventEmitter();
  mockProc.killed = false;
  mockProc.kill = vi.fn();

  (spawn as ReturnType<typeof vi.fn>).mockReturnValue(mockProc);

  setTimeout(() => {
    mockProc.emit('error', new Error('spawn ENOENT'));
  }, 10);
}

describe('CodebaseScanner', () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codebase-scanner-test-'));
    vi.clearAllMocks();
  });

  afterAll(async () => {
    try {
      if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  describe('scan() with LLM success', () => {
    it('returns LLM-generated markdown summary', async () => {
      await createFile('package.json', JSON.stringify({
        dependencies: { next: '14.0.0', react: '18.0.0' },
        scripts: { dev: 'next dev', build: 'next build' },
      }));

      const llmOutput = `## Codebase Overview
- **Project Type**: Next.js 14 with React 18
- **Tech Stack**: TypeScript, Next.js, React`;

      mockClaudeProcess(llmOutput);

      const scanner = new CodebaseScanner(tmpDir);
      const result = await scanner.scan();

      expect(result).toContain('## Codebase Overview');
      expect(result).toContain('Next.js');
    });

    it('passes gathered context to the LLM prompt', async () => {
      await createFile('package.json', JSON.stringify({ name: 'test-project' }));
      await createFile('README.md', 'This is a test project');

      mockClaudeProcess('## Codebase Overview\nTest project summary');

      const scanner = new CodebaseScanner(tmpDir);
      await scanner.scan();

      // Verify spawn was called with a prompt containing context
      expect(spawn).toHaveBeenCalledTimes(1);
      const spawnArgs = (spawn as ReturnType<typeof vi.fn>).mock.calls[0];
      const promptArg = spawnArgs[1][1]; // args[1] is the prompt after '-p'
      expect(promptArg).toContain('package.json');
      expect(promptArg).toContain('README.md');
    });

    it('uses haiku model', async () => {
      mockClaudeProcess('## Codebase Overview\nSummary');

      const scanner = new CodebaseScanner(tmpDir);
      await scanner.scan();

      const spawnArgs = (spawn as ReturnType<typeof vi.fn>).mock.calls[0];
      const args = spawnArgs[1] as string[];
      const modelIndex = args.indexOf('--model');
      expect(modelIndex).toBeGreaterThan(-1);
      expect(args[modelIndex + 1]).toBe('haiku');
    });
  });

  describe('scan() with LLM failure (fallback)', () => {
    it('returns fallback summary when LLM process exits with error', async () => {
      await createFile('package.json', JSON.stringify({ name: 'my-project' }));
      await createFile('Cargo.toml', '[package]\nname = "myapp"');

      mockClaudeProcess('', 1);

      const scanner = new CodebaseScanner(tmpDir);
      const result = await scanner.scan();

      expect(result).toContain('## Codebase Overview');
      expect(result).toContain('LLM summary unavailable');
      expect(result).toContain('package.json');
      expect(result).toContain('Cargo.toml');
    });

    it('returns fallback summary when LLM process errors', async () => {
      await createFile('go.mod', 'module example.com/myapp');

      mockClaudeProcessError();

      const scanner = new CodebaseScanner(tmpDir);
      const result = await scanner.scan();

      expect(result).toContain('## Codebase Overview');
      expect(result).toContain('LLM summary unavailable');
    });

    it('returns fallback summary when LLM returns empty output', async () => {
      await createFile('pubspec.yaml', 'name: my_app');

      mockClaudeProcess('');

      const scanner = new CodebaseScanner(tmpDir);
      const result = await scanner.scan();

      expect(result).toContain('## Codebase Overview');
      expect(result).toContain('LLM summary unavailable');
      expect(result).toContain('pubspec.yaml');
    });

    it('lists source directories in fallback', async () => {
      await createFile('src/main.ts', '');
      await createFile('lib/utils.dart', '');

      mockClaudeProcess('', 1);

      const scanner = new CodebaseScanner(tmpDir);
      const result = await scanner.scan();

      expect(result).toContain('Source Directories');
      expect(result).toContain('src/');
      expect(result).toContain('lib/');
    });
  });

  describe('context gathering', () => {
    it('reads config files when they exist', async () => {
      await createFile('package.json', JSON.stringify({ name: 'test' }));
      await createFile('tsconfig.json', '{}');
      await createFile('Makefile', 'all: build');

      const llmOutput = '## Codebase Overview\nSummary';
      mockClaudeProcess(llmOutput);

      const scanner = new CodebaseScanner(tmpDir);
      await scanner.scan();

      const spawnArgs = (spawn as ReturnType<typeof vi.fn>).mock.calls[0];
      const promptArg = spawnArgs[1][1] as string;
      expect(promptArg).toContain('package.json');
      expect(promptArg).toContain('tsconfig.json');
      expect(promptArg).toContain('Makefile');
      expect(promptArg).toContain('"name":"test"');
    });

    it('reads README.md first 100 lines', async () => {
      const lines = Array.from({ length: 150 }, (_, i) => `Line ${i + 1}`);
      await createFile('README.md', lines.join('\n'));

      mockClaudeProcess('## Codebase Overview\nSummary');

      const scanner = new CodebaseScanner(tmpDir);
      await scanner.scan();

      const spawnArgs = (spawn as ReturnType<typeof vi.fn>).mock.calls[0];
      const promptArg = spawnArgs[1][1] as string;
      expect(promptArg).toContain('Line 1');
      expect(promptArg).toContain('Line 100');
      expect(promptArg).not.toContain('Line 101');
    });

    it('reads CLAUDE.md when it exists', async () => {
      await createFile('CLAUDE.md', '# My Project\nBuild with npm run build');

      mockClaudeProcess('## Codebase Overview\nSummary');

      const scanner = new CodebaseScanner(tmpDir);
      await scanner.scan();

      const spawnArgs = (spawn as ReturnType<typeof vi.fn>).mock.calls[0];
      const promptArg = spawnArgs[1][1] as string;
      expect(promptArg).toContain('CLAUDE.md');
      expect(promptArg).toContain('Build with npm run build');
    });

    it('lists source directory contents (1 level deep)', async () => {
      await createFile('src/components/Button.tsx', '');
      await createFile('src/lib/utils.ts', '');
      await createFile('src/app.ts', '');

      mockClaudeProcess('## Codebase Overview\nSummary');

      const scanner = new CodebaseScanner(tmpDir);
      await scanner.scan();

      const spawnArgs = (spawn as ReturnType<typeof vi.fn>).mock.calls[0];
      const promptArg = spawnArgs[1][1] as string;
      expect(promptArg).toContain('src/');
      expect(promptArg).toContain('components/');
      expect(promptArg).toContain('lib/');
      expect(promptArg).toContain('app.ts');
    });

    it('filters hidden files from root listing', async () => {
      await createFile('.git/HEAD', 'ref: refs/heads/main');
      await createFile('.hidden', '');
      await createFile('visible.txt', '');
      await createFile('.env.example', 'KEY=value');

      mockClaudeProcess('## Codebase Overview\nSummary');

      const scanner = new CodebaseScanner(tmpDir);
      await scanner.scan();

      const spawnArgs = (spawn as ReturnType<typeof vi.fn>).mock.calls[0];
      const promptArg = spawnArgs[1][1] as string;
      expect(promptArg).toContain('visible.txt');
      expect(promptArg).toContain('.env.example');
      expect(promptArg).not.toContain('.git');
      expect(promptArg).not.toContain('.hidden');
    });
  });

  describe('formatAsMarkdown (backward compatibility)', () => {
    it('passes through the markdown string', () => {
      const scanner = new CodebaseScanner(tmpDir);
      const input = '## Codebase Overview\nSome content';
      expect(scanner.formatAsMarkdown(input)).toBe(input);
    });
  });
});
