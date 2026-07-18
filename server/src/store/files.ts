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
import type { VaultConfig, VaultData, VaultDomain, VaultTask } from './types.js';
import { INBOX_CODE } from './types.js';
import { AGENTS_FILE, renderAgentsDoc } from './format-doc.js';
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

/**
 * 写入/刷新 vault 根的 AGENTS.md（给 AI agent 的格式说明）。
 * 内容由代码常量与本库配置渲染，故每次打开都重写以保证不过期；
 * 内容不变时不写，避免制造无谓的 git 改动。
 */
export function writeAgentsDoc(
  dir: string,
  config: VaultConfig,
  domains: VaultDomain[]
): void {
  try {
    const file = path.join(dir, AGENTS_FILE);
    const content = renderAgentsDoc(config, domains);
    let prev: string | null = null;
    try {
      prev = fs.readFileSync(file, 'utf8');
    } catch {
      prev = null;
    }
    if (prev !== content) atomicWriteFile(file, content);
  } catch {
    /* 说明文件只是便利功能，写不了不应影响打开库 */
  }
}

// ── 文件删除 ────────────────────────────────────────────────────

/**
 * 删除单个文件。
 *
 * 不能用 fs.rmSync：实测 Node v24.11.1 (Windows) 下，只要路径中含任何非 ASCII
 * 字符（vault 路径常含中文，如 docs/需求管理），rmSync 删文件即静默无效——
 * 既不抛错也不删除，调用方会误判成功。unlinkSync 无此问题。
 * 删除后显式校验存在性，宁可抛错也不谎报成功（孤儿分片残留会让已删任务复活）。
 */
export function removeFile(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw e;
  }
  if (fs.existsSync(filePath)) {
    throw new Error(`文件删除失败（调用未报错但文件仍存在）: ${filePath}`);
  }
}

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
          removeFile(tmp);
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
  files.set('people.json', JSON.stringify({ format: 'clawpm-people@1', people: data.people }, null, 2) + '\n');

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
 * 清理 tasks/ 与 archive/ 下不属于目标集合的分片文件，返回被删的相对路径。
 *
 * 这两个目录由 clawpm 独占，出现在其中却不在目标集合里的 .json 只可能是：
 * 某 domain 最后一个任务被移走后的空壳，或上一次写入残留（如 migrate --force
 * 覆盖一个旧库）。不清掉会被下次加载读回来，表现为「已删的需求复活」或
 * 「冒出没注册的领域」。
 */
function removeOrphanShards(dir: string, keep: Set<string>): string[] {
  const removed: string[] = [];
  for (const sub of ['tasks', 'archive'] as const) {
    const subDir = path.join(dir, sub);
    if (!fs.existsSync(subDir)) continue;
    for (const name of fs.readdirSync(subDir)) {
      if (!name.endsWith('.json')) continue;
      const rel = `${sub}/${name}`;
      if (!keep.has(rel)) {
        removeFile(path.join(subDir, name));
        removed.push(rel);
      }
    }
  }
  return removed;
}

/**
 * 将整个 vault 写入目录（全量），并清掉不属于本次写入的孤儿分片。
 * 返回写入的相对路径列表。
 */
export function writeVault(dir: string, data: Omit<VaultData, 'dir' | 'warnings'>): string[] {
  const files = buildVaultFiles(data);
  for (const [rel, content] of files) {
    atomicWriteFile(path.join(dir, rel), content);
  }
  // 全量写＝该目录内容应与 data 完全一致，残留的旧分片必须清除
  removeOrphanShards(dir, new Set(files.keys()));
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
  const removed = removeOrphanShards(dir, new Set(files.keys()));
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
  const people = readJsonFile<{ people: VaultData['people'] }>(
    path.join(dir, 'people.json'),
    { people: [] }
  ).people ?? [];

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

  // 状态合法性：任务的 status 必须在本库工作流里声明过。
  // 曾发生过 clawpm.json 的自定义工作流被落盘覆盖成默认五态，导致 39 条任务的状态
  // 集体失去定义（看板无法归列），而当时没有任何环节会发现 —— 故在此显式告警。
  const legalStatuses = new Set(config.workflow.statuses.map((s) => s.id));
  const illegal = new Map<string, number>();
  for (const t of tasks) {
    if (t.status && !legalStatuses.has(t.status)) {
      illegal.set(t.status, (illegal.get(t.status) ?? 0) + 1);
    }
  }
  for (const [status, count] of illegal) {
    warnings.push(
      `${count} 个任务的 status '${status}' 未在 ${CONFIG_FILE} 的 workflow.statuses 中声明（看板无法归列）`
    );
  }

  for (const t of tasks) {
    if (t.parent && !seen.has(t.parent)) {
      warnings.push(`'${t.id}' 的 parent '${t.parent}' 不存在（组树时按根节点处理）`);
    }
  }

  return { dir, config, domains, milestones, fields, links, people, tasks, warnings };
}
