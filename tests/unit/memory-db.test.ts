import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';

let testDb: Database.Database;

// Mock getDb to return our in-memory test database
vi.mock('../../src/lib/db', () => ({
  getDb: () => testDb,
}));

import {
  initMemoryTables,
  createTeamMessage,
  getTeamMessages,
  createKnowledgeEntry,
  getKnowledgeEntries,
  upsertKnowledgeEntry,
  getCrossSessionFindings,
} from '@/lib/autonomous/memory-db';

// --- Types mirroring src/lib/autonomous/types.ts ---

interface AutoFinding {
  id: string;
  session_id: string;
  category: string;
  priority: string;
  title: string;
  description: string;
  file_path: string | null;
  status: string;
  retry_count: number;
  max_retries: number;
  resolved_by_cycle_id: string | null;
  failure_history: string | null;
  project_path?: string | null;
  resolution_summary?: string | null;
  created_at: string;
  updated_at: string;
}

function setupTestDb(): void {
  testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');

  // Create prerequisite tables (auto_sessions and auto_findings for cross-session queries)
  testDb.exec(`
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
      project_path TEXT,
      resolution_summary TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES auto_sessions(id) ON DELETE CASCADE
    );
  `);

  // Initialize memory tables via the actual module function
  initMemoryTables();
}

