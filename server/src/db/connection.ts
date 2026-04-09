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
      type TEXT NOT NULL DEFAULT 'task',
      status TEXT NOT NULL DEFAULT 'backlog',
      progress INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'P2',
      owner TEXT,
      assignee TEXT,
      due_date TEXT,
      start_date TEXT,
      source TEXT NOT NULL DEFAULT 'planned',
      blocker TEXT,
      health_score INTEGER NOT NULL DEFAULT 100,
      tags TEXT NOT NULL DEFAULT '[]',
      labels TEXT NOT NULL DEFAULT '[]',
      pos_x REAL,
      pos_y REAL,
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
      parent_backlog_item_id INTEGER,
      priority TEXT NOT NULL DEFAULT 'P2',
      source TEXT,
      source_context TEXT,
      estimated_scope TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pool',
      sort_order INTEGER NOT NULL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS custom_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      field_type TEXT NOT NULL DEFAULT 'text',
      options TEXT NOT NULL DEFAULT '[]',
      color TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_field_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      field_id INTEGER NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
      value TEXT NOT NULL DEFAULT '',
      UNIQUE(task_id, field_id)
    );

    CREATE TABLE IF NOT EXISTS req_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      target_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      link_type TEXT NOT NULL DEFAULT 'relates',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 节点附件（v2.2：文档/链接/TAPD 关联）
    CREATE TABLE IF NOT EXISTS task_attachments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      type        TEXT NOT NULL,
      title       TEXT NOT NULL,
      content     TEXT NOT NULL,
      metadata    TEXT DEFAULT '{}',
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_by  TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_attachments_task ON task_attachments(task_id);

    -- 节点权限控制（v2.5）
    CREATE TABLE IF NOT EXISTS task_permissions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      grantee     TEXT NOT NULL,
      level       TEXT NOT NULL DEFAULT 'view',
      granted_by  TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(task_id, grantee)
    );
    CREATE INDEX IF NOT EXISTS idx_task_permissions_task ON task_permissions(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_permissions_grantee ON task_permissions(grantee);
  `);

  // 增量迁移：为旧数据库添加新字段（新建的表已包含这些列，ALTER 会被 catch 跳过）
  try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN type TEXT NOT NULL DEFAULT 'task'`); } catch {}
  try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN labels TEXT NOT NULL DEFAULT '[]'`); } catch {}
  try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN pos_x REAL`); } catch {}
  try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN pos_y REAL`); } catch {}
  try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`); } catch {}

  // v2.0 数据迁移
  try { sqlite.exec(`UPDATE tasks SET status = 'active' WHERE status = 'blocked'`); } catch {}
  try { sqlite.exec(`UPDATE tasks SET status = 'done' WHERE status = 'cancelled'`); } catch {}
  try { sqlite.exec(`UPDATE tasks SET status = 'backlog' WHERE status = 'planned' AND owner IS NULL AND due_date IS NULL`); } catch {}
  try {
    const rows = sqlite.prepare("SELECT task_id, type FROM tasks WHERE labels = '[]' AND type != 'task'").all() as any[];
    for (const row of rows) {
      sqlite.prepare("UPDATE tasks SET labels = ? WHERE task_id = ?").run(JSON.stringify([row.type]), row.task_id);
    }
  } catch {}

  // v2.1 项目迁移：创建 projects 表，为业务表添加 project_id
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      slug        TEXT NOT NULL UNIQUE,
      name        TEXT NOT NULL,
      description TEXT,
      archived    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // 确保默认项目存在
  sqlite.exec(`INSERT OR IGNORE INTO projects (slug, name, description) VALUES ('default', '默认项目', '自动创建的默认项目')`);

  // 为业务表添加 project_id（现有数据归入 default 项目 id=1）
  const tablesNeedProjectId = ['tasks', 'domains', 'milestones', 'backlog_items', 'goals', 'members'];
  for (const table of tablesNeedProjectId) {
    try { sqlite.exec(`ALTER TABLE ${table} ADD COLUMN project_id INTEGER NOT NULL DEFAULT 1`); } catch {}
  }
  try { sqlite.exec(`ALTER TABLE backlog_items ADD COLUMN parent_backlog_item_id INTEGER`); } catch {}
  try { sqlite.exec(`ALTER TABLE backlog_items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`); } catch {}

  // 项目内唯一约束
  try { sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_domains_project_name ON domains(project_id, name)`); } catch {}
  try { sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_domains_project_prefix ON domains(project_id, task_prefix)`); } catch {}
  try { sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_members_project_identifier ON members(project_id, identifier)`); } catch {}

  // v3.0 迁移：迭代、通知、归档
  try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN archived_at TEXT`); } catch {}

  sqlite.exec(`
    -- 迭代表
    CREATE TABLE IF NOT EXISTS iterations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  INTEGER NOT NULL REFERENCES projects(id),
      name        TEXT NOT NULL,
      description TEXT,
      start_date  TEXT,
      end_date    TEXT,
      status      TEXT NOT NULL DEFAULT 'planned',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 任务-迭代关联表
    CREATE TABLE IF NOT EXISTS task_iterations (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id       INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      iteration_id  INTEGER NOT NULL REFERENCES iterations(id) ON DELETE CASCADE,
      UNIQUE(task_id, iteration_id)
    );
    CREATE INDEX IF NOT EXISTS idx_task_iterations_task ON task_iterations(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_iterations_iteration ON task_iterations(iteration_id);

    -- 通知表
    CREATE TABLE IF NOT EXISTS notifications (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id    INTEGER NOT NULL REFERENCES projects(id),
      recipient_id  TEXT NOT NULL,
      type          TEXT NOT NULL,
      title         TEXT NOT NULL,
      content       TEXT,
      task_id       TEXT,
      is_read       INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, is_read);

    -- Intake 收件箱（v3.1）
    CREATE TABLE IF NOT EXISTS intake_items (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      intake_id     TEXT NOT NULL UNIQUE,
      project_id    INTEGER NOT NULL REFERENCES projects(id),
      title         TEXT NOT NULL,
      description   TEXT,
      category      TEXT NOT NULL DEFAULT 'feedback',
      submitter     TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'pending',
      priority      TEXT NOT NULL DEFAULT 'P2',
      reviewed_by   TEXT,
      review_note   TEXT,
      task_id       TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_intake_project_status ON intake_items(project_id, status);
  `);

  // v3.5 迁移：tasks 新增 assignee / start_date 字段
  try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN assignee TEXT`); } catch {}
  try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN start_date TEXT`); } catch {}

  // v4.0 迁移：members 新增 role / onboarded_at 字段
  try { sqlite.exec(`ALTER TABLE members ADD COLUMN role TEXT`); } catch {}
  try { sqlite.exec(`ALTER TABLE members ADD COLUMN onboarded_at TEXT`); } catch {}

  // v5.0 迁移：账号 / 会话 / Agent Token
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      username       TEXT NOT NULL UNIQUE,
      password_hash  TEXT NOT NULL,
      display_name   TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'active',
      last_login_at  TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS account_sessions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      token_prefix  TEXT NOT NULL,
      token_hash    TEXT NOT NULL UNIQUE,
      status        TEXT NOT NULL DEFAULT 'active',
      expires_at    TEXT,
      last_used_at  TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_account_sessions_account ON account_sessions(account_id, status);

    CREATE TABLE IF NOT EXISTS account_member_bindings (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id         INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      project_id         INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      member_identifier  TEXT NOT NULL,
      is_default         INTEGER NOT NULL DEFAULT 0,
      created_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_account_member_binding_unique
      ON account_member_bindings(account_id, project_id, member_identifier);

    CREATE TABLE IF NOT EXISTS agent_tokens (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id         INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      member_identifier  TEXT NOT NULL,
      client_type        TEXT NOT NULL DEFAULT 'openclaw',
      name               TEXT,
      token_prefix       TEXT NOT NULL,
      token_hash         TEXT NOT NULL UNIQUE,
      status             TEXT NOT NULL DEFAULT 'active',
      expires_at         TEXT,
      last_used_at       TEXT,
      created_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_agent_tokens_member ON agent_tokens(project_id, member_identifier, status);

    CREATE TABLE IF NOT EXISTS auth_audit_logs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id    INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      actor_type    TEXT NOT NULL,
      actor_id      TEXT NOT NULL,
      action        TEXT NOT NULL,
      target_type   TEXT,
      target_id     TEXT,
      metadata      TEXT NOT NULL DEFAULT '{}',
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // v6.0 迁移：项目成员关联表（系统成员 ↔ 项目）
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS project_members (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id         INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      member_identifier  TEXT NOT NULL,
      role               TEXT,
      joined_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_project_members_unique ON project_members(project_id, member_identifier);
  `);

  // v6.0 数据迁移：将现有 members 中 project_id + identifier 的组合写入 project_members 关联表
  try {
    const existingMembers = sqlite.prepare('SELECT DISTINCT project_id, identifier, role FROM members WHERE project_id IS NOT NULL').all() as any[];
    for (const row of existingMembers) {
      try {
        sqlite.prepare('INSERT OR IGNORE INTO project_members (project_id, member_identifier, role) VALUES (?, ?, ?)').run(row.project_id, row.identifier, row.role);
      } catch {}
    }
  } catch {}

  // v6.0：为 members 表添加全局唯一约束（identifier 全局唯一）
  try { sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_members_identifier_global ON members(identifier)`); } catch {}

  // v7.0 迁移：tasks 新增 schedule_mode / schedule_cron / schedule_config 字段
  try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN schedule_mode TEXT NOT NULL DEFAULT 'once'`); } catch {}
  try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN schedule_cron TEXT`); } catch {}
  try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN schedule_config TEXT NOT NULL DEFAULT '{}'`); } catch {}

  // v7.1 迁移：tasks 新增调度运行态字段 + task_schedule_runs 表
  try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN schedule_next_run_at TEXT`); } catch {}
  try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN schedule_last_triggered_at TEXT`); } catch {}
  try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN schedule_paused INTEGER NOT NULL DEFAULT 0`); } catch {}
  try { sqlite.exec(`ALTER TABLE tasks ADD COLUMN schedule_last_error TEXT`); } catch {}

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS task_schedule_runs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id      INTEGER NOT NULL,
      task_id         INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      task_str_id     TEXT NOT NULL,
      run_key         TEXT NOT NULL UNIQUE,
      trigger_type    TEXT NOT NULL,
      trigger_source  TEXT NOT NULL,
      scheduled_at    TEXT,
      triggered_at    TEXT NOT NULL,
      status          TEXT NOT NULL,
      payload         TEXT NOT NULL DEFAULT '{}',
      error_message   TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_schedule_runs_task ON task_schedule_runs(task_id);
    CREATE INDEX IF NOT EXISTS idx_schedule_runs_key ON task_schedule_runs(run_key);
  `);
}
