// ClawMate/MineFriend requirements.json → clawpm 文本 vault 迁移。
//
// 关键映射（见项目记忆 clawpm-existing-data-migration）：
// - domain code 取自 ID 中段（FEAT-<CODE>-NN），权威且 100% 可解析
// - status：8 规范码直通；unknown 按 statusRaw 首 emoji 归一；statusRaw 全文存 statusNote
// - tracking 7 轨：done/pending/no/na 直通，other → pending（并入报告）
// - 生成 15 个合成层根节点（LAYER-<CODE>），令迁移后 MindMap 立刻呈现树状
// - workflow：8 态 + 看板列映射 + 评审 gate（标 done 前置 测试报告=done）

import fs from 'fs';
import type {
  VaultConfig,
  VaultData,
  VaultDomain,
  VaultTask,
  VaultWorkflow,
} from './types.js';
import { VAULT_FORMAT } from './types.js';
import { naturalCompare, splitDescription } from './canonical.js';
import { writeVault } from './files.js';
import { spreadRanks } from './rank.js';

export interface MigrateReqOptions {
  fromFile: string;
  vaultDir: string;
  force?: boolean;
  /** archived 条目的归档时间戳（原数据无此信息，迁移时统一标注） */
  archivedDate?: string;
}

export interface MigrateReqReport {
  total: number;
  active: number;
  archived: number;
  domains: number;
  syntheticRoots: number;
  unknownResolved: string[];
  trackingOther: string[];
  warnings: string[];
  files: string[];
}

interface RawReq {
  id: string;
  title: string;
  desc?: string;
  layer?: string;
  type?: string;
  typeLabel?: string;
  priority?: string;
  status?: string;
  statusRaw?: string;
  archived?: boolean;
  tracking?: Record<string, string>;
}

// code → 领域显示名 + 颜色（显示名取自 layer 字段的规范拼写）
const DOMAIN_META: Record<string, { name: string; color: string }> = {
  CROSS: { name: '跨层', color: '#f59e0b' },
  L1: { name: 'L1-Adapter', color: '#6366f1' },
  L2: { name: 'L2-Capability', color: '#8b5cf6' },
  L3: { name: 'L3-Atomic', color: '#3b82f6' },
  L4: { name: 'L4-技能层', color: '#06b6d4' },
  L5: { name: 'L5-策略层', color: '#10b981' },
  L6: { name: 'L6-TaskRuntime', color: '#84cc16' },
  L7: { name: 'L7-MainBrain', color: '#ef4444' },
  WEBUI: { name: 'WebUI', color: '#ec4899' },
  MEM: { name: 'Memory', color: '#f97316' },
  ENG: { name: '工程', color: '#64748b' },
  HB: { name: 'Heartbeat', color: '#14b8a6' },
  PERC: { name: 'Perception', color: '#a855f7' },
  NARR: { name: 'Narration', color: '#d946ef' },
  RL: { name: 'RL', color: '#0ea5e9' },
  V1: { name: 'v1退役', color: '#9ca3af' },
};

// statusRaw 首 emoji → 规范状态码
const EMOJI_STATUS: Record<string, string> = {
  '🔍': 'review',
  '📐': 'design',
  '🛠': 'ready',
  '⏳': 'doing',
  '🧪': 'accept',
  '✅': 'done',
  '🚫': 'closed',
  '❌': 'closed',
};

const KNOWN_STATUS = new Set(['review', 'design', 'ready', 'doing', 'accept', 'done', 'closed']);

export const MINEFRIEND_WORKFLOW: VaultWorkflow = {
  statuses: [
    { id: 'backlog', label: '📋 待规划', kanban: 'backlog' },
    { id: 'review', label: '🔍 待评审', kanban: 'review' },
    { id: 'design', label: '📐 设计中', kanban: 'planned' },
    { id: 'ready', label: '🛠 待实施', kanban: 'planned' },
    { id: 'doing', label: '⏳ 实施中', kanban: 'active' },
    { id: 'accept', label: '🧪 待验收', kanban: 'review' },
    { id: 'done', label: '✅ 已完成', kanban: 'done' },
    { id: 'closed', label: '🚫 关闭/冗余', kanban: 'done' },
  ],
  trackKeys: ['评审', '需求', '设计', '框架图', '代码实现', '测试用例', '测试报告'],
  gates: [{ to: 'done', require: { 'tracking.测试报告': 'done' } }],
};

const ID_RE = /^(FEAT|BUG|TEST)-([A-Z0-9]+)-(.+)$/;

/** 去掉 statusRaw 开头的 emoji + 空格，保留日期/备注信息 */
function stripEmoji(s: string): string {
  return s.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}️]+\s*/u, '').trim();
}

function deriveStatus(req: RawReq, warnings: string[], unknownResolved: string[]): string {
  if (req.status && KNOWN_STATUS.has(req.status)) return req.status;
  const raw = req.statusRaw ?? '';
  for (const [emoji, code] of Object.entries(EMOJI_STATUS)) {
    if (raw.startsWith(emoji)) {
      unknownResolved.push(`${req.id}: statusRaw「${raw}」→ ${code}`);
      return code;
    }
  }
  warnings.push(`${req.id}: 无法归一 status（statusRaw「${raw}」），置 backlog`);
  return 'backlog';
}

