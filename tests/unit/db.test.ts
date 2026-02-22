import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const TEST_DB_PATH = path.join(process.cwd(), 'test-mclaude.db');

// Direct database helper functions (mirrors src/lib/db.ts logic)
let db: Database.Database;

function initTestDb(): Database.Database {
  // Clean up any previous test db
  try { fs.unlinkSync(TEST_DB_PATH); } catch {}
  try { fs.unlinkSync(TEST_DB_PATH + '-wal'); } catch {}
  try { fs.unlinkSync(TEST_DB_PATH + '-shm'); } catch {}

  const d = new Database(TEST_DB_PATH);
  d.pragma('journal_mode = WAL');
  d.pragma('foreign_keys = ON');

  d.exec(`
    CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      queue_order INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      working_directory TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS run_sessions (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'idle',
      current_prompt_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS executions (
      id TEXT PRIMARY KEY,
      prompt_id TEXT NOT NULL,
      run_session_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      output TEXT NOT NULL DEFAULT '',
      cost_usd REAL,
      duration_ms INTEGER,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  d.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run('working_directory', process.cwd());
  d.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run('claude_binary', 'claude');

  return d;
}

// Helper functions that mirror db.ts
function getPrompts() {
  return db.prepare('SELECT * FROM prompts ORDER BY queue_order ASC').all() as Array<Record<string, unknown>>;
}

function getPrompt(id: string) {
  return db.prepare('SELECT * FROM prompts WHERE id = ?').get(id) as Record<string, unknown> | undefined;
}

function createPrompt(title: string, content: string, working_directory?: string | null) {
  const id = uuidv4();
  const now = new Date().toISOString();
  const maxOrder = db.prepare('SELECT COALESCE(MAX(queue_order), -1) as max_order FROM prompts').get() as { max_order: number };
  const queueOrder = maxOrder.max_order + 1;
  db.prepare(
    'INSERT INTO prompts (id, title, content, queue_order, status, working_directory, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, title, content, queueOrder, 'pending', working_directory ?? null, now, now);
  return getPrompt(id)!;
}

function updatePrompt(id: string, data: Record<string, unknown>) {
  const existing = getPrompt(id);
  if (!existing) return undefined;
  const now = new Date().toISOString();
  const title = data.title ?? existing.title;
  const content = data.content ?? existing.content;
  const status = data.status ?? existing.status;
  const wd = data.working_directory !== undefined ? data.working_directory : existing.working_directory;
  db.prepare('UPDATE prompts SET title = ?, content = ?, status = ?, working_directory = ?, updated_at = ? WHERE id = ?').run(title, content, status, wd, now, id);
  return getPrompt(id);
}

function deletePrompt(id: string) {
  const result = db.prepare('DELETE FROM prompts WHERE id = ?').run(id);
  return result.changes > 0;
}

function reorderPrompts(orderedIds: string[]) {
  const stmt = db.prepare('UPDATE prompts SET queue_order = ?, updated_at = ? WHERE id = ?');
  const now = new Date().toISOString();
  const transaction = db.transaction(() => {
    for (let i = 0; i < orderedIds.length; i++) {
      stmt.run(i, now, orderedIds[i]);
    }
  });
  transaction();
}

function getNextPendingPrompt() {
  return db.prepare("SELECT * FROM prompts WHERE status = 'pending' ORDER BY queue_order ASC LIMIT 1").get() as Record<string, unknown> | undefined;
}

function resetPromptStatuses() {
  const now = new Date().toISOString();
  db.prepare("UPDATE prompts SET status = 'pending', updated_at = ? WHERE status != 'pending'").run(now);
}

function createSession() {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO run_sessions (id, status, current_prompt_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, 'idle', null, now, now);
  return getSession(id)!;
}

function getSession(id: string) {
  return db.prepare('SELECT * FROM run_sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
}

function updateSession(id: string, data: Record<string, unknown>) {
  const existing = getSession(id);
  if (!existing) return undefined;
  const now = new Date().toISOString();
  const status = data.status ?? existing.status;
  const currentPromptId = data.current_prompt_id !== undefined ? data.current_prompt_id : existing.current_prompt_id;
  db.prepare('UPDATE run_sessions SET status = ?, current_prompt_id = ?, updated_at = ? WHERE id = ?').run(status, currentPromptId, now, id);
  return getSession(id);
}

function createExecution(data: { prompt_id: string; run_session_id: string }) {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO executions (id, prompt_id, run_session_id, status, output, started_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, data.prompt_id, data.run_session_id, 'running', '', now);
  return getExecution(id)!;
}

function getExecution(id: string) {
  return db.prepare('SELECT e.*, p.title as prompt_title FROM executions e LEFT JOIN prompts p ON e.prompt_id = p.id WHERE e.id = ?').get(id) as Record<string, unknown> | undefined;
}

function updateExecution(id: string, data: Record<string, unknown>) {
  const existing = getExecution(id);
  if (!existing) return undefined;
  const status = data.status ?? existing.status;
  const output = data.output ?? existing.output;
  const costUsd = data.cost_usd !== undefined ? data.cost_usd : existing.cost_usd;
  const durationMs = data.duration_ms !== undefined ? data.duration_ms : existing.duration_ms;
  const completedAt = data.completed_at !== undefined ? data.completed_at : existing.completed_at;
  db.prepare('UPDATE executions SET status = ?, output = ?, cost_usd = ?, duration_ms = ?, completed_at = ? WHERE id = ?').run(status, output, costUsd, durationMs, completedAt, id);
  return getExecution(id);
}

function getRecentExecutions(limit = 20, offset = 0) {
  return db.prepare('SELECT e.*, p.title as prompt_title FROM executions e LEFT JOIN prompts p ON e.prompt_id = p.id ORDER BY e.started_at DESC LIMIT ? OFFSET ?').all(limit, offset) as Array<Record<string, unknown>>;
}

function getSetting(key: string) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

function setSetting(key: string, value: string) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').run(key, value, value);
}

function getAllSettings() {
  return {
    working_directory: getSetting('working_directory') ?? process.cwd(),
    claude_binary: getSetting('claude_binary') ?? 'claude',
  };
}

describe('Database Operations', () => {
  beforeEach(() => {
    if (db) {
      try { db.close(); } catch {}
    }
    db = initTestDb();
  });

  afterAll(() => {
    if (db) {
      try { db.close(); } catch {}
    }
    try { fs.unlinkSync(TEST_DB_PATH); } catch {}
    try { fs.unlinkSync(TEST_DB_PATH + '-wal'); } catch {}
    try { fs.unlinkSync(TEST_DB_PATH + '-shm'); } catch {}
  });

  describe('Prompt CRUD', () => {
    it('should create a prompt', () => {
      const prompt = createPrompt('Test Title', 'Test Content');
      expect(prompt).toBeDefined();
      expect(prompt.title).toBe('Test Title');
      expect(prompt.content).toBe('Test Content');
      expect(prompt.status).toBe('pending');
      expect(prompt.queue_order).toBe(0);
    });

    it('should auto-increment queue_order', () => {
      const p1 = createPrompt('First', 'Content 1');
      const p2 = createPrompt('Second', 'Content 2');
      expect(p1.queue_order).toBe(0);
      expect(p2.queue_order).toBe(1);
    });

    it('should create prompt with working_directory', () => {
      const prompt = createPrompt('Test', 'Content', '/some/path');
      expect(prompt.working_directory).toBe('/some/path');
    });

    it('should create prompt with null working_directory', () => {
      const prompt = createPrompt('Test', 'Content', null);
      expect(prompt.working_directory).toBeNull();
    });

    it('should get all prompts ordered by queue_order', () => {
      createPrompt('First', 'Content 1');
      createPrompt('Second', 'Content 2');
      createPrompt('Third', 'Content 3');

      const prompts = getPrompts();
      expect(prompts).toHaveLength(3);
      expect(prompts[0].title).toBe('First');
      expect(prompts[1].title).toBe('Second');
      expect(prompts[2].title).toBe('Third');
    });

    it('should get a prompt by id', () => {
      const created = createPrompt('Test', 'Content');
      const fetched = getPrompt(created.id as string);
      expect(fetched).toBeDefined();
      expect(fetched!.id).toBe(created.id);
    });

    it('should return undefined for non-existent prompt', () => {
      const fetched = getPrompt('non-existent-id');
      expect(fetched).toBeUndefined();
    });

    it('should update a prompt', () => {
      const created = createPrompt('Original', 'Original content');
      const updated = updatePrompt(created.id as string, { title: 'Updated' });
      expect(updated!.title).toBe('Updated');
      expect(updated!.content).toBe('Original content');
    });

    it('should update prompt status', () => {
      const created = createPrompt('Test', 'Content');
      const updated = updatePrompt(created.id as string, { status: 'running' });
      expect(updated!.status).toBe('running');
    });

    it('should return undefined when updating non-existent prompt', () => {
      const result = updatePrompt('non-existent', { title: 'Nope' });
      expect(result).toBeUndefined();
    });

    it('should delete a prompt', () => {
      const created = createPrompt('Test', 'Content');
      const deleted = deletePrompt(created.id as string);
      expect(deleted).toBe(true);
      expect(getPrompt(created.id as string)).toBeUndefined();
    });

    it('should return false when deleting non-existent prompt', () => {
      const deleted = deletePrompt('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('Prompt Queue Operations', () => {
    it('should reorder prompts', () => {
      const p1 = createPrompt('First', 'C1');
      const p2 = createPrompt('Second', 'C2');
      const p3 = createPrompt('Third', 'C3');

      reorderPrompts([p3.id as string, p1.id as string, p2.id as string]);

      const prompts = getPrompts();
      expect(prompts[0].title).toBe('Third');
      expect(prompts[1].title).toBe('First');
      expect(prompts[2].title).toBe('Second');
    });

    it('should get next pending prompt', () => {
      createPrompt('First', 'C1');
      createPrompt('Second', 'C2');

      const next = getNextPendingPrompt();
      expect(next).toBeDefined();
      expect(next!.title).toBe('First');
    });

    it('should return undefined when no pending prompts', () => {
      const p = createPrompt('Test', 'Content');
      updatePrompt(p.id as string, { status: 'completed' });

      const next = getNextPendingPrompt();
      expect(next).toBeUndefined();
    });

    it('should reset prompt statuses to pending', () => {
      const p1 = createPrompt('P1', 'C1');
      const p2 = createPrompt('P2', 'C2');
      updatePrompt(p1.id as string, { status: 'completed' });
      updatePrompt(p2.id as string, { status: 'failed' });

      resetPromptStatuses();

      const prompts = getPrompts();
      expect(prompts.every(p => p.status === 'pending')).toBe(true);
    });
  });

  describe('Session Operations', () => {
    it('should create a session', () => {
      const session = createSession();
      expect(session).toBeDefined();
      expect(session.status).toBe('idle');
      expect(session.current_prompt_id).toBeNull();
    });

    it('should update session status', () => {
      const session = createSession();
      const updated = updateSession(session.id as string, { status: 'running' });
      expect(updated!.status).toBe('running');
    });

    it('should update session current_prompt_id', () => {
      const session = createSession();
      const updated = updateSession(session.id as string, { current_prompt_id: 'prompt-123' });
      expect(updated!.current_prompt_id).toBe('prompt-123');
    });
  });

  describe('Execution Operations', () => {
    it('should create an execution', () => {
      const prompt = createPrompt('Test', 'Content');
      const session = createSession();
      const execution = createExecution({
        prompt_id: prompt.id as string,
        run_session_id: session.id as string,
      });
      expect(execution).toBeDefined();
      expect(execution.status).toBe('running');
      expect(execution.output).toBe('');
    });

    it('should update execution', () => {
      const prompt = createPrompt('Test', 'Content');
      const session = createSession();
      const exec = createExecution({
        prompt_id: prompt.id as string,
        run_session_id: session.id as string,
      });

      const updated = updateExecution(exec.id as string, {
        status: 'completed',
        output: 'Done',
        cost_usd: 0.05,
        duration_ms: 3000,
        completed_at: new Date().toISOString(),
      });
      expect(updated!.status).toBe('completed');
      expect(updated!.output).toBe('Done');
      expect(updated!.cost_usd).toBe(0.05);
    });

    it('should get recent executions', () => {
      const prompt = createPrompt('Test', 'Content');
      const session = createSession();
      createExecution({ prompt_id: prompt.id as string, run_session_id: session.id as string });
      createExecution({ prompt_id: prompt.id as string, run_session_id: session.id as string });

      const executions = getRecentExecutions(10, 0);
      expect(executions).toHaveLength(2);
    });

    it('should join prompt_title in executions', () => {
      const prompt = createPrompt('My Prompt', 'Content');
      const session = createSession();
      const exec = createExecution({
        prompt_id: prompt.id as string,
        run_session_id: session.id as string,
      });
      expect(exec.prompt_title).toBe('My Prompt');
    });
  });

  describe('Settings Operations', () => {
    it('should get default settings', () => {
      const settings = getAllSettings();
      expect(settings.working_directory).toBeDefined();
      expect(settings.claude_binary).toBe('claude');
    });

    it('should set and get a setting', () => {
      setSetting('claude_binary', '/usr/local/bin/claude');
      const value = getSetting('claude_binary');
      expect(value).toBe('/usr/local/bin/claude');
    });

    it('should update existing setting', () => {
      setSetting('working_directory', '/new/path');
      const settings = getAllSettings();
      expect(settings.working_directory).toBe('/new/path');
    });
  });
});
