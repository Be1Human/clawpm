// 生成 vault 根目录的 AGENTS.md —— 给 AI agent 看的「本库怎么读怎么写」说明。
//
// 为什么要生成而不是手写：说明里的默认值、字段顺序、状态机、领域表若靠人维护，
// 代码一改文档就开始骗人。这里全部从**代码自身的常量**（TASK_KEY_ORDER /
// TASK_DEFAULTS / TASK_REQUIRED_KEYS）与**本库的 clawpm.json / domains.json**
// 渲染，改代码或改配置，文档下次打开即自动跟上。
//
// 为什么放 vault 根而不是 .clawpm/：.clawpm/ 是运行时目录（不入 git），而说明必须
// 随库走 —— 库被 git 拷到别的机器、别的 agent 打开时，不该依赖任何外部文档或 skill。
// 该文件只随「格式/工作流/领域」变化，不随需求增删变化，故不会成为合并冲突热点。

import { TASK_DEFAULTS, TASK_KEY_ORDER, TASK_REQUIRED_KEYS } from './canonical.js';
import { INBOX_CODE, type VaultConfig, type VaultDomain } from './types.js';

export const AGENTS_FILE = 'AGENTS.md';

/** 字段说明表：key → 人话解释。未列出的字段按 TASK_KEY_ORDER 顺序仍会出现在文档里 */
const FIELD_DOC: Record<string, string> = {
  id: '唯一主键，字符串。分片内不重复；整库不得重复',
  title: '标题',
  type: '类型：feat / bug / test / task',
  status: '状态，取值必须是下方「本库状态机」中的 id',
  statusNote: '状态的自由文本备注（如「骨架完成，待联调」）',
  progress: '进度 0-100（整数）',
  priority: '优先级 P0-P3',
  parent: '父需求的 id；根需求无此字段。**树由此字段构建**，可跨分片文件引用',
  rank: '同级排序键（base36，字典序即顺序）。不要手写，交给软件拖拽',
  owner: '负责人（自由文本）',
  assignee: '执行人（自由文本）',
  startDate: '开始日期 YYYY-MM-DD',
  dueDate: '截止日期 YYYY-MM-DD',
  milestone: '里程碑名称，引用 milestones.json 的 name',
  domain: '领域代号，引用 domains.json 的 code。**必须与所在文件名一致**',
  labels: '节点色系：epic / feature / bug / spike / chore',
  tags: '自由标签',
  blocker: '阻塞说明',
  tracking: '交付物矩阵，如 {"评审":"done"}，值域 done / pending / no / na',
  review: '评审元数据 {status, reviewer, reviewedAt, doc}',
  fields: '自定义字段字典，键须在 fields.json 注册',
  description: '多行文本，**按行拆成字符串数组**（为了行级 diff）',
  notes: '备注流水 [{at, by, text}]',
  history: '进度历史 [{at, progress, summary}]',
  attachments: '附件 [{type, title, content}]',
  deps: '显式依赖的需求 id 数组',
  archivedAt: '归档时间；**非空即归档**，文件应位于 archive/',
  createdAt: '创建时间',
  updatedAt: '更新时间',
};

function fieldTable(): string {
  const rows = TASK_KEY_ORDER.map((k) => {
    const required = TASK_REQUIRED_KEYS.includes(k);
    const hasDefault = k in TASK_DEFAULTS;
    const note = required
      ? '**必填**'
      : hasDefault
        ? `缺省 \`${JSON.stringify(TASK_DEFAULTS[k])}\``
        : '可选';
    return `| \`${k}\` | ${note} | ${FIELD_DOC[k] ?? ''} |`;
  });
  return ['| 字段 | 默认 | 说明 |', '|---|---|---|', ...rows].join('\n');
}

function statusTable(config: VaultConfig): string {
  const rows = config.workflow.statuses.map(
    (s) => `| \`${s.id}\` | ${s.label} | ${s.kanban} |`
  );
  return ['| status | 含义 | 看板列 |', '|---|---|---|', ...rows].join('\n');
}

