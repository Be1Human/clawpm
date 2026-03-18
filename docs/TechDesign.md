# ClawPM — 技术设计文档

> **版本**: v3.6  
> **日期**: 2026-03-17  
> **关联 PRD**: [PRD.md](./PRD.md) v3.6  
> **状态**: 迭代中  
> **变更记录**:  
> - v1.1 ~ v1.4: 需求树、人员管理、甘特图、标签/关联图谱等迭代  
> - **v2.0 (2026-03-01): 颠覆性重设计** — 新状态体系 (backlog → planned → active → review → done)，去掉 type 推导，极简创建（只需 title），内联创建技术方案，AI 拆解接口规划  
> - **v2.1 (2026-03-02): 多项目支持** — 新增 projects 表，所有业务表加 project_id 外键，API 路由加项目上下文，前端嵌套路由 + 项目切换器，MCP 工具加 project 参数，stdio 传输模式  
> - **v2.2 (2026-03-02): 节点附件系统** — 新增 task_attachments 表，支持 Markdown 文档/外部链接/TAPD 关联三种附件类型，附件 CRUD API，前端附件面板
> - **v2.3 (2026-03-02): 节点样式个性化** — 思维导图节点支持用户自定义背景色/边框色/包围框/字体色等视觉样式，纯前端 localStorage 方案
> - **v2.4 (2026-03-04): 协作与个人工作台** — 轻量身份识别机制（X-ClawPM-User Header）、"我的需求子树"个人工作台、MCP Agent 身份绑定、仪表盘个人视角
> - **v5.0 (2026-03-18): 账号与 Agent Token 鉴权** — 新增账号登录、成员绑定、Agent 专属 token、MCP session principal、OpenClaw 一键配置
> - **v2.5 (2026-03-04): 节点权限控制** — 新增 task_permissions 表，Owner 可授权 edit/view 权限，写操作中间件校验，MCP 权限工具
> - **v2.6 (2026-03-04): 我的任务三视图** — 平铺视图（按状态分组）、树状视图（现有）、思维导图视图（ReactFlow），localStorage 视图偏好记忆
> - **v3.0 (2026-03-05): Plane 借鉴增强** — Cmd+K 命令面板(cmdk)、统一筛选 FilterBar/useFilters、迭代管理(iterations 表)、Markdown 描述编辑器(react-markdown)、归档机制(archived_at)、批量操作(batch API)、收藏/最近访问(localStorage)、站内通知(notifications 表+轮询)
> - **v3.1 (2026-03-05): Intake 收件箱** — 新增 intake_items 表，公开提交页面(无需认证)，审核流转(pending→accepted/rejected/deferred/duplicate)，接受后自动创建 Task 节点并打标签，MCP 工具支持
> - **v3.2 (2026-03-05): 成员管理 MCP 工具** — 新增 list_members/get_member/create_member/update_member/delete_member 五个 MCP 工具，AI Agent 可查询成员擅长领域和任务负载
> - **v3.3 (2026-03-05): Markdown 全能预览** — MarkdownPreview 浅色主题重构、任务描述编辑时右侧实时预览面板、悬浮窗模式自适应尺寸
> - **v3.4 (2026-03-10): 图片上传 + 节点样式增强** — 后端图片上传 API + 静态文件服务，前端描述编辑器粘贴/拖拽图片，脑图节点半包围/全包围边框效果
> - **v3.5 (2026-03-17): 项目空间任务列表树形化** — `TaskList` 改为消费树形数据源，前端递归渲染，同级按优先级排序并兼容筛选与批量操作
> - **v3.6 (2026-03-17): 树优先视图统一** — `KanbanBoard`、`GanttChart`、`Backlog`、`MyTasks`、`MyGantt` 围绕同一套需求树派生 UI，统一排序、筛选和祖先保留规则

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

### 10.0 v5.0 认证更新

当前版本在原有共享 Bearer Token 之上新增双主体认证：

1. **账号会话 token**
   - 用于人类用户登录 Web
   - 后端解析后得到 `account principal`
   - 再映射到一个 `current member`

2. **Agent token**
   - 用于 OpenClaw / Cursor / CodeBuddy 等 MCP 客户端
   - 后端解析后得到 `agent principal`
   - 直接绑定到 `member.identifier`

兼容策略：

- `CLAWPM_API_TOKEN` 仍保留，作为开发与迁移期兜底
- `X-ClawPM-User` / `CLAWPM_AGENT_ID` 仍可继续使用，但优先级低于新版 principal
- 新代码优先走 `AuthService.resolvePrincipalByToken()`

### 10.1 传输层

支持两种传输模式：

| 模式 | 入口 | 适用场景 |
|------|------|---------|
| **SSE** | `GET /mcp/sse` + `POST /mcp/messages` | Cursor、远程 AI Agent |
| **stdio** | `npx tsx server/src/mcp/stdio.ts` | CodeBuddy、本地 Agent |

### 10.2 认证

SSE 模式支持两种认证方式：
```
Authorization: Bearer <agent-token>
或
?token=<agent-token>
```
stdio 模式推荐通过环境变量传入：

```
CLAWPM_AGENT_TOKEN=<agent-token>
```

兼容保留：

```
CLAWPM_AGENT_ID=<legacy-identifier>
--agent-id=<legacy-identifier>
```

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

---

## 十七、Plane 借鉴增强技术设计 (v3.0)

### 17.1 新增依赖

| 包名 | 用途 | 大小 |
|------|------|------|
| `cmdk` | Cmd+K 命令面板 | ~3KB gzip |
| `react-markdown` | Markdown 渲染 | ~12KB gzip |
| `remark-gfm` | GitHub Flavored Markdown 支持 | ~2KB gzip |

### 17.2 数据库变更

#### 17.2.1 新增表