// Helper: create a test session
function createTestSession(id: string, targetProject: string): void {
  const now = new Date().toISOString();
  testDb.prepare(
    'INSERT INTO auto_sessions (id, target_project, status, total_cycles, total_cost_usd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, targetProject, 'running', 0, 0, now, now);
}

// Helper: create a test finding
function createTestFinding(data: {
  id: string;
  session_id: string;
  title: string;
  status: string;
  project_path?: string;
  priority?: string;
  category?: string;
}): void {
  const now = new Date().toISOString();
  testDb.prepare(
    'INSERT INTO auto_findings (id, session_id, category, priority, title, description, status, project_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    data.id,
    data.session_id,
    data.category ?? 'bug',
    data.priority ?? 'P2',
    data.title,
    'test description',
    data.status,
    data.project_path ?? null,
    now,
    now,
  );
}

// --- Tests ---

describe('Memory DB Operations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    if (testDb) {
      try { testDb.close(); } catch { /* ignore */ }
    }
    setupTestDb();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initMemoryTables', () => {
    it('should create tables without error', () => {
      // Tables already created in setupTestDb via initMemoryTables()
      // Verify tables exist by querying their schema
      const teamMsgTable = testDb.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='auto_team_messages'"
      ).get();
      expect(teamMsgTable).toBeDefined();

      const knowledgeTable = testDb.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='auto_knowledge_entries'"
      ).get();
      expect(knowledgeTable).toBeDefined();
    });
  });

  describe('createTeamMessage', () => {
    it('should create and retrieve a team message', () => {
      const msg = createTeamMessage({
        project_path: '/test/project',
        session_id: 'session-1',
        cycle_id: 'cycle-1',
        from_agent: 'Reviewer',
        category: 'convention',
        content: 'Always use strict TypeScript mode',
      });

      expect(msg).toBeDefined();
      expect(msg.id).toBeDefined();
      expect(msg.project_path).toBe('/test/project');
      expect(msg.session_id).toBe('session-1');
      expect(msg.cycle_id).toBe('cycle-1');
      expect(msg.from_agent).toBe('Reviewer');
      expect(msg.category).toBe('convention');
      expect(msg.content).toBe('Always use strict TypeScript mode');
      expect(msg.created_at).toBeDefined();
    });
  });

  describe('getTeamMessages', () => {
    it('should filter by project_path', () => {
      createTeamMessage({
        project_path: '/project-a',
        session_id: null,
        cycle_id: null,
        from_agent: 'Developer',
        category: 'pattern',
        content: 'Message for project A',
      });
      vi.advanceTimersByTime(1000);
      createTeamMessage({
        project_path: '/project-b',
        session_id: null,
        cycle_id: null,
        from_agent: 'Developer',
        category: 'pattern',
        content: 'Message for project B',
      });

      const messagesA = getTeamMessages('/project-a');
      expect(messagesA).toHaveLength(1);
      expect(messagesA[0].content).toBe('Message for project A');

      const messagesB = getTeamMessages('/project-b');
      expect(messagesB).toHaveLength(1);
      expect(messagesB[0].content).toBe('Message for project B');
    });

    it('should filter by category', () => {
      createTeamMessage({
        project_path: '/test/project',
        session_id: null,
        cycle_id: null,
        from_agent: 'Reviewer',
        category: 'convention',
        content: 'Convention message',
      });
      vi.advanceTimersByTime(1000);
      createTeamMessage({
        project_path: '/test/project',
        session_id: null,
        cycle_id: null,
        from_agent: 'Developer',
        category: 'warning',
        content: 'Warning message',
      });

      const conventions = getTeamMessages('/test/project', { category: 'convention' });
      expect(conventions).toHaveLength(1);
      expect(conventions[0].content).toBe('Convention message');

      const warnings = getTeamMessages('/test/project', { category: 'warning' });
      expect(warnings).toHaveLength(1);
      expect(warnings[0].content).toBe('Warning message');
    });

    it('should respect limit', () => {
      for (let i = 0; i < 5; i++) {
        createTeamMessage({
          project_path: '/test/project',
          session_id: null,
          cycle_id: null,
          from_agent: 'Developer',
          category: 'pattern',
          content: `Message ${i}`,
        });
        vi.advanceTimersByTime(1000);
      }

      const messages = getTeamMessages('/test/project', { limit: 3 });
      expect(messages).toHaveLength(3);
      // Should be ordered by created_at DESC, so most recent first
      expect(messages[0].content).toBe('Message 4');
      expect(messages[1].content).toBe('Message 3');
      expect(messages[2].content).toBe('Message 2');
    });
  });

  describe('createKnowledgeEntry', () => {
    it('should create and retrieve a knowledge entry', () => {
      const entry = createKnowledgeEntry({
        project_path: '/test/project',
        category: 'architecture_decision',
        title: 'Use Repository Pattern',
        content: 'All data access should go through repository classes',
        source_session_id: 'session-1',
        source_agent: 'Reviewer',
      });

      expect(entry).toBeDefined();
      expect(entry.id).toBeDefined();
      expect(entry.project_path).toBe('/test/project');
      expect(entry.category).toBe('architecture_decision');
      expect(entry.title).toBe('Use Repository Pattern');
      expect(entry.content).toBe('All data access should go through repository classes');
      expect(entry.source_session_id).toBe('session-1');
      expect(entry.source_agent).toBe('Reviewer');
      expect(entry.occurrence_count).toBe(1);
      expect(entry.last_seen_at).toBeDefined();
      expect(entry.created_at).toBeDefined();
      expect(entry.superseded_by).toBeNull();
    });
  });

  describe('getKnowledgeEntries', () => {
    it('should exclude superseded entries', () => {
      const entry1 = createKnowledgeEntry({
        project_path: '/test/project',
        category: 'coding_convention',
        title: 'Naming Convention v1',
        content: 'Use camelCase',
      });
      vi.advanceTimersByTime(1000);
      const entry2 = createKnowledgeEntry({
        project_path: '/test/project',
        category: 'coding_convention',
        title: 'Naming Convention v2',
        content: 'Use PascalCase for components',
      });

      // Supersede entry1 with entry2
      testDb.prepare('UPDATE auto_knowledge_entries SET superseded_by = ? WHERE id = ?').run(entry2.id, entry1.id);

      const entries = getKnowledgeEntries('/test/project');
      expect(entries).toHaveLength(1);
      expect(entries[0].title).toBe('Naming Convention v2');
    });

    it('should filter by category', () => {
      createKnowledgeEntry({
        project_path: '/test/project',
        category: 'architecture_decision',
        title: 'Architecture entry',
        content: 'content',
      });
      vi.advanceTimersByTime(1000);
      createKnowledgeEntry({
        project_path: '/test/project',
        category: 'coding_convention',
        title: 'Convention entry',
        content: 'content',
      });

      const archEntries = getKnowledgeEntries('/test/project', { category: 'architecture_decision' });
      expect(archEntries).toHaveLength(1);
      expect(archEntries[0].title).toBe('Architecture entry');
    });

    it('should order by occurrence_count DESC', () => {
      createKnowledgeEntry({
        project_path: '/test/project',
        category: 'coding_convention',
        title: 'Less common',
        content: 'content',
      });
      vi.advanceTimersByTime(1000);
      const popular = createKnowledgeEntry({
        project_path: '/test/project',
        category: 'coding_convention',
        title: 'More common',
        content: 'content',
      });

      // Bump occurrence_count for the popular entry
      testDb.prepare('UPDATE auto_knowledge_entries SET occurrence_count = 5 WHERE id = ?').run(popular.id);

      const entries = getKnowledgeEntries('/test/project');
      expect(entries).toHaveLength(2);
      expect(entries[0].title).toBe('More common');
      expect(entries[0].occurrence_count).toBe(5);
    });
  });

  describe('upsertKnowledgeEntry', () => {
    it('should create new entry when not found', () => {
      upsertKnowledgeEntry('/test/project', 'New Convention', {
        category: 'coding_convention',
        content: 'Use arrow functions',
        source_agent: 'Reviewer',
      });

      const entries = getKnowledgeEntries('/test/project');
      expect(entries).toHaveLength(1);
      expect(entries[0].title).toBe('New Convention');
      expect(entries[0].content).toBe('Use arrow functions');
      expect(entries[0].occurrence_count).toBe(1);
    });

    it('should update existing entry and increment occurrence_count', () => {
      upsertKnowledgeEntry('/test/project', 'Repeated Convention', {
        category: 'coding_convention',
        content: 'Original content',
        source_agent: 'Reviewer',
      });
      vi.advanceTimersByTime(5000);

      upsertKnowledgeEntry('/test/project', 'Repeated Convention', {
        category: 'coding_convention',
        content: 'Updated content',
        source_agent: 'Developer',
      });

      const entries = getKnowledgeEntries('/test/project');
      expect(entries).toHaveLength(1);
      expect(entries[0].title).toBe('Repeated Convention');
      expect(entries[0].content).toBe('Updated content');
      expect(entries[0].occurrence_count).toBe(2);
    });
  });

  describe('getCrossSessionFindings', () => {
    it('should return findings from correct project across sessions', () => {
      // Create sessions for different projects
      createTestSession('session-a1', '/project-a');
      createTestSession('session-a2', '/project-a');
      createTestSession('session-b1', '/project-b');

      // Create findings
      createTestFinding({ id: 'f1', session_id: 'session-a1', title: 'Bug in A', status: 'resolved', project_path: '/project-a' });
      createTestFinding({ id: 'f2', session_id: 'session-a2', title: 'Another bug in A', status: 'resolved', project_path: '/project-a' });
      createTestFinding({ id: 'f3', session_id: 'session-b1', title: 'Bug in B', status: 'resolved', project_path: '/project-b' });

      const findingsA = getCrossSessionFindings('/project-a', ['resolved']);
      expect(findingsA).toHaveLength(2);
      expect(findingsA.every((f: AutoFinding) => f.project_path === '/project-a')).toBe(true);

      const findingsB = getCrossSessionFindings('/project-b', ['resolved']);
      expect(findingsB).toHaveLength(1);
      expect(findingsB[0].title).toBe('Bug in B');
    });

    it('should filter by status correctly', () => {
      createTestSession('session-1', '/test/project');

      createTestFinding({ id: 'f1', session_id: 'session-1', title: 'Resolved finding', status: 'resolved', project_path: '/test/project' });
      createTestFinding({ id: 'f2', session_id: 'session-1', title: 'Wont fix finding', status: 'wont_fix', project_path: '/test/project' });
      createTestFinding({ id: 'f3', session_id: 'session-1', title: 'Open finding', status: 'open', project_path: '/test/project' });

      // Only resolved
      const resolved = getCrossSessionFindings('/test/project', ['resolved']);
      expect(resolved).toHaveLength(1);
      expect(resolved[0].title).toBe('Resolved finding');

      // Both resolved and wont_fix
      const resolvedAndWontFix = getCrossSessionFindings('/test/project', ['resolved', 'wont_fix']);
      expect(resolvedAndWontFix).toHaveLength(2);

      // Open only
      const open = getCrossSessionFindings('/test/project', ['open']);
      expect(open).toHaveLength(1);
      expect(open[0].title).toBe('Open finding');
    });
  });
});
