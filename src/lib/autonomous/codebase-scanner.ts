import fs from 'fs/promises';
import path from 'path';

export interface CodebaseSummary {
  projectType: string;
  routeMap: string[];
  componentTree: string[];
  keyFiles: string[];
  dependencies: Record<string, string>;
  scripts: Record<string, string>;
}

const MAX_LIST_ITEMS = 30;

const KEY_CONFIG_FILES = [
  'package.json',
  'tsconfig.json',
  'next.config.js',
  'next.config.mjs',
  'next.config.ts',
  'vite.config.ts',
  'vite.config.js',
  'tailwind.config.js',
  'tailwind.config.ts',
  'postcss.config.js',
  'postcss.config.mjs',
  '.eslintrc.js',
  '.eslintrc.json',
  'eslint.config.js',
  'eslint.config.mjs',
  'vitest.config.ts',
  'playwright.config.ts',
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  '.env.example',
  'Cargo.toml',
  'go.mod',
  'requirements.txt',
  'pyproject.toml',
];

export class CodebaseScanner {
  constructor(private projectPath: string) {}

  async scan(): Promise<CodebaseSummary> {
    const [projectType, routeMap, componentTree, keyFiles, pkgData] = await Promise.all([
      this.detectProjectType(),
      this.scanRoutes(),
      this.scanComponents(),
      this.scanKeyFiles(),
      this.readPackageJson(),
    ]);

    return {
      projectType,
      routeMap: routeMap.slice(0, MAX_LIST_ITEMS),
      componentTree: componentTree.slice(0, MAX_LIST_ITEMS),
      keyFiles,
      dependencies: pkgData.dependencies,
      scripts: pkgData.scripts,
    };
  }

