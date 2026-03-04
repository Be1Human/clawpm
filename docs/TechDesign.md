# ClawPM — 技术设计文档

> **版本**: v2.2  
> **日期**: 2026-03-02  
> **关联 PRD**: [PRD.md](./PRD.md) v2.2  
> **状态**: 迭代中  
> **变更记录**:  
> - v1.1 ~ v1.4: 需求树、人员管理、甘特图、标签/关联图谱等迭代  
> - **v2.0 (2026-03-01): 颠覆性重设计** — 新状态体系 (backlog → planned → active → review → done)，去掉 type 推导，极简创建（只需 title），内联创建技术方案，AI 拆解接口规划  
> - **v2.1 (2026-03-02): 多项目支持** — 新增 projects 表，所有业务表加 project_id 外键，API 路由加项目上下文，前端嵌套路由 + 项目切换器，MCP 工具加 project 参数，stdio 传输模式  
> - **v2.2 (2026-03-02): 节点附件系统** — 新增 task_attachments 表，支持 Markdown 文档/外部链接/TAPD 关联三种附件类型，附件 CRUD API，前端附件面板
> - **v2.3 (2026-03-02): 节点样式个性化** — 思维导图节点支持用户自定义背景色/边框色/包围框/字体色等视觉样式，纯前端 localStorage 方案
> - **v2.4 (2026-03-04): 协作与个人工作台** — 轻量身份识别机制（X-ClawPM-User Header）、"我的需求子树"个人工作台、MCP Agent 身份绑定、仪表盘个人视角
> - **v2.5 (2026-03-04): 节点权限控制** — 新增 task_permissions 表，Owner 可授权 edit/view 权限，写操作中间件校验，MCP 权限工具
> - **v2.6 (2026-03-04): 我的任务三视图** — 平铺视图（按状态分组）、树状视图（现有）、思维导图视图（ReactFlow），localStorage 视图偏好记忆

---

## 一、技术选型

| 组件 | 方案 | 理由 |
|------|------|------|
| **后端运行时** | Node.js (TypeScript) | 原生 async/事件驱动，MCP SDK 官方支持 |
| **后端框架** | Fastify | 高性能、插件体系完善、原生 TypeScript |
| **数据库** | SQLite (better-sqlite3) | 零配置、单文件、易备份 |
| **ORM** | Drizzle ORM | 类型安全、轻量、SQLite 支持好 |
| **MCP SDK** | @modelcontextprotocol/sdk | 官方 TypeScript SDK，SSE + stdio 双传输 |
| **前端框架** | React 18 + Vite | 成熟生态、快速开发 |
| **前端 UI** | Tailwind CSS | 现代化、高度可定制 |
| **状态管理** | TanStack Query | 服务端状态管理，自动缓存和刷新 |
| **思维导图** | @xyflow/react (v12) | MIT 协议，支持自定义节点/边/拖拽/缩放 |
| **图表** | Recharts | 轻量、React 原生 |
| **容器化** | Docker + docker-compose | 一键部署 |

---

## 二、项目结构

```
clawpm/
├── docs/
│   ├── PRD.md
│   └── TechDesign.md
├── server/
│   ├── src/
│   │   ├── index.ts                # 入口：Fastify + MCP (SSE)
│   │   ├── config.ts
│   │   ├── db/
│   │   │   ├── schema.ts           # Drizzle schema（含 projects 表）
│   │   │   └── connection.ts       # SQLite 连接 + 迁移
│   │   ├── api/
│   │   │   └── routes.ts           # REST API 路由（含项目上下文）
│   │   ├── mcp/
│   │   │   ├── server.ts           # MCP 工具定义（含项目参数）
│   │   │   └── stdio.ts            # MCP stdio 入口（CodeBuddy 用）
│   │   └── services/
│   │       ├── task-service.ts      # 节点业务逻辑（项目隔离）
│   │       ├── project-service.ts   # 项目管理服务（v2.1 新增）
│   │       ├── attachment-service.ts # 附件管理服务（v2.2 新增）
│   │       ├── req-link-service.ts
│   │       ├── backlog-service.ts
│   │       ├── goal-service.ts
│   │       ├── risk-service.ts
│   │       └── id-generator.ts
│   └── package.json
├── web/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx                  # 含项目嵌套路由
│   │   ├── api/client.ts            # 含项目上下文
│   │   ├── components/
│   │   │   ├── Layout.tsx           # 含项目切换器
│   │   │   ├── ProjectSwitcher.tsx  # 项目选择组件（v2.1 新增）
│   │   │   ├── AttachmentPanel.tsx  # 附件面板：文档/链接/TAPD（v2.2 新增）
│   │   │   ├── MarkdownEditor.tsx   # MD 编辑器（左右分栏预览）（v2.2 新增）
│   │   │   └── CreateTaskModal.tsx
│   │   └── pages/
│   │       ├── ProjectList.tsx      # 项目列表页（v2.1 新增）
│   │       ├── Dashboard.tsx
│   │       ├── KanbanBoard.tsx
│   │       ├── MindMap.tsx
│   │       ├── Requirements.tsx
│   │       ├── TaskList.tsx
│   │       ├── TaskDetail.tsx
│   │       ├── GanttChart.tsx
│   │       ├── Members.tsx
│   │       └── Backlog.tsx
│   └── package.json
├── start.bat                        # Windows 一键启动
└── docker-compose.yml
```

---

## 三、数据库设计

### 3.1 核心表结构

