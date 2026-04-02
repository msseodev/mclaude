import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const TEST_DB_PATH = path.join(process.cwd(), 'test-finding-counts.db');

let db: Database.Database;

// --- Init test DB (mirrors auto_findings table from db.ts) ---

function initTestDb(): Database.Database {
  try { fs.unlinkSync(TEST_DB_PATH); } catch { /* ignore */ }
  try { fs.unlinkSync(TEST_DB_PATH + '-wal'); } catch { /* ignore */ }
  try { fs.unlinkSync(TEST_DB_PATH + '-shm'); } catch { /* ignore */ }

  const d = new Database(TEST_DB_PATH);
  d.pragma('journal_mode = WAL');
  d.pragma('foreign_keys = ON');

  d.exec(`
    CREATE TABLE IF NOT EXISTS auto_sessions (
      id TEXT PRIMARY KEY,
      target_project TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      total_cycles INTEGER NOT NULL DEFAULT 0,
      total_cost_usd REAL NOT NULL DEFAULT 0,
      config TEXT,
      initial_prompt TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auto_findings (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'P2',
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      file_path TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      resolved_by_cycle_id TEXT,
      failure_history TEXT,
      resolution_summary TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES auto_sessions(id) ON DELETE CASCADE
    );
  `);

  return d;
}

function createSession(id: string, targetProject: string): void {
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO auto_sessions (id, target_project, status, total_cycles, total_cost_usd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, targetProject, 'running', 0, 0, now, now);
}

function insertFinding(sessionId: string, status: string): void {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO auto_findings (id, session_id, category, priority, title, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, sessionId, 'bug', 'P2', `Finding ${id.slice(0, 8)}`, 'test description', status, now, now);
}

/** Mirrors the getAutoFindingCounts function from src/lib/autonomous/db.ts */
function getAutoFindingCounts(sessionId: string): { total: number; open: number; resolved: number } {
  const row = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status IN ('open', 'in_progress') THEN 1 ELSE 0 END) as open,
      SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved
    FROM auto_findings WHERE session_id = ?
  `).get(sessionId) as { total: number; open: number; resolved: number };
  return {
    total: row.total ?? 0,
    open: row.open ?? 0,
    resolved: row.resolved ?? 0,
  };
}

// --- Tests ---

describe('getAutoFindingCounts', () => {
  beforeEach(() => {
    if (db) {
      try { db.close(); } catch { /* ignore */ }
    }
    db = initTestDb();
  });

  afterAll(() => {
    if (db) {
      try { db.close(); } catch { /* ignore */ }
    }
    try { fs.unlinkSync(TEST_DB_PATH); } catch { /* ignore */ }
    try { fs.unlinkSync(TEST_DB_PATH + '-wal'); } catch { /* ignore */ }
    try { fs.unlinkSync(TEST_DB_PATH + '-shm'); } catch { /* ignore */ }
  });

  it('should return correct counts for a session with mixed finding statuses', () => {
    const sessionId = uuidv4();
    createSession(sessionId, '/project');

    // 2 open, 1 in_progress, 3 resolved
    insertFinding(sessionId, 'open');
    insertFinding(sessionId, 'open');
    insertFinding(sessionId, 'in_progress');
    insertFinding(sessionId, 'resolved');
    insertFinding(sessionId, 'resolved');
    insertFinding(sessionId, 'resolved');

    const counts = getAutoFindingCounts(sessionId);

    expect(counts.total).toBe(6);
    expect(counts.open).toBe(3); // 2 open + 1 in_progress
    expect(counts.resolved).toBe(3);
  });

  it('should return zeros for a non-existent session', () => {
    const counts = getAutoFindingCounts('non-existent-session-id');

    expect(counts.total).toBe(0);
    expect(counts.open).toBe(0);
    expect(counts.resolved).toBe(0);
  });

  it('should not count findings from other sessions', () => {
    const sessionA = uuidv4();
    const sessionB = uuidv4();
    createSession(sessionA, '/project-a');
    createSession(sessionB, '/project-b');

    insertFinding(sessionA, 'open');
    insertFinding(sessionA, 'resolved');
    insertFinding(sessionB, 'open');
    insertFinding(sessionB, 'open');
    insertFinding(sessionB, 'open');

    const countsA = getAutoFindingCounts(sessionA);
    expect(countsA.total).toBe(2);
    expect(countsA.open).toBe(1);
    expect(countsA.resolved).toBe(1);

    const countsB = getAutoFindingCounts(sessionB);
    expect(countsB.total).toBe(3);
    expect(countsB.open).toBe(3);
    expect(countsB.resolved).toBe(0);
  });

  it('should handle session with only open findings', () => {
    const sessionId = uuidv4();
    createSession(sessionId, '/project');

    insertFinding(sessionId, 'open');
    insertFinding(sessionId, 'in_progress');

    const counts = getAutoFindingCounts(sessionId);
    expect(counts.total).toBe(2);
    expect(counts.open).toBe(2);
    expect(counts.resolved).toBe(0);
  });

  it('should handle session with only resolved findings', () => {
    const sessionId = uuidv4();
    createSession(sessionId, '/project');

    insertFinding(sessionId, 'resolved');
    insertFinding(sessionId, 'resolved');

    const counts = getAutoFindingCounts(sessionId);
    expect(counts.total).toBe(2);
    expect(counts.open).toBe(0);
    expect(counts.resolved).toBe(2);
  });
});
