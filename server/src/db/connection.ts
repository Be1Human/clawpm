import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { config } from '../config.js';
import fs from 'fs';
import path from 'path';

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db) {
    const dir = path.dirname(config.dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const sqlite = new Database(config.dbPath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    _db = drizzle(sqlite, { schema });
    runMigrations(sqlite);
  }
  return _db;
}

function runMigrations(sqlite: Database.Database) {
  // 增量迁移：为已有数据库添加新字段
  try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN type TEXT NOT NULL DEFAULT 'task'`); } catch {}

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS domains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      task_prefix TEXT NOT NULL UNIQUE,
      keywords TEXT NOT NULL DEFAULT '[]',
      color TEXT NOT NULL DEFAULT '#6366f1',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS milestones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      target_date TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT,
      domain_id INTEGER REFERENCES domains(id),
      milestone_id INTEGER REFERENCES milestones(id),
      parent_task_id INTEGER,
      status TEXT NOT NULL DEFAULT 'planned',
      progress INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'P2',
      owner TEXT,
      due_date TEXT,
      start_date TEXT,
      source TEXT NOT NULL DEFAULT 'planned',
      blocker TEXT,
      health_score INTEGER NOT NULL DEFAULT 100,
      tags TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id),
      content TEXT NOT NULL,
      author TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS progress_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id),
      progress INTEGER NOT NULL,
      summary TEXT,
      recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS backlog_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      backlog_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT,
      domain_id INTEGER REFERENCES domains(id),
      priority TEXT NOT NULL DEFAULT 'P2',
      source TEXT,
      source_context TEXT,
      estimated_scope TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pool',
      scheduled_task_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      target_date TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      set_by TEXT,
      overall_progress INTEGER NOT NULL DEFAULT 0,
      health TEXT NOT NULL DEFAULT 'green',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS objectives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id INTEGER NOT NULL REFERENCES goals(id),
      title TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 1.0,
      progress INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'not-started',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS objective_task_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      objective_id INTEGER NOT NULL REFERENCES objectives(id),
      task_id INTEGER NOT NULL REFERENCES tasks(id)
    );

    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      identifier TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'human',
      color TEXT NOT NULL DEFAULT '#6366f1',
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
