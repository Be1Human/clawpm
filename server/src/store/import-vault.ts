// 文本 vault → SQLite 导入。
// insertVaultData 把 vault 数据写入一个已建好 schema 的库（CLI import 用最小 DDL 新库，
// VaultStore 用 :memory: 完整 schema），是 vault→SQLite 映射的唯一实现。
// 用途：round-trip 验证（export→import→export 字节一致）、老架构回迁、VaultStore 启动加载。

import fs from 'fs';
import { openDatabase, type SqliteDb } from '../db/sqlite-driver.js';
import type { VaultData } from './types.js';
import { INBOX_CODE } from './types.js';
import { joinDescription, naturalCompare } from './canonical.js';
import { loadVault } from './files.js';
import { compareRanks } from './rank.js';

export interface ImportOptions {
  vaultDir: string;
  dbPath: string;
  projectSlug?: string;
  /** 覆盖已存在的目标库文件 */
  force?: boolean;
}

export interface ImportReport {
  project: string;
  tasks: number;
  domains: number;
  milestones: number;
  fields: number;
  links: number;
  warnings: string[];
}

/** CLI import 用的最小 schema（仅需求树相关表）。VaultStore 用 connection.ts 的完整 runMigrations */
export const MINIMAL_DDL = `
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL DEFAULT 1 REFERENCES projects(id),
  name TEXT NOT NULL,
  task_prefix TEXT NOT NULL,
  keywords TEXT NOT NULL DEFAULT '[]',
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL DEFAULT 1 REFERENCES projects(id),
  name TEXT NOT NULL,
  target_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE custom_fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text',
  options TEXT NOT NULL DEFAULT '[]',
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL UNIQUE,
  project_id INTEGER NOT NULL DEFAULT 1 REFERENCES projects(id),
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
  schedule_mode TEXT NOT NULL DEFAULT 'once',
  schedule_cron TEXT,
  schedule_config TEXT NOT NULL DEFAULT '{}',
  schedule_next_run_at TEXT,
  schedule_last_triggered_at TEXT,
  schedule_paused INTEGER NOT NULL DEFAULT 0,
  schedule_last_error TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  pos_x REAL,
  pos_y REAL,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE req_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  target_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL DEFAULT 'relates',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE task_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  content TEXT NOT NULL,
  author TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE progress_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  progress INTEGER NOT NULL,
  summary TEXT,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE task_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE task_field_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  field_id INTEGER NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
  value TEXT NOT NULL DEFAULT '',
  UNIQUE(task_id, field_id)
);
`;

