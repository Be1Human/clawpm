// canonical serializer —— git diff 质量的根基。
// 规则：
// 1. UTF-8 无 BOM、LF 换行、2 空格缩进、文件末尾一个换行
// 2. 对象 key 按 schema 声明顺序输出，未知 key 殿后按字典序（透传不丢弃）
// 3. 缺省值省略（type='task'、progress=0、priority='P2'、null/''/空数组/空对象）
// 4. 标量一行一个；tags/labels/deps 等短数组单行 inline；
//    description/notes/history/attachments 每元素一行
// 5. 分片内任务按 id 自然排序（FEAT-2 < FEAT-10），插入点按 ID 散开，
//    避免"都追加到文件末尾"的合并冲突热点
// 所有 vault 文件必须经本模块落盘，禁止裸 JSON.stringify。

import type {
  TaskShard,
  VaultConfig,
  VaultDomain,
  VaultFieldDef,
  VaultLink,
  VaultMilestone,
  VaultTask,
} from './types.js';
import {
  DOMAINS_FORMAT,
  FIELDS_FORMAT,
  LINKS_FORMAT,
  MILESTONES_FORMAT,
  TASKS_FORMAT,
  VAULT_FORMAT,
} from './types.js';

// ── 排序 ────────────────────────────────────────────────────────

/** 自然排序：数字段按数值比较（FEAT-2 < FEAT-10），其余按码元比较 */
export function naturalCompare(a: string, b: string): number {
  const re = /(\d+)|(\D+)/g;
  const pa = a.match(re) ?? [];
  const pb = b.match(re) ?? [];
  const len = Math.min(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i];
    const y = pb[i];
    const nx = /^\d/.test(x);
    const ny = /^\d/.test(y);
    if (nx && ny) {
      // 按字符串比较数值（去前导零后比长度再比字典序），避免 parseInt 对超长数字段的精度丢失
      const sx = x.replace(/^0+/, '') || '0';
      const sy = y.replace(/^0+/, '') || '0';
      if (sx.length !== sy.length) return sx.length - sy.length;
      if (sx !== sy) return sx < sy ? -1 : 1;
      // 数值相等但原串位数不同（01 vs 1）：前导零少者在前，保证全序
      if (x.length !== y.length) return x.length - y.length;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return pa.length - pb.length;
}

// ── 确定性 JSON ─────────────────────────────────────────────────

function sortDeep(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(sortDeep);
  const obj = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    if (obj[k] !== undefined) out[k] = sortDeep(obj[k]);
  }
  return out;
}

/** JSON.stringify，但对象 key 深度排序 —— 同一数据永远得到同一字符串 */
export function stableStringify(v: unknown): string {
  return JSON.stringify(sortDeep(v));
}

// ── 任务序列化 ──────────────────────────────────────────────────

/** 任务字段的落盘顺序（git blame 稳定性依赖它） */
export const TASK_KEY_ORDER = [
  'id',
  'title',
  'type',
  'status',
  'statusNote',
  'progress',
  'priority',
  'parent',
  'rank',
  'owner',
  'assignee',
  'collaborators',
  'startDate',
  'dueDate',
  'milestone',
  'domain',
  'labels',
  'tags',
  'blocker',
  'tracking',
  'review',
  'fields',
  'description',
  'notes',
  'history',
  'attachments',
  'deps',
  'archivedAt',
  'createdAt',
  'updatedAt',
] as const;

const TASK_KEY_SET = new Set<string>(TASK_KEY_ORDER);

/** 必填字段：即使值为 falsy（如 title=''、status=''）也必须落盘，否则 import 会静默丢任务/崩溃 */
const REQUIRED_TASK_KEYS = new Set(['id', 'title', 'status']);

/** 每元素占一行的数组字段 */
const BLOCK_ARRAY_KEYS = new Set(['description', 'notes', 'history', 'attachments']);

function isEmptyObject(v: unknown): boolean {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    Object.keys(v as object).every((k) => (v as Record<string, unknown>)[k] === undefined)
  );
}

/** 缺省值省略规则 */
/**
 * 有默认值的字段：取值等于默认值时不落盘（文件只含信息量，diff 无噪音）。
 *
 * 这是「字段缺失 = 取默认值」这条约定的**唯一事实来源**：序列化的省略规则、
 * 必填字段判定、以及给 agent 看的格式说明（store/format-doc.ts）都从这里读，
 * 改这里三处一起变，杜绝「代码改了文档还在骗人」。
 */
