import fs from 'fs/promises';
import path from 'path';
import { spawn, execFileSync } from 'child_process';
import { getSetting } from '../db';

const CONFIG_FILES = [
  'package.json',
  'pubspec.yaml',
  'Cargo.toml',
  'go.mod',
  'pyproject.toml',
  'build.gradle',
  'build.gradle.kts',
  'CMakeLists.txt',
  'Makefile',
  'tsconfig.json',
  'next.config.js',
  'next.config.mjs',
  'next.config.ts',
  'vite.config.ts',
  'vite.config.js',
  'angular.json',
  'vue.config.js',
  'svelte.config.js',
  'remix.config.js',
  'astro.config.mjs',
  'nuxt.config.ts',
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'requirements.txt',
  'setup.py',
  'pom.xml',
  '.env.example',
];

const SOURCE_DIRS = ['lib', 'src', 'app', 'cmd', 'pkg', 'internal', 'test', 'tests'];

const MAX_CONFIG_READ_SIZE = 5000;
const README_MAX_LINES = 100;
const LLM_TIMEOUT_MS = 60000;

interface GatheredContext {
  rootFiles: string[];
  configContents: Map<string, string>;
  sourceDirListings: Map<string, string[]>;
  readmeContent: string | null;
  claudeMdContent: string | null;
}

export class CodebaseScanner {
  constructor(private projectPath: string) {}

  /**
   * Scan the codebase and return a markdown summary.
   * Uses an LLM (haiku) to generate a project-agnostic summary from gathered context.
   * Falls back to a minimal rule-based summary on failure.
   */
  async scan(): Promise<string> {
    const context = await this.gatherContext();
    const markdown = await this.generateLLMSummary(context);
    return markdown;
  }

  /**
   * @deprecated Use scan() directly -- it now returns markdown.
   * Kept for backward compatibility; simply returns the pre-built markdown.
   */
  formatAsMarkdown(markdown: string): string {
    return markdown;
  }

  // --- Context gathering (rule-based) ---

  private async gatherContext(): Promise<GatheredContext> {
    const [rootFiles, configContents, sourceDirListings, readmeContent, claudeMdContent] =
      await Promise.all([
        this.listRootFiles(),
        this.readConfigFiles(),
        this.listSourceDirs(),
        this.readFileHead('README.md', README_MAX_LINES),
        this.readFileHead('CLAUDE.md', README_MAX_LINES),
      ]);

    return { rootFiles, configContents, sourceDirListings, readmeContent, claudeMdContent };
  }

