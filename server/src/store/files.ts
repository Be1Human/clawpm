// vault 目录布局与文件 IO：原子写（tmp + rename）、全量加载、分片归属。
//
// 布局：
//   <vault>/
//     clawpm.json          标识 + 工作流配置（存在即认定为 vault）
//     domains.json  milestones.json  fields.json  links.json
//     tasks/<code>.json    活跃任务按 domain 分片；_inbox.json 收无 domain 任务
//     archive/<code>.json  归档任务同维分片
//     views/  attachments/ .clawpm/（Step 1 不涉及）

import fs from 'fs';
import path from 'path';
import type { VaultData, VaultTask } from './types.js';
import { INBOX_CODE } from './types.js';
import {
  parseConfig,
  parseTaskShard,
  stringifyConfig,
  stringifyDomains,
  stringifyFields,
  stringifyLinks,
  stringifyMilestones,
  stringifyTaskShard,
} from './canonical.js';

export const CONFIG_FILE = 'clawpm.json';

// ── 原子写 ──────────────────────────────────────────────────────

/** 写临时文件后 rename 原子替换；内容必须已含末尾换行（canonical 保证） */
export function atomicWriteFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, filePath);
}

// ── 分片归属 ────────────────────────────────────────────────────

/** Windows/POSIX 均安全的分片文件名；'_' 前缀是保留命名空间 */
export function shardFileName(code: string): string {
  let safe = code.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '');
  if (safe === '') safe = '_unnamed';
  return `${safe}.json`;
}

/** 任务所属分片的 vault 相对路径。归属以任务自身字段为准，文件位置仅是物理布局 */
export function shardRelPath(task: VaultTask): string {
  const dir = task.archivedAt ? 'archive' : 'tasks';
  return `${dir}/${shardFileName(task.domain ?? INBOX_CODE)}`;
}

// ── 全量写 ──────────────────────────────────────────────────────

/**
 * 将整个 vault 写入目录。返回写入的相对路径列表。
 * 只写非空分片；不清理既有多余文件（调用方负责保证目录干净）。
 */
export function writeVault(dir: string, data: Omit<VaultData, 'dir' | 'warnings'>): string[] {
  const written: string[] = [];
  const put = (rel: string, content: string) => {
    atomicWriteFile(path.join(dir, rel), content);
    written.push(rel);
  };

  put(CONFIG_FILE, stringifyConfig(data.config));
  put('domains.json', stringifyDomains(data.domains));
  put('milestones.json', stringifyMilestones(data.milestones));
  put('fields.json', stringifyFields(data.fields));
  put('links.json', stringifyLinks(data.links));

  const shards = new Map<string, VaultTask[]>();
  for (const t of data.tasks) {
    const rel = shardRelPath(t);
    let list = shards.get(rel);
    if (!list) {
      list = [];
      shards.set(rel, list);
    }
    list.push(t);
  }
  for (const rel of [...shards.keys()].sort()) {
    put(rel, stringifyTaskShard(shards.get(rel)!));
  }
  return written;
}

// ── 全量加载 ────────────────────────────────────────────────────

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function listShardFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.includes('.tmp-'))
    .sort()
    .map((f) => path.join(dir, f));
}

/** 目录是否为 vault（存在 clawpm.json） */
export function isVaultDir(dir: string): boolean {
  return fs.existsSync(path.join(dir, CONFIG_FILE));
}

/**
 * 全量加载 vault 到内存。重复 ID / 悬空 parent / 分片与字段归属不一致
 * 记入 warnings（不阻断，与 git merge 后的临时不一致共存）。
 */
export function loadVault(dir: string): VaultData {
  const configPath = path.join(dir, CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    throw new Error(`${dir} 不是 clawpm vault（缺少 ${CONFIG_FILE}）`);
  }
  const warnings: string[] = [];
  const config = parseConfig(fs.readFileSync(configPath, 'utf8'), CONFIG_FILE);

  const domains = readJsonFile<{ domains: VaultData['domains'] }>(
    path.join(dir, 'domains.json'),
    { domains: [] }
  ).domains ?? [];
  const milestones = readJsonFile<{ milestones: VaultData['milestones'] }>(
    path.join(dir, 'milestones.json'),
    { milestones: [] }
  ).milestones ?? [];
  const fields = readJsonFile<{ fields: VaultData['fields'] }>(
    path.join(dir, 'fields.json'),
    { fields: [] }
  ).fields ?? [];
  const links = readJsonFile<{ links: VaultData['links'] }>(
    path.join(dir, 'links.json'),
    { links: [] }
  ).links ?? [];

  const tasks: VaultTask[] = [];
  const seen = new Map<string, string>(); // id -> 文件
  for (const sub of ['tasks', 'archive'] as const) {
    for (const file of listShardFiles(path.join(dir, sub))) {
      const rel = `${sub}/${path.basename(file)}`;
      const shard = parseTaskShard(fs.readFileSync(file, 'utf8'), rel);
      for (const t of shard.tasks) {
        if (typeof t.id !== 'string' || t.id === '' || typeof t.title !== 'string') {
          warnings.push(`${rel}: 存在缺少 id/title 的任务，已跳过`);
          continue;
        }
        const prev = seen.get(t.id);
        if (prev) {
          warnings.push(`重复 ID '${t.id}'（${prev} 与 ${rel}），保留前者`);
          continue;
        }
        seen.set(t.id, rel);
        if (sub === 'archive' && !t.archivedAt) {
          warnings.push(`${rel}: '${t.id}' 位于 archive/ 但无 archivedAt 字段`);
        }
        tasks.push(t);
      }
    }
  }

  for (const t of tasks) {
    if (t.parent && !seen.has(t.parent)) {
      warnings.push(`'${t.id}' 的 parent '${t.parent}' 不存在（组树时按根节点处理）`);
    }
  }

  return { dir, config, domains, milestones, fields, links, tasks, warnings };
}
