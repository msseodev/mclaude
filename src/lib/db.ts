import Database from 'better-sqlite3';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { Prompt, RunSession, Execution, Settings } from './types';

const DB_PATH = path.join(process.cwd(), 'mclaude.db');

const globalForDb = globalThis as unknown as { __mclaudeDb: Database.Database };

function initDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
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

  // Insert default settings if not exist
  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  insertSetting.run('working_directory', process.cwd());
  insertSetting.run('claude_binary', 'claude');

  return db;
}

export function getDb(): Database.Database {
  if (!globalForDb.__mclaudeDb) {
    globalForDb.__mclaudeDb = initDb();
  }
  return globalForDb.__mclaudeDb;
}

// --- Prompt CRUD ---

export function getPrompts(): Prompt[] {
  const db = getDb();
  return db.prepare('SELECT * FROM prompts ORDER BY queue_order ASC').all() as Prompt[];
}

export function getPrompt(id: string): Prompt | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM prompts WHERE id = ?').get(id) as Prompt | undefined;
}

export function createPrompt(title: string, content: string, working_directory?: string | null): Prompt {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();
  const maxOrder = db.prepare('SELECT COALESCE(MAX(queue_order), -1) as max_order FROM prompts').get() as { max_order: number };
  const queueOrder = maxOrder.max_order + 1;

  db.prepare(
    'INSERT INTO prompts (id, title, content, queue_order, status, working_directory, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, title, content, queueOrder, 'pending', working_directory ?? null, now, now);

  return getPrompt(id)!;
}

export function updatePrompt(id: string, data: Partial<Pick<Prompt, 'title' | 'content' | 'status' | 'working_directory'>>): Prompt | undefined {
  const db = getDb();
  const existing = getPrompt(id);
  if (!existing) return undefined;

  const now = new Date().toISOString();
  const title = data.title ?? existing.title;
  const content = data.content ?? existing.content;
  const status = data.status ?? existing.status;
  const workingDirectory = data.working_directory !== undefined ? data.working_directory : existing.working_directory;

  db.prepare(
    'UPDATE prompts SET title = ?, content = ?, status = ?, working_directory = ?, updated_at = ? WHERE id = ?'
  ).run(title, content, status, workingDirectory, now, id);

  return getPrompt(id);
}

export function deletePrompt(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM prompts WHERE id = ?').run(id);
  return result.changes > 0;
}

export function reorderPrompts(orderedIds: string[]): void {
  const db = getDb();
  const stmt = db.prepare('UPDATE prompts SET queue_order = ?, updated_at = ? WHERE id = ?');
  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    for (let i = 0; i < orderedIds.length; i++) {
      stmt.run(i, now, orderedIds[i]);
    }
  });
  transaction();
}

export function getNextPendingPrompt(): Prompt | undefined {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM prompts WHERE status = 'pending' ORDER BY queue_order ASC LIMIT 1"
  ).get() as Prompt | undefined;
}

export function resetPromptStatuses(): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE prompts SET status = 'pending', updated_at = ? WHERE status != 'pending'"
  ).run(now);
}

// --- Run Session helpers ---

export function createSession(): RunSession {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(
    'INSERT INTO run_sessions (id, status, current_prompt_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, 'idle', null, now, now);

  return getSession(id)!;
}

export function getSession(id: string): RunSession | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM run_sessions WHERE id = ?').get(id) as RunSession | undefined;
}

export function updateSession(id: string, data: Partial<Pick<RunSession, 'status' | 'current_prompt_id'>>): RunSession | undefined {
  const db = getDb();
  const existing = getSession(id);
  if (!existing) return undefined;

  const now = new Date().toISOString();
  const status = data.status ?? existing.status;
  const currentPromptId = data.current_prompt_id !== undefined ? data.current_prompt_id : existing.current_prompt_id;

  db.prepare(
    'UPDATE run_sessions SET status = ?, current_prompt_id = ?, updated_at = ? WHERE id = ?'
  ).run(status, currentPromptId, now, id);

  return getSession(id);
}

export function getLatestSession(): RunSession | undefined {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM run_sessions ORDER BY created_at DESC LIMIT 1'
  ).get() as RunSession | undefined;
}

// --- Execution helpers ---

export function createExecution(data: { prompt_id: string; run_session_id: string }): Execution {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(
    'INSERT INTO executions (id, prompt_id, run_session_id, status, output, started_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, data.prompt_id, data.run_session_id, 'running', '', now);

  return getExecution(id)!;
}

export function updateExecution(id: string, data: Partial<Pick<Execution, 'status' | 'output' | 'cost_usd' | 'duration_ms' | 'completed_at'>>): Execution | undefined {
  const db = getDb();
  const existing = getExecution(id);
  if (!existing) return undefined;

  const status = data.status ?? existing.status;
  const output = data.output ?? existing.output;
  const costUsd = data.cost_usd !== undefined ? data.cost_usd : existing.cost_usd;
  const durationMs = data.duration_ms !== undefined ? data.duration_ms : existing.duration_ms;
  const completedAt = data.completed_at !== undefined ? data.completed_at : existing.completed_at;

  db.prepare(
    'UPDATE executions SET status = ?, output = ?, cost_usd = ?, duration_ms = ?, completed_at = ? WHERE id = ?'
  ).run(status, output, costUsd, durationMs, completedAt, id);

  return getExecution(id);
}

export function getExecution(id: string): Execution | undefined {
  const db = getDb();
  return db.prepare(
    'SELECT e.*, p.title as prompt_title FROM executions e LEFT JOIN prompts p ON e.prompt_id = p.id WHERE e.id = ?'
  ).get(id) as Execution | undefined;
}

export function getExecutionsBySession(sessionId: string): Execution[] {
  const db = getDb();
  return db.prepare(
    'SELECT e.*, p.title as prompt_title FROM executions e LEFT JOIN prompts p ON e.prompt_id = p.id WHERE e.run_session_id = ? ORDER BY e.started_at ASC'
  ).all(sessionId) as Execution[];
}

export function getRecentExecutions(limit: number = 20, offset: number = 0): Execution[] {
  const db = getDb();
  return db.prepare(
    'SELECT e.*, p.title as prompt_title FROM executions e LEFT JOIN prompts p ON e.prompt_id = p.id ORDER BY e.started_at DESC LIMIT ? OFFSET ?'
  ).all(limit, offset) as Execution[];
}

// --- Settings helpers ---

export function getSetting(key: string): string | undefined {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
  ).run(key, value, value);
}

export function getAllSettings(): Settings {
  return {
    working_directory: getSetting('working_directory') ?? process.cwd(),
    claude_binary: getSetting('claude_binary') ?? 'claude',
  };
}
