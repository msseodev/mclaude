import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { CodebaseScanner } from '../../src/lib/autonomous/codebase-scanner';

let tmpDir: string;

async function createFile(relativePath: string, content: string = ''): Promise<void> {
  const fullPath = path.join(tmpDir, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');
}

describe('CodebaseScanner', () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codebase-scanner-test-'));
  });

  afterAll(async () => {
    // Clean up all temp dirs (best effort)
    try {
      if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  describe('detectProjectType', () => {
    it('detects Next.js project from package.json', async () => {
      await createFile('package.json', JSON.stringify({
        dependencies: { next: '14.0.0', react: '18.0.0' },
      }));
      const scanner = new CodebaseScanner(tmpDir);
      const result = await scanner.detectProjectType();
      expect(result).toBe('nextjs');
    });

    it('detects React-only project from package.json', async () => {
      await createFile('package.json', JSON.stringify({
        dependencies: { react: '18.0.0', 'react-dom': '18.0.0' },
      }));
      const scanner = new CodebaseScanner(tmpDir);
      const result = await scanner.detectProjectType();
      expect(result).toBe('react');
    });

    it('returns unknown when no package.json exists', async () => {
      const scanner = new CodebaseScanner(tmpDir);
      const result = await scanner.detectProjectType();
      expect(result).toBe('unknown');
    });

    it('detects rust project from Cargo.toml', async () => {
      await createFile('Cargo.toml', '[package]\nname = "myapp"');
      const scanner = new CodebaseScanner(tmpDir);
      const result = await scanner.detectProjectType();
      expect(result).toBe('rust');
    });

    it('detects go project from go.mod', async () => {
      await createFile('go.mod', 'module example.com/myapp');
      const scanner = new CodebaseScanner(tmpDir);
      const result = await scanner.detectProjectType();
      expect(result).toBe('go');
    });

    it('detects python project from requirements.txt', async () => {
      await createFile('requirements.txt', 'flask==2.0.0');
      const scanner = new CodebaseScanner(tmpDir);
      const result = await scanner.detectProjectType();
      expect(result).toBe('python');
    });

    it('returns node for package.json with no known framework', async () => {
      await createFile('package.json', JSON.stringify({
        dependencies: { lodash: '4.0.0' },
      }));
      const scanner = new CodebaseScanner(tmpDir);
      const result = await scanner.detectProjectType();
      expect(result).toBe('node');
    });
  });

  describe('scanRoutes', () => {
    it('finds App Router routes with page.tsx files', async () => {
      await createFile('src/app/page.tsx', 'export default function Home() {}');
      await createFile('src/app/about/page.tsx', 'export default function About() {}');
      await createFile('src/app/blog/[id]/page.tsx', 'export default function BlogPost() {}');

      const scanner = new CodebaseScanner(tmpDir);
      const routes = await scanner.scanRoutes();

      expect(routes.length).toBeGreaterThanOrEqual(3);
      expect(routes).toContainEqual(expect.stringContaining('/ (page.tsx)'));
      expect(routes).toContainEqual(expect.stringContaining('/about (page.tsx)'));
      expect(routes).toContainEqual(expect.stringContaining('/blog/[id] (page.tsx)'));
    });

    it('finds route.ts files', async () => {
      await createFile('src/app/api/users/route.ts', 'export function GET() {}');

      const scanner = new CodebaseScanner(tmpDir);
      const routes = await scanner.scanRoutes();

      expect(routes).toContainEqual(expect.stringContaining('/api/users (route.ts)'));
    });

    it('returns empty array when no routes exist', async () => {
      const scanner = new CodebaseScanner(tmpDir);
      const routes = await scanner.scanRoutes();
      expect(routes).toEqual([]);
    });

    it('finds layout.tsx files', async () => {
      await createFile('src/app/layout.tsx', 'export default function Layout() {}');
      await createFile('src/app/page.tsx', 'export default function Home() {}');

      const scanner = new CodebaseScanner(tmpDir);
      const routes = await scanner.scanRoutes();

      expect(routes).toContainEqual(expect.stringContaining('layout.tsx'));
    });
  });

  describe('scanComponents', () => {
    it('finds component files in src/components', async () => {
      await createFile('src/components/Button.tsx', 'export function Button() {}');
      await createFile('src/components/Modal.tsx', 'export function Modal() {}');
      await createFile('src/components/ui/Badge.tsx', 'export function Badge() {}');

      const scanner = new CodebaseScanner(tmpDir);
      const components = await scanner.scanComponents();

      expect(components.length).toBe(3);
      expect(components).toContainEqual(expect.stringContaining('Button.tsx'));
      expect(components).toContainEqual(expect.stringContaining('Modal.tsx'));
      expect(components).toContainEqual(expect.stringContaining('Badge.tsx'));
    });

    it('returns empty array when no components directory exists', async () => {
      const scanner = new CodebaseScanner(tmpDir);
      const components = await scanner.scanComponents();
      expect(components).toEqual([]);
    });

    it('returns relative paths from project root', async () => {
      await createFile('src/components/Header.tsx', '');

      const scanner = new CodebaseScanner(tmpDir);
      const components = await scanner.scanComponents();

      expect(components.length).toBe(1);
      expect(components[0]).toBe(path.join('src', 'components', 'Header.tsx'));
    });
  });

  describe('scanKeyFiles', () => {
    it('finds standard config files', async () => {
      await createFile('package.json', '{}');
      await createFile('tsconfig.json', '{}');
      await createFile('vitest.config.ts', '');

      const scanner = new CodebaseScanner(tmpDir);
      const keyFiles = await scanner.scanKeyFiles();

      expect(keyFiles).toContain('package.json');
      expect(keyFiles).toContain('tsconfig.json');
      expect(keyFiles).toContain('vitest.config.ts');
    });

    it('returns empty array when no key files exist', async () => {
      const scanner = new CodebaseScanner(tmpDir);
      const keyFiles = await scanner.scanKeyFiles();
      expect(keyFiles).toEqual([]);
    });

    it('does not include files not in the key files list', async () => {
      await createFile('random-file.txt', '');
      await createFile('package.json', '{}');

      const scanner = new CodebaseScanner(tmpDir);
      const keyFiles = await scanner.scanKeyFiles();

      expect(keyFiles).toContain('package.json');
      expect(keyFiles).not.toContain('random-file.txt');
    });
  });

  describe('formatAsMarkdown', () => {
    it('generates markdown with all sections', () => {
      const scanner = new CodebaseScanner(tmpDir);
      const md = scanner.formatAsMarkdown({
        projectType: 'nextjs',
        routeMap: ['/ (page.tsx)', '/about (page.tsx)'],
        componentTree: ['src/components/Button.tsx', 'src/components/Modal.tsx'],
        keyFiles: ['package.json', 'tsconfig.json'],
        dependencies: { react: '18.0.0', next: '14.0.0' },
        scripts: { dev: 'next dev', build: 'next build' },
      });

      expect(md).toContain('## Codebase Overview');
      expect(md).toContain('**Project Type**: nextjs');
      expect(md).toContain('### Route Map');
      expect(md).toContain('- / (page.tsx)');
      expect(md).toContain('- /about (page.tsx)');
      expect(md).toContain('### Components');
      expect(md).toContain('- src/components/Button.tsx');
      expect(md).toContain('### Key Files');
      expect(md).toContain('- package.json');
      expect(md).toContain('### Dependencies');
      expect(md).toContain('- react: 18.0.0');
      expect(md).toContain('### Scripts');
      expect(md).toContain('- `dev`: next dev');
      expect(md).toContain('- `build`: next build');
    });

    it('omits empty sections', () => {
      const scanner = new CodebaseScanner(tmpDir);
      const md = scanner.formatAsMarkdown({
        projectType: 'unknown',
        routeMap: [],
        componentTree: [],
        keyFiles: [],
        dependencies: {},
        scripts: {},
      });

      expect(md).toContain('## Codebase Overview');
      expect(md).toContain('**Project Type**: unknown');
      expect(md).not.toContain('### Route Map');
      expect(md).not.toContain('### Components');
      expect(md).not.toContain('### Key Files');
      expect(md).not.toContain('### Dependencies');
      expect(md).not.toContain('### Scripts');
    });

    it('shows truncation notice when route map is at max items', () => {
      const scanner = new CodebaseScanner(tmpDir);
      const routes = Array.from({ length: 30 }, (_, i) => `/route-${i} (page.tsx)`);
      const md = scanner.formatAsMarkdown({
        projectType: 'nextjs',
        routeMap: routes,
        componentTree: [],
        keyFiles: [],
        dependencies: {},
        scripts: {},
      });

      expect(md).toContain('truncated at 30 items');
    });
  });
});