function nowSqlite(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * 把 vault 数据插入一个已建好 schema 的库。项目按 slug 解析：已存在则复用其 id
 * （:memory: 完整 schema 下 runMigrations 已插入 default 项目），否则新建。
 * 假设库中该项目的需求树数据为空（VaultStore 用全新 :memory:；CLI import 用全新库）。
 */
export function insertVaultData(
  db: SqliteDb,
  vault: VaultData,
  slug: string,
  warnings: string[]
): void {
  const run = db.transaction(() => {
    const now = nowSqlite();

    let projectId: number;
    const existing = db.prepare('SELECT id FROM projects WHERE slug = ?').get(slug) as
      | { id: number }
      | undefined;
    if (existing) {
      projectId = existing.id;
      db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(vault.config.name, projectId);
    } else {
      const r = db.prepare('INSERT INTO projects (slug, name) VALUES (?, ?)').run(
        slug,
        vault.config.name
      );
      projectId = Number(r.lastInsertRowid);
    }

    const domainId = new Map<string, number>();
    const insDomain = db.prepare(
      'INSERT INTO domains (project_id, name, task_prefix, keywords, color) VALUES (?, ?, ?, ?, ?)'
    );
    for (const d of vault.domains) {
      const r = insDomain.run(
        projectId,
        d.name,
        d.code,
        JSON.stringify(d.keywords ?? []),
        d.color ?? '#6366f1'
      );
      domainId.set(d.code, Number(r.lastInsertRowid));
    }

    const milestoneId = new Map<string, number>();
    const insMilestone = db.prepare(
      'INSERT INTO milestones (project_id, name, target_date, status, description) VALUES (?, ?, ?, ?, ?)'
    );
    for (const m of vault.milestones) {
      const r = insMilestone.run(
        projectId,
        m.name,
        m.targetDate ?? null,
        m.status ?? 'active',
        m.description ?? null
      );
      milestoneId.set(m.name, Number(r.lastInsertRowid));
    }

    const fieldId = new Map<string, number>();
    const insField = db.prepare(
      'INSERT INTO custom_fields (name, field_type, options, color, sort_order) VALUES (?, ?, ?, ?, ?)'
    );
    vault.fields.forEach((f, i) => {
      const r = insField.run(
        f.name,
        f.type ?? 'text',
        JSON.stringify(f.options ?? []),
        f.color ?? null,
        i
      );
      fieldId.set(f.name, Number(r.lastInsertRowid));
    });

    // sort_order：按 (rank, id) 还原每个兄弟组的整数排序
    const byParent = new Map<string, typeof vault.tasks>();
    for (const t of vault.tasks) {
      const key = t.parent ?? '';
      let list = byParent.get(key);
      if (!list) {
        list = [];
        byParent.set(key, list);
      }
      list.push(t);
    }
    const sortOrder = new Map<string, number>();
    for (const group of byParent.values()) {
      group.sort((a, b) => compareRanks(a.rank, b.rank) || naturalCompare(a.id, b.id));
      group.forEach((t, i) => sortOrder.set(t.id, i));
    }

    const taskNumId = new Map<string, number>();
    const insTask = db.prepare(
      `INSERT INTO tasks (task_id, project_id, title, description, domain_id, milestone_id,
         type, status, progress, priority, owner, assignee, due_date, start_date, blocker,
         tags, labels, sort_order, archived_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const sortedTasks = [...vault.tasks].sort((a, b) => naturalCompare(a.id, b.id));
    for (const t of sortedTasks) {
      let dId: number | null = null;
      if (t.domain && t.domain !== INBOX_CODE) {
        dId = domainId.get(t.domain) ?? null;
        if (dId === null) warnings.push(`'${t.id}' 的 domain '${t.domain}' 未在 domains.json 注册，已忽略`);
      }
      let mId: number | null = null;
      if (t.milestone) {
        mId = milestoneId.get(t.milestone) ?? null;
        if (mId === null) warnings.push(`'${t.id}' 的 milestone '${t.milestone}' 未注册，已忽略`);
      }
      const status = typeof t.status === 'string' && t.status !== '' ? t.status : 'backlog';
      if (status !== t.status) warnings.push(`'${t.id}' 缺少 status，导入为 'backlog'`);
      const r = insTask.run(
        t.id,
        projectId,
        t.title,
        joinDescription(t.description),
        dId,
        mId,
        t.type ?? 'task',
        status,
        t.progress ?? 0,
        t.priority ?? 'P2',
        t.owner ?? null,
        t.assignee ?? null,
        t.dueDate ?? null,
        t.startDate ?? null,
        t.blocker ?? null,
        JSON.stringify(t.tags ?? []),
        JSON.stringify(t.labels ?? []),
        sortOrder.get(t.id) ?? 0,
        t.archivedAt ?? null,
        t.createdAt ?? now,
        t.updatedAt ?? now
      );
      taskNumId.set(t.id, Number(r.lastInsertRowid));
    }

    // 第二遍回填 parent
    const setParent = db.prepare('UPDATE tasks SET parent_task_id = ? WHERE id = ?');
    for (const t of sortedTasks) {
      if (!t.parent) continue;
      const pid = taskNumId.get(t.parent);
      if (pid === undefined) {
        warnings.push(`'${t.id}' 的 parent '${t.parent}' 不存在，按根节点导入`);
        continue;
      }
      setParent.run(pid, taskNumId.get(t.id)!);
    }

    const insNote = db.prepare(
      'INSERT INTO task_notes (task_id, content, author, created_at) VALUES (?, ?, ?, ?)'
    );
    const insHistory = db.prepare(
      'INSERT INTO progress_history (task_id, progress, summary, recorded_at) VALUES (?, ?, ?, ?)'
    );
    const insAttach = db.prepare(
      `INSERT INTO task_attachments (task_id, type, title, content, metadata, sort_order,
         created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insFieldValue = db.prepare(
      'INSERT INTO task_field_values (task_id, field_id, value) VALUES (?, ?, ?)'
    );
    for (const t of sortedTasks) {
      const nid = taskNumId.get(t.id)!;
      for (const n of t.notes ?? []) insNote.run(nid, n.text, n.by ?? null, n.at ?? now);
      for (const h of t.history ?? []) insHistory.run(nid, h.progress, h.summary ?? null, h.at ?? now);
      (t.attachments ?? []).forEach((a, i) =>
        insAttach.run(
          nid,
          a.type,
          a.title,
          a.content,
          JSON.stringify(a.metadata ?? {}),
          i,
          a.createdBy ?? null,
          a.createdAt ?? now,
          a.updatedAt ?? now
        )
      );
      for (const [name, value] of Object.entries(t.fields ?? {})) {
        const fid = fieldId.get(name);
        if (fid === undefined) {
          warnings.push(`'${t.id}' 的自定义字段 '${name}' 未在 fields.json 注册，已忽略`);
          continue;
        }
        insFieldValue.run(nid, fid, value);
      }
    }

    const insLink = db.prepare(
      'INSERT INTO req_links (source_task_id, target_task_id, link_type) VALUES (?, ?, ?)'
    );
    for (const l of vault.links) {
      const s = taskNumId.get(l.source);
      const g = taskNumId.get(l.target);
      if (s === undefined || g === undefined) {
        warnings.push(`link ${l.source}→${l.target} 端点不存在，已跳过`);
        continue;
      }
      insLink.run(s, g, l.type);
    }
  });
  run();
}

export function importVault(opts: ImportOptions): ImportReport {
  const slug = opts.projectSlug ?? 'default';

  if (fs.existsSync(opts.dbPath)) {
    if (!opts.force) throw new Error(`目标库已存在: ${opts.dbPath}（使用 --force 覆盖）`);
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(opts.dbPath + suffix, { force: true });
  }

  const vault: VaultData = loadVault(opts.vaultDir);
  const warnings = [...vault.warnings];

  const db = openDatabase(opts.dbPath);
  try {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(MINIMAL_DDL);
    insertVaultData(db, vault, slug, warnings);

    return {
      project: slug,
      tasks: vault.tasks.length,
      domains: vault.domains.length,
      milestones: vault.milestones.length,
      fields: vault.fields.length,
      links: vault.links.length,
      warnings,
    };
  } finally {
    db.close();
  }
}
