// clawpm 文本 vault 格式（clawpm-vault@1）类型定义。
// 设计原则：
// - 字符串业务 ID（如 FEAT-WEBUI-03）是唯一主键，数字自增 id 永不落盘
// - 树 = 扁平记录 + parent 字符串引用，运行时组树
// - 缺省值不落盘（serializer 负责省略），未知字段原样透传
// - 分片文件仅是物理布局，任务的 domain/archivedAt 字段才是归属权威

export interface VaultWorkflowStatus {
  id: string;
  label: string;
  /** 映射到看板五列语义，前端按状态分组/着色的逻辑读此字段 */
  kanban: 'backlog' | 'planned' | 'active' | 'review' | 'done';
  [key: string]: unknown;
}

export interface VaultGate {
  /** 目标状态 id，迁移到该状态前校验 require */
  to: string;
  /** 形如 { "tracking.测试报告": "done" } 的前置条件 */
  require: Record<string, string>;
}

export interface VaultWorkflow {
  statuses: VaultWorkflowStatus[];
  /** 交付物追踪矩阵的轨道名（如 评审/需求/设计/…） */
  trackKeys?: string[];
  gates?: VaultGate[];
}

/** vault 根目录的 clawpm.json —— 存在即认定该目录为需求仓库 */
export interface VaultConfig {
  format: string; // VAULT_FORMAT
  name: string;
  workflow: VaultWorkflow;
  [key: string]: unknown;
}

export interface VaultDomain {
  /** 分片文件名 = ID 前缀（原 domains.task_prefix） */
  code: string;
  name: string;
  color?: string;
  keywords?: string[];
  [key: string]: unknown;
}

export interface VaultMilestone {
  name: string;
  targetDate?: string;
  /** 缺省 'active' */
  status?: string;
  description?: string;
  [key: string]: unknown;
}

export interface VaultFieldDef {
  name: string;
  /** 'text' | 'number' | 'date' | 'select' | 'multi_select'，缺省 'text' */
  type?: string;
  options?: string[];
  color?: string;
  [key: string]: unknown;
}

export type VaultLinkType = 'blocks' | 'precedes' | 'relates';

export interface VaultLink {
  source: string;
  target: string;
  type: VaultLinkType;
}

export interface VaultNote {
  at: string;
  by?: string;
  text: string;
}

export interface VaultHistoryEntry {
  at: string;
  progress: number;
  summary?: string;
}

export interface VaultAttachment {
  type: string; // 'doc' | 'link' | 'tapd'
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface VaultReview {
  status?: string; // pending | approved | rejected | needs_revision
  reviewer?: string;
  reviewedAt?: string;
  doc?: string;
}

export interface VaultTask {
  id: string;
  title: string;
  /** 缺省 'task' */
  type?: string;
  status: string;
  /** 状态自由文本备注（迁移时承接 statusRaw 的信息量） */
  statusNote?: string;
  /** 0-100，缺省 0 */
  progress?: number;
  /** P0-P3，缺省 'P2' */
  priority?: string;
  /** 父任务业务 ID，根节点省略 */
  parent?: string;
  /** 同级排序 fractional rank（字典序即兄弟顺序），见 rank.ts */
  rank?: string;
  owner?: string;
  assignee?: string;
  startDate?: string;
  dueDate?: string;
  /** 按 name 引用 milestones.json */
  milestone?: string;
  /** 按 code 引用 domains.json；任务归属以此字段为准，所在分片文件仅是物理布局 */
  domain?: string;
  labels?: string[];
  tags?: string[];
  blocker?: string;
  /** 交付物追踪矩阵，值域 done|pending|no|na */
  tracking?: Record<string, string>;
  review?: VaultReview;
  /** 自定义字段，字段名 → 值 */
  fields?: Record<string, string>;
  /** 多行文本按行拆分存储（行级 diff），API 边界收发 string */
  description?: string[];
  notes?: VaultNote[];
  history?: VaultHistoryEntry[];
  attachments?: VaultAttachment[];
  /** 显式依赖的任务 ID（可选，desc 里的软依赖显式化） */
  deps?: string[];
  /** 非空 => 已归档，物理上位于 archive/ 分片 */
  archivedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

/** tasks/<code>.json 或 archive/<code>.json 的文件结构 */
export interface TaskShard {
  format: string; // TASKS_FORMAT
  tasks: VaultTask[];
}

/** 全量加载到内存的 vault 数据 */
export interface VaultData {
  dir: string;
  config: VaultConfig;
  domains: VaultDomain[];
  milestones: VaultMilestone[];
  fields: VaultFieldDef[];
  links: VaultLink[];
  /** 活跃 + 归档（archivedAt 区分） */
  tasks: VaultTask[];
  /** 加载期校验告警（重复 ID、悬空 parent 等），不阻断 */
  warnings: string[];
}

export const VAULT_FORMAT = 'clawpm-vault@1';
export const TASKS_FORMAT = 'clawpm-tasks@1';
export const DOMAINS_FORMAT = 'clawpm-domains@1';
export const MILESTONES_FORMAT = 'clawpm-milestones@1';
export const FIELDS_FORMAT = 'clawpm-fields@1';
export const LINKS_FORMAT = 'clawpm-links@1';

/** 无 domain 任务的默认分片名（下划线前缀为保留命名空间） */
export const INBOX_CODE = '_inbox';

/** clawpm 原生五态的默认 workflow（新建/导出 vault 时使用） */
export const DEFAULT_WORKFLOW: VaultWorkflow = {
  statuses: [
    { id: 'backlog', label: '待规划', kanban: 'backlog' },
    { id: 'planned', label: '已计划', kanban: 'planned' },
    { id: 'active', label: '进行中', kanban: 'active' },
    { id: 'review', label: '待评审', kanban: 'review' },
    { id: 'done', label: '已完成', kanban: 'done' },
  ],
};