```sql
-- 项目表（v2.1 新增，最顶层隔离单元）
CREATE TABLE projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,              -- URL 友好标识: "letsgo"
  name        TEXT NOT NULL,                     -- 显示名称: "LetsGo 项目"
  description TEXT,
  archived    INTEGER NOT NULL DEFAULT 0,        -- 0=活跃, 1=归档
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 节点表（需求/任务统一）
CREATE TABLE tasks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id         TEXT NOT NULL UNIQUE,         -- 业务 ID: "U-042"
  project_id      INTEGER NOT NULL REFERENCES projects(id),  -- v2.1: 归属项目
  title           TEXT NOT NULL,                -- 唯一必填字段
  description     TEXT,
  domain_id       INTEGER REFERENCES domains(id),
  milestone_id    INTEGER REFERENCES milestones(id),
  parent_task_id  INTEGER REFERENCES tasks(id),
  status          TEXT NOT NULL DEFAULT 'backlog',
    -- v2.0 状态体系: backlog | planned | active | review | done
  progress        INTEGER NOT NULL DEFAULT 0,   -- 0-100
  priority        TEXT NOT NULL DEFAULT 'P2',   -- P0/P1/P2/P3
  owner           TEXT,
  due_date        TEXT,
  start_date      TEXT,
  source          TEXT NOT NULL DEFAULT 'planned',
  blocker         TEXT,
  health_score    INTEGER DEFAULT 100,
  type            TEXT NOT NULL DEFAULT 'task',  -- 遗留字段，不再用于逻辑
  tags            TEXT NOT NULL DEFAULT '[]',    -- JSON array
  labels          TEXT NOT NULL DEFAULT '[]',    -- JSON array，可选分类标签
  pos_x           REAL,                          -- 思维导图位置
  pos_y           REAL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 关联表
CREATE TABLE req_links (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source_task_id  INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  target_task_id  INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  link_type       TEXT NOT NULL DEFAULT 'relates',  -- blocks | precedes | relates
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 成员表
CREATE TABLE members (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id),  -- v2.1: 归属项目
  name        TEXT NOT NULL,
  identifier  TEXT NOT NULL,                   -- = tasks.owner（项目内唯一）
  type        TEXT NOT NULL DEFAULT 'human',   -- human | agent
  color       TEXT NOT NULL DEFAULT '#6366f1',
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 业务板块
CREATE TABLE domains (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id),  -- v2.1: 归属项目
  name        TEXT NOT NULL,                   -- 项目内唯一
  task_prefix TEXT NOT NULL,                   -- 项目内唯一
  keywords    TEXT DEFAULT '[]',     -- JSON array
  color       TEXT DEFAULT '#6366f1',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 里程碑
CREATE TABLE milestones (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER NOT NULL REFERENCES projects(id),  -- v2.1: 归属项目
  name          TEXT NOT NULL,
  target_date   TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
  description   TEXT,
  domain_weights TEXT,               -- JSON
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 备注
CREATE TABLE task_notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     INTEGER NOT NULL REFERENCES tasks(id),
  content     TEXT NOT NULL,
  author      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 节点附件（v2.2 新增：文档/链接/TAPD 关联）
CREATE TABLE task_attachments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,                -- doc | link | tapd
  title       TEXT NOT NULL,                -- 显示名称
  content     TEXT NOT NULL,                -- MD 正文 / URL / TAPD 单 ID
  metadata    TEXT DEFAULT '{}',            -- JSON 扩展字段
    -- doc:  { wordCount?: number }
    -- link: { favicon?: string, domain?: string, linkType?: string }
    -- tapd: { tapdType: "story"|"bug"|"task", workspaceId: string,
    --         title?: string, status?: string, owner?: string }
  sort_order  INTEGER NOT NULL DEFAULT 0,   -- 同节点内排序
  created_by  TEXT,                         -- 创建人
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_attachments_task ON task_attachments(task_id);

-- 进度历史
CREATE TABLE progress_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     INTEGER NOT NULL REFERENCES tasks(id),
  progress    INTEGER NOT NULL,
  summary     TEXT,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 需求池
CREATE TABLE backlog_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  backlog_id      TEXT NOT NULL UNIQUE,
  project_id      INTEGER NOT NULL REFERENCES projects(id),  -- v2.1: 归属项目
  title           TEXT NOT NULL,
  description     TEXT,
  domain_id       INTEGER REFERENCES domains(id),
  priority        TEXT DEFAULT 'P2',
  source          TEXT,
  source_context  TEXT,
  estimated_scope TEXT,
  tags            TEXT DEFAULT '[]',
  status          TEXT NOT NULL DEFAULT 'pool',
  scheduled_task_id INTEGER REFERENCES tasks(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 目标
CREATE TABLE goals (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id       INTEGER NOT NULL REFERENCES projects(id),  -- v2.1: 归属项目
  title            TEXT NOT NULL,
  description      TEXT,
  target_date      TEXT,
  status           TEXT NOT NULL DEFAULT 'active',
  set_by           TEXT,
  overall_progress INTEGER DEFAULT 0,
  health           TEXT DEFAULT 'green',
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 目标 KR
CREATE TABLE objectives (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id     INTEGER NOT NULL REFERENCES goals(id),
  title       TEXT NOT NULL,
  weight      REAL NOT NULL DEFAULT 1.0,
  progress    INTEGER DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'not-started',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- KR-任务关联
CREATE TABLE objective_task_links (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  objective_id INTEGER NOT NULL REFERENCES objectives(id),
  task_id      INTEGER NOT NULL REFERENCES tasks(id)
);
```

### 3.2 v2.0 关键变更

| 变更 | 说明 |
|------|------|
| `status` 默认值 | `'planned'` → `'backlog'` |
| `status` 枚举 | `backlog, planned, active, review, done`（去掉 blocked/cancelled） |
| `type` 字段 | 保留但降级为遗留字段，新代码不再写入/读取 |
| `labels` 字段 | 可选标签 JSON 数组，取代 type 的分类功能 |
| 创建必填字段 | 仅 `title`，其余全部 optional |

### 3.3 v2.1 关键变更 — 多项目支持

| 变更 | 说明 |
|------|------|
| 新增 `projects` 表 | 项目元数据，包含 slug/name/description/archived |
| 业务表加 `project_id` | `tasks`、`domains`、`milestones`、`backlog_items`、`goals`、`members` 均新增 `project_id NOT NULL` 外键 |
| `members.identifier` | 唯一约束从全局改为 `UNIQUE(project_id, identifier)` |
| `domains.name/task_prefix` | 唯一约束从全局改为 `UNIQUE(project_id, name)` / `UNIQUE(project_id, task_prefix)` |
| 默认项目 | 首次启动自动创建 `slug='default', name='默认项目'`；迁移时现有数据归入默认项目 |
| ID 生成器 | task_id 在项目内递增（通过 `project_id` 过滤计算下一个 ID） |

### 3.4 v2.2 关键变更 — 节点附件系统

| 变更 | 说明 |
|------|------|
| 新增 `task_attachments` 表 | 存储节点挂载的文档、链接、TAPD 关联 |
| 三种附件类型 | `doc`（Markdown 文档）、`link`（外部链接）、`tapd`（TAPD 单关联） |
| `metadata` JSON 字段 | 各类型的扩展信息（TAPD 摘要缓存、链接域名识别等） |
| `sort_order` | 支持同节点内附件排序 |
| 级联删除 | 删除节点时自动删除其所有附件（`ON DELETE CASCADE`） |

---

## 四、状态体系技术设计（v2.0 核心）

### 4.1 状态常量定义

```typescript
// 系统状态枚举
export const NODE_STATUS = {
  BACKLOG: 'backlog',   // 未排期
  PLANNED: 'planned',   // 未开始
  ACTIVE:  'active',    // 进行中
  REVIEW:  'review',    // 验收中
  DONE:    'done',      // 已完成
} as const;

export type NodeStatus = typeof NODE_STATUS[keyof typeof NODE_STATUS];

// 前端显示映射
export const STATUS_CONFIG: Record<NodeStatus, {
  label: string;
  color: string;
  bgColor: string;
  dotColor: string;
}> = {
  backlog: { label: '未排期', color: '#64748b', bgColor: '#f1f5f9', dotColor: '#94a3b8' },
  planned: { label: '未开始', color: '#2563eb', bgColor: '#eff6ff', dotColor: '#60a5fa' },
  active:  { label: '进行中', color: '#4f46e5', bgColor: '#eef2ff', dotColor: '#818cf8' },
  review:  { label: '验收中', color: '#d97706', bgColor: '#fffbeb', dotColor: '#fbbf24' },
  done:    { label: '已完成', color: '#16a34a', bgColor: '#f0fdf4', dotColor: '#4ade80' },
};
```

### 4.2 看板列映射

```typescript
// 看板的5列，对应5个状态
export const KANBAN_COLUMNS: { status: NodeStatus; label: string }[] = [
  { status: 'backlog', label: '未排期' },
  { status: 'planned', label: '未开始' },
  { status: 'active',  label: '进行中' },
  { status: 'review',  label: '验收中' },
  { status: 'done',    label: '已完成' },
];
```

### 4.3 状态流转规则