export const TASK_DEFAULTS: Readonly<Record<string, unknown>> = {
  type: 'task',
  progress: 0,
  priority: 'P2',
};

/**
 * 必填字段：即使是空值也必须落盘。
 * 省略它们会导致加载时任务被判为非法而静默丢弃（title）或崩溃（status）。
 */
export const TASK_REQUIRED_KEYS: readonly string[] = ['id', 'title', 'status'];

export function isOmittedTaskValue(key: string, v: unknown): boolean {
  if (TASK_REQUIRED_KEYS.includes(key)) return false;
  if (v === undefined || v === null || v === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (isEmptyObject(v)) return true;
  return key in TASK_DEFAULTS && v === TASK_DEFAULTS[key];
}

function orderedTaskKeys(t: VaultTask): string[] {
  const known = TASK_KEY_ORDER.filter((k) => k in t);
  const unknown = Object.keys(t)
    .filter((k) => !TASK_KEY_SET.has(k))
    .sort();
  return [...known, ...unknown];
}

function renderTask(t: VaultTask, indent: string): string {
  const inner = indent + '  ';
  const lines: string[] = [];
  for (const key of orderedTaskKeys(t)) {
    const v = (t as Record<string, unknown>)[key];
    if (!REQUIRED_TASK_KEYS.has(key) && isOmittedTaskValue(key, v)) continue;
    if (BLOCK_ARRAY_KEYS.has(key) && Array.isArray(v)) {
      const items = v.map((it) => `${inner}  ${stableStringify(it)}`);
      lines.push(`${inner}${JSON.stringify(key)}: [\n${items.join(',\n')}\n${inner}]`);
    } else {
      lines.push(`${inner}${JSON.stringify(key)}: ${stableStringify(v)}`);
    }
  }
  return `${indent}{\n${lines.join(',\n')}\n${indent}}`;
}

/** 序列化任务分片文件（tasks/<code>.json / archive/<code>.json） */
export function stringifyTaskShard(tasks: VaultTask[]): string {
  const sorted = [...tasks].sort((a, b) => naturalCompare(a.id, b.id));
  const body =
    sorted.length === 0
      ? '  "tasks": []'
      : `  "tasks": [\n${sorted.map((t) => renderTask(t, '    ')).join(',\n')}\n  ]`;
  return `{\n  "format": ${JSON.stringify(TASKS_FORMAT)},\n${body}\n}\n`;
}

export function parseTaskShard(text: string, file: string): TaskShard {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`${file}: JSON 解析失败 — ${(e as Error).message}`);
  }
  const shard = parsed as TaskShard;
  if (shard.format !== TASKS_FORMAT) {
    throw new Error(`${file}: format 不是 ${TASKS_FORMAT}（得到 ${String(shard.format)}）`);
  }
  if (!Array.isArray(shard.tasks)) {
    throw new Error(`${file}: 缺少 tasks 数组`);
  }
  return shard;
}

// ── 顶层小文件（domains/milestones/fields/links） ────────────────

function renderInlineRecord(obj: Record<string, unknown>, keyOrder: string[]): string {
  const knownSet = new Set(keyOrder);
  const keys = [
    ...keyOrder.filter((k) => k in obj),
    ...Object.keys(obj).filter((k) => !knownSet.has(k)).sort(),
  ];
  const parts: string[] = [];
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (isEmptyObject(v)) continue;
    parts.push(`${JSON.stringify(k)}: ${stableStringify(v)}`);
  }
  return `{ ${parts.join(', ')} }`;
}

function stringifyRecordFile(
  format: string,
  listKey: string,
  records: Record<string, unknown>[],
  keyOrder: string[]
): string {
  const body =
    records.length === 0
      ? `  ${JSON.stringify(listKey)}: []`
      : `  ${JSON.stringify(listKey)}: [\n${records
          .map((r) => `    ${renderInlineRecord(r, keyOrder)}`)
          .join(',\n')}\n  ]`;
  return `{\n  "format": ${JSON.stringify(format)},\n${body}\n}\n`;
}

