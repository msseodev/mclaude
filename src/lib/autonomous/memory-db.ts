import { getDb } from '../db';
import { v4 as uuidv4 } from 'uuid';
import type { TeamMessage, TeamMessageCategory, KnowledgeEntry, KnowledgeCategory, AutoFinding } from './types';

// --- Init ---

export function initMemoryTables(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS auto_team_messages (
      id TEXT PRIMARY KEY,
      project_path TEXT NOT NULL,
      session_id TEXT,
      cycle_id TEXT,
      from_agent TEXT NOT NULL,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_team_messages_project_path ON auto_team_messages(project_path);

    CREATE TABLE IF NOT EXISTS auto_knowledge_entries (
      id TEXT PRIMARY KEY,
      project_path TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      source_session_id TEXT,
      source_agent TEXT,
      occurrence_count INTEGER NOT NULL DEFAULT 1,
      last_seen_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      superseded_by TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_entries_project_path ON auto_knowledge_entries(project_path);
    CREATE INDEX IF NOT EXISTS idx_knowledge_entries_category ON auto_knowledge_entries(category);
  `);
}

// --- Team Messages CRUD ---

export function createTeamMessage(data: {
  project_path: string;
  session_id: string | null;
  cycle_id: string | null;
  from_agent: string;
  category: TeamMessageCategory;
  content: string;
}): TeamMessage {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(
    'INSERT INTO auto_team_messages (id, project_path, session_id, cycle_id, from_agent, category, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, data.project_path, data.session_id, data.cycle_id, data.from_agent, data.category, data.content, now);

  return db.prepare('SELECT * FROM auto_team_messages WHERE id = ?').get(id) as TeamMessage;
}

export function getTeamMessages(
  projectPath: string,
  opts?: { category?: TeamMessageCategory; limit?: number },
): TeamMessage[] {
  const db = getDb();
  const conditions: string[] = ['project_path = ?'];
  const params: unknown[] = [projectPath];

  if (opts?.category) {
    conditions.push('category = ?');
    params.push(opts.category);
  }

  const whereClause = conditions.join(' AND ');
  const limitClause = opts?.limit ? `LIMIT ${opts.limit}` : '';

  return db.prepare(
    `SELECT * FROM auto_team_messages WHERE ${whereClause} ORDER BY created_at DESC ${limitClause}`
  ).all(...params) as TeamMessage[];
}

// --- Knowledge Entries CRUD ---

export function createKnowledgeEntry(data: {
  project_path: string;
  category: KnowledgeCategory;
  title: string;
  content: string;
  source_session_id?: string | null;
  source_agent?: string | null;
}): KnowledgeEntry {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(
    'INSERT INTO auto_knowledge_entries (id, project_path, category, title, content, source_session_id, source_agent, occurrence_count, last_seen_at, created_at, superseded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    data.project_path,
    data.category,
    data.title,
    data.content,
    data.source_session_id ?? null,
    data.source_agent ?? null,
    1,
    now,
    now,
    null,
  );

  return db.prepare('SELECT * FROM auto_knowledge_entries WHERE id = ?').get(id) as KnowledgeEntry;
}

export function getKnowledgeEntries(
  projectPath: string,
  opts?: { category?: KnowledgeCategory; limit?: number },
): KnowledgeEntry[] {
  const db = getDb();
  const conditions: string[] = ['project_path = ?', 'superseded_by IS NULL'];
  const params: unknown[] = [projectPath];

  if (opts?.category) {
    conditions.push('category = ?');
    params.push(opts.category);
  }

  const whereClause = conditions.join(' AND ');
  const limitClause = opts?.limit ? `LIMIT ${opts.limit}` : '';

  return db.prepare(
    `SELECT * FROM auto_knowledge_entries WHERE ${whereClause} ORDER BY occurrence_count DESC ${limitClause}`
  ).all(...params) as KnowledgeEntry[];
}

export function upsertKnowledgeEntry(
  projectPath: string,
  title: string,
  data: Partial<KnowledgeEntry>,
): KnowledgeEntry {
  const db = getDb();
  const now = new Date().toISOString();

  // Exact match on project_path + title (where not superseded)
  const existing = db.prepare(
    'SELECT * FROM auto_knowledge_entries WHERE project_path = ? AND title = ? AND superseded_by IS NULL'
  ).get(projectPath, title) as KnowledgeEntry | undefined;

  if (existing) {
    const newContent = data.content ?? existing.content;
    const newOccurrenceCount = existing.occurrence_count + 1;

    db.prepare(
      'UPDATE auto_knowledge_entries SET content = ?, occurrence_count = ?, last_seen_at = ? WHERE id = ?'
    ).run(newContent, newOccurrenceCount, now, existing.id);

    return db.prepare('SELECT * FROM auto_knowledge_entries WHERE id = ?').get(existing.id) as KnowledgeEntry;
  }

  // Create new entry
  return createKnowledgeEntry({
    project_path: projectPath,
    category: data.category ?? 'coding_convention',
    title,
    content: data.content ?? '',
    source_session_id: data.source_session_id ?? null,
    source_agent: data.source_agent ?? null,
  });
}

// --- Cross-Session Findings ---

export function getCrossSessionFindings(
  projectPath: string,
  statuses: string[],
): AutoFinding[] {
  const db = getDb();

  if (statuses.length === 0) return [];

  const placeholders = statuses.map(() => '?').join(', ');

  return db.prepare(
    `SELECT f.* FROM auto_findings f
     WHERE f.project_path = ?
     AND f.status IN (${placeholders})
     ORDER BY f.priority ASC, f.created_at DESC`
  ).all(projectPath, ...statuses) as AutoFinding[];
}