```typescript
// 合法的状态转换（应用层校验，不强制）
const VALID_TRANSITIONS: Record<NodeStatus, NodeStatus[]> = {
  backlog: ['planned', 'active', 'done'],
  planned: ['active', 'backlog', 'done'],
  active:  ['review', 'planned', 'done'],
  review:  ['done', 'active'],
  done:    ['active', 'backlog'],
};
```

> 注意：看板拖拽等交互不强制校验状态转换合法性，允许自由拖动。合法性规则主要用于 AI 建议和警告。

---

## 五、节点创建流程（v2.0 核心）

### 5.1 极简创建 — 后端

创建节点只需 `title`，其余所有字段都有合理默认值：

```typescript
interface CreateTaskParams {
  title: string;                    // 唯一必填
  parent_task_id?: string;          // 父节点 taskId
  labels?: string[];                // 可选标签
  priority?: string;                // 默认 P2
  owner?: string;
  due_date?: string;
  start_date?: string;
  description?: string;
  domain?: string;                  // domain name → 自动查找 id
  milestone?: string;               // milestone name → 自动查找 id
  status?: string;                  // 默认 backlog
}

// TaskService.create
async create(params: CreateTaskParams): Promise<Task> {
  const taskId = await this.generateTaskId(domainId);
  
  return db.insert(tasks).values({
    taskId,
    title: params.title,
    status: params.status || 'backlog',      // 默认未排期
    priority: params.priority || 'P2',
    labels: JSON.stringify(params.labels || []),
    parentTaskId: parentInternalId || null,
    owner: params.owner || null,
    description: params.description || null,
    dueDate: params.due_date || null,
    startDate: params.start_date || null,
    type: 'task',                              // 遗留字段，固定值
    // ... 其余字段取默认值
  });
}
```

**关键变更：**
- 去掉 `_inferChildType()` — 不再根据父节点推导 type
- `type` 字段固定写 `'task'`，不参与任何业务逻辑
- 默认状态从 `planned` 改为 `backlog`

### 5.2 极简创建 — 前端 CreateTaskModal

```typescript
// 极简版创建弹窗：只有标题是必填，其余折叠在"更多选项"中
function CreateTaskModal({ parentTaskId, onClose }) {
  const [title, setTitle] = useState('');
  
  const submit = () => {
    api.createTask({
      title,
      parent_task_id: parentTaskId,
      // 其他字段都不填，后端用默认值
    });
  };
  
  return (
    // 标题输入 + 确认按钮
    // "更多选项" 展开区：标签、负责人、优先级、截止日期...
  );
}
```

### 5.3 内联创建 — 思维导图

思维导图中的创建不走弹窗，而是直接在图上内联编辑：

```typescript
// MindMap.tsx 内联创建流程
function handleTabKey(selectedNodeId: string) {
  // 1. 调用后端创建一个空标题节点
  const newTask = await api.createTask({
    title: '新节点',
    parent_task_id: selectedNodeId,
  });
  
  // 2. 将新节点添加到图中
  addNodeToGraph(newTask);
  
  // 3. 自动选中新节点并进入编辑模式
  setEditingNodeId(newTask.taskId);
  
  // 4. 用户输入标题后 Enter 确认 → 调用 update_task 更新标题
  //    如果 Esc 取消 → 删除该节点
}

function handleEnterKey(selectedNodeId: string) {
  // 创建同级节点：parent = 当前节点的 parent
  const parentId = getParentId(selectedNodeId);
  // 同上流程
}
```

**技术要点：**
- 创建时先发一个 `createTask({ title: '新节点' })` 请求
- 节点出现后立即进入内联编辑模式
- Enter 确认时调用 `updateTask` 更新标题
- Esc 取消时调用 `deleteTask` 删除
- 整个过程无弹窗打断

---

## 六、REST API 设计

### 6.1 基础约定

- 基础路径: `/api/v1`
- 认证: `Authorization: Bearer <token>` 或 `?token=<token>`
- 响应格式: JSON
- **v2.1 项目上下文**：大部分 API 需要 `project` 参数（slug），通过两种方式传递：
  - **查询参数**：`?project=letsgo`（适用于所有请求）
  - **请求体**：`{ "project": "letsgo", ... }`（适用于 POST/PATCH）
  - 不传 project 时使用默认项目（`default`）

### 6.2 项目 API（v2.1 新增）

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/v1/projects` | 列出所有项目 |
| POST | `/api/v1/projects` | 创建项目（name, slug?, description?） |
| GET | `/api/v1/projects/:slug` | 获取项目详情 |
| PATCH | `/api/v1/projects/:slug` | 更新项目 |

### 6.3 节点（任务）API

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/v1/tasks` | 创建节点（只需 title） |
| GET | `/api/v1/tasks` | 列出节点（支持筛选） |
| GET | `/api/v1/tasks/:taskId` | 获取节点详情 |
| PATCH | `/api/v1/tasks/:taskId` | 更新节点 |
| DELETE | `/api/v1/tasks/:taskId` | 删除节点（及子树） |
| POST | `/api/v1/tasks/:taskId/progress` | 上报进度 |
| POST | `/api/v1/tasks/:taskId/notes` | 添加备注 |
| GET | `/api/v1/tasks/:taskId/history` | 进度历史 |
| GET | `/api/v1/tasks/tree` | 完整需求树 |
| PATCH | `/api/v1/tasks/:taskId/reparent` | 节点迁移 |

### 6.3 关联 API

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/v1/req-links` | 获取关联（支持 `?task_id=` 过滤） |
| POST | `/api/v1/req-links` | 创建关联（含循环检测） |
| DELETE | `/api/v1/req-links/:id` | 删除关联 |

### 6.4 附件 API（v2.2 新增）

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/v1/tasks/:taskId/attachments` | 获取节点的附件列表（支持 `?type=doc` 过滤） |
| POST | `/api/v1/tasks/:taskId/attachments` | 添加附件（type, title, content, metadata?） |
| GET | `/api/v1/attachments/:id` | 获取单个附件详情（含完整 content） |
| PATCH | `/api/v1/attachments/:id` | 更新附件（title, content, metadata, sort_order） |
| DELETE | `/api/v1/attachments/:id` | 删除附件 |
| PATCH | `/api/v1/tasks/:taskId/attachments/reorder` | 批量更新排序 |

### 6.5 其他 API

| 方法 | 路径 | 描述 |
|------|------|------|
| GET/POST | `/api/v1/members` | 成员管理 |
| GET/POST | `/api/v1/domains` | 业务板块 |
| GET/POST | `/api/v1/milestones` | 里程碑 |
| GET/POST | `/api/v1/backlog` | 需求池 |
| GET/POST | `/api/v1/goals` | 目标管理 |
| GET | `/api/v1/dashboard/*` | 仪表盘数据 |
| GET | `/api/v1/gantt` | 甘特图数据 |

---

## 七、循环依赖检测算法

创建 `blocks` 或 `precedes` 关联时，用 DFS 检测是否引入循环：

```typescript
function hasCycle(sourceId: string, targetId: string, allLinks: ReqLink[]): boolean {
  const visited = new Set<string>();
  const stack = [targetId];

  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur === sourceId) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);

    const outgoing = allLinks.filter(
      l => l.sourceId === cur && (l.linkType === 'blocks' || l.linkType === 'precedes')
    );
    stack.push(...outgoing.map(l => l.targetId));
  }
  return false;
}
```

---

## 八、节点迁移（Reparent）