export function stringifyDomains(domains: VaultDomain[]): string {
  const sorted = [...domains].sort((a, b) => naturalCompare(a.code, b.code));
  return stringifyRecordFile(DOMAINS_FORMAT, 'domains', sorted, [
    'code',
    'name',
    'color',
    'keywords',
  ]);
}

export function stringifyMilestones(milestones: VaultMilestone[]): string {
  const sorted = [...milestones].sort((a, b) => naturalCompare(a.name, b.name));
  return stringifyRecordFile(MILESTONES_FORMAT, 'milestones', sorted, [
    'name',
    'targetDate',
    'status',
    'description',
  ]);
}

/** fields 数组顺序即 UI 展示顺序（不落 sortOrder 字段） */
export function stringifyFields(fields: VaultFieldDef[]): string {
  return stringifyRecordFile(FIELDS_FORMAT, 'fields', fields, [
    'name',
    'type',
    'options',
    'color',
  ]);
}

export function stringifyLinks(links: VaultLink[]): string {
  const sorted = [...links].sort(
    (a, b) =>
      naturalCompare(a.source, b.source) ||
      naturalCompare(a.target, b.target) ||
      naturalCompare(a.type, b.type)
  );
  return stringifyRecordFile(LINKS_FORMAT, 'links', sorted as unknown as Record<string, unknown>[], [
    'source',
    'target',
    'type',
  ]);
}

// ── clawpm.json ─────────────────────────────────────────────────

export function stringifyConfig(config: VaultConfig): string {
  const lines: string[] = [];
  lines.push(`  "format": ${JSON.stringify(VAULT_FORMAT)}`);
  lines.push(`  "name": ${JSON.stringify(config.name)}`);

  const wf = config.workflow;
  const wfLines: string[] = [];
  const statuses = wf.statuses
    .map((s) => `      ${renderInlineRecord(s, ['id', 'label', 'kanban'])}`)
    .join(',\n');
  wfLines.push(`    "statuses": [\n${statuses}\n    ]`);
  if (wf.trackKeys && wf.trackKeys.length > 0) {
    wfLines.push(`    "trackKeys": ${stableStringify(wf.trackKeys)}`);
  }
  if (wf.gates && wf.gates.length > 0) {
    const gates = wf.gates.map((g) => `      ${stableStringify(g)}`).join(',\n');
    wfLines.push(`    "gates": [\n${gates}\n    ]`);
  }
  const WF_KNOWN = new Set(['statuses', 'trackKeys', 'gates']);
  const wfRecord = wf as unknown as Record<string, unknown>;
  for (const k of Object.keys(wfRecord).filter((k) => !WF_KNOWN.has(k)).sort()) {
    const v = wfRecord[k];
    if (v === undefined || v === null) continue;
    wfLines.push(`    ${JSON.stringify(k)}: ${stableStringify(v)}`);
  }
  lines.push(`  "workflow": {\n${wfLines.join(',\n')}\n  }`);

  const KNOWN = new Set(['format', 'name', 'workflow']);
  for (const k of Object.keys(config).filter((k) => !KNOWN.has(k)).sort()) {
    const v = config[k];
    if (v === undefined || v === null) continue;
    lines.push(`  ${JSON.stringify(k)}: ${stableStringify(v)}`);
  }
  return `{\n${lines.join(',\n')}\n}\n`;
}

export function parseConfig(text: string, file: string): VaultConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`${file}: JSON 解析失败 — ${(e as Error).message}`);
  }
  const config = parsed as VaultConfig;
  if (config.format !== VAULT_FORMAT) {
    throw new Error(`${file}: format 不是 ${VAULT_FORMAT}（得到 ${String(config.format)}）`);
  }
  if (!config.workflow || !Array.isArray(config.workflow.statuses)) {
    throw new Error(`${file}: 缺少 workflow.statuses`);
  }
  return config;
}

// ── 多行文本 ↔ 行数组 ───────────────────────────────────────────

/** API 边界收发 string，落盘存 string[]（行级 diff） */
export function splitDescription(s: string | null | undefined): string[] | undefined {
  if (s === null || s === undefined || s === '') return undefined;
  return s.replace(/\r\n/g, '\n').split('\n');
}

export function joinDescription(lines: string[] | undefined): string | null {
  if (!lines || lines.length === 0) return null;
  return lines.join('\n');
}