  async detectProjectType(): Promise<string> {
    // Check for language-specific files first
    const checks: Array<{ file: string; type: string }> = [
      { file: 'Cargo.toml', type: 'rust' },
      { file: 'go.mod', type: 'go' },
      { file: 'requirements.txt', type: 'python' },
      { file: 'pyproject.toml', type: 'python' },
    ];

    for (const check of checks) {
      if (await this.fileExists(path.join(this.projectPath, check.file))) {
        return check.type;
      }
    }

    // Check package.json for JS/TS frameworks
    try {
      const pkgPath = path.join(this.projectPath, 'package.json');
      const content = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      const allDeps = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
      };

      if (allDeps['next']) return 'nextjs';
      if (allDeps['nuxt']) return 'nuxt';
      if (allDeps['@angular/core']) return 'angular';
      if (allDeps['svelte'] || allDeps['@sveltejs/kit']) return 'svelte';
      if (allDeps['vue']) return 'vue';
      if (allDeps['react']) return 'react';
      if (allDeps['express']) return 'node-server';
      if (allDeps['fastify']) return 'node-server';
      if (allDeps['hono']) return 'node-server';

      return 'node';
    } catch {
      return 'unknown';
    }
  }

  async scanRoutes(): Promise<string[]> {
    const routes: string[] = [];

    // Try Next.js App Router first (src/app/**/page.tsx, route.ts)
    const appRouterDirs = ['src/app', 'app'];
    for (const dir of appRouterDirs) {
      const absDir = path.join(this.projectPath, dir);
      if (await this.dirExists(absDir)) {
        const appRoutes = await this.findFiles(absDir, (name) =>
          /^(page|route|layout|loading|error|not-found)\.(tsx?|jsx?|mdx?)$/.test(name)
        );
        for (const filePath of appRoutes) {
          const rel = path.relative(absDir, filePath);
          const routePath = '/' + path.dirname(rel).replace(/\\/g, '/');
          const fileName = path.basename(filePath);
          const normalizedRoute = routePath === '/.' ? '/' : routePath;
          routes.push(`${normalizedRoute} (${fileName})`);
        }
        if (routes.length > 0) return routes;
      }
    }

    // Try Next.js Pages Router fallback (pages/**/*.tsx)
    const pagesDirs = ['src/pages', 'pages'];
    for (const dir of pagesDirs) {
      const absDir = path.join(this.projectPath, dir);
      if (await this.dirExists(absDir)) {
        const pageFiles = await this.findFiles(absDir, (name) =>
          /\.(tsx?|jsx?)$/.test(name) && !name.startsWith('_')
        );
        for (const filePath of pageFiles) {
          const rel = path.relative(absDir, filePath);
          const routePath = '/' + rel.replace(/\\/g, '/').replace(/\.(tsx?|jsx?)$/, '').replace(/\/index$/, '');
          routes.push(routePath || '/');
        }
        if (routes.length > 0) return routes;
      }
    }

    return routes;
  }

  async scanComponents(): Promise<string[]> {
    const components: string[] = [];
    const componentDirs = ['src/components', 'components', 'src/ui', 'ui'];

    for (const dir of componentDirs) {
      const absDir = path.join(this.projectPath, dir);
      if (await this.dirExists(absDir)) {
        const files = await this.findFiles(absDir, (name) =>
          /\.(tsx?|jsx?)$/.test(name)
        );
        for (const filePath of files) {
          const rel = path.relative(this.projectPath, filePath);
          components.push(rel);
        }
      }
    }

    return components;
  }

  async scanKeyFiles(): Promise<string[]> {
    const found: string[] = [];
    for (const file of KEY_CONFIG_FILES) {
      if (await this.fileExists(path.join(this.projectPath, file))) {
        found.push(file);
      }
    }
    return found;
  }

  async readPackageJson(): Promise<{ dependencies: Record<string, string>; scripts: Record<string, string> }> {
    try {
      const pkgPath = path.join(this.projectPath, 'package.json');
      const content = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      return {
        dependencies: {
          ...(pkg.dependencies ?? {}),
          ...(pkg.devDependencies ?? {}),
        },
        scripts: pkg.scripts ?? {},
      };
    } catch {
      return { dependencies: {}, scripts: {} };
    }
  }

  formatAsMarkdown(summary: CodebaseSummary): string {
    let md = `## Codebase Overview\n`;
    md += `- **Project Type**: ${summary.projectType}\n\n`;

    if (summary.routeMap.length > 0) {
      md += `### Route Map\n`;
      for (const route of summary.routeMap) {
        md += `- ${route}\n`;
      }
      if (summary.routeMap.length >= MAX_LIST_ITEMS) {
        md += `- ... (truncated at ${MAX_LIST_ITEMS} items)\n`;
      }
      md += '\n';
    }

    if (summary.componentTree.length > 0) {
      md += `### Components\n`;
      for (const comp of summary.componentTree) {
        md += `- ${comp}\n`;
      }
      if (summary.componentTree.length >= MAX_LIST_ITEMS) {
        md += `- ... (truncated at ${MAX_LIST_ITEMS} items)\n`;
      }
      md += '\n';
    }

    if (summary.keyFiles.length > 0) {
      md += `### Key Files\n`;
      for (const file of summary.keyFiles) {
        md += `- ${file}\n`;
      }
      md += '\n';
    }

    const depNames = Object.keys(summary.dependencies);
    if (depNames.length > 0) {
      md += `### Dependencies\n`;
      for (const dep of depNames.slice(0, MAX_LIST_ITEMS)) {
        md += `- ${dep}: ${summary.dependencies[dep]}\n`;
      }
      if (depNames.length > MAX_LIST_ITEMS) {
        md += `- ... (${depNames.length - MAX_LIST_ITEMS} more)\n`;
      }
      md += '\n';
    }

    const scriptNames = Object.keys(summary.scripts);
    if (scriptNames.length > 0) {
      md += `### Scripts\n`;
      for (const name of scriptNames) {
        md += `- \`${name}\`: ${summary.scripts[name]}\n`;
      }
      md += '\n';
    }

    return md;
  }

  // --- Private helpers ---

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(filePath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  private async dirExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  private async findFiles(dir: string, filter: (name: string) => boolean): Promise<string[]> {
    const results: string[] = [];
    try {
      const entries = await fs.readdir(dir, { recursive: true, withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && filter(entry.name)) {
          // In Node 20+, entry.parentPath is available; fall back to entry.path
          const parentDir = (entry as unknown as { parentPath?: string }).parentPath ?? (entry as unknown as { path?: string }).path ?? dir;
          results.push(path.join(parentDir, entry.name));
        }
      }
    } catch {
      // Directory might not be readable
    }
    return results.sort();
  }
}