```typescript
async function reparentTask(taskId: string, newParentId: string | null) {
  // 1. 防止移入自身子孙节点
  if (newParentId) {
    const isDesc = await isDescendant(newParentId, taskId);
    if (isDesc) throw new Error('不能将节点移入其子孙节点');
  }
  // 2. 更新 parent_task_id
  // 3. 子节点自动跟随（无需额外操作）
  // 4. 关联关系不变
}
```

---

## 九、前端架构

### 9.1 路由设计

v2.1 改为嵌套路由，所有项目内页面都在 `/p/:projectSlug/` 下：

| 路径 | 页面 | 描述 |
|------|------|------|
| `/` | ProjectList | 项目列表（v2.1 新增） |
| `/p/:slug` | Dashboard | 项目仪表盘 |
| `/p/:slug/mindmap` | MindMap | 思维导图（核心视图） |
| `/p/:slug/board` | KanbanBoard | 看板 |
| `/p/:slug/requirements` | Requirements | 需求树列表 |
| `/p/:slug/tasks` | TaskList | 任务列表 |
| `/p/:slug/tasks/:taskId` | TaskDetail | 节点详情 |
| `/p/:slug/gantt` | GanttChart | 甘特图 |
| `/p/:slug/members` | Members | 成员管理 |
| `/p/:slug/backlog` | Backlog | 需求池 |
| `/p/:slug/milestones` | Milestones | 里程碑 |

前端通过 `useParams()` 获取 `slug`，所有 API 调用自动附带 `?project=slug`。

### 9.2 项目切换器组件（v2.1 新增）

```typescript
// ProjectSwitcher.tsx — 侧边栏顶部
function ProjectSwitcher() {
  const { slug } = useParams();
  const { data: projects } = useQuery(['projects'], api.listProjects);
  const navigate = useNavigate();
  
  return (
    <Select value={slug} onChange={(newSlug) => navigate(`/p/${newSlug}`)}>
      {projects?.map(p => (
        <Option key={p.slug} value={p.slug}>{p.name}</Option>
      ))}
    </Select>
  );
}
```

### 9.3 思维导图技术方案

基于 `@xyflow/react` 实现，核心技术点：

#### 9.3.1 自动树形布局

```typescript
// 横向树形布局算法
function computeLayout(roots: TreeNode[]) {
  // 递归计算每个子树的高度
  // 父节点垂直居中于子树
  // 水平方向每层递增固定间距
  // 折叠的节点不展开子树
}
```

#### 9.3.2 自定义节点 (TaskNode)

```typescript
// 节点渲染内容
<div className="task-node">
  <StatusDot status={data.status} />
  <span className="title">{data.title}</span>
  {data.labels.map(l => <Label key={l} text={l} />)}
  {hasChildren && <CollapseToggle count={childCount} />}
</div>
```

#### 9.3.3 自定义边样式

```typescript
const EDGE_STYLES = {
  tree:     { stroke: '#d1d5db', strokeWidth: 1.5 },             // 灰色实线
  blocks:   { stroke: '#ef4444', strokeWidth: 2, dasharray: '5,3' },  // 红虚线
  precedes: { stroke: '#f97316', strokeWidth: 1.5, dasharray: '4,3' }, // 橙虚线
  relates:  { stroke: '#93c5fd', strokeWidth: 1, dasharray: '3,4' },   // 蓝虚线
};
```

#### 9.3.4 拖拽规则

- 只有根节点（parent_id = null）可以自由拖拽
- 拖拽根节点时，整个子树跟随平移（计算位置偏移量应用到所有后代）
- 非根节点不可独立移动，位置由布局算法决定

#### 9.3.5 键盘快捷键

| 快捷键 | 操作 |
|--------|------|
| `Tab` | 创建子节点（内联） |
| `Enter` | 创建同级节点（内联） |
| `Delete` | 删除选中节点 |
| 双击 | 内联编辑标题 |

#### 9.3.6 节点样式个性化（v2.3 新增）

用户可为每个思维导图节点自定义视觉样式，属于纯客户端个性化设置，存储在 `localStorage`。

**样式数据结构：**

```typescript
interface NodeStyle {
  bgColor?: string;       // 背景色（默认由 label 决定）
  borderColor?: string;   // 边框色
  textColor?: string;     // 标题文字色
  borderWidth?: number;   // 边框粗细 (1-4)
  borderStyle?: 'solid' | 'dashed' | 'dotted';  // 边框样式
  emoji?: string;         // 节点前缀 emoji
}
```

**存储方案：** `localStorage` key = `clawpm-mindmap-nodeStyles`，值为 `Record<taskId, NodeStyle>` JSON。

**交互方式：**
- 右键菜单新增「🎨 样式设置」选项，点击打开样式弹窗
- 弹窗提供：预设色板（快速选色）+ 自定义颜色输入 + 边框样式选择 + emoji 选择
- 提供「恢复默认」按钮清除自定义样式

**渲染优先级：** 用户自定义样式 > domain 高亮样式 > label 色系 > 默认样式

**预设色板：**
```typescript
const PRESET_BG_COLORS = [
  '#fff', '#fef3c7', '#dcfce7', '#dbeafe', '#ede9fe',
  '#fce7f3', '#fee2e2', '#ffedd5', '#f0fdf4', '#f0f9ff',
];
const PRESET_BORDER_COLORS = [
  '#e2e8f0', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
  '#ec4899', '#ef4444', '#f97316', '#14b8a6', '#6366f1',
];
```

#### 9.3.6 思维导图筛选面板

思维导图右侧控制面板提供全维度筛选能力，覆盖节点的所有核心字段：

**筛选维度：**

| 维度 | 状态 key | 类型 | 默认值 |
|------|----------|------|--------|
| 状态 | `filterStatus` | `Set<string>` | 空集（不筛选） |
| 优先级 | `filterPriority` | `Set<string>` | 空集 |
| 负责人 | `filterOwner` | `string` | `''` |
| 里程碑 | `filterMilestone` | `string` | `''` |
| 标签 | `filterLabel` | `string` | `''` |
| 截止日期范围 | `filterDueDateRange` | `[string, string]` | `['', '']` |
| 自定义字段 | `fieldFilters` | `Record<number, string>` | `{}` |

**前端筛选逻辑：**

```typescript
function nodeMatchesCoreFilters(node: any, filters: CoreFilters): boolean {
  // 状态：多选 OR
  if (filters.status.size > 0 && !filters.status.has(node.status)) return false;
  // 优先级：多选 OR
  if (filters.priority.size > 0 && !filters.priority.has(node.priority)) return false;
  // 负责人
  if (filters.owner && node.owner !== filters.owner) return false;
  // 里程碑
  if (filters.milestone && node.milestone?.name !== filters.milestone) return false;
  // 标签
  if (filters.label) {
    const labels = node.labels || [];
    if (!labels.includes(filters.label)) return false;
  }
  // 截止日期范围
  if (filters.dueDateFrom && (!node.dueDate || node.dueDate < filters.dueDateFrom)) return false;
  if (filters.dueDateTo && (!node.dueDate || node.dueDate > filters.dueDateTo)) return false;
  return true;
}
```

**树路径保留算法：** 同现有 `hasVisibleDescendant` 递归逻辑，确保匹配节点的祖先和子孙路径完整显示。

**持久化：** 所有筛选状态通过 `localStorage` 持久化（`clawpm-mindmap-*` 前缀）。

### 9.4 标签色标系统

