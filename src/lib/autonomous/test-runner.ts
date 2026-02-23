import { spawn } from 'child_process';
import type { TestResult } from './types';

const TEST_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Parse test counts from common test runner output formats.
 * Supports Jest/Vitest ("X passed", "X failed", "X total")
 * and Mocha ("X passing", "X failing").
 * Returns null values if patterns cannot be matched.
 */
function parseTestCounts(output: string): {
  passCount: number | null;
  failCount: number | null;
  totalCount: number | null;
} {
  let passCount: number | null = null;
  let failCount: number | null = null;
  let totalCount: number | null = null;

  // Jest/Vitest patterns: "X passed", "X failed", "X total"
  const passedMatch = output.match(/(\d+)\s+passed/);
  const failedMatch = output.match(/(\d+)\s+failed/);
  const totalMatch = output.match(/(\d+)\s+total/);

  if (passedMatch) passCount = parseInt(passedMatch[1], 10);
  if (failedMatch) failCount = parseInt(failedMatch[1], 10);
  if (totalMatch) totalCount = parseInt(totalMatch[1], 10);

  // If we got pass/fail from Jest/Vitest, compute total if not explicitly found
  if (passCount !== null && failCount !== null && totalCount === null) {
    totalCount = passCount + failCount;
  }

  // If we already have results, return them
  if (passCount !== null || failCount !== null || totalCount !== null) {
    return { passCount, failCount, totalCount };
  }

  // Mocha patterns: "X passing", "X failing"
  const passingMatch = output.match(/(\d+)\s+passing/);
  const failingMatch = output.match(/(\d+)\s+failing/);

  if (passingMatch) passCount = parseInt(passingMatch[1], 10);
  if (failingMatch) failCount = parseInt(failingMatch[1], 10);

  if (passCount !== null && failCount !== null) {
    totalCount = passCount + failCount;
  } else if (passCount !== null) {
    totalCount = passCount;
  }

  return { passCount, failCount, totalCount };
}

export class TestRunner {
  constructor(private projectPath: string) {}

  async runTests(testCommand: string): Promise<TestResult> {
    const startTime = Date.now();

    return new Promise<TestResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let killed = false;

      const child = spawn(testCommand, [], {
        shell: true,
        cwd: this.projectPath,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const timeout = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');
        // Force kill after 5 seconds if still alive
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
      }, TEST_TIMEOUT_MS);

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code: number | null) => {
        clearTimeout(timeout);

        const duration_ms = Date.now() - startTime;
        const output = stdout + (stderr ? '\n' + stderr : '');
        const exitCode = killed ? null : code;
        const passed = !killed && code === 0;

        const { passCount, failCount, totalCount } = parseTestCounts(output);

        resolve({
          passed,
          output,
          exitCode,
          duration_ms,
          passCount,
          failCount,
          totalCount,
        });
      });

      child.on('error', (err: Error) => {
        clearTimeout(timeout);

        const duration_ms = Date.now() - startTime;

        resolve({
          passed: false,
          output: `Process error: ${err.message}`,
          exitCode: null,
          duration_ms,
          passCount: null,
          failCount: null,
          totalCount: null,
        });
      });
    });
  }
}