  private async listRootFiles(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.projectPath, { withFileTypes: true });
      return entries
        .map(e => e.isDirectory() ? e.name + '/' : e.name)
        .filter(name => !name.startsWith('.') || name === '.env.example')
        .sort();
    } catch {
      return [];
    }
  }

  private async readConfigFiles(): Promise<Map<string, string>> {
    const contents = new Map<string, string>();
    const reads = CONFIG_FILES.map(async (file) => {
      try {
        const filePath = path.join(this.projectPath, file);
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) return;
        const content = await fs.readFile(filePath, 'utf-8');
        contents.set(file, content.slice(0, MAX_CONFIG_READ_SIZE));
      } catch {
        // File doesn't exist or isn't readable
      }
    });
    await Promise.all(reads);
    return contents;
  }

  private async listSourceDirs(): Promise<Map<string, string[]>> {
    const listings = new Map<string, string[]>();
    const checks = SOURCE_DIRS.map(async (dir) => {
      try {
        const absDir = path.join(this.projectPath, dir);
        const stat = await fs.stat(absDir);
        if (!stat.isDirectory()) return;
        const entries = await fs.readdir(absDir, { withFileTypes: true });
        const names = entries
          .map(e => e.isDirectory() ? e.name + '/' : e.name)
          .sort();
        listings.set(dir, names);
      } catch {
        // Directory doesn't exist
      }
    });
    await Promise.all(checks);
    return listings;
  }

  private async readFileHead(fileName: string, maxLines: number): Promise<string | null> {
    try {
      const filePath = path.join(this.projectPath, fileName);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n').slice(0, maxLines);
      return lines.join('\n');
    } catch {
      return null;
    }
  }

  // --- LLM summary generation ---

  private async generateLLMSummary(context: GatheredContext): Promise<string> {
    const contextText = this.buildContextText(context);
    const prompt = `Analyze this project and produce a concise markdown summary. Include:
- Project type and tech stack
- Directory structure overview
- Key features/modules
- Test infrastructure
- Build/run commands

Keep it under 50 lines. Start with "## Codebase Overview". This summary helps other AI agents understand the project context.

${contextText}`;

    try {
      const claudeBinary = getSetting('claude_binary') || 'claude';
      const result = await runClaudeOneShotWithModel(claudeBinary, prompt, 'haiku', LLM_TIMEOUT_MS);
      if (result && result.trim().length > 0) {
        return result.trim();
      }
    } catch {
      // Fall through to fallback
    }

    return this.buildFallbackSummary(context);
  }

  private buildContextText(context: GatheredContext): string {
    const sections: string[] = [];

    sections.push('### Root files');
    if (context.rootFiles.length > 0) {
      sections.push(context.rootFiles.join('\n'));
    } else {
      sections.push('(empty)');
    }

    if (context.configContents.size > 0) {
      sections.push('\n### Config files');
      for (const [file, content] of context.configContents) {
        sections.push(`\n--- ${file} ---`);
        sections.push(content);
      }
    }

    if (context.sourceDirListings.size > 0) {
      sections.push('\n### Source directories');
      for (const [dir, entries] of context.sourceDirListings) {
        sections.push(`\n${dir}/: ${entries.join(', ')}`);
      }
    }

    if (context.readmeContent) {
      sections.push('\n### README.md (first 100 lines)');
      sections.push(context.readmeContent);
    }

    if (context.claudeMdContent) {
      sections.push('\n### CLAUDE.md');
      sections.push(context.claudeMdContent);
    }

    return sections.join('\n');
  }

  private buildFallbackSummary(context: GatheredContext): string {
    const lines: string[] = ['## Codebase Overview'];
    lines.push('');
    lines.push('*LLM summary unavailable -- fallback to file listing.*');
    lines.push('');

    if (context.rootFiles.length > 0) {
      lines.push('### Root Files');
      for (const file of context.rootFiles.slice(0, 30)) {
        lines.push(`- ${file}`);
      }
      lines.push('');
    }

    if (context.configContents.size > 0) {
      lines.push('### Config Files Found');
      for (const file of context.configContents.keys()) {
        lines.push(`- ${file}`);
      }
      lines.push('');
    }

    if (context.sourceDirListings.size > 0) {
      lines.push('### Source Directories');
      for (const [dir, entries] of context.sourceDirListings) {
        lines.push(`- ${dir}/ (${entries.length} entries)`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

// --- Helper: one-shot Claude call with model override ---

function runClaudeOneShotWithModel(
  binary: string,
  prompt: string,
  model: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve) => {
    let resolvedBinary: string;
    try {
      resolvedBinary = path.isAbsolute(binary)
        ? binary
        : execFileSync('which', [binary], { encoding: 'utf-8' }).trim();
    } catch {
      resolve('');
      return;
    }

    const env = { ...process.env };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;

    const proc = spawn(resolvedBinary, [
      '-p', prompt,
      '--output-format', 'text',
      '--model', model,
      '--max-turns', '1',
      '--dangerously-skip-permissions',
    ], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
    }, timeoutMs);

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.on('close', (code: number | null) => {
      clearTimeout(timer);
      if (timedOut || (code !== null && code !== 0)) {
        resolve('');
        return;
      }
      resolve(stdout.trim());
    });

    proc.on('error', () => {
      clearTimeout(timer);
      resolve('');
    });
  });
}