```typescript
const LABEL_COLORS: Record<string, { bg: string; text: string; accent: string }> = {
  epic:    { bg: '#f5f3ff', text: '#6d28d9', accent: '#7c3aed' },
  feature: { bg: '#eff6ff', text: '#1d4ed8', accent: '#2563eb' },
  task:    { bg: '#f0fdf4', text: '#15803d', accent: '#16a34a' },
  bug:     { bg: '#fef2f2', text: '#b91c1c', accent: '#dc2626' },
  spike:   { bg: '#fff7ed', text: '#c2410c', accent: '#ea580c' },
  chore:   { bg: '#f8fafc', text: '#475569', accent: '#64748b' },
};
```

### 9.5 附件面板技术方案（v2.2 新增）

#### 9.5.1 组件结构

```typescript
// AttachmentPanel.tsx — 节点详情页的附件区域
function AttachmentPanel({ taskId }: { taskId: string }) {
  const [activeTab, setActiveTab] = useState<'doc' | 'link' | 'tapd'>('doc');
  const { data: attachments } = useQuery(
    ['attachments', taskId, activeTab],
    () => api.listAttachments(taskId, activeTab)
  );

  return (
    <div className="attachment-panel">
      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tab value="doc" label="文档" icon={<FileText />} count={docCount} />
        <Tab value="link" label="链接" icon={<Link />} count={linkCount} />
        <Tab value="tapd" label="TAPD" icon={<Ticket />} count={tapdCount} />
      </Tabs>
      
      <AttachmentList items={attachments} type={activeTab} />
      <AddAttachmentButton type={activeTab} taskId={taskId} />
    </div>
  );
}
```

#### 9.5.2 Markdown 文档编辑器

```typescript
// MarkdownEditor.tsx — 左右分栏编辑+预览
function MarkdownEditor({ content, onChange, onSave }) {
  return (
    <div className="grid grid-cols-2 gap-4 h-full">
      {/* 左侧：代码编辑器 */}
      <textarea 
        className="font-mono text-sm p-4 border rounded"
        value={content}
        onChange={e => onChange(e.target.value)}
      />
      {/* 右侧：Markdown 渲染预览 */}
      <div className="prose prose-sm p-4 border rounded overflow-auto">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
```

技术选型：
- Markdown 渲染：`react-markdown` + `remark-gfm`（支持表格/任务列表）
- 代码高亮：`rehype-highlight`
- 编辑器增强（后续）：可升级为 `@uiw/react-md-editor` 提供工具栏

#### 9.5.3 链接卡片

```typescript
// LinkCard.tsx — 外部链接展示
function LinkCard({ attachment }) {
  const { title, content: url, metadata } = attachment;
  const domain = metadata.domain || new URL(url).hostname;
  const icon = getLinkIcon(domain); // iWiki/飞书/Figma/GitHub 等图标
  
  return (
    <a href={url} target="_blank" className="flex items-center gap-3 p-3 rounded border hover:bg-gray-50">
      <img src={icon} className="w-5 h-5" />
      <div>
        <div className="font-medium text-sm">{title}</div>
        <div className="text-xs text-gray-400">{domain}</div>
      </div>
      <ExternalLink className="ml-auto w-4 h-4 text-gray-400" />
    </a>
  );
}

// 域名 → 图标映射
const LINK_ICONS: Record<string, string> = {
  'iwiki.woa.com': '/icons/iwiki.svg',
  'feishu.cn': '/icons/feishu.svg',
  'figma.com': '/icons/figma.svg',
  'github.com': '/icons/github.svg',
  'tapd.cn': '/icons/tapd.svg',
};
```

#### 9.5.4 TAPD 关联卡片

```typescript
// TapdCard.tsx — TAPD 单展示
function TapdCard({ attachment }) {
  const { title, content: tapdId, metadata } = attachment;
  const tapdUrl = `https://www.tapd.cn/${metadata.workspaceId}/${metadata.tapdType}s/view/${tapdId}`;
  
  return (
    <a href={tapdUrl} target="_blank" className="flex items-center gap-3 p-3 rounded border hover:bg-gray-50">
      <TapdIcon type={metadata.tapdType} />
      <div className="flex-1">
        <div className="font-medium text-sm">{metadata.title || title}</div>
        <div className="text-xs text-gray-400">
          #{tapdId} · {metadata.status} · {metadata.owner}
        </div>
      </div>
      <ExternalLink className="ml-auto w-4 h-4 text-gray-400" />
    </a>
  );
}
```

#### 9.5.5 思维导图附件计数

节点卡片上显示附件计数，让用户一眼看出哪些节点有文档/链接：

```typescript
// TaskNode 中的附件指示器
{attachmentCount > 0 && (
  <span className="text-xs text-gray-400 flex items-center gap-0.5">
    <Paperclip className="w-3 h-3" />
    {attachmentCount}
  </span>
)}
```

---

## 十、MCP Server 设计

### 10.1 传输层

支持两种传输模式：

| 模式 | 入口 | 适用场景 |
|------|------|---------|
| **SSE** | `GET /mcp/sse` + `POST /mcp/messages` | Cursor、远程 AI Agent |
| **stdio** | `npx tsx server/src/mcp/stdio.ts` | CodeBuddy、本地 Agent |

### 10.2 认证

SSE 模式支持两种认证方式：
```
Authorization: Bearer <CLAWPM_API_TOKEN>
或
?token=<CLAWPM_API_TOKEN>
```
stdio 模式无需认证（本地进程）。

### 10.3 MCP 工具实现要点

v2.2 变更：
- 新增附件管理工具：`add_task_attachment`、`list_task_attachments`、`update_task_attachment`、`delete_task_attachment`
- Agent 可通过 MCP 为节点添加需求文档（type=doc）、外部链接（type=link）、TAPD 关联（type=tapd）
- TAPD 关联可配合 TAPD MCP 工具自动获取 TAPD 单摘要存入 metadata

v2.1 变更：
- 所有工具新增可选参数 `project`（项目 slug），不传时使用默认项目
- 新增项目管理工具：`list_projects`、`create_project`、`switch_project`
- 所有数据查询/写入操作均通过 `project_id` 过滤，确保项目隔离

v2.0 变更：
- `create_task` 只需 `title`，`type` 参数移除
- `list_tasks` 的 status 筛选值变更为 `backlog/planned/active/review/done`
- `get_my_tasks` 的 status 筛选值同步变更
- 新增 `reparent_task` 工具
- 新增 `create_req_link` / `delete_req_link` / `list_req_links` 工具

---

## 十一、部署架构

### 11.1 Docker Compose

```yaml
version: '3.8'

services:
  clawpm:
    build: .
    ports:
      - "${PORT:-3210}:3210"
    volumes:
      - clawpm-data:/app/data
    environment:
      - CLAWPM_PORT=3210
      - CLAWPM_API_TOKEN=${CLAWPM_API_TOKEN}
      - CLAWPM_DB_PATH=/app/data/clawpm.db
    restart: unless-stopped

volumes:
  clawpm-data:
```

Fastify 单进程同时提供：
- `/api/*` — REST API
- `/mcp/*` — MCP SSE
- `/*` — 前端静态文件

### 11.2 环境变量

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `CLAWPM_PORT` | `3210` | 服务端口 |
| `CLAWPM_DB_PATH` | `./data/clawpm.db` | SQLite 路径 |
| `CLAWPM_API_TOKEN` | (必填) | API Token |
| `CLAWPM_LOG_LEVEL` | `info` | 日志级别 |

---

## 十二、安全设计

| 维度 | 措施 |
|------|------|
| **认证** | Bearer Token |
| **CORS** | 可配置允许域名 |
| **输入校验** | Zod schema |
| **SQL 注入** | Drizzle ORM 参数化查询 |
| **速率限制** | Fastify rate-limit 插件 |

---

## 十三、数据迁移策略

### 13.0 v2.1 项目迁移（多项目支持）

```sql
-- 1. 创建 projects 表
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. 插入默认项目（如果不存在）
INSERT OR IGNORE INTO projects (slug, name, description) 
VALUES ('default', '默认项目', '自动创建的默认项目');

-- 3. 为现有业务表添加 project_id 列（默认值指向 default 项目）
ALTER TABLE tasks ADD COLUMN project_id INTEGER NOT NULL DEFAULT 1 REFERENCES projects(id);
ALTER TABLE domains ADD COLUMN project_id INTEGER NOT NULL DEFAULT 1 REFERENCES projects(id);
ALTER TABLE milestones ADD COLUMN project_id INTEGER NOT NULL DEFAULT 1 REFERENCES projects(id);
ALTER TABLE backlog_items ADD COLUMN project_id INTEGER NOT NULL DEFAULT 1 REFERENCES projects(id);
ALTER TABLE goals ADD COLUMN project_id INTEGER NOT NULL DEFAULT 1 REFERENCES projects(id);
ALTER TABLE members ADD COLUMN project_id INTEGER NOT NULL DEFAULT 1 REFERENCES projects(id);

-- 4. 更新唯一约束（SQLite 不支持 ALTER 约束，需要通过新建表重建）
-- 迁移代码中通过 CREATE UNIQUE INDEX IF NOT EXISTS 实现
CREATE UNIQUE INDEX IF NOT EXISTS idx_domains_project_name ON domains(project_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_domains_project_prefix ON domains(project_id, task_prefix);
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_project_identifier ON members(project_id, identifier);
```

**迁移策略要点：**
- 现有数据全部归入 `default` 项目（project_id = 1）
- `ALTER TABLE ADD COLUMN` 使用 `DEFAULT 1` 确保现有行都指向默认项目
- 唯一约束从全局改为项目内唯一（通过复合索引）
- 迁移是**向前兼容**的：不删除数据，不破坏现有功能

### 13.1 v2.2 附件系统迁移

```sql
-- 创建附件表（新增，无需迁移现有数据）
CREATE TABLE IF NOT EXISTS task_attachments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,              -- doc | link | tapd
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  metadata    TEXT DEFAULT '{}',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_attachments_task ON task_attachments(task_id);
```

> 纯新增表，不影响现有数据，迁移无风险。

### 13.2 状态迁移

已有数据中 `status` 值的映射：

| 旧值 | 新值 | 说明 |
|------|------|------|
| `planned` | `planned` | 不变 |
| `active` | `active` | 不变 |
| `review` | `review` | 不变 |
| `done` | `done` | 不变 |
| `blocked` | `active` | 阻塞状态合并到进行中，阻塞信息保留在 blocker 字段 |
| `cancelled` | `done` | 已取消视为已完成 |

新创建节点默认为 `backlog`。

### 13.3 Type → Labels 迁移

```typescript
function migrateTypeToLabels(sqlite: Database.Database) {
  const rows = sqlite.prepare(
    "SELECT task_id, type FROM tasks WHERE labels = '[]' AND type != 'task'"
  ).all();
  for (const row of rows as any[]) {
    sqlite.prepare("UPDATE tasks SET labels = ? WHERE task_id = ?")
      .run(JSON.stringify([row.type]), row.task_id);
  }
}
```

> `type = 'task'` 的节点不自动添加标签（因为"task"标签无意义——所有节点都是 task）。

### 13.4 默认状态迁移

```sql
-- 将所有无日期、无负责人的 planned 节点改为 backlog
UPDATE tasks 
SET status = 'backlog' 
WHERE status = 'planned' 
  AND owner IS NULL 
  AND due_date IS NULL;
```

---

## 十四、协作与个人工作台技术设计（v2.4 新增）

### 14.1 身份识别机制

采用**轻量身份声明**，不引入密码/登录系统。

#### 14.1.1 前端身份管理

完全对齐现有 `useActiveProject.ts` 模式（`useSyncExternalStore` + localStorage + listeners）：

```typescript
// web/src/lib/useCurrentUser.ts
const STORAGE_KEY = 'clawpm-user';
const listeners = new Set<() => void>();

export function getCurrentUser(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setCurrentUser(identifier: string): void {
  localStorage.setItem(STORAGE_KEY, identifier);
  listeners.forEach(fn => fn());
}

export function clearCurrentUser(): void {
  localStorage.removeItem(STORAGE_KEY);
  listeners.forEach(fn => fn());
}

export function subscribeCurrentUser(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCurrentUser(): string | null {
  return useSyncExternalStore(subscribeCurrentUser, getCurrentUser);
}
```

#### 14.1.2 HTTP Header 注入

前端 `client.ts` 的 `request()` 函数自动注入 `X-ClawPM-User` Header：

```typescript
// 在 request() 中，headers 构建时：
const currentUser = getCurrentUser();
if (currentUser) {
  headers['X-ClawPM-User'] = currentUser;
}
```

#### 14.1.3 后端 extractUser 中间件

在 `index.ts` 的 auth hook 中增加用户身份提取逻辑：

```typescript
// 从 Header 读取用户身份，注入到 request 对象
fastify.decorateRequest('clawpmUser', null);
fastify.addHook('onRequest', async (req) => {
  req.clawpmUser = req.headers['x-clawpm-user'] as string || null;
});
```

- `X-ClawPM-User` 完全可选，不传时系统行为与现有完全一致
- 不影响现有 Bearer Token 认证逻辑

### 14.2 个人工作台——"我的需求子树"

#### 14.2.1 数据获取

**复用已有 `GET /api/v1/tasks/tree?owner=xxx`**。该端点已具备：
- 按 `owner` 过滤匹配节点
- 自动补全祖先路径（task-service.ts L354-370 的 `ensureAncestors` 逻辑）
- 返回带 `children` 嵌套的树形 JSON

无需新建后端树形端点。

#### 14.2.2 前端渲染方案

复用 `Requirements.tsx` 的 TreeNodeRow 缩进渲染模式，增加：

1. **节点差异化渲染**：
   - `node.owner === currentUser` → 高亮显示（正常颜色 + 左侧靛蓝竖条）
   - 其余节点（祖先上下文）→ 半透明（opacity-50），不可操作

2. **面包屑溯源**：每个"我的节点"上方显示微型路径 `根 > 父 > ...`

3. **统计聚合**：前端从树形数据中统计各状态的"我的节点"数量

#### 14.2.3 路由

```
/p/:slug/my-tasks → MyTasks 页面
```

### 14.3 个人概览 API

新增 `GET /api/v1/my/overview` 端点：

```typescript
// routes.ts
fastify.get('/api/v1/my/overview', async (req) => {
  const user = req.clawpmUser;
  if (!user) return { error: 'No identity set' };
  
  const projectId = resolveProjectId(req);
  const tasks = await TaskService.list({ owner: user, projectId });
  
  const now = new Date().toISOString().slice(0, 10);
  return {
    active: tasks.filter(t => t.status === 'active').length,
    review: tasks.filter(t => t.status === 'review').length,
    overdue: tasks.filter(t => t.dueDate && t.dueDate < now && t.status !== 'done').length,
    planned: tasks.filter(t => t.status === 'planned').length,
    total: tasks.length,
  };
});
```

### 14.4 MCP Agent 身份绑定

#### 14.4.1 身份来源

```typescript
// mcp/stdio.ts
const agentId = process.env.CLAWPM_AGENT_ID 
  || process.argv.find(a => a.startsWith('--agent-id='))?.split('=')[1]
  || null;

const mcpServer = createMcpServer({ agentId });
```

#### 14.4.2 工具变更

```typescript
// mcp/server.ts
export function createMcpServer(options?: { agentId?: string }) {
  const agentId = options?.agentId;
  
  // get_my_tasks: owner 从 required 降为 optional
  // 未传时 fallback 到 agentId
  server.tool('get_my_tasks', { owner: z.string().optional(), ... }, async ({ owner, ... }) => {
    const effectiveOwner = owner || agentId;
    if (!effectiveOwner) return { error: 'owner required (no agent identity bound)' };
    return TaskService.list({ owner: effectiveOwner, ... });
  });

  // 新增 whoami 工具
  server.tool('whoami', {}, async () => {
    return { agentId: agentId || null, message: agentId ? `You are ${agentId}` : 'No identity bound' };
  });

  // 新增 get_my_task_tree 工具
  server.tool('get_my_task_tree', { owner: z.string().optional(), ... }, async ({ owner, ... }) => {
    const effectiveOwner = owner || agentId;
    if (!effectiveOwner) return { error: 'owner required' };
    return TaskService.getTree(undefined, { owner: effectiveOwner, projectId });
  });
}
```

### 14.5 仪表盘个人概览

已设置身份时，Dashboard 顶部新增"我的概览"条带：

```typescript
// Dashboard.tsx 增加的数据获取
const currentUser = useCurrentUser();
const { data: myOverview } = useQuery(
  ['my-overview', currentUser],
  () => api.getMyOverview(),
  { enabled: !!currentUser }
);
```

渲染：浅靛蓝背景条带（bg-indigo-50），紧凑展示 3 个数据项。未设身份时不渲染。

### 14.6 向后兼容

| 变更点 | 兼容策略 |
|--------|----------|
| `X-ClawPM-User` Header | 完全可选，不传时行为不变 |
| MCP `get_my_tasks` | `owner` 从 required 降为 optional，不传 fallback 到 agentId |
| 新增端点 `/api/v1/my/overview` | 纯新增，不影响现有 |
| 新增 MCP 工具 `whoami` / `get_my_task_tree` | 纯新增，不影响现有 |
| 侧边栏身份区 | 未设身份时仅显示"请选择身份"引导文字 |

---

## 十五、节点权限控制技术设计 (v2.5)

### 15.1 数据库设计

新增 `task_permissions` 表：

```sql
CREATE TABLE task_permissions (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id   INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  grantee   TEXT    NOT NULL,            -- 被授权人 identifier（对应 members.identifier）
  level     TEXT    NOT NULL DEFAULT 'view', -- 'edit' | 'view'
  granted_by TEXT   NOT NULL,             -- 授权人（通常为 owner）
  created_at TEXT   DEFAULT (datetime('now')),
  updated_at TEXT   DEFAULT (datetime('now')),
  UNIQUE(task_id, grantee)               -- 同一节点同一被授权人只有一条记录
);
```

**设计要点**：
- `task_id` 外键级联删除：节点删除时权限记录自动清除
- `UNIQUE(task_id, grantee)` 确保幂等：重复授权走 `INSERT OR REPLACE`
- `level` 只有两个合法值 `edit` / `view`，用 Drizzle text + 应用层校验
- 索引：`(task_id)` + `(grantee)` 两个索引覆盖主要查询模式

**Drizzle Schema 定义**：

```typescript
export const taskPermissions = sqliteTable('task_permissions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  grantee: text('grantee').notNull(),
  level: text('level').notNull().default('view'),   // 'edit' | 'view'
  grantedBy: text('granted_by').notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
}, (table) => ({
  taskGranteeUnique: unique().on(table.taskId, table.grantee),
}));
```

### 15.2 权限判定逻辑

```typescript
// permission-service.ts

type PermLevel = 'owner' | 'edit' | 'view' | 'none';

async function getEffectivePermission(taskInternalId: number, taskOwner: string, user: string): Promise<PermLevel> {
  // 1. Owner 拥有全部权限
  if (user === taskOwner) return 'owner';
  
  // 2. 查询 task_permissions 表
  const perm = await db.select()
    .from(taskPermissions)
    .where(and(eq(taskPermissions.taskId, taskInternalId), eq(taskPermissions.grantee, user)))
    .get();
  
  if (perm) return perm.level as PermLevel;
  
  // 3. 无授权记录 — 判断节点是否受控
  const hasAnyPerm = await db.select({ count: sql`count(*)` })
    .from(taskPermissions)
    .where(eq(taskPermissions.taskId, taskInternalId))
    .get();
  
  // 如果节点无任何权限记录，视为公开（返回 'edit' 保持向后兼容）
  if (!hasAnyPerm || hasAnyPerm.count === 0) return 'edit';
  
  // 有权限记录但该用户不在其中 → 无权限
  return 'none';
}
```

**判定优先级**：`owner > edit > view > none`

**"公开"与"受控"模式切换**：
- 节点没有任何 `task_permissions` 记录 → 公开模式，所有用户默认 `edit`（向后兼容）
- 节点有至少一条 `task_permissions` 记录 → 受控模式，未授权用户为 `none`

### 15.3 写操作鉴权中间件

在 `routes.ts` 中新增权限校验辅助函数：

```typescript
async function requireEditPermission(req: FastifyRequest, taskId: string): Promise<void> {
  const user = (req as any).clawpmUser;
  if (!user) return; // 未设身份 → 兼容模式，不拦截
  
  const task = await TaskService.getByTaskId(taskId);
  if (!task) throw { statusCode: 404, message: 'Task not found' };
  
  const perm = await PermissionService.getEffectivePermission(task.id, task.owner, user);
  if (perm === 'none' || perm === 'view') {
    throw { statusCode: 403, message: '无编辑权限：你对此节点仅有查看权限或无权限' };
  }
}
```

**需要接入鉴权的端点**：

| 端点 | 校验点 |
|------|--------|
| `PUT /api/v1/tasks/:taskId` | 修改任务字段 |
| `POST /api/v1/tasks/:taskId/progress` | 上报进度 |
| `POST /api/v1/tasks/:taskId/complete` | 标记完成 |
| `POST /api/v1/tasks/:taskId/blocker` | 报告阻塞 |
| `DELETE /api/v1/tasks/:taskId` | 删除任务（仅 Owner） |
| `POST /api/v1/tasks` | 创建子任务时校验父节点权限 |
| `POST /api/v1/tasks/:taskId/reparent` | 节点迁移（源和目标都要校验） |

**不做鉴权的端点**（读操作，由前端适配只读态）：
- `GET /api/v1/tasks/:taskId`
- `GET /api/v1/tasks/tree`
- `GET /api/v1/tasks` (列表)

### 15.4 REST API 设计

新增权限管理端点：

```
POST   /api/v1/tasks/:taskId/permissions       — 授予/更新权限
GET    /api/v1/tasks/:taskId/permissions       — 查看权限列表
DELETE /api/v1/tasks/:taskId/permissions/:grantee — 撤销权限
```

**POST /api/v1/tasks/:taskId/permissions**：

```json
// Request
{ "grantee": "alice", "level": "edit" }

// Response 200
{ "taskId": "FE-3", "grantee": "alice", "level": "edit", "grantedBy": "bob" }
```

校验逻辑：
1. 请求者必须是该节点的 Owner
2. `grantee` 必须是项目中已有的 member
3. `level` 只能是 `edit` 或 `view`
4. 已存在记录 → 更新 level（覆盖语义）

**GET /api/v1/tasks/:taskId/permissions**：

```json
// Response 200
{
  "taskId": "FE-3",
  "owner": "bob",
  "permissions": [
    { "grantee": "alice", "level": "edit", "grantedBy": "bob", "granteeInfo": { "name": "Alice", "type": "human" } },
    { "grantee": "agent-01", "level": "view", "grantedBy": "bob", "granteeInfo": { "name": "Frontend Agent", "type": "agent" } }
  ]
}
```

**DELETE /api/v1/tasks/:taskId/permissions/:grantee**：

校验：请求者必须是 Owner。返回 204。

### 15.5 任务响应中的权限信息附加

`_enrichTask()` 方法增强：当请求中带有 `X-ClawPM-User` 时，在返回的任务对象中附加 `_myPermission` 字段：

```typescript
// enrichTask 增加 userContext 参数
async _enrichTask(task, userContext?: string) {
  const enriched = { /* 现有逻辑 */ };
  
  if (userContext) {
    enriched._myPermission = await PermissionService.getEffectivePermission(
      task.id, task.owner, userContext
    );
  }
  
  return enriched;
}
```

前端根据 `_myPermission` 字段控制 UI：
- `owner` / `edit`：正常编辑模式
- `view`：只读模式，操作按钮隐藏
- `none`：内容脱敏或隐藏

### 15.6 MCP 工具扩展

新增 3 个权限管理工具：

```typescript
// grant_permission
server.tool('grant_permission', {
  task_id: z.string().describe('节点业务ID'),
  grantee: z.string().describe('被授权人 identifier'),
  level: z.enum(['edit', 'view']).describe('权限等级'),
  project: z.string().optional(),
}, async ({ task_id, grantee, level, project }) => {
  // 校验调用者身份（agentId 或 MCP 直连时的 owner）
  // 调用 PermissionService.grant()
});