```sql
-- 迭代表
CREATE TABLE IF NOT EXISTS iterations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id),
  name        TEXT NOT NULL,
  description TEXT,
  start_date  TEXT,
  end_date    TEXT,
  status      TEXT NOT NULL DEFAULT 'planned',  -- planned | active | completed
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 任务-迭代关联表（多对多）
CREATE TABLE IF NOT EXISTS task_iterations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id       INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  iteration_id  INTEGER NOT NULL REFERENCES iterations(id) ON DELETE CASCADE,
  UNIQUE(task_id, iteration_id)
);
CREATE INDEX IF NOT EXISTS idx_task_iterations_task ON task_iterations(task_id);
CREATE INDEX IF NOT EXISTS idx_task_iterations_iteration ON task_iterations(iteration_id);

-- 通知表
CREATE TABLE IF NOT EXISTS notifications (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER NOT NULL REFERENCES projects(id),
  recipient_id  TEXT NOT NULL,             -- member.identifier
  type          TEXT NOT NULL,             -- task_assigned | status_changed | note_added
  title         TEXT NOT NULL,
  content       TEXT,
  task_id       TEXT,                      -- 关联的任务 taskId（业务ID）
  is_read       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, is_read);
```

#### 17.2.2 现有表变更

```sql
-- tasks 表新增归档字段
ALTER TABLE tasks ADD COLUMN archived_at TEXT;  -- ISO datetime or NULL
```

#### 17.2.3 Drizzle Schema 新增

```typescript
export const iterations = sqliteTable('iterations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id),
  name: text('name').notNull(),
  description: text('description'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  status: text('status').notNull().default('planned'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

export const taskIterations = sqliteTable('task_iterations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  iterationId: integer('iteration_id').notNull().references(() => iterations.id, { onDelete: 'cascade' }),
});

export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id),
  recipientId: text('recipient_id').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  content: text('content'),
  taskId: text('task_id'),
  isRead: integer('is_read').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// tasks 表新增字段
// archivedAt: text('archived_at'),  -- 添加到现有 tasks 表定义
```

### 17.3 后端服务层

#### 17.3.1 iteration-service.ts（新建）

```typescript
class IterationService {
  create(params: { name, description?, startDate?, endDate?, projectId }): Promise<Iteration>;
  list(projectId: number, status?: string): Promise<Iteration[]>;
  getById(id: number): Promise<Iteration & { tasks: Task[], stats: IterationStats }>;
  update(id: number, params: Partial<CreateParams>): Promise<Iteration>;
  delete(id: number): Promise<void>;
  addTask(iterationId: number, taskId: string): Promise<void>;
  removeTask(iterationId: number, taskId: string): Promise<void>;
  getTasksByIteration(iterationId: number): Promise<Task[]>;
}

interface IterationStats {
  totalTasks: number;
  completedTasks: number;
  completionRate: number;  // 0-100
  statusBreakdown: Record<string, number>;
}
```

#### 17.3.2 notification-service.ts（新建）

```typescript
class NotificationService {
  create(params: { projectId, recipientId, type, title, content?, taskId? }): Promise<void>;
  listByRecipient(recipientId: string, projectId: number, opts?: { unreadOnly? }): Promise<Notification[]>;
  markAsRead(id: number): Promise<void>;
  markAllAsRead(recipientId: string, projectId: number): Promise<void>;
  getUnreadCount(recipientId: string, projectId: number): Promise<number>;
}
```

#### 17.3.3 task-service.ts 增强

```typescript
// 现有方法变更：
list(): 增加 archived_at IS NULL 默认过滤（除非传 includeArchived=true）
getTree(): 同上

// 新增方法：
archive(taskId: string): Promise<void>;      // 设置 archived_at = now()
unarchive(taskId: string): Promise<void>;    // 设置 archived_at = null
batchUpdate(taskIds: string[], updates: Partial<UpdateParams>): Promise<Task[]>;
listArchived(projectId: number): Promise<Task[]>;  // 查询已归档任务

// 通知触发点（在方法末尾调用 NotificationService.create）：
update(): 当 owner 变更时 → task_assigned 通知
update(): 当 status 变更时 → status_changed 通知
addNote(): → note_added 通知
```

### 17.4 REST API 新增

#### 17.4.1 迭代 API

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/v1/iterations` | 迭代列表（?project=&status=） |
| POST | `/api/v1/iterations` | 创建迭代 |
| GET | `/api/v1/iterations/:id` | 迭代详情（含关联任务和统计） |
| PATCH | `/api/v1/iterations/:id` | 更新迭代 |
| DELETE | `/api/v1/iterations/:id` | 删除迭代 |
| POST | `/api/v1/iterations/:id/tasks` | 添加任务到迭代 `{ task_id }` |
| DELETE | `/api/v1/iterations/:id/tasks/:taskId` | 从迭代移除任务 |

#### 17.4.2 批量操作 API

| 方法 | 路径 | 描述 |
|------|------|------|
| PATCH | `/api/v1/tasks/batch` | 批量更新 `{ task_ids: string[], updates: { status?, owner?, priority? } }` |

#### 17.4.3 归档 API

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/v1/tasks/:taskId/archive` | 归档任务 |
| POST | `/api/v1/tasks/:taskId/unarchive` | 恢复任务 |
| GET | `/api/v1/tasks/archived` | 获取已归档任务列表 |

#### 17.4.4 通知 API

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/v1/notifications` | 通知列表（?unread_only=true） |
| GET | `/api/v1/notifications/unread-count` | 未读数量 |
| PATCH | `/api/v1/notifications/:id/read` | 标记单条已读 |
| POST | `/api/v1/notifications/read-all` | 全部标记已读 |

### 17.5 MCP 工具新增

```
-- 迭代管理
create_iteration(name, start_date?, end_date?, description?, project?)
list_iterations(status?, project?)
add_task_to_iteration(iteration_id, task_id, project?)
remove_task_from_iteration(iteration_id, task_id, project?)

-- 归档
archive_task(task_id, project?)
unarchive_task(task_id, project?)

