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
  // Windows 上杀软/索引器可能短暂锁定目标文件导致 rename EPERM/EBUSY，重试几次
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(tmp, filePath);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (attempt >= 5 || (code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY')) {
        try {
          fs.rmSync(tmp, { force: true });
        } catch {
          /* 保留 tmp 以便排查 */
        }
        throw e;
      }
      const until = Date.now() + 20 * (attempt + 1);
      while (Date.now() < until) {
        /* 忙等短暂退避（同步 API，无法 await） */
      }
    }
  }
}

// ── 分片归属 ────────────────────────────────────────────────────

/** Windows/POSIX 均安全的分片文件名；'_' 前缀是保留命名空间 */
export function shardFileName(code: string): string {
  let safe = code.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '');
  if (safe === '') safe = '_unnamed';
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(safe)) safe = `${safe}_`; // Windows 保留设备名
  return `${safe}.json`;
}

/** 任务所属分片的 vault 相对路径。归属以任务自身字段为准，文件位置仅是物理布局 */
export function shardRelPath(task: VaultTask): string {
  const dir = task.archivedAt ? 'archive' : 'tasks';
  return `${dir}/${shardFileName(task.domain ?? INBOX_CODE)}`;
}

// ── 序列化为文件映射 ────────────────────────────────────────────

/**
 * 把 vault 内存结构序列化为 {相对路径 → 文件内容} 映射（不落盘）。
 * writeVault（全量写）与 syncVault（差量写）共用，保证两条路径产出一致。
 */
export function buildVaultFiles(data: Omit<VaultData, 'dir' | 'warnings'>): Map<string, string> {
  const files = new Map<string, string>();
  files.set(CONFIG_FILE, stringifyConfig(data.config));
  files.set('domains.json', stringifyDomains(data.domains));
  files.set('milestones.json', stringifyMilestones(data.milestones));
  files.set('fields.json', stringifyFields(data.fields));
  files.set('links.json', stringifyLinks(data.links));

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
  // 大小写不敏感文件系统（Windows/macOS）上，仅大小写不同的分片名会互相覆盖导致静默丢数据。
  // 序列化前硬性拦截：宁可报错也不悄悄丢任务。
  const byLower = new Map<string, string>();
  for (const rel of shards.keys()) {
    const lower = rel.toLowerCase();
    const prev = byLower.get(lower);
    if (prev && prev !== rel) {
      throw new Error(
        `分片文件名仅大小写不同会在不区分大小写的文件系统上互相覆盖: '${prev}' 与 '${rel}'（请让相关 domain code 在忽略大小写时唯一）`
      );
    }
    byLower.set(lower, rel);
  }
  for (const rel of [...shards.keys()].sort()) {
    files.set(rel, stringifyTaskShard(shards.get(rel)!));
  }
  return files;
}

/**
 * 将整个 vault 写入目录（全量）。返回写入的相对路径列表。
 * 只写非空分片；不清理既有多余文件（调用方负责保证目录干净）。
 */
export function writeVault(dir: string, data: Omit<VaultData, 'dir' | 'warnings'>): string[] {
  const files = buildVaultFiles(data);
  for (const [rel, content] of files) {
    atomicWriteFile(path.join(dir, rel), content);
  }
  return [...files.keys()];
}

/**
 * 差量落盘：只写内容变化的文件，并删除不再需要的孤儿分片
 * （某 domain 最后一个任务被移走/删除后其分片文件应消失）。返回变更统计。
 */
export function syncVault(
  dir: string,
  data: Omit<VaultData, 'dir' | 'warnings'>
): { changed: string[]; removed: string[] } {
  const files = buildVaultFiles(data);
  const changed: string[] = [];
  for (const [rel, content] of files) {
    const full = path.join(dir, rel);
    let prev: string | null = null;
    try {
      prev = fs.readFileSync(full, 'utf8');
    } catch {
      prev = null;
    }
    if (prev !== content) {
      atomicWriteFile(full, content);
      changed.push(rel);
    }
  }
  // 清理 tasks/ 与 archive/ 下不在目标集合中的孤儿分片
  const removed: string[] = [];
  for (const sub of ['tasks', 'archive'] as const) {
    const subDir = path.join(dir, sub);
    if (!fs.existsSync(subDir)) continue;
    for (const name of fs.readdirSync(subDir)) {
      if (!name.endsWith('.json')) continue;
      const rel = `${sub}/${name}`;
      if (!files.has(rel)) {
        fs.rmSync(path.join(subDir, name), { force: true });
        removed.push(rel);
      }
    }
  }
  return { changed, removed };
}

// ── 全量加载 ────────────────────────────────────────────────────

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function listShardFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  // 原子写的临时文件名为 `<path>.tmp-<pid>`（不以 .json 结尾），.json 过滤已排除；
  // 故不额外按 '.tmp-' 子串过滤，避免误伤名字里含 '.tmp-' 的合法分片
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => path.join(dir, f));
}

/** 目录是否为 vault（存在 clawpm.json） */
export function isVaultDir(dir: string): boolean {
  return fs.existsSync(path.join(dir, CONFIG_FILE));
}

/** 从给定目录逐级向上查找含 clawpm.json 的 vault 根（语义同 git 找 .git），未找到返回 null */
export function findVaultUp(startDir: string): string | null {
  let dir = path.resolve(startDir);
  for (;;) {
    if (isVaultDir(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null; // 抵达根
    dir = parent;
  }
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
        if (t === null || typeof t !== 'object' || Array.isArray(t)) {
          warnings.push(`${rel}: tasks 数组含非对象元素，已跳过`);
          continue;
        }
        if (typeof t.id !== 'string' || t.id === '' || typeof t.title !== 'string') {
          warnings.push(`${rel}: 存在缺少 id/title 的任务，已跳过`);
          continue;
        }
        if (typeof t.status !== 'string' || t.status === '') {
          warnings.push(`${rel}: '${t.id}' 缺少 status，组树/导入时按 'backlog' 处理`);
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