// revoke_permission
server.tool('revoke_permission', {
  task_id: z.string().describe('节点业务ID'),
  grantee: z.string().describe('被授权人 identifier'),
  project: z.string().optional(),
}, async ({ task_id, grantee, project }) => {
  // 校验调用者身份必须是 Owner
  // 调用 PermissionService.revoke()
});

// list_permissions
server.tool('list_permissions', {
  task_id: z.string().describe('节点业务ID'),
  project: z.string().optional(),
}, async ({ task_id, project }) => {
  // 返回该节点的 owner + 所有授权列表
});
```

### 15.7 前端适配

**任务详情面板 — 权限管理区**：
- 仅当 `_myPermission === 'owner'` 时渲染"权限管理"折叠面板
- 已授权人列表：成员头像 + 名称 + 权限下拉（edit/view）+ 移除按钮
- "添加协作者"按钮：弹出成员选择器 + 权限等级选择
- 使用 `useMutation` + invalidateQueries 实时更新

**只读模式适配**：
- `_myPermission === 'view'` 时：
  - 标题、描述区域变为纯文本展示
  - 隐藏"推进状态"、"编辑"、"删除"等操作按钮
  - 隐藏"添加子节点"入口
  - 显示只读标识（灰色锁 + "仅查看"标签）

**"我的需求子树"适配**：
- `_myPermission === 'none'` 的节点：显示为 `[受限节点]` 占位，不展示内容
- `_myPermission === 'view'` 的节点：正常展示但不显示操作按钮

### 15.8 向后兼容

| 变更点 | 兼容策略 |
|--------|----------|
| 新增 `task_permissions` 表 | 纯新增表，不影响现有表 |
| 权限校验逻辑 | 未设身份（`X-ClawPM-User` 为空）时跳过所有权限检查，保持原有行为 |
| 无权限记录的节点 | 视为"公开"，所有人默认 `edit` 权限，完全兼容 |
| `_enrichTask()` | 新增可选 `_myPermission` 字段，不影响现有字段 |
| MCP 权限工具 | 纯新增工具，不影响现有工具 |
| 前端 | 仅在 `_myPermission` 存在且非 `owner`/`edit` 时才切换到只读态 |

---

## 十六、我的任务三视图技术设计 (v2.6)

### 16.1 架构概览

纯前端变更，不涉及后端 API 新增。数据源统一为 `api.getTaskTree({ owner: currentUser })`。

```
MyTasks.tsx（页面壳：Header + 统计卡片 + 视图切换按钮组）
  ├── MyTasksTreeView     — 现有树形列表（抽取为子组件）
  ├── MyTasksFlatView     — 新增：按状态分组的平铺卡片视图
  └── MyTasksMindMapView  — 新增：基于 ReactFlow 的思维导图视图
