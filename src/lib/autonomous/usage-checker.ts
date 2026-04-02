import { execFile } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import os from 'os';
import path from 'path';

export interface UsageResult {
  utilization: number;
  resetsAt: Date | null;
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

    // Parse output: "85|2026-04-03T02:00:00.000Z" or "85|"
    const [utilStr, resetsAtStr] = output.split('|');
    const utilization = parseInt(utilStr, 10);
    if (isNaN(utilization)) {
      throw new Error(`Unexpected usage output: ${output}`);
    }

    return {
      utilization,
      resetsAt: resetsAtStr ? new Date(resetsAtStr) : null,
    };
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

function generateSwiftScript(sessionKey: string, orgId: string): string {
  // Escape backslashes and quotes for Swift string literals
  const escKey = sessionKey.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const escOrg = orgId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  return `#!/usr/bin/env swift
import Foundation
func fetchUsage() async throws -> (Int, String?) {
    guard let url = URL(string: "https://claude.ai/api/organizations/${escOrg}/usage") else {
        throw NSError(domain: "URL", code: 0)
    }
    var req = URLRequest(url: url)
    req.setValue("sessionKey=${escKey}", forHTTPHeaderField: "Cookie")
    req.setValue("application/json", forHTTPHeaderField: "Accept")
    let (data, response) = try await URLSession.shared.data(for: req)
    guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
        throw NSError(domain: "HTTP", code: (response as? HTTPURLResponse)?.statusCode ?? 0)
    }
    guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let fh = json["five_hour"] as? [String: Any],
          let util = fh["utilization"] as? Int else {
        throw NSError(domain: "Parse", code: 0)
    }
    return (util, fh["resets_at"] as? String)
}
Task {
    do {
        let (u, r) = try await fetchUsage()
        print("\\(u)|\\(r ?? "")")
        exit(0)
    } catch {
        print("ERROR:\\(error.localizedDescription)")
        exit(1)
    }
}
RunLoop.main.run()
`;
}