function deriveType(req: RawReq): string {
  if (req.id.startsWith('TEST-') || (req.typeLabel && req.typeLabel.includes('验证'))) return 'test';
  if (req.type === 'bug') return 'bug';
  if (req.type === 'feat') return 'feat';
  return 'task';
}

export function migrateRequirements(opts: MigrateReqOptions): MigrateReqReport {
  const warnings: string[] = [];
  const unknownResolved: string[] = [];
  const trackingOther: string[] = [];
  const archivedDate = opts.archivedDate ?? new Date().toISOString().slice(0, 10);

  if (fs.existsSync(opts.vaultDir)) {
    const entries = fs.readdirSync(opts.vaultDir).filter((f) => f !== '.git');
    if (entries.length > 0 && !opts.force) {
      throw new Error(`vault 目录非空: ${opts.vaultDir}（--force 覆盖）`);
    }
  }

  const raw = JSON.parse(fs.readFileSync(opts.fromFile, 'utf8')) as {
    meta?: { project?: string };
    requirements: RawReq[];
  };
  const reqs = raw.requirements ?? [];

  // ── 解析 ID → code，收集出现的领域 ──
  const codeSet = new Set<string>();
  const reqCode = new Map<string, string>();
  for (const r of reqs) {
    const m = r.id.match(ID_RE);
    if (!m) {
      warnings.push(`${r.id}: ID 不符合 TYPE-CODE-NN 规则，归入 _inbox`);
      continue;
    }
    reqCode.set(r.id, m[2]);
    codeSet.add(m[2]);
  }

  const domains: VaultDomain[] = [...codeSet]
    .sort(naturalCompare)
    .map((code) => ({
      code,
      name: DOMAIN_META[code]?.name ?? code,
      color: DOMAIN_META[code]?.color ?? '#6366f1',
    }));

  // ── 合成层根节点：每个 code 一个 LAYER-<code> ──
  const rootIds = [...codeSet].sort(naturalCompare).map((c) => `LAYER-${c}`);
  const rootRanks = spreadRanks(rootIds.length);
  const tasks: VaultTask[] = [];
  [...codeSet].sort(naturalCompare).forEach((code, i) => {
    tasks.push({
      id: `LAYER-${code}`,
      title: DOMAIN_META[code]?.name ?? code,
      type: 'task',
      status: 'backlog',
      domain: code,
      rank: rootRanks[i],
      description: [`${DOMAIN_META[code]?.name ?? code} 层需求（迁移生成的分组根节点）`],
    });
  });

  // ── 需求节点：挂到对应层根节点下，按原数组顺序铺 rank ──
  let archived = 0;
  const byCode = new Map<string, RawReq[]>();
  for (const r of reqs) {
    const code = reqCode.get(r.id) ?? '_inbox';
    let list = byCode.get(code);
    if (!list) {
      list = [];
      byCode.set(code, list);
    }
    list.push(r);
  }
  for (const [code, list] of byCode) {
    const ranks = spreadRanks(list.length);
    list.forEach((r, i) => {
      const status = deriveStatus(r, warnings, unknownResolved);
      const note = r.statusRaw ? stripEmoji(r.statusRaw) : undefined;

      // tracking：other → pending（并入报告）
      const tracking: Record<string, string> = {};
      for (const [k, v] of Object.entries(r.tracking ?? {})) {
        if (v === 'other') {
          tracking[k] = 'pending';
          trackingOther.push(`${r.id}.${k}: other → pending`);
        } else {
          tracking[k] = v;
        }
      }

      const task: VaultTask = {
        id: r.id,
        title: r.title,
        type: deriveType(r),
        status,
        statusNote: note,
        priority: r.priority ?? 'P2',
        parent: code === '_inbox' ? undefined : `LAYER-${code}`,
        domain: code === '_inbox' ? undefined : code,
        rank: ranks[i],
        tracking: Object.keys(tracking).length ? tracking : undefined,
        description: splitDescription(r.desc),
      };
      if (r.archived) {
        task.archivedAt = archivedDate;
        archived++;
      }
      tasks.push(task);
    });
  }

  const config: VaultConfig = {
    format: VAULT_FORMAT,
    name: raw.meta?.project?.split('·').pop()?.trim() || 'MineFriend 需求管理',
    workflow: MINEFRIEND_WORKFLOW,
  };

  const data: Omit<VaultData, 'dir' | 'warnings'> = {
    config,
    domains,
    milestones: [],
    fields: [],
    links: [],
    tasks,
  };
  const files = writeVault(opts.vaultDir, data).sort(naturalCompare);

  return {
    total: reqs.length,
    active: reqs.length - archived,
    archived,
    domains: domains.length,
    syntheticRoots: rootIds.length,
    unknownResolved,
    trackingOther,
    warnings,
    files,
  };
}