-- 通知
list_notifications(unread_only?, project?)
mark_notification_read(notification_id, project?)
```

### 17.6 前端新增文件

| 文件 | 类型 | 说明 |
|------|------|------|
| `components/CommandPalette.tsx` | 新建 | cmdk 全局命令面板 |
| `components/FilterBar.tsx` | 新建 | 统一筛选栏组件 |
| `components/NotificationPanel.tsx` | 新建 | 通知弹出面板 |
| `components/BatchActionBar.tsx` | 新建 | 批量操作底部悬浮栏 |
| `components/MarkdownPreview.tsx` | 新建 | Markdown 渲染组件 |
| `lib/useFilters.ts` | 新建 | 统一筛选状态 Hook |
| `lib/useRecentTasks.ts` | 新建 | 最近访问记录 Hook |
| `lib/useFavorites.ts` | 新建 | 收藏管理 Hook |
| `pages/Iterations.tsx` | 新建 | 迭代列表页 |
| `pages/IterationDetail.tsx` | 新建 | 迭代详情页 |
| `pages/Archive.tsx` | 新建 | 归档箱页面 |

### 17.7 前端现有文件变更

| 文件 | 变更内容 |
|------|----------|
| `Layout.tsx` | 注册 Cmd+K 快捷键；侧边栏增加迭代/归档箱导航；顶部增加通知铃铛；增加收藏/最近访问分组 |
| `App.tsx` | 新增迭代列表/详情、归档箱路由 |
| `api/client.ts` | 新增迭代/批量/归档/通知相关 API 方法 |
| `TaskDetail.tsx` | description 升级为 Markdown 编辑/预览；增加归档按钮；记录最近访问 |
| `TaskList.tsx` | 替换筛选为 FilterBar；增加批量选择复选框和 BatchActionBar |
| `KanbanBoard.tsx` | 替换筛选为 FilterBar |
| `Requirements.tsx` | 替换筛选为 FilterBar |

### 17.8 关键技术决策

| 决策点 | 方案 | 理由 |
|--------|------|------|
| 命令面板 | `cmdk` 库 | MIT 协议，3KB，无额外 UI 框架依赖 |
| Markdown 渲染 | `react-markdown` + `remark-gfm` | 轻量，GFM 支持好，与已有附件系统方案一致 |
| 通知获取 | 30s 轮询 | 不引入 WebSocket，保持架构简单，SQLite 无连接压力 |
| 收藏/最近访问 | localStorage | 纯前端，无需后端存储，足够轻量 |
| 批量操作 | 事务包裹 | SQLite 事务保证原子性 |
| 归档字段 | `archived_at TEXT` | 存 ISO datetime 可追溯归档时间，NULL 表示未归档 |

### 17.9 向后兼容

| 变更点 | 兼容策略 |
|--------|----------|
| 新增 3 张表 | `CREATE TABLE IF NOT EXISTS`，不影响现有表 |
| tasks.archived_at | `ALTER TABLE ADD COLUMN`（try/catch），默认 NULL，现有数据不受影响 |
| TaskService.list() | 默认过滤 `archived_at IS NULL`，现有查询行为不变 |
| 新增 API 端点 | 纯新增，不修改现有端点签名 |
| FilterBar 替换 | 现有筛选逻辑迁移到 FilterBar，功能完全等价 |
| 新增 MCP 工具 | 纯新增，不影响现有工具 |

---

## 二十二、项目空间任务列表树形化技术设计 (v3.5)

### 22.1 目标

将项目空间 `/tasks` 页面从扁平表格切换为树形列表，但保留当前页面已经具备的高信息密度、筛选栏和批量操作能力。

### 22.2 数据源方案

- 前端从 `api.getTasks()` 切换为 `api.getTaskTree()`，直接复用后端已有树形接口。
- 不新增后端端点，也不修改数据库结构。
- 同级排序优先在前端完成，避免影响其他已经依赖 `sortOrder` 的页面。

### 22.3 前端处理流程

```typescript
const { data: tree = [] } = useQuery({
  queryKey: ['task-tree-list', activeProject],
  queryFn: () => api.getTaskTree(),
});

const sortedTree = sortTreeByPriority(tree);
const filteredTree = filterTreeKeepAncestors(sortedTree, filters);
const visibleRows = flattenTree(filteredTree);
```

处理规则：

1. `sortTreeByPriority()` 递归处理整棵树。
2. 排序键为：`priorityOrder -> sortOrder -> title`。
3. `filterTreeKeepAncestors()` 对命中节点保留祖先链，确保搜索/筛选后仍能理解上下文。
4. `flattenTree()` 仅用于多选全选、计数和批量操作，不改变页面的树形展示。

### 22.4 排序规则

```typescript
const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };

function compareSibling(a, b) {
  return (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99)
    || ((a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    || String(a.title || '').localeCompare(String(b.title || ''));
}
```

说明：

- 优先级更高的节点始终排在前面。
- 当优先级相同时，尊重已有 `sortOrder`，避免完全打乱既有人工整理顺序。
- 当 `priority` 和 `sortOrder` 都相同时，用标题排序保证结果稳定。

### 22.5 UI 结构

`TaskList.tsx` 调整为三层结构：

1. 页面壳：标题、统计、筛选栏、新建按钮。
2. 树形表头：保留现有字段列宽，视觉上仍是“列表”。
3. 递归行组件：负责缩进、展开/折叠、勾选、字段展示。

每行新增：

- 展开/折叠按钮（无子节点时占位隐藏）
- 基于 `depth` 的左侧缩进
- 保持原有 checkbox 选择行为

### 22.6 兼容性与风险

| 变更点 | 方案 |
|--------|------|
| 数据源从扁平改树形 | 仅限 `TaskList.tsx` 页面消费变化，不影响其他页面 |
| 批量操作 | 通过 `flattenTree(filteredTree)` 获取当前可见节点集合 |
| 筛选行为 | 前端递归保留祖先路径，避免深层命中丢失上下文 |
| 后端兼容性 | 无 schema/API 变更，零迁移成本 |

---

## 二十三、树优先视图统一技术设计 (v3.6)

### 23.1 设计目标

将“需求树是唯一底层结构”的产品理念贯彻到非脑图页面，避免不同页面各自做扁平映射，导致用户在列表、看板、甘特图、需求池和个人空间之间来回切换时丢失上下文。

### 23.2 统一基础能力

新增一组前端共享的树处理能力，供多个页面复用：

```typescript
sortTreeByPriority(nodes)
filterTreeKeepAncestors(nodes, filters)
flattenTree(nodes)
buildBreadcrumb(node, allNodesMap)
groupTreeByStatus(nodes)
```

统一规则：

1. 同级排序：`priority -> sortOrder -> title`
2. 筛选后保留祖先路径
3. 个人空间数据集：`owner === currentUser` 的命中节点 + 必要祖先
4. 树节点展示时优先复用同一套 row/card 元数据（标题、ID、标签、状态、优先级、owner、进度）

### 23.3 看板树化

#### 23.3.1 数据组织

`KanbanBoard.tsx` 从 `api.getTasks()` 切换到 `api.getTaskTree()`，然后执行：

```typescript
const sortedTree = sortTreeByPriority(tree);
const filteredTree = filterTreeKeepAncestors(sortedTree, filters);
const columnTrees = buildStatusColumnsFromTree(filteredTree);
```

`buildStatusColumnsFromTree()` 规则：

- 保留所有匹配节点的树层级
- 每个状态列只展示 `node.status === column.status` 的节点
- 节点的 `depth` 由其在原树中的层级决定
- 当父节点不在当前列、子节点在当前列时，仍通过 breadcrumb 或占位缩进保留来源感

#### 23.3.2 UI 形态

- 列结构保持不变，仍然是状态列
- 列内卡片改为“树卡片”：可缩进、可折叠、可显示父路径
- 拖拽改状态时只变更 `status`，不变更树结构

### 23.4 甘特图树行化

#### 23.4.1 数据组织

`GanttChart.tsx` 与 `MyGantt.tsx` 统一切到树驱动：

```typescript
const sortedTree = sortTreeByPriority(tree);
const filteredTree = filterTreeKeepAncestors(sortedTree, filters);
const rows = flattenTreeWithDepth(filteredTree);
```

#### 23.4.2 UI 形态

- 左侧固定列：可展开/收起的树行
- 右侧时间轴：每个树行一条时间 bar
- 不再以 `domain` / `owner` 作为主分组容器，它们降级为筛选或附加信息
- 个人甘特图只展示“我的节点 + 祖先路径”，但仍复用相同树行组件

### 23.5 需求池树化

#### 23.5.1 数据与接口

需求池当前是独立表 `backlog_items`，没有父子结构字段。要实现树化，需要为需求池补充：

```sql
backlog_items.parent_backlog_id INTEGER NULL
backlog_items.sort_order INTEGER NOT NULL DEFAULT 0
```

对应服务层需要补充：

- 创建 backlog 条目时支持 `parent_backlog_id`
- 列表接口返回树形结构或返回平铺后由前端组树
- 排期时支持将 backlog 子树映射到正式任务树

#### 23.5.2 排期规则

- 单条排期：保留其父需求指向
- 子树排期：允许整棵 backlog 子树转换为正式 task 子树
- 同级排序与任务树一致：`priority -> sortOrder -> title`

### 23.6 个人空间一致性

当前个人空间实际存在的相关页面是：

- `MyTasks`（目前默认 flat）
- `MyGantt`
- `MyDashboard`

统一改造方案：

1. `MyTasks` 默认视图切回树视图，`/my/tasks/list` 改为树优先入口。
2. 现有 flat 视图不删除，但从默认主入口降级为辅助视图。
3. `MyGantt` 改为树行模式，与项目甘特图共享实现。
4. `MyDashboard` 的“近期任务”入口和快速入口文本，统一强调“需求树上下文”。

### 23.7 实施顺序

建议分 4 个批次，逐步收敛风险：

1. 看板树化：纯前端，复用现有任务树接口
2. 甘特图树行化：纯前端，项目/个人两页一起改
3. 个人空间入口统一：调整 `MyTasks` 默认视图和工作台文案
4. 需求池树化：涉及数据库字段、服务层和前端，单独一个批次

### 23.8 风险

| 风险点 | 说明 | 缓解方式 |
|--------|------|----------|
| 看板列内树化后拖拽复杂度上升 | 卡片既有状态又有树层级 | 首版只支持改状态，不支持列内拖拽重排 |
| 甘特图树行化后高度同步复杂 | 左右两侧必须严格对齐 | 左侧树与右侧时间条采用同一 `rows` 数据源渲染 |
| 需求池树化需要数据迁移 | 当前 backlog 无父子结构 | 单独 migration，默认旧数据全为根节点 |
| 个人空间默认视图变更可能影响习惯 | 现用户当前默认是 flat | 保留 flat 作为可切换辅助视图 |

---

## 十八、Intake 收件箱技术设计 (v3.1)

### 18.1 数据库设计

#### 18.1.1 新增 intake_items 表

```sql
CREATE TABLE IF NOT EXISTS intake_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  intake_id     TEXT NOT NULL UNIQUE,                 -- 业务 ID: "IN-001"
  project_id    INTEGER NOT NULL REFERENCES projects(id),
  title         TEXT NOT NULL,
  description   TEXT,                                 -- Markdown 格式
  category      TEXT NOT NULL DEFAULT 'feedback',     -- bug | feature | feedback
  submitter     TEXT NOT NULL,                        -- 提交人名称（自由填写）
  status        TEXT NOT NULL DEFAULT 'pending',      -- pending | accepted | rejected | deferred | duplicate
  priority      TEXT NOT NULL DEFAULT 'P2',           -- 建议优先级
  reviewed_by   TEXT,                                 -- 审核人 member.identifier
  review_note   TEXT,                                 -- 审核备注
  task_id       TEXT,                                 -- 接受后关联的 task.task_id
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_intake_project_status ON intake_items(project_id, status);
```

#### 18.1.2 Drizzle Schema

```typescript
export const intakeItems = sqliteTable('intake_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  intakeId: text('intake_id').notNull().unique(),
  projectId: integer('project_id').notNull().references(() => projects.id),
  title: text('title').notNull(),
  description: text('description'),
  category: text('category').notNull().default('feedback'), // 'bug' | 'feature' | 'feedback'
  submitter: text('submitter').notNull(),
  status: text('status').notNull().default('pending'), // 'pending'|'accepted'|'rejected'|'deferred'|'duplicate'
  priority: text('priority').notNull().default('P2'),
  reviewedBy: text('reviewed_by'),
  reviewNote: text('review_note'),
  taskId: text('task_id'),          // 接受后关联的节点 taskId
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});
```

### 18.2 后端服务层

#### 18.2.1 intake-service.ts（新建）

```typescript
class IntakeService {
  // 生成 Intake 业务 ID（IN-001, IN-002, ...）
  private async generateIntakeId(projectId: number): Promise<string>;
  
  // 提交 Intake（公开接口，无需认证）
  async submit(params: {
    title: string;
    description?: string;
    category?: 'bug' | 'feature' | 'feedback';
    submitter: string;
    priority?: string;
    projectId: number;
  }): Promise<IntakeItem>;
  
  // 列表查询
  async list(projectId: number, filters?: {
    status?: string;
    category?: string;
  }): Promise<IntakeItem[]>;
  
  // 获取单条详情
  async getById(id: number): Promise<IntakeItem | null>;
  async getByIntakeId(intakeId: string, projectId: number): Promise<IntakeItem | null>;
  
  // 获取统计
  async getStats(projectId: number): Promise<Record<string, number>>;
  
  // 审核操作
  async review(intakeId: string, params: {
    action: 'accept' | 'reject' | 'defer' | 'duplicate';
    reviewedBy: string;
    reviewNote?: string;
    // accept 时的额外参数
    parentTaskId?: string;
    owner?: string;
    priority?: string;
    extraLabels?: string[];
    projectId: number;
  }): Promise<IntakeItem & { task?: Task }>;
  
  // 暂缓恢复
  async reopen(intakeId: string, projectId: number): Promise<IntakeItem>;
}
```

#### 18.2.2 审核-接受 核心逻辑

```typescript
async review(intakeId, params) {
  const item = await this.getByIntakeId(intakeId, params.projectId);
  if (!item || item.status !== 'pending') throw new Error('只能审核 pending 状态的条目');
  
  if (params.action === 'accept') {
    // 1. 根据 category 确定自动标签
    const categoryLabelMap = { bug: 'bug', feature: 'feature', feedback: 'feedback' };
    const labels = [categoryLabelMap[item.category], ...(params.extraLabels || [])];
    
    // 2. 创建 Task 节点
    const task = await TaskService.create({
      title: item.title,
      description: item.description || undefined,
      labels,
      priority: params.priority || item.priority,
      owner: params.owner,
      parent_task_id: params.parentTaskId,
      projectId: params.projectId,
    });
    
    // 3. 更新 Intake 状态
    await db.update(intakeItems)
      .set({
        status: 'accepted',
        reviewedBy: params.reviewedBy,
        reviewNote: params.reviewNote,
        taskId: task.taskId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(intakeItems.intakeId, intakeId));
    
    return { ...item, status: 'accepted', taskId: task.taskId, task };
  }
  
  // reject / defer / duplicate
  const statusMap = { reject: 'rejected', defer: 'deferred', duplicate: 'duplicate' };
  await db.update(intakeItems)
    .set({
      status: statusMap[params.action],
      reviewedBy: params.reviewedBy,
      reviewNote: params.reviewNote,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(intakeItems.intakeId, intakeId));
}
```

### 18.3 REST API

#### 18.3.1 公开接口（无需认证）

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/v1/intake` | 提交 Intake（公开，无需 Bearer Token） |

请求体：
```json
{
  "title": "登录页点击按钮无反应",
  "description": "## 复现步骤\n1. 打开登录页\n2. 点击登录按钮\n3. 无反应",
  "category": "bug",
  "submitter": "张三",
  "priority": "P1",
  "project": "letsgo"
}
```

响应：
```json
{
  "intakeId": "IN-042",
  "title": "登录页点击按钮无反应",
  "status": "pending",
  "createdAt": "2026-03-05T10:30:00.000Z"
}
```

#### 18.3.2 项目成员接口（需认证）

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/v1/intake` | Intake 列表（?project=&status=&category=） |
| GET | `/api/v1/intake/:intakeId` | Intake 详情 |
| GET | `/api/v1/intake/stats` | 各状态数量统计 |
| POST | `/api/v1/intake/:intakeId/review` | 审核操作 |
| POST | `/api/v1/intake/:intakeId/reopen` | 暂缓恢复为 pending |

审核请求体：
```json
{
  "action": "accept",
  "review_note": "确认是 Bug，分配给前端处理",
  "parent_task_id": "FE-1",
  "owner": "frontend-agent",
  "priority": "P1",
  "extra_labels": ["urgent"]
}
```

#### 18.3.3 认证豁免

提交接口 `POST /api/v1/intake` 需要豁免 Bearer Token 认证，允许未登录用户提交。其他 Intake 端点仍需认证。

在 auth hook 中添加白名单：

```typescript
// 认证豁免路径
const PUBLIC_PATHS = ['/api/v1/intake'];
const PUBLIC_METHODS = ['POST'];

// auth hook 中
if (PUBLIC_PATHS.some(p => req.url.startsWith(p)) && PUBLIC_METHODS.includes(req.method)) {
  // 跳过认证（仅限 POST 提交）
}
```

### 18.4 MCP 工具

```typescript
// submit_intake — 提交收件箱条目（如 AI Agent 从飞书消息提取 Bug）
server.tool('submit_intake', {
  title: z.string().describe('标题'),
  description: z.string().optional().describe('详细描述 (Markdown)'),
  category: z.enum(['bug', 'feature', 'feedback']).optional().describe('类别'),
  submitter: z.string().describe('提交人名称'),
  priority: z.string().optional().describe('建议优先级'),
  project: z.string().optional(),
}, async (params) => {
  return IntakeService.submit({ ... });
});

// list_intake — 查看收件箱
server.tool('list_intake', {
  status: z.string().optional().describe('状态筛选'),
  category: z.string().optional().describe('类别筛选'),
  project: z.string().optional(),
}, async (params) => {
  return IntakeService.list(projectId, params);
});

// review_intake — 审核
server.tool('review_intake', {
  intake_id: z.string().describe('Intake 业务 ID'),
  action: z.enum(['accept', 'reject', 'defer', 'duplicate']).describe('审核动作'),
  review_note: z.string().optional().describe('审核备注'),
  parent_task_id: z.string().optional().describe('接受时指定父节点'),
  owner: z.string().optional().describe('接受时指定负责人'),
  priority: z.string().optional().describe('接受时调整优先级'),
  project: z.string().optional(),
}, async (params) => {
  return IntakeService.review(params.intake_id, { ... });
});
```

### 18.5 前端设计

#### 18.5.1 新增文件

| 文件 | 类型 | 说明 |
|------|------|------|
| `pages/IntakeSubmit.tsx` | 新建 | 公开提交表单页面 |
| `pages/IntakeList.tsx` | 新建 | 项目成员的 Intake 管理列表 |
| `services/intake-service.ts` | 新建 | 后端 Intake 服务 |

#### 18.5.2 路由

```
/p/:slug/intake/submit  → IntakeSubmit（公开，无需身份选择）
/p/:slug/intake         → IntakeList（需认证）
```

#### 18.5.3 提交页面（IntakeSubmit）

```typescript
function IntakeSubmit() {
  const { slug } = useParams();
  const [submitted, setSubmitted] = useState(false);
  const [intakeId, setIntakeId] = useState('');
  
  if (submitted) return <SubmitSuccess intakeId={intakeId} />;
  
  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1>提交反馈 — {projectName}</h1>
      <form onSubmit={handleSubmit}>
        <Input label="标题" required />
        <Select label="类别" options={[
          { value: 'bug', label: '🐛 Bug 报告' },
          { value: 'feature', label: '✨ 功能建议' },
          { value: 'feedback', label: '💬 一般反馈' },
        ]} />
        <Textarea label="详细描述" placeholder="支持 Markdown 格式" />
        <Input label="你的名字" required />
        <Select label="建议优先级" options={['P0','P1','P2','P3']} />
        <Button type="submit">提交</Button>
      </form>
    </div>
  );
}
```

#### 18.5.4 管理列表页（IntakeList）

```typescript
function IntakeList() {
  const { data: items } = useQuery(['intake', slug], () => api.listIntake(slug));
  const { data: stats } = useQuery(['intake-stats', slug], () => api.getIntakeStats(slug));
  
  return (
    <div>
      {/* 顶部统计卡片 */}
      <StatsBar stats={stats} />
      
      {/* 筛选栏 */}
      <FilterRow status={statusFilter} category={categoryFilter} />
      
      {/* 条目列表 */}
      {items?.map(item => (
        <IntakeCard key={item.id} item={item} onReview={handleReview} />
      ))}
    </div>
  );
}
```

#### 18.5.5 类别色标

```typescript
const CATEGORY_CONFIG = {
  bug:      { label: 'Bug 报告', color: '#dc2626', bgColor: '#fef2f2', icon: '🐛' },
  feature:  { label: '功能建议', color: '#2563eb', bgColor: '#eff6ff', icon: '✨' },
  feedback: { label: '一般反馈', color: '#6366f1', bgColor: '#eef2ff', icon: '💬' },
};

const INTAKE_STATUS_CONFIG = {
  pending:   { label: '待审核', color: '#f59e0b', bgColor: '#fffbeb' },
  accepted:  { label: '已接受', color: '#16a34a', bgColor: '#f0fdf4' },
  rejected:  { label: '已拒绝', color: '#dc2626', bgColor: '#fef2f2' },
  deferred:  { label: '已暂缓', color: '#6366f1', bgColor: '#eef2ff' },
  duplicate: { label: '重复',   color: '#64748b', bgColor: '#f1f5f9' },
};
```

#### 18.5.6 侧边栏集成

`Layout.tsx` 侧边栏增加收件箱导航项：

```typescript
// "工作台" 分组
{ name: '收件箱', path: `/${slug}/intake`, icon: InboxIcon, badge: pendingCount }
```

### 18.6 API client 新增方法

```typescript
// api/client.ts
submitIntake(params: SubmitIntakeParams): Promise<IntakeItem>;       // POST /api/v1/intake（无 token）
listIntake(project: string, filters?): Promise<IntakeItem[]>;        // GET /api/v1/intake
getIntakeStats(project: string): Promise<Record<string, number>>;   // GET /api/v1/intake/stats
reviewIntake(intakeId: string, params: ReviewParams): Promise<IntakeItem>; // POST /api/v1/intake/:id/review
reopenIntake(intakeId: string): Promise<IntakeItem>;                 // POST /api/v1/intake/:id/reopen
```

注意 `submitIntake` 方法需要特殊处理——不携带 Authorization Header。

### 18.7 向后兼容

| 变更点 | 兼容策略 |
|--------|----------|
| 新增 `intake_items` 表 | `CREATE TABLE IF NOT EXISTS`，不影响现有表 |
| 新增 API 端点 `/api/v1/intake` | 纯新增，不修改现有端点 |
| 新增前端页面 | 纯新增路由，不影响现有页面 |
| 认证豁免 | 仅 `POST /api/v1/intake` 豁免，其他端点不受影响 |
| 侧边栏 | 新增导航项，不影响现有导航 |
| 新增 MCP 工具 | 纯新增，不影响现有工具 |

---

## 十九、成员管理 MCP 工具技术设计 (v3.2)

### 19.1 背景

成员管理已有完整的 REST API（5 个端点）、服务层（MemberService CRUD + 任务统计）和前端页面，但 MCP 层缺少成员管理工具。AI Agent 无法通过 MCP 查询"当前有哪些成员"、"谁擅长前端"、"谁的负载最轻"。

v3.2 补齐 MCP 成员管理工具，让 Agent 具备完整的团队感知能力。

### 19.2 现有基础设施（无需变更）

| 层级 | 状态 | 说明 |
|------|------|------|
| 数据库 `members` 表 | 已有 | name/identifier/type/color/description/projectId |
| `MemberService` | 已有 | list/getByIdentifier/create/update/delete + _withStats |
| REST API | 已有 | `GET/POST /members`, `GET/PATCH/DELETE /members/:identifier` |
| 前端 Members 页面 | 已有 | 成员卡片网格 + 创建/编辑弹窗 |

### 19.3 新增 MCP 工具

#### 19.3.1 list_members — 列出项目成员

```typescript
mcp.tool('list_members', '列出项目成员（含擅长领域、任务统计）', {
  type: z.enum(['human', 'agent']).optional().describe('按类型筛选：human=人类, agent=AI Agent'),
  project: z.string().optional().describe('项目 slug'),
}, async (p) => {
  const projectId = resolveProject(p.project);
  const list = MemberService.list(p.type, projectId);
  return { content: [{ type: 'text' as const, text: JSON.stringify(list, null, 2) }] };
});
```

**返回数据示例**：
```json
[
  {
    "id": 1,
    "name": "Alice",
    "identifier": "alice",
    "type": "human",
    "color": "#6366f1",
    "description": "前端开发，擅长 React、CSS、动画。负责用户系统和支付模块前端",
    "taskCount": 8,
    "activeCount": 2
  },
  {
    "id": 2,
    "name": "Frontend Agent",
    "identifier": "frontend-agent",
    "type": "agent",
    "color": "#10b981",
    "description": "前端自动化 Agent，擅长组件开发、样式修复、单元测试生成",
    "taskCount": 15,
    "activeCount": 1
  }
]
```

> **关键字段说明**：
> - `description` — 成员的擅长领域和职责描述，AI Agent 据此判断任务分配
> - `taskCount` — 该成员负责的总任务数（所有状态）
> - `activeCount` — 该成员当前进行中的任务数（status=active）

#### 19.3.2 get_member — 获取单个成员详情

```typescript
mcp.tool('get_member', '获取单个成员详情（含擅长领域和任务负载）', {
  identifier: z.string().describe('成员标识符，如 alice、frontend-agent'),
}, async (p) => {
  const member = MemberService.getByIdentifier(p.identifier);
  if (!member) return { content: [{ type: 'text' as const, text: '成员不存在' }] };
  return { content: [{ type: 'text' as const, text: JSON.stringify(member, null, 2) }] };
});
```

#### 19.3.3 create_member — 创建成员

```typescript
mcp.tool('create_member', '创建项目成员（人类或 AI Agent）', {
  name: z.string().describe('显示名称'),
  identifier: z.string().describe('唯一标识符（将作为任务 owner 字段的值）'),
  type: z.enum(['human', 'agent']).optional().describe('成员类型，默认 human'),
  color: z.string().optional().describe('头像颜色，不填则随机分配'),
  description: z.string().optional().describe('擅长领域、职责范围描述'),
  project: z.string().optional().describe('项目 slug'),
}, async (p) => {
  const projectId = resolveProject(p.project);
  try {
    const member = MemberService.create({
      name: p.name,
      identifier: p.identifier,
      type: p.type,
      color: p.color,
      description: p.description,
      projectId,
    });
    return { content: [{ type: 'text' as const, text: `[OK] 成员已创建：${member.name} (${member.identifier})\n${JSON.stringify(member, null, 2)}` }] };
  } catch (e: any) {
    return { content: [{ type: 'text' as const, text: `创建失败：${e.message}` }] };
  }
});
```

#### 19.3.4 update_member — 更新成员信息

```typescript
mcp.tool('update_member', '更新成员信息（名称、描述、类型等）', {
  identifier: z.string().describe('成员标识符'),
  name: z.string().optional().describe('新名称'),
  type: z.enum(['human', 'agent']).optional().describe('更新类型'),
  color: z.string().optional().describe('更新颜色'),
  description: z.string().optional().describe('更新擅长领域/职责描述'),
}, async (p) => {
  const { identifier, ...updates } = p;
  const member = MemberService.update(identifier, updates);
  if (!member) return { content: [{ type: 'text' as const, text: '成员不存在' }] };
  return { content: [{ type: 'text' as const, text: `[OK] 成员已更新：${member.name}\n${JSON.stringify(member, null, 2)}` }] };
});
```

#### 19.3.5 delete_member — 删除成员

```typescript
mcp.tool('delete_member', '删除成员（不会影响已分配的任务）', {
  identifier: z.string().describe('成员标识符'),
}, async (p) => {
  const member = MemberService.getByIdentifier(p.identifier);
  if (!member) return { content: [{ type: 'text' as const, text: '成员不存在' }] };
  MemberService.delete(p.identifier);
  return { content: [{ type: 'text' as const, text: `[OK] 成员 ${p.identifier} 已删除` }] };
});
```

### 19.4 实现要点

| 要点 | 说明 |
|------|------|
| **复用 MemberService** | 5 个 MCP 工具直接调用已有的 MemberService 方法，不新增服务层代码 |
| **_withStats 自动附加** | MemberService.list() 和 getByIdentifier() 已自动附加 taskCount/activeCount |
| **项目隔离** | list_members 和 create_member 通过 projectId 过滤，确保项目间成员隔离 |
| **无数据库变更** | 纯 MCP 层新增，不修改 schema 或迁移 |
| **无前端变更** | 前端成员管理页面已完整，无需修改 |

### 19.5 MCP 工具在 server.ts 中的位置

新增 5 个工具应放在 `// ── Identity Tools` 区块之后、`// ── Permission Tools` 区块之前，形成独立的 `// ── Member Tools（v3.2）` 区块。

### 19.6 向后兼容

| 变更点 | 兼容策略 |
|--------|----------|
| 新增 5 个 MCP 工具 | 纯新增，不影响现有 54 个工具（总计变为 59 个） |
| MemberService | 零修改，完全复用 |
| REST API | 零修改，MCP 工具与 REST API 独立 |
| 数据库 | 零修改 |

---

## 二十、Markdown 全能预览技术设计 (v3.3)

### 20.1 背景

当前任务详情的 description 字段已支持 Markdown 渲染（`MarkdownPreview` 组件 + `react-markdown` + `remark-gfm`），但存在以下问题：

| 问题 | 描述 |
|------|------|
| 深色主题不匹配 | `prose-invert` + 深色背景样式，与白色 UI 冲突 |
| 编辑无预览 | 编辑时只有 textarea，保存后才能看渲染效果 |
| 无全屏预览 | 描述内容较长时没有沉浸式阅读体验 |
| 悬浮窗未适配 | MindMap 悬浮窗中 TaskDetail 没有针对性的尺寸适配 |

### 20.2 改动范围

| 文件 | 改动 |
|------|------|
| `MarkdownPreview.tsx` | 浅色主题重构，所有自定义 components 样式适配白底 |
| `TaskDetail.tsx` | 描述区域重构为分栏编辑+实时预览布局 |

### 20.3 MarkdownPreview 浅色主题

将 `prose-invert` 改为 `prose`（Tailwind Typography 默认浅色模式），自定义组件样式全部调整为浅色：

- 表格边框：`border-gray-200`
- 表头背景：`bg-gray-50`
- 代码块背景：`bg-gray-900`（代码块保持深色以符合开发习惯）
- 行内代码：`bg-gray-100 text-gray-800`
- 链接色：`text-indigo-600`

### 20.4 描述区分栏编辑+预览

编辑态改为 grid 两栏布局：

```
左栏(50%): textarea 编辑器（mono字体，行号区域）
右栏(50%): MarkdownPreview 实时渲染（随输入同步更新）
```

- 预览面板可通过按钮收起/展开
- 窄屏（容器 < 640px）时退化为 Tab 切换（编辑/预览）
- 悬浮窗模式自动检测容器宽度适配

### 20.5 向后兼容

| 变更点 | 兼容策略 |
|--------|----------|
| MarkdownPreview 样式 | 纯样式变更，API 不变 |
| TaskDetail 描述区 | 非编辑态渲染不变，编辑态 UX 升级 |
| 无后端变更 | 纯前端改动 |

---

## 二十一、图片上传 + 节点样式增强技术设计 (v3.4)

### 21.1 图片上传

#### 21.1.1 后端

**新增 API**：`POST /api/v1/upload/image`
- 接收 multipart/form-data，字段名 `file`
- 存储到 `data/uploads/` 目录，文件名使用 `{timestamp}-{random}.{ext}`
- 返回 `{ url: "/uploads/{filename}" }`
- 需要注册 `@fastify/multipart` 插件
- 需要注册静态文件服务 `@fastify/static` 指向 `data/uploads/`

**文件限制**：
- 最大 10MB
- 仅允许 image/png, image/jpeg, image/gif, image/webp

#### 21.1.2 前端

**描述编辑器增强**：
- textarea 上方工具栏新增"插入图片"按钮
- 支持粘贴截图（监听 paste 事件，检测 clipboardData.files）
- 支持拖拽图片文件到编辑区
- 上传后在光标位置插入 `![image](url)` 语法
- 上传中显示 `![uploading...]()`

#### 21.1.3 改动范围

| 文件 | 改动 |
|------|------|
| `server/package.json` | 新增 `@fastify/multipart`、`@fastify/static` 依赖 |
| `server/src/api/routes.ts` | 新增 `POST /api/v1/upload/image` 路由 + 静态文件服务注册 |
| `web/src/api/client.ts` | 新增 `uploadImage(file: File)` API 方法 |
| `web/src/pages/TaskDetail.tsx` | textarea 增加粘贴/拖拽图片处理 + 图片上传工具栏 |

### 21.2 节点样式增强：包围模式

#### 21.2.1 数据模型

在现有 `NodeStyle` 接口中新增 `borderMode` 字段：

```typescript
type BorderMode = 'bar' | 'half' | 'full';
// bar = 默认左色条（现有行为）
// half = 半包围（左+上+下三边，右侧开放）
// full = 全包围（四边都有颜色边框）
```

#### 21.2.2 渲染逻辑

- `bar`（默认）：保持现有 1px 左色条 + 灰色细边框
- `half`：去除左色条，改为 `borderLeft` + `borderTop` + `borderBottom` 使用强调色，`borderRight` 保持浅灰
- `full`：去除左色条，四边都使用强调色

#### 21.2.3 改动范围

| 文件 | 改动 |
|------|------|
| `web/src/pages/MindMap.tsx` — `NodeStyle` | 新增 `borderMode` 字段 |
| `web/src/pages/MindMap.tsx` — `NodeStyleModal` | 新增"包围模式"选择器 |
| `web/src/pages/MindMap.tsx` — `TaskNode` | 根据 `borderMode` 调整边框渲染 |

### 21.3 向后兼容

| 变更点 | 兼容策略 |
|--------|----------|
| 图片上传 API | 新增 API，不影响现有接口 |
| `NodeStyle.borderMode` | 默认值为 `'bar'`，与旧数据完全兼容 |
| localStorage nodeStyles | 旧数据无 `borderMode` 字段，会被视为 `'bar'` |
