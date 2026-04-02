import { execFile } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import os from 'os';
import path from 'path';

export interface UsageBucket {
  utilization: number;
  resetsAt: Date | null;
}

export interface UsageResult {
  /** Highest utilization across all buckets — use this for threshold checks */
  utilization: number;
  resetsAt: Date | null;
  fiveHour: UsageBucket | null;
  sevenDay: UsageBucket | null;
  sevenDaySonnet: UsageBucket | null;
}

const BUFFER_MS = 60 * 1000; // 60 seconds
const MAX_WAIT_MS = 5 * 60 * 60 * 1000; // 5 hours (matches Claude's rate limit window)

export function getWaitTimeMs(resetsAt: Date): number {
  const ms = resetsAt.getTime() - Date.now() + BUFFER_MS;
  if (isNaN(ms)) return BUFFER_MS;
  return Math.min(Math.max(ms, BUFFER_MS), MAX_WAIT_MS);
}

/**
 * Check Claude API usage by running a Swift script that uses macOS native URLSession.
 * This is necessary because claude.ai uses Cloudflare challenges that block Node.js fetch/curl,
 * but Swift's URLSession on macOS passes through natively.
 */
export async function checkUsage(sessionKey: string, orgId: string): Promise<UsageResult> {
  if (/[/\\]/.test(orgId)) {
    throw new Error('Invalid orgId: contains path traversal characters');
  }

  // Write a temporary Swift script with the provided credentials
  const script = generateSwiftScript(sessionKey, orgId);
  const tmpPath = path.join(os.tmpdir(), `mlaude-usage-${Date.now()}.swift`);
  await writeFile(tmpPath, script, 'utf-8');

  try {
    const output = await new Promise<string>((resolve, reject) => {
      const proc = execFile('swift', [tmpPath], { timeout: 15_000 }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message));
          return;
        }
        resolve(stdout.trim());
      });
      proc.unref();
    });

    // Parse JSON output from Swift script
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(output);
    } catch {
      // Legacy format fallback: "85|2026-04-03T02:00:00.000Z"
      const [utilStr, resetsAtStr] = output.split('|');
      const utilization = parseInt(utilStr, 10);
      if (isNaN(utilization)) throw new Error(`Unexpected usage output: ${output}`);
      return { utilization, resetsAt: resetsAtStr ? new Date(resetsAtStr) : null, fiveHour: null, sevenDay: null, sevenDaySonnet: null };
    }

    const parseBucket = (key: string): UsageBucket | null => {
      const b = parsed[key] as Record<string, unknown> | null | undefined;
      if (!b || typeof b.utilization !== 'number') return null;
      return { utilization: b.utilization, resetsAt: b.resets_at ? new Date(b.resets_at as string) : null };
    };

    const fiveHour = parseBucket('five_hour');
    const sevenDay = parseBucket('seven_day');
    const sevenDaySonnet = parseBucket('seven_day_sonnet');

    // Use highest utilization across all buckets
    const buckets = [fiveHour, sevenDay, sevenDaySonnet].filter((b): b is UsageBucket => b !== null);
    if (buckets.length === 0) throw new Error('No usage buckets found in response');

    const worst = buckets.reduce((a, b) => a.utilization >= b.utilization ? a : b);

    return {
      utilization: worst.utilization,
      resetsAt: worst.resetsAt,
      fiveHour,
      sevenDay,
      sevenDaySonnet,
    };
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

function generateSwiftScript(sessionKey: string, orgId: string): string {
  const escKey = sessionKey.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const escOrg = orgId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  return `#!/usr/bin/env swift
import Foundation
Task {
    do {
        guard let url = URL(string: "https://claude.ai/api/organizations/${escOrg}/usage") else {
            print("ERROR:Invalid URL"); exit(1)
        }
        var req = URLRequest(url: url)
        req.setValue("sessionKey=${escKey}", forHTTPHeaderField: "Cookie")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            print("ERROR:HTTP \\((response as? HTTPURLResponse)?.statusCode ?? 0)"); exit(1)
        }
        // Pass through raw JSON — Node.js will parse all buckets
        print(String(data: data, encoding: .utf8)!)
        exit(0)
    } catch {
        print("ERROR:\\(error.localizedDescription)"); exit(1)
    }
}
RunLoop.main.run()
`;
}
