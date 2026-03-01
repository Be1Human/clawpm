# ClawPM — 技术设计文档

> **版本**: v2.0  
> **日期**: 2026-03-01  
> **关联 PRD**: [PRD.md](./PRD.md) v2.0  
> **状态**: 迭代中  
> **变更记录**:  
> - v1.1 ~ v1.4: 需求树、人员管理、甘特图、标签/关联图谱等迭代  
> - **v2.0 (2026-03-01): 颠覆性重设计** — 新状态体系 (backlog → planned → active → review → done)，去掉 type 推导，极简创建（只需 title），内联创建技术方案，AI 拆解接口规划

---

## 一、技术选型

| 组件 | 方案 | 理由 |
|------|------|------|
| **后端运行时** | Node.js (TypeScript) | 原生 async/事件驱动，MCP SDK 官方支持 |
| **后端框架** | Fastify | 高性能、插件体系完善、原生 TypeScript |
| **数据库** | SQLite (better-sqlite3) | 零配置、单文件、易备份 |
| **ORM** | Drizzle ORM | 类型安全、轻量、SQLite 支持好 |
| **MCP SDK** | @modelcontextprotocol/sdk | 官方 TypeScript SDK，SSE 传输 |
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
│   │   ├── index.ts                # 入口：Fastify + MCP
│   │   ├── config.ts
│   │   ├── db/
│   │   │   ├── schema.ts           # Drizzle schema
│   │   │   └── connection.ts       # SQLite 连接 + 迁移
│   │   ├── api/
│   │   │   └── routes.ts           # REST API 路由
│   │   ├── mcp/
│   │   │   ├── server.ts
│   │   │   └── tools/              # MCP 工具
│   │   └── services/
│   │       ├── task-service.ts      # 节点业务逻辑
│   │       ├── req-link-service.ts  # 关联业务逻辑
│   │       ├── backlog-service.ts
│   │       ├── goal-service.ts
│   │       ├── risk-service.ts
│   │       └── id-generator.ts
│   └── package.json
├── web/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/client.ts
│   │   ├── components/
│   │   │   └── CreateTaskModal.tsx
│   │   └── pages/
│   │       ├── Dashboard.tsx
│   │       ├── KanbanBoard.tsx
│   │       ├── MindMap.tsx          # 核心：思维导图
│   │       ├── Requirements.tsx     # 需求树列表
│   │       ├── TaskList.tsx
│   │       ├── TaskDetail.tsx
│   │       ├── GanttChart.tsx
│   │       ├── Members.tsx
│   │       └── Backlog.tsx
│   └── package.json
└── docker-compose.yml
```

---

## 三、数据库设计

### 3.1 核心表结构

```sql
-- 节点表（需求/任务统一）
CREATE TABLE tasks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id         TEXT NOT NULL UNIQUE,         -- 业务 ID: "U-042"
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
  name        TEXT NOT NULL,
  identifier  TEXT NOT NULL UNIQUE,  -- = tasks.owner
  type        TEXT NOT NULL DEFAULT 'human',  -- human | agent
  color       TEXT NOT NULL DEFAULT '#6366f1',
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 业务板块
CREATE TABLE domains (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  task_prefix TEXT NOT NULL UNIQUE,
  keywords    TEXT DEFAULT '[]',     -- JSON array
  color       TEXT DEFAULT '#6366f1',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 里程碑
CREATE TABLE milestones (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
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
- 认证: `Authorization: Bearer <token>`
- 响应格式: JSON

### 6.2 节点（任务）API

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

### 6.4 其他 API

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

| 路径 | 页面 | 描述 |
|------|------|------|
| `/` | Dashboard | 仪表盘 |
| `/mindmap` | MindMap | 思维导图（核心视图） |
| `/board` | KanbanBoard | 看板 |
| `/requirements` | Requirements | 需求树列表 |
| `/tasks` | TaskList | 任务列表 |
| `/tasks/:taskId` | TaskDetail | 节点详情 |
| `/gantt` | GanttChart | 甘特图 |
| `/members` | Members | 成员管理 |
| `/backlog` | Backlog | 需求池 |
| `/milestones` | Milestones | 里程碑 |

### 9.2 思维导图技术方案

基于 `@xyflow/react` 实现，核心技术点：

#### 9.2.1 自动树形布局

```typescript
// 横向树形布局算法
function computeLayout(roots: TreeNode[]) {
  // 递归计算每个子树的高度
  // 父节点垂直居中于子树
  // 水平方向每层递增固定间距
  // 折叠的节点不展开子树
}
```

#### 9.2.2 自定义节点 (TaskNode)

```typescript
// 节点渲染内容
<div className="task-node">
  <StatusDot status={data.status} />
  <span className="title">{data.title}</span>
  {data.labels.map(l => <Label key={l} text={l} />)}
  {hasChildren && <CollapseToggle count={childCount} />}
</div>
```

#### 9.2.3 自定义边样式

```typescript
const EDGE_STYLES = {
  tree:     { stroke: '#d1d5db', strokeWidth: 1.5 },             // 灰色实线
  blocks:   { stroke: '#ef4444', strokeWidth: 2, dasharray: '5,3' },  // 红虚线
  precedes: { stroke: '#f97316', strokeWidth: 1.5, dasharray: '4,3' }, // 橙虚线
  relates:  { stroke: '#93c5fd', strokeWidth: 1, dasharray: '3,4' },   // 蓝虚线
};
```

#### 9.2.4 拖拽规则

- 只有根节点（parent_id = null）可以自由拖拽
- 拖拽根节点时，整个子树跟随平移（计算位置偏移量应用到所有后代）
- 非根节点不可独立移动，位置由布局算法决定

#### 9.2.5 键盘快捷键

| 快捷键 | 操作 |
|--------|------|
| `Tab` | 创建子节点（内联） |
| `Enter` | 创建同级节点（内联） |
| `Delete` | 删除选中节点 |
| 双击 | 内联编辑标题 |

### 9.3 标签色标系统

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

---

## 十、MCP Server 设计

### 10.1 传输层

SSE 传输，与 REST API 共用 Fastify 实例：

```
POST /mcp/messages  →  发送请求
GET  /mcp/sse       ←  接收响应流
```

### 10.2 认证

```
Authorization: Bearer <CLAWPM_API_TOKEN>
```

### 10.3 MCP 工具实现要点

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

### 13.1 状态迁移

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

### 13.2 Type → Labels 迁移

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

### 13.3 默认状态迁移

```sql
-- 将所有无日期、无负责人的 planned 节点改为 backlog
UPDATE tasks 
SET status = 'backlog' 
WHERE status = 'planned' 
  AND owner IS NULL 
  AND due_date IS NULL;
```