function domainTable(domains: VaultDomain[]): string {
  if (!domains.length) return '（本库尚未定义领域，任务会落在 `tasks/_inbox.json`）';
  const rows = domains.map((d) => `| \`${d.code}\` | ${d.name} | \`tasks/${d.code}.json\` |`);
  return ['| code | 名称 | 分片文件 |', '|---|---|---|', ...rows].join('\n');
}

/** 渲染本库的 AGENTS.md 全文 */
export function renderAgentsDoc(config: VaultConfig, domains: VaultDomain[]): string {
  const defaultsList = Object.entries(TASK_DEFAULTS)
    .map(([k, v]) => `\`${k}\`=${JSON.stringify(v)}`)
    .join('、');

  return `# 这是一个 clawpm 需求库

> 本文件由 clawpm 自动生成（每次打开本库时按当前格式与配置刷新），**请勿手工编辑**。
> 人用 clawpm 软件查看，AI agent 直接读本目录的文本文件即可。

项目：**${config.name}**　格式：\`${config.format}\`

## 目录结构

\`\`\`
clawpm.json          本文件所在目录是需求库的标识；含工作流状态机
domains.json         领域定义（code → 名称）
milestones.json      里程碑
fields.json          自定义字段定义
links.json           需求间关联 [{source, target, type}]，type: blocks|precedes|relates
tasks/<code>.json    活跃需求，按领域分片；无领域的落 tasks/${INBOX_CODE}.json
archive/<code>.json  已归档需求（同样按领域分片）
.clawpm/             运行时产物（锁文件、报告），不入 git
${AGENTS_FILE}            本说明
\`\`\`

## ⚠️ 写入前必读：软件正开着时不要直接改文件

软件运行时**内存是权威副本**，它不监听文件改动。此时你直接改文本，会在它下次落盘时被**静默覆盖**（不报错、不提示）。

判断方法：

\`\`\`bash
cat .clawpm/instance.json          # 有 {pid, port} 说明可能在运行
curl http://127.0.0.1:<port>/health # 返回的 vault 路径 == 本库 → 确实在运行
\`\`\`

- **在运行** → 走 HTTP API（\`POST /api/v1/tasks\` 等，需 \`Authorization: Bearer <token>\`，默认 token 为 \`dev-token\`），或先关掉软件
- **没运行** → 可直接读写本目录的 JSON（批量导入首选）

## 任务记录格式

任务是**扁平记录**，父子关系靠 \`parent\` 字段（存父需求的 id），不是嵌套结构。
读树的方法：加载 \`tasks/*.json\`（含 \`archive/*.json\` 如需归档）全部任务 → 按 \`id\` 建索引 → 按 \`parent\` 挂树 → 同级按 \`rank\` 字典序排。

${fieldTable()}

### 缺失字段 = 取默认值（重要）

为了让 git diff 干净，**取值等于默认值的字段不落盘**。因此：

${defaultsList}

字段不存在**不代表未设置**，而是等于上面的默认值。其余可选字段不存在即为空/未设置。
未在上表中的字段（如自定义扩展）会被原样保留，不会丢失。

## 本库状态机

status 只能取以下值（**每个库可不同**，以本表为准）：

${statusTable(config)}
${
  config.workflow.trackKeys?.length
    ? `\n交付物轨道（\`tracking\` 字段的键）：${config.workflow.trackKeys
        .map((k) => `\`${k}\``)
        .join('、')}　值域：\`done\` / \`pending\` / \`no\` / \`na\`\n`
    : ''
}${
    config.workflow.gates?.length
      ? `\n状态门禁：${config.workflow.gates
          .map((g) => `迁移到 \`${g.to}\` 需满足 ${JSON.stringify(g.require)}`)
          .join('；')}\n`
      : ''
  }
## 本库领域

${domainTable(domains)}

领域代号即分片文件名。给任务写 \`domain\` 时用 **code**，且该 code 必须已在 \`domains.json\` 注册。

## 直接写文件时的约定

- 必须是合法 JSON，且带 \`"format"\` 字段（\`clawpm-tasks@1\`）
- \`id\` 自己保证唯一；\`parent\` 指向已存在的 id（悬空会在加载时告警并当作根节点）
- 不必纠结键序、缩进、排序 —— 软件下次落盘会自动规范化
- 写完可重启软件，看启动日志的 \`[vault] 已加载 N 个任务\` 与告警行自检
`;
}
