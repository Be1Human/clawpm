// SQLite → 文本 vault 导出。
// 直接用 better-sqlite3 读库（只读），不经 drizzle/service 层——
// 导出器是格式的参考实现，也是 round-trip 验证（export→import→export 字节一致）的基准。

import fs from 'fs';
import path from 'path';
import { openDatabase, type SqliteDb } from '../db/sqlite-driver.js';
import type {
  VaultConfig,
  VaultData,
  VaultDomain,
  VaultFieldDef,
  VaultLink,
  VaultLinkType,
  VaultMilestone,
  VaultTask,
} from './types.js';
import { DEFAULT_WORKFLOW, VAULT_FORMAT } from './types.js';
import { naturalCompare, splitDescription } from './canonical.js';
import { writeVault } from './files.js';
import { spreadRanks } from './rank.js';

export interface ExportOptions {
  dbPath: string;
  projectSlug: string;
  outDir: string;
  /** 允许写入非空目录（默认要求目录为空或不存在） */
  force?: boolean;
}

export interface ExportReport {
  project: string;
  tasks: number;
  archived: number;
  domains: number;
  milestones: number;
  fields: number;
  links: number;
  files: string[];
  warnings: string[];
}

interface TaskRow {
  id: number;
  task_id: string;
  title: string;
  description: string | null;
  domain_id: number | null;
  milestone_id: number | null;
  parent_task_id: number | null;
  type: string;
  status: string;
  progress: number;
  priority: string;
  owner: string | null;
  assignee: string | null;
  due_date: string | null;
  start_date: string | null;
  blocker: string | null;
  tags: string;
  labels: string;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

function parseJsonArray(raw: string | null, warnings: string[], ctx: string): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    warnings.push(`${ctx}: JSON 数组解析失败，按空处理`);
    return [];
  }
}

export interface CollectedVault {
  project: { id: number; slug: string; name: string };
  data: Omit<VaultData, 'dir' | 'warnings'>;
  archived: number;
  warnings: string[];
}

/**
 * 从任意 SQLite 库（文件或 :memory:）收集某项目的需求树数据为 vault 内存结构。
 * CLI 导出与 VaultStore 落盘共用此函数，保证 SQLite↔vault 映射只有一份实现。
 */