```

### 16.2 视图状态管理

```typescript
type ViewMode = 'tree' | 'flat' | 'mindmap';

// localStorage 持久化
const STORAGE_KEY = 'clawpm-my-tasks-view';
const [viewMode, setViewMode] = useState<ViewMode>(
  () => (localStorage.getItem(STORAGE_KEY) as ViewMode) || 'tree'
);

useEffect(() => { localStorage.setItem(STORAGE_KEY, viewMode); }, [viewMode]);
```

### 16.3 平铺视图（MyTasksFlatView）

**数据处理**：
```typescript
// 从树形结构中扁平化提取所有属于当前用户的节点
function flattenMyNodes(nodes: any[], owner: string): any[] {
  const result: any[] = [];
  function walk(list: any[]) {
    for (const n of list) {
      if (n.owner === owner) result.push(n);
      if (n.children?.length) walk(n.children);
    }
  }
  walk(nodes);
  return result;
}

// 按状态分组
const grouped = Object.groupBy(flatNodes, n => n.status);
```

**渲染**：
- 5 个状态组（active → review → planned → backlog → done），顺序固定
- 每组标题：彩色圆点 + 状态名 + 数量 badge
- 每个卡片：taskId + 标题 + 标签 + 进度条 + 截止日期（如有）
- done 组默认折叠，展开时内容透明度降低

### 16.4 思维导图视图（MyTasksMindMapView）

**节点布局**：
- 以 `currentUser` 名字作为虚拟中心根节点
- 一级子节点 = 用户直属任务（tree 的顶层节点）
- 按原有的父子关系递归展开
- 使用 dagre 自动布局（与全局 MindMap 一致）

**节点样式**：
- 状态着色与全局思维导图一致
- 节点显示：标题 + taskId + 进度百分比
- 点击节点 → navigate 到 `/tasks/:taskId`

**交互**：
- 支持画布拖拽、缩放
- 不支持编辑（只读展示）
- 使用 `fitView` 自动居中

### 16.5 视图切换按钮组

位于标题右侧，三个图标按钮：
```
[列表] [树形] [脑图]
```
- 当前激活视图：`bg-indigo-100 text-indigo-600`
- 非激活视图：`text-gray-400 hover:text-gray-600`
- 使用 SVG 图标区分