export function collectVaultData(db: SqliteDb, projectSlug: string): CollectedVault {
  const warnings: string[] = [];
  {
    const project = db
      .prepare('SELECT id, slug, name FROM projects WHERE slug = ?')
      .get(projectSlug) as { id: number; slug: string; name: string } | undefined;
    if (!project) throw new Error(`项目不存在: ${projectSlug}`);

    // ── domains：task_prefix 作为 code，冲突时追加序号去重 ──
    const domainRows = db
      .prepare(
        'SELECT id, name, task_prefix, keywords, color FROM domains WHERE project_id = ? ORDER BY id'
      )
      .all(project.id) as {
      id: number;
      name: string;
      task_prefix: string;
      keywords: string;
      color: string;
    }[];
    // 大小写不敏感去重：'AI' 与 'ai' 的分片文件在 Windows/macOS 上会互相覆盖
    const usedCodes = new Set<string>();
    const domainCode = new Map<number, string>();
    const domains: VaultDomain[] = [];
    for (const d of domainRows) {
      let code = d.task_prefix || d.name;
      if (code.startsWith('_')) code = `D${code}`; // '_' 前缀是保留命名空间
      let unique = code;
      for (let n = 2; usedCodes.has(unique.toLowerCase()); n++) unique = `${code}-${n}`;
      if (unique !== code) warnings.push(`domain 前缀冲突: '${code}' → '${unique}'（${d.name}）`);
      usedCodes.add(unique.toLowerCase());
      domainCode.set(d.id, unique);
      domains.push({
        code: unique,
        name: d.name,
        color: d.color || undefined,
        keywords: parseJsonArray(d.keywords, warnings, `domain ${d.name} keywords`),
      });
    }

    // ── milestones：name 引用，重名去重 ──
    const milestoneRows = db
      .prepare(
        'SELECT id, name, target_date, status, description FROM milestones WHERE project_id = ? ORDER BY id'
      )
      .all(project.id) as {
      id: number;
      name: string;
      target_date: string | null;
      status: string;
      description: string | null;
    }[];
    const usedMsNames = new Set<string>();
    const milestoneName = new Map<number, string>();
    const milestones: VaultMilestone[] = [];
    for (const m of milestoneRows) {
      let name = m.name;
      for (let n = 2; usedMsNames.has(name); n++) name = `${m.name} (${n})`;
      if (name !== m.name) warnings.push(`milestone 重名: '${m.name}' → '${name}'`);
      usedMsNames.add(name);
      milestoneName.set(m.id, name);
      milestones.push({
        name,
        targetDate: m.target_date || undefined,
        status: m.status === 'active' ? undefined : m.status,
        description: m.description || undefined,
      });
    }

    // ── custom fields：数组顺序即 UI 顺序（(sort_order, id) 排序后落盘） ──
    const fieldRows = db
      .prepare('SELECT id, name, field_type, options, color FROM custom_fields ORDER BY sort_order, id')
      .all() as { id: number; name: string; field_type: string; options: string; color: string | null }[];
    // 字段名去重：custom_fields.name 无唯一约束，重名会让 task.fields 字典键冲突丢值
    const usedFieldNames = new Set<string>();
    const fieldName = new Map<number, string>();
    const fields: VaultFieldDef[] = [];
    for (const f of fieldRows) {
      let name = f.name;
      for (let n = 2; usedFieldNames.has(name); n++) name = `${f.name} (${n})`;
      if (name !== f.name) warnings.push(`自定义字段重名: '${f.name}' → '${name}'`);
      usedFieldNames.add(name);
      fieldName.set(f.id, name);
      fields.push({
        name,
        type: f.field_type === 'text' ? undefined : f.field_type,
        options: parseJsonArray(f.options, warnings, `field ${f.name} options`),
        color: f.color || undefined,
      });
    }

    // ── tasks ──
    const taskRows = db
      .prepare(
        `SELECT id, task_id, title, description, domain_id, milestone_id, parent_task_id,
                type, status, progress, priority, owner, assignee, due_date, start_date,
                blocker, tags, labels, sort_order, archived_at, created_at, updated_at
         FROM tasks WHERE project_id = ? ORDER BY id`
      )
      .all(project.id) as TaskRow[];

    const strId = new Map<number, string>();
    for (const r of taskRows) strId.set(r.id, r.task_id);

    // 关联子表一次性取回、按任务分组
    const inProject = `SELECT t.* FROM %TABLE% t
      JOIN tasks k ON k.id = t.task_id WHERE k.project_id = ?`;
    const groupBy = <T extends { task_id: number }>(rows: T[]): Map<number, T[]> => {
      const m = new Map<number, T[]>();
      for (const r of rows) {
        let list = m.get(r.task_id);
        if (!list) {
          list = [];
          m.set(r.task_id, list);
        }
        list.push(r);
      }
      return m;
    };
    const noteRows = groupBy(
      db.prepare(inProject.replace('%TABLE%', 'task_notes') + ' ORDER BY t.created_at, t.id').all(project.id) as {
        task_id: number; content: string; author: string | null; created_at: string;
      }[]
    );
    const historyRows = groupBy(
      db.prepare(inProject.replace('%TABLE%', 'progress_history') + ' ORDER BY t.recorded_at, t.id').all(project.id) as {
        task_id: number; progress: number; summary: string | null; recorded_at: string;
      }[]
    );
    const attachRows = groupBy(
      db.prepare(inProject.replace('%TABLE%', 'task_attachments') + ' ORDER BY t.sort_order, t.id').all(project.id) as {
        task_id: number; type: string; title: string; content: string; metadata: string | null;
        created_by: string | null; created_at: string; updated_at: string;
      }[]
    );
    const fieldValueRows = groupBy(
      db.prepare(inProject.replace('%TABLE%', 'task_field_values') + ' ORDER BY t.field_id').all(project.id) as {
        task_id: number; field_id: number; value: string;
      }[]
    );

    // 同级排序：按 (sort_order, id) 分组铺 rank
    const siblingGroups = new Map<string, TaskRow[]>();
    for (const r of taskRows) {
      const parentKey =
        r.parent_task_id !== null && strId.has(r.parent_task_id)
          ? String(r.parent_task_id)
          : '';
      let list = siblingGroups.get(parentKey);
      if (!list) {
        list = [];
        siblingGroups.set(parentKey, list);
      }
      list.push(r);
    }
    const rankOf = new Map<number, string>();
    for (const group of siblingGroups.values()) {
      group.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
      const ranks = spreadRanks(group.length);
      group.forEach((r, i) => rankOf.set(r.id, ranks[i]));
    }

    const tasks: VaultTask[] = [];
    let archivedCount = 0;
    for (const r of taskRows) {
      let parent: string | undefined;
      if (r.parent_task_id !== null) {
        parent = strId.get(r.parent_task_id);
        if (!parent) warnings.push(`'${r.task_id}' 的 parent（数字 id ${r.parent_task_id}）悬空，按根节点导出`);
      }
      let domain: string | undefined;
      if (r.domain_id !== null) {
        domain = domainCode.get(r.domain_id);
        if (!domain) warnings.push(`'${r.task_id}' 的 domain（id ${r.domain_id}）不在本项目，已忽略`);
      }
      let milestone: string | undefined;
      if (r.milestone_id !== null) {
        milestone = milestoneName.get(r.milestone_id);
        if (!milestone) warnings.push(`'${r.task_id}' 的 milestone（id ${r.milestone_id}）不在本项目，已忽略`);
      }
      const fieldsMap: Record<string, string> = {};
      for (const fv of fieldValueRows.get(r.id) ?? []) {
        const name = fieldName.get(fv.field_id);
        if (name && fv.value !== '') fieldsMap[name] = fv.value;
      }
      if (r.archived_at) archivedCount++;

      tasks.push({
        id: r.task_id,
        title: r.title,
        type: r.type,
        status: r.status,
        progress: r.progress,
        priority: r.priority,
        parent,
        rank: rankOf.get(r.id),
        owner: r.owner ?? undefined,
        assignee: r.assignee ?? undefined,
        startDate: r.start_date ?? undefined,
        dueDate: r.due_date ?? undefined,
        milestone,
        domain,
        labels: parseJsonArray(r.labels, warnings, `task ${r.task_id} labels`),
        tags: parseJsonArray(r.tags, warnings, `task ${r.task_id} tags`),
        blocker: r.blocker ?? undefined,
        fields: fieldsMap,
        description: splitDescription(r.description),
        notes: (noteRows.get(r.id) ?? []).map((n) => ({
          at: n.created_at,
          by: n.author ?? undefined,
          text: n.content,
        })),
        history: (historyRows.get(r.id) ?? []).map((h) => ({
          at: h.recorded_at,
          progress: h.progress,
          summary: h.summary ?? undefined,
        })),
        attachments: (attachRows.get(r.id) ?? []).map((a) => {
          let metadata: Record<string, unknown> | undefined;
          try {
            const parsed = a.metadata ? JSON.parse(a.metadata) : undefined;
            metadata = parsed && Object.keys(parsed).length > 0 ? parsed : undefined;
          } catch {
            warnings.push(`task ${r.task_id} 附件 '${a.title}' metadata 解析失败，按空处理`);
          }
          return {
            type: a.type,
            title: a.title,
            content: a.content,
            metadata,
            createdBy: a.created_by ?? undefined,
            createdAt: a.created_at,
            updatedAt: a.updated_at,
          };
        }),
        archivedAt: r.archived_at ?? undefined,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      });
    }

    // ── links：两端都在本项目才导出 ──
    const linkRows = db
      .prepare(
        `SELECT l.source_task_id, l.target_task_id, l.link_type FROM req_links l
         JOIN tasks s ON s.id = l.source_task_id
         WHERE s.project_id = ?`
      )
      .all(project.id) as { source_task_id: number; target_task_id: number; link_type: string }[];
    const links: VaultLink[] = [];
    for (const l of linkRows) {
      const source = strId.get(l.source_task_id);
      const target = strId.get(l.target_task_id);
      if (!source || !target) {
        warnings.push(`req_link ${l.source_task_id}→${l.target_task_id} 跨项目或悬空，已跳过`);
        continue;
      }
      links.push({ source, target, type: l.link_type as VaultLinkType });
    }

    // ── 披露未导出的数据（不静默截断：Step 1 只导需求树，其余按设计裁剪或留待后续）──
    const droppedCols = db
      .prepare(
        `SELECT
           SUM(CASE WHEN source IS NOT NULL AND source != 'planned' THEN 1 ELSE 0 END) AS src,
           SUM(CASE WHEN schedule_mode != 'once' THEN 1 ELSE 0 END) AS sched,
           SUM(CASE WHEN pos_x IS NOT NULL OR pos_y IS NOT NULL THEN 1 ELSE 0 END) AS pos,
           SUM(CASE WHEN blocker IS NOT NULL AND blocker != '' THEN 1 ELSE 0 END) AS blk
         FROM tasks WHERE project_id = ?`
      )
      .get(project.id) as { src: number; sched: number; pos: number; blk: number };
    if (droppedCols.src) warnings.push(`ℹ ${droppedCols.src} 个任务的 source 列未导出（设计裁剪）`);
    if (droppedCols.sched)
      warnings.push(`ℹ ${droppedCols.sched} 个任务的 schedule_* 调度配置未导出（设计裁剪）`);
    if (droppedCols.pos)
      warnings.push(`ℹ ${droppedCols.pos} 个任务的 pos_x/pos_y 画布坐标未导出（布局由前端现算）`);

    const tableExists = (name: string): boolean =>
      !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
    const relatedTables: [string, string][] = [
      ['backlog_items', '需求池'],
      ['goals', '目标'],
      ['iterations', '迭代'],
      ['intake_items', '收件箱'],
      ['members', '成员'],
    ];
    for (const [table, label] of relatedTables) {
      if (!tableExists(table)) continue; // import 生成的最小库不含协作表
      const row = db
        .prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE project_id = ?`)
        .get(project.id) as { c: number };
      if (row.c > 0) warnings.push(`ℹ ${label}（${table}）有 ${row.c} 条数据，本次未导出`);
    }

    const config: VaultConfig = {
      format: VAULT_FORMAT,
      name: project.name,
      workflow: DEFAULT_WORKFLOW,
    };

    const data: Omit<VaultData, 'dir' | 'warnings'> = {
      config,
      domains,
      milestones,
      fields,
      links,
      tasks,
    };
    return { project, data, archived: archivedCount, warnings };
  }
}

export function exportVault(opts: ExportOptions): ExportReport {
  if (fs.existsSync(opts.outDir)) {
    const entries = fs.readdirSync(opts.outDir);
    if (entries.length > 0 && !opts.force) {
      throw new Error(`输出目录非空: ${opts.outDir}（使用 --force 覆盖写入）`);
    }
  }

  const db = openDatabase(opts.dbPath, { readonly: true });
  try {
    const { project, data, archived, warnings } = collectVaultData(db, opts.projectSlug);
    const files = writeVault(opts.outDir, data).sort(naturalCompare);
    return {
      project: project.slug,
      tasks: data.tasks.length,
      archived,
      domains: data.domains.length,
      milestones: data.milestones.length,
      fields: data.fields.length,
      links: data.links.length,
      files,
      warnings,
    };
  } finally {
    db.close();
  }
}
