# ClawPM — 技术设计文档

> **版本**: v1.3  
> **日期**: 2026-03-01  
> **关联 PRD**: [PRD.md](./PRD.md) v1.3  
> **状态**: 迭代中  
> **变更记录**:  
> - v1.1 (2026-03-01): 新增需求树技术设计 — tasks.type 字段、树形 API、Requirements 页面  
> - v1.2 (2026-03-01): 系统自洽性修复 — type/parent 字段全链路贯通  
> - v1.3 (2026-03-01): 人员管理、甘特图、需求树增强（过滤+思维导图）

---

## 一、技术选型

| 组件 | 方案 | 理由 |
|------|------|------|
| **后端运行时** | Node.js (TypeScript) | 原生 async/事件驱动，MCP SDK 官方支持 |
| **后端框架** | Fastify | 高性能、插件体系完善、原生 TypeScript |
| **数据库** | SQLite (better-sqlite3) | 零配置、单文件、易备份、性能优秀 |
| **ORM** | Drizzle ORM | 类型安全、轻量、SQLite 支持好 |
| **MCP SDK** | @modelcontextprotocol/sdk | 官方 TypeScript SDK，SSE 传输支持 |
| **前端框架** | React 18 + Vite | 成熟生态、快速开发 |
| **前端 UI** | Tailwind CSS + shadcn/ui | 现代化组件、高度可定制 |
| **状态管理** | TanStack Query | 服务端状态管理，自动缓存和刷新 |
| **图表** | Recharts | 轻量、React 原生、支持看板需要的图表类型 |
| **容器化** | Docker + docker-compose | 一键部署 |
| **包管理** | pnpm + monorepo | 统一管理 server/web 两个包 |

---

## 二、项目结构

```
clawpm/
├── docs/
│   ├── PRD.md                      # 产品需求文档
│   └── TechDesign.md               # 本文档
├── server/                         # 后端服务
│   ├── src/
│   │   ├── index.ts                # 入口，启动 Fastify + MCP
│   │   ├── config.ts               # 配置管理
│   │   ├── db/
│   │   │   ├── schema.ts           # Drizzle schema 定义
│   │   │   ├── migrate.ts          # 数据库迁移
│   │   │   └── connection.ts       # SQLite 连接
│   │   ├── models/
│   │   │   ├── task.ts             # 任务模型
│   │   │   ├── backlog.ts          # 需求池模型
│   │   │   ├── goal.ts             # 目标模型
│   │   │   ├── milestone.ts        # 里程碑模型
│   │   │   └── domain.ts           # 业务板块模型
│   │   ├── api/
│   │   │   ├── routes.ts           # API 路由注册
│   │   │   ├── tasks.ts            # 任务 API
│   │   │   ├── backlog.ts          # 需求池 API
│   │   │   ├── goals.ts            # 目标 API
│   │   │   ├── milestones.ts       # 里程碑 API
│   │   │   ├── domains.ts          # 业务板块 API
│   │   │   └── dashboard.ts        # 仪表盘聚合 API
│   │   ├── mcp/
│   │   │   ├── server.ts           # MCP Server 初始化
│   │   │   ├── transport.ts        # SSE 传输层
│   │   │   ├── tools/
│   │   │   │   ├── task-tools.ts   # 任务相关 MCP 工具
│   │   │   │   ├── backlog-tools.ts # 需求池 MCP 工具
│   │   │   │   ├── goal-tools.ts   # 目标 MCP 工具
│   │   │   │   ├── project-tools.ts # 项目概览 MCP 工具
│   │   │   │   └── config-tools.ts # 配置管理 MCP 工具
│   │   │   └── index.ts            # 工具注册
│   │   └── services/
│   │       ├── task-service.ts     # 任务业务逻辑
│   │       ├── backlog-service.ts  # 需求池业务逻辑
│   │       ├── goal-service.ts     # 目标业务逻辑
│   │       ├── risk-service.ts     # 风险分析
│   │       └── id-generator.ts     # 任务 ID 生成器
│   ├── package.json
│   └── tsconfig.json
├── web/                            # 前端 Web UI
│   ├── src/
│   │   ├── main.tsx                # 入口
│   │   ├── App.tsx                 # 路由
│   │   ├── api/                    # API 调用层
│   │   ├── components/             # 通用组件
│   │   │   ├── ui/                 # shadcn/ui 组件
│   │   │   ├── TaskCard.tsx
│   │   │   ├── KanbanColumn.tsx
│   │   │   └── ...
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx       # 仪表盘
│   │   │   ├── KanbanBoard.tsx     # 看板
│   │   │   ├── TaskList.tsx        # 任务列表
│   │   │   ├── TaskDetail.tsx      # 任务详情
│   │   │   ├── Backlog.tsx         # 需求池
│   │   │   └── Milestones.tsx      # 里程碑
│   │   └── hooks/                  # 自定义 hooks
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml
├── Dockerfile
├── pnpm-workspace.yaml
├── package.json                    # 根 package.json
└── README.md
```

---

## 三、数据库设计

### 3.1 ER 图

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   domains    │     │  milestones  │     │    goals     │
│──────────────│     │──────────────│     │──────────────│
│ id (PK)      │     │ id (PK)      │     │ id (PK)      │
│ name         │     │ name         │     │ title        │
│ task_prefix  │     │ target_date  │     │ target_date  │
│ keywords     │     │ status       │     │ status       │
│ color        │     │ description  │     │ description  │
│ created_at   │     │ created_at   │     │ created_at   │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │ 1:N                │ 1:N                │ 1:N
       │                    │                    │
       ▼                    ▼                    ▼
┌──────────────────────────────────────┐  ┌──────────────┐
│              tasks                   │  │  objectives  │
│──────────────────────────────────────│  │──────────────│
│ id (PK)                              │  │ id (PK)      │
│ task_id (业务 ID, 如 "U-042")         │  │ goal_id (FK) │
│ title                                │  │ title        │
│ description                          │  │ weight       │
│ domain_id (FK)                       │  │ progress     │
│ milestone_id (FK, nullable)          │  │ status       │
│ parent_task_id (FK, nullable, 自引用) │  └──────┬───────┘
│ status (enum)                        │         │ 1:N
│ progress (0-100)                     │         ▼
│ priority (P0/P1/P2/P3)              │  ┌──────────────┐
│ owner                                │  │ objective_   │
│ due_date                             │  │ task_links   │
│ start_date                           │  │──────────────│
│ source (planned/agent/decision-maker)│  │ objective_id │
│ blocker                              │  │ task_id      │
│ health_score                         │  └──────────────┘
│ created_at                           │
│ updated_at                           │
└──────────────┬───────────────────────┘
               │ 1:N
               ▼
┌──────────────────────┐   ┌──────────────────────┐
│    task_notes        │   │   progress_history   │
│──────────────────────│   │──────────────────────│
│ id (PK)              │   │ id (PK)              │
│ task_id (FK)         │   │ task_id (FK)         │
│ content              │   │ progress             │
│ author               │   │ summary              │
│ created_at           │   │ recorded_at          │
└──────────────────────┘   └──────────────────────┘

┌──────────────────────┐
│   backlog_items      │
│──────────────────────│
│ id (PK)              │
│ backlog_id (业务 ID)  │
│ title                │
│ description          │
│ domain_id (FK)       │
│ priority             │
│ source               │
│ source_context       │
│ estimated_scope      │
│ tags (JSON)          │
│ status (pool/scheduled/cancelled) │
│ scheduled_task_id    │  ← 排期后关联到 task
│ created_at           │
│ updated_at           │
└──────────────────────┘
```

### 3.2 Schema 定义 (Drizzle ORM)

```typescript
// server/src/db/schema.ts

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const domains = sqliteTable('domains', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  taskPrefix: text('task_prefix').notNull().unique(),
  keywords: text('keywords', { mode: 'json' }).$type<string[]>().default([]),
  color: text('color').default('#6366f1'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const milestones = sqliteTable('milestones', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  targetDate: text('target_date'),
  status: text('status').notNull().default('active'),   // active, completed, cancelled
  description: text('description'),
  domainWeights: text('domain_weights', { mode: 'json' }).$type<Record<string, number>>(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: text('task_id').notNull().unique(),            // 业务 ID: "U-042"
  title: text('title').notNull(),
  description: text('description'),
  domainId: integer('domain_id').references(() => domains.id),
  milestoneId: integer('milestone_id').references(() => milestones.id),
  parentTaskId: integer('parent_task_id').references(() => tasks.id),
  status: text('status').notNull().default('planned'),
    // planned, active, review, done, blocked, cancelled
  progress: integer('progress').notNull().default(0),    // 0-100
  priority: text('priority').notNull().default('P2'),    // P0, P1, P2, P3
  owner: text('owner'),
  dueDate: text('due_date'),
  startDate: text('start_date'),
  source: text('source').notNull().default('planned'),
    // planned, agent-created, decision-maker
  blocker: text('blocker'),
  healthScore: integer('health_score').default(100),
  tags: text('tags', { mode: 'json' }).$type<string[]>().default([]),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

export const taskNotes = sqliteTable('task_notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').notNull().references(() => tasks.id),
  content: text('content').notNull(),
  author: text('author'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const progressHistory = sqliteTable('progress_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').notNull().references(() => tasks.id),
  progress: integer('progress').notNull(),
  summary: text('summary'),
  recordedAt: text('recorded_at').notNull().default(sql`(datetime('now'))`),
});

export const backlogItems = sqliteTable('backlog_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  backlogId: text('backlog_id').notNull().unique(),      // 业务 ID: "BL-042"
  title: text('title').notNull(),
  description: text('description'),
  domainId: integer('domain_id').references(() => domains.id),
  priority: text('priority').default('P2'),
  source: text('source'),                                // 来源描述
  sourceContext: text('source_context'),
  estimatedScope: text('estimated_scope'),               // small, medium, large
  tags: text('tags', { mode: 'json' }).$type<string[]>().default([]),
  status: text('status').notNull().default('pool'),      // pool, scheduled, cancelled
  scheduledTaskId: integer('scheduled_task_id').references(() => tasks.id),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

export const goals = sqliteTable('goals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description'),
  targetDate: text('target_date'),
  status: text('status').notNull().default('active'),    // active, achieved, cancelled
  setBy: text('set_by'),
  overallProgress: integer('overall_progress').default(0),
  health: text('health').default('green'),               // green, yellow, red
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

export const objectives = sqliteTable('objectives', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  goalId: integer('goal_id').notNull().references(() => goals.id),
  title: text('title').notNull(),
  weight: real('weight').notNull().default(1.0),
  progress: integer('progress').default(0),
  status: text('status').notNull().default('not-started'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const objectiveTaskLinks = sqliteTable('objective_task_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  objectiveId: integer('objective_id').notNull().references(() => objectives.id),
  taskId: integer('task_id').notNull().references(() => tasks.id),
});
```

### 3.3 任务 ID 生成规则

每个业务板块有一个 `task_prefix`（如用户系统 = "U"），任务 ID 格式为 `{prefix}-{3位序号}`：

```
U-001, U-002, ..., U-999
P-001, P-002, ...
T-001, ...
```

需求池 ID 统一使用 `BL-{3位序号}`：`BL-001, BL-002, ...`

ID 生成逻辑：查询该 prefix 下的最大序号 + 1。

---

## 四、MCP Server 设计

### 4.1 传输层

使用 SSE (Server-Sent Events) 传输，支持远程连接：

```
客户端 (Cursor / OpenClaw)
    │
    │  POST /mcp/messages     →  发送请求
    │  GET  /mcp/sse          ←  接收响应流
    │
    ▼
ClawPM MCP Server (Fastify 集成)
```

MCP 端点挂载在 Fastify 的 `/mcp` 路径下，与 REST API (`/api`) 共用同一个 Fastify 实例和端口。

### 4.2 认证

MCP 和 API 统一使用 Bearer Token 认证：

```
Authorization: Bearer <CLAWPM_API_TOKEN>
```

Token 在 `.env` 或环境变量中配置。

### 4.3 MCP 工具注册

```typescript
// server/src/mcp/tools/task-tools.ts (示意)

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerTaskTools(mcp: McpServer) {

  mcp.tool(
    'create_task',
    '创建新任务。Agent 开发中发现新需求或 OpenClaw 拆解需求时调用。',
    {
      title: z.string().describe('任务标题'),
      description: z.string().optional().describe('任务描述'),
      domain: z.string().optional().describe('业务板块名称'),
      priority: z.enum(['P0', 'P1', 'P2', 'P3']).optional().describe('优先级'),
      milestone: z.string().optional().describe('所属里程碑名称'),
      owner: z.string().optional().describe('负责人/Agent 标识'),
      due_date: z.string().optional().describe('截止日期 YYYY-MM-DD'),
      parent_task_id: z.string().optional().describe('父任务 ID'),
      tags: z.array(z.string()).optional().describe('标签'),
    },
    async (params) => {
      const task = await taskService.create(params);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(task, null, 2),
        }],
      };
    }
  );

  mcp.tool(
    'update_progress',
    'Agent 完成阶段性工作后上报进度。会自动记录进度历史。',
    {
      task_id: z.string().describe('任务业务 ID，如 "U-042"'),
      progress: z.number().min(0).max(100).describe('完成百分比'),
      summary: z.string().optional().describe('本次进展摘要'),
    },
    async (params) => {
      const task = await taskService.updateProgress(
        params.task_id, params.progress, params.summary
      );
      return {
        content: [{
          type: 'text',
          text: `任务 ${params.task_id} 进度已更新为 ${params.progress}%`,
        }],
      };
    }
  );

  mcp.tool(
    'get_my_tasks',
    '获取分配给指定 owner 的所有任务。Agent 启动时调用，了解今天该做什么。',
    {
      owner: z.string().describe('负责人/Agent 标识'),
      status: z.enum(['planned', 'active', 'review', 'blocked'])
        .optional().describe('按状态筛选'),
    },
    async (params) => {
      const tasks = await taskService.listByOwner(params.owner, params.status);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(tasks, null, 2),
        }],
      };
    }
  );

  mcp.tool(
    'request_next_task',
    'Agent 完成当前任务后，请求推荐下一个应做的任务。按优先级和依赖关系排序。',
    {
      owner: z.string().optional().describe('负责人，可选'),
      domain: z.string().optional().describe('偏好的业务板块，可选'),
    },
    async (params) => {
      const next = await taskService.recommendNext(params.owner, params.domain);
      return {
        content: [{
          type: 'text',
          text: next
            ? JSON.stringify(next, null, 2)
            : '当前没有待领取的任务',
        }],
      };
    }
  );

  // ... complete_task, report_blocker, add_task_note, list_tasks, get_task
}
```

### 4.4 推荐算法 (request_next_task)

```
优先级排序规则：
1. 依赖已就绪的任务优先（上游全部 done）
2. P0 > P1 > P2 > P3
3. 截止日期近的优先
4. 同等条件下，偏好 owner 已有的 domain
5. 排除已有 owner 且不是当前请求者的任务
```

---

## 五、REST API 设计

### 5.1 基础约定

- 基础路径: `/api/v1`
- 认证: `Authorization: Bearer <token>`
- 响应格式: JSON
- 分页: `?page=1&limit=20`
- 排序: `?sort=created_at&order=desc`

### 5.2 API 端点

#### 任务

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/v1/tasks` | 创建任务 |
| GET | `/api/v1/tasks` | 列出任务（支持筛选排序分页） |
| GET | `/api/v1/tasks/:taskId` | 获取任务详情 |
| PATCH | `/api/v1/tasks/:taskId` | 更新任务 |
| POST | `/api/v1/tasks/:taskId/progress` | 上报进度 |
| POST | `/api/v1/tasks/:taskId/notes` | 添加备注 |
| GET | `/api/v1/tasks/:taskId/history` | 获取进度历史 |

#### 需求池

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/v1/backlog` | 创建需求池条目 |
| GET | `/api/v1/backlog` | 列出需求池 |
| PATCH | `/api/v1/backlog/:backlogId` | 更新条目 |
| POST | `/api/v1/backlog/:backlogId/schedule` | 排期（转为任务） |

#### 目标

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/v1/goals` | 创建目标 |
| GET | `/api/v1/goals` | 列出目标 |
| GET | `/api/v1/goals/:goalId` | 获取目标详情（含进度） |
| PATCH | `/api/v1/goals/:goalId` | 更新目标 |
| POST | `/api/v1/goals/:goalId/link-task` | 关联任务到 KR |

#### 里程碑

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/v1/milestones` | 创建里程碑 |
| GET | `/api/v1/milestones` | 列出里程碑 |
| GET | `/api/v1/milestones/:id` | 获取里程碑详情 |
| PATCH | `/api/v1/milestones/:id` | 更新里程碑 |

#### 业务板块

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/v1/domains` | 创建业务板块 |
| GET | `/api/v1/domains` | 列出业务板块 |

#### 仪表盘 / 聚合

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/v1/dashboard/overview` | 项目整体状态 |
| GET | `/api/v1/dashboard/risks` | 风险清单 |
| GET | `/api/v1/dashboard/resources` | 资源分布 |
| GET | `/api/v1/dashboard/milestones` | 各里程碑状态 |

---

## 六、服务层设计

### 6.1 TaskService

```typescript
class TaskService {
  async create(params: CreateTaskParams): Promise<Task>;
  async getById(taskId: string): Promise<Task | null>;
  async update(taskId: string, params: UpdateTaskParams): Promise<Task>;
  async updateProgress(taskId: string, progress: number, summary?: string): Promise<Task>;
  async complete(taskId: string, summary?: string): Promise<Task>;
  async reportBlocker(taskId: string, blocker: string): Promise<Task>;
  async addNote(taskId: string, content: string, author?: string): Promise<TaskNote>;
  async list(filters: TaskFilters): Promise<PaginatedResult<Task>>;
  async listByOwner(owner: string, status?: string): Promise<Task[]>;
  async recommendNext(owner?: string, domain?: string): Promise<Task | null>;
  async generateTaskId(domainId: number): Promise<string>;
}
```

### 6.2 BacklogService

```typescript
class BacklogService {
  async create(params: CreateBacklogParams): Promise<BacklogItem>;
  async list(filters: BacklogFilters): Promise<PaginatedResult<BacklogItem>>;
  async update(backlogId: string, params: UpdateBacklogParams): Promise<BacklogItem>;
  async schedule(backlogId: string, params: ScheduleParams): Promise<Task>;
    // 将需求从池中移出，创建对应 task，标记 backlog 为 scheduled
}
```

### 6.3 GoalService

```typescript
class GoalService {
  async create(params: CreateGoalParams): Promise<Goal>;
  async getById(goalId: number): Promise<GoalWithProgress>;
  async update(goalId: number, params: UpdateGoalParams): Promise<Goal>;
  async linkTask(goalId: number, objectiveId: number, taskId: string): Promise<void>;
  async recalculateProgress(goalId: number): Promise<GoalWithProgress>;
    // 基于关联任务的进度，加权计算目标达成率
}
```

### 6.4 RiskService

```typescript
class RiskService {
  async analyze(): Promise<RiskReport> {
    // 1. 查找逾期任务: due_date < today && status != done
    // 2. 查找预警任务: due_date - today <= 3 && progress < 80
    // 3. 查找停滞任务: updated_at 超过 N 天且 status=active
    // 4. 查找阻塞任务: blocker 字段非空
    // 5. 计算每个任务的健康度
    // 6. 计算项目整体健康度
  }

  calculateHealthScore(task: Task): number {
    // 公式见 PRD 第十节
  }
}
```

---

## 七、部署架构

### 7.1 Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  clawpm:
    build: .
    ports:
      - "${PORT:-3210}:3210"
    volumes:
      - clawpm-data:/app/data        # SQLite 数据持久化
    environment:
      - CLAWPM_PORT=3210
      - CLAWPM_API_TOKEN=${CLAWPM_API_TOKEN}
      - CLAWPM_DB_PATH=/app/data/clawpm.db
    restart: unless-stopped

volumes:
  clawpm-data:
```

### 7.2 Dockerfile

```dockerfile
# 多阶段构建
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/
COPY web/package.json web/
RUN corepack enable && pnpm install --frozen-lockfile

COPY server/ server/
COPY web/ web/
RUN pnpm --filter server build
RUN pnpm --filter web build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/package.json ./server/
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/web/dist ./web/dist

EXPOSE 3210
CMD ["node", "server/dist/index.js"]
```

Fastify 同时提供：
- `/api/*` — REST API
- `/mcp/*` — MCP SSE 端点
- `/*` — 前端静态文件 (web/dist)

全部单进程、单端口、单容器。

### 7.3 客户端 MCP 配置

**Cursor (本地 Agent) 连接 ClawPM：**

```json
// .cursor/mcp.json
{
  "mcpServers": {
    "clawpm": {
      "url": "http://your-server:3210/mcp/sse",
      "headers": {
        "Authorization": "Bearer your-api-token"
      }
    }
  }
}
```

**OpenClaw 连接 ClawPM：**

在 OpenClaw 的 MCP 配置中添加 ClawPM 服务器即可。

---

## 八、前端架构

### 8.1 路由设计

| 路径 | 页面 | 描述 |
|------|------|------|
| `/` | Dashboard | 项目仪表盘 |
| `/board` | KanbanBoard | 看板视图 |
| `/tasks` | TaskList | 任务列表（表格） |
| `/tasks/:taskId` | TaskDetail | 任务详情 |
| `/backlog` | Backlog | 需求池 |
| `/milestones` | Milestones | 里程碑列表 |
| `/milestones/:id` | MilestoneDetail | 里程碑详情 |
| `/goals` | Goals | 目标管理（二期） |

### 8.2 看板设计

```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│  待开始   │ │  进行中   │ │  评审中   │ │  已阻塞   │ │  已完成   │
│ (Planned)│ │ (Active) │ │ (Review) │ │(Blocked) │ │  (Done)  │
├──────────┤ ├──────────┤ ├──────────┤ ├──────────┤ ├──────────┤
│ ┌──────┐ │ │ ┌──────┐ │ │          │ │ ┌──────┐ │ │ ┌──────┐ │
│ │U-008 │ │ │ │U-004 │ │ │          │ │ │P-003 │ │ │ │U-001 │ │
│ │RBAC  │ │ │ │登录   │ │ │          │ │ │退款   │ │ │ │注册   │ │
│ │P0    │ │ │ │78%   │ │ │          │ │ │阻塞🔴 │ │ │ │✅    │ │
│ └──────┘ │ │ └──────┘ │ │          │ │ └──────┘ │ │ └──────┘ │
│ ┌──────┐ │ │ ┌──────┐ │ │          │ │          │ │ ┌──────┐ │
│ │P-005 │ │ │ │U-006 │ │ │          │ │          │ │ │U-002 │ │
│ │支付页 │ │ │ │OAuth │ │ │          │ │          │ │ │注册页 │ │
│ │P1    │ │ │ │30%   │ │ │          │ │          │ │ │✅    │ │
│ └──────┘ │ │ └──────┘ │ │          │ │          │ │ └──────┘ │
└──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
```

### 8.3 仪表盘设计

```
┌────────────────────────────────────────────────────────┐
│  ClawPM Dashboard                                      │
├────────────────────────────────────────────────────────┤
│                                                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │ 总任务    │ │ 进行中    │ │ 逾期      │ │ 健康度    │ │
│  │    28    │ │    12    │ │     2    │ │  72/100  │ │
│  │          │ │          │ │    🔴    │ │    🟡    │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
│                                                        │
│  ┌─────────────────────┐  ┌─────────────────────────┐ │
│  │ 状态分布 (饼图)       │  │ 各板块进度 (柱状图)       │ │
│  │                     │  │                         │ │
│  │   Done 42%          │  │ 用户系统  ████████░░ 80% │ │
│  │   Active 36%        │  │ 支付系统  ████░░░░░░ 40% │ │
│  │   Planned 14%       │  │ UI通用    ██████░░░░ 60% │ │
│  │   Blocked 8%        │  │ 基础设施  ███░░░░░░░ 30% │ │
│  │                     │  │                         │ │
│  └─────────────────────┘  └─────────────────────────┘ │
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │ 最近活动                                          │ │
│  │ 5m ago  U-004 登录模块 进度更新 65% → 78%          │ │
│  │ 1h ago  BL-042 积分系统 录入需求池                  │ │
│  │ 2h ago  P-003 退款流程 报告阻塞                    │ │
│  └──────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

---

## 九、配置管理

### 9.1 环境变量

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `CLAWPM_PORT` | `3210` | 服务端口 |
| `CLAWPM_DB_PATH` | `./data/clawpm.db` | SQLite 数据库路径 |
| `CLAWPM_API_TOKEN` | (必填) | API 认证 Token |
| `CLAWPM_LOG_LEVEL` | `info` | 日志级别 |

### 9.2 初始化

首次启动时自动：
1. 创建 SQLite 数据库文件
2. 执行 schema 迁移
3. 如果 `CLAWPM_SEED=true`，注入示例数据

---

## 十三、人员管理技术设计（v1.3 新增）

### 13.1 数据库

```sql
CREATE TABLE members (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  identifier TEXT NOT NULL UNIQUE,  -- 登录名/Agent ID，也是 tasks.owner 的值
  type       TEXT NOT NULL DEFAULT 'human',  -- 'human' | 'agent'
  color      TEXT NOT NULL DEFAULT '#6366f1',
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

> `tasks.owner` 字段存储 `members.identifier`，两者通过 identifier 关联（软关联，不加外键约束，owner 可以是任意字符串）。

### 13.2 API

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/v1/members` | 列出所有成员，支持 `?type=human\|agent` |
| POST | `/api/v1/members` | 创建成员 |
| GET | `/api/v1/members/:identifier` | 获取成员详情（含任务统计） |
| PATCH | `/api/v1/members/:identifier` | 更新成员信息 |
| DELETE | `/api/v1/members/:identifier` | 删除成员 |

### 13.3 前端路由

| 路径 | 页面 | 描述 |
|------|------|------|
| `/members` | Members | 成员列表 |
| `/members/:identifier` | MemberDetail | 成员详情 |

### 13.4 CreateTaskModal 增强

从文本输入改为成员选择器（Combobox）：
- 显示成员列表（头像+名称+类型图标）
- 支持输入搜索过滤
- 允许输入自定义（不在列表中的 owner）

---

## 十四、甘特图技术设计（v1.3 新增）

### 14.1 技术方案

不引入额外甘特库（避免包体积），使用纯 CSS + SVG 自行实现：

```
时间轴 = CSS Grid，每列 = 1 天（可切换为每列 1 周）
任务条 = position: absolute，left/width 按日期计算
今日线 = 绝对定位的竖线
里程碑 = 菱形图标 + 竖线
```

### 14.2 数据处理

```typescript
// 计算任务条宽度和偏移
function calcBar(task, startDate, dayWidth) {
  const start = task.startDate || task.createdAt.slice(0,10);
  const end   = task.dueDate   || today;
  const left  = diffDays(startDate, start) * dayWidth;
  const width = Math.max(diffDays(start, end), 1) * dayWidth;
  return { left, width };
}
```

### 14.3 前端路由

| 路径 | 页面 |
|------|------|
| `/gantt` | GanttChart |

---

## 十五、需求树增强技术设计（v1.3 新增）

### 15.1 过滤器

新增 query 参数：`milestone`、`status`、`domain`、`owner`

后端 `getTree(filters)` 已支持 `domainName`，需扩展为完整 `TreeFilters`：

```typescript
interface TreeFilters {
  domain?: string;
  milestone?: string;
  status?: string;
  owner?: string;
}
```

过滤策略：过滤命中的节点始终显示，其祖先节点也显示（保持树路径完整），不命中且无命中子孙的节点隐藏。

### 15.2 思维导图视图

**依赖库：** `@xyflow/react` v12（原 react-flow）

```bash
pnpm --filter web add @xyflow/react
```

**节点数据结构（XYFlow Node）：**
```typescript
{
  id: task.taskId,
  type: 'taskNode',        // 自定义节点类型
  position: { x, y },     // 自动布局（dagre）或用户拖拽后保存
  data: { task },
}
```

**边数据结构（XYFlow Edge）：**
```typescript
{
  id: `${parent.taskId}->${child.taskId}`,
  source: parent.taskId,
  target: child.taskId,
  type: 'smoothstep',
}
```

**自动布局：** 使用 `dagre` 库计算初始位置（从根向下展开）。节点拖拽后位置保存到 localStorage（不同步到服务端，仅本地缓存）。

**自定义节点（TaskNode）：**
- 显示 type 图标 + 标题 + 状态圆点 + 进度条
- 右上角 `+` 按钮添加子节点
- 右键菜单：跳转详情 / 添加子节点 / 删除节点

---

## 十二、系统自洽性设计（v1.2 新增）

### 12.1 问题背景

v1.1 引入了 `type`（epic/story/task/subtask）和 `parent_task_id` 字段，但仅在需求树页面和任务详情页实现了支持，其余页面和接口存在 15 处不自洽。

### 12.2 需要修复的层级清单

| 层级 | 组件/接口 | 问题 | 修复方案 |
|------|-----------|------|---------|
| 后端服务 | `TaskService.update` | 不支持修改 `type` / `parent_task_id` | `UpdateTaskParams` 加两字段，update 方法处理 |
| 后端服务 | `TaskService.list` | `TaskFilters` 无 `type` 筛选 | 加 `type?` 字段，list 方法加 where 条件 |
| 后端服务 | `BacklogService.schedule` | 排期转任务不设置 `type` | 默认设为 `task` |
| 后端路由 | `GET /api/v1/tasks` | 不传递 `type` query 参数 | routes.ts 透传 `q.type` |
| MCP 工具 | `create_task` | 无 `type` / `parent_task_id` 参数 | 加入 schema 和处理逻辑 |
| MCP 工具 | `update_task` | 无 `type` / `parent_task_id` 参数 | 加入 schema 和处理逻辑 |
| 前端 | `TaskList.tsx` | 创建弹窗无 type/parent 字段，列表无 type 列，无 type 筛选 | 统一创建弹窗，加 type 列和筛选 |
| 前端 | `KanbanBoard.tsx` | 卡片不显示 type，创建入口不支持 type | 卡片加 type 标签，复用统一创建弹窗 |

### 12.3 统一任务创建弹窗规范

所有创建任务的入口（需求树、看板、任务列表）必须支持相同的字段：

```
必填: title
选填: type (epic/story/task/subtask, 默认 task)
      parent_task_id (父节点 task_id)
      priority (P0-P3, 默认 P2)
      domain
      milestone
      owner
      due_date
      description
```

> **规则**：若指定了 `parent_task_id`，`type` 可由父节点类型自动推导（epic→story→task→subtask）。

### 12.4 TaskService 更新后接口

```typescript
interface UpdateTaskParams {
  title?: string;
  description?: string;
  type?: string;              // 新增
  parent_task_id?: string;    // 新增（传 taskId 字符串）
  status?: string;
  priority?: string;
  owner?: string;
  due_date?: string;
  milestone?: string;
  blocker?: string;
  tags?: string[];
}

interface TaskFilters {
  status?: string;
  domain?: string;
  milestone?: string;
  owner?: string;
  priority?: string;
  type?: string;              // 新增
  parentId?: number;          // 新增（可选，筛选某父节点的子任务）
}
```

---

## 十一、需求树技术设计（v1.1 新增）

### 11.1 数据库变更

**tasks 表新增 `type` 字段：**

```sql
ALTER TABLE tasks ADD COLUMN type TEXT NOT NULL DEFAULT 'task';
-- 取值: 'epic' | 'story' | 'task' | 'subtask'
```

**父子关系：** 沿用已有的 `parent_task_id` 字段（引用 `tasks.id`），无需新增表。

**层级约束（应用层校验，非数据库约束）：**

| 父类型 | 允许的子类型 |
|--------|------------|
| `null` | `epic` |
| `epic` | `story` |
| `story` | `task` |
| `task` | `subtask` |
| `subtask` | — |

### 11.2 API 设计

**新增接口：**

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/v1/tasks/tree` | 返回完整需求树（所有根节点及其后代） |
| GET | `/api/v1/tasks/:taskId/children` | 返回指定节点的直接子节点 |

**`GET /api/v1/tasks/tree` 响应结构：**

```json
[
  {
    "id": 1,
    "taskId": "U-001",
    "title": "用户系统重构",
    "type": "epic",
    "parentTaskId": null,
    "status": "active",
    "progress": 65,
    "priority": "P0",
    "domain": { "id": 1, "name": "用户系统", "color": "#6366f1" },
    "children": [
      {
        "id": 2,
        "taskId": "U-002",
        "title": "用户注册流程优化",
        "type": "story",
        "parentTaskId": 1,
        "progress": 80,
        "children": [...]
      }
    ]
  }
]
```

**`POST /api/v1/tasks` 参数新增：**

```json
{
  "title": "实现注册API",
  "type": "task",
  "parent_task_id": "U-002"
}
```

> `type` 未传时：有父节点则根据父节点类型自动推导，无父节点则默认 `epic`。

### 11.3 服务层设计

**TaskService 新增方法：**

```typescript
// 获取完整树（所有根节点递归构建）
getTree(domainName?: string): TreeNode[]

// 内部：递归构建子树
_buildSubtree(parentId: number, allTasks: Task[]): TreeNode[]

// 自动推导子节点类型
_inferChildType(parentType: string): string
// epic → story, story → task, task → subtask, subtask → subtask

// 更新 create：支持 type 和 parent_task_id
create(params: CreateTaskParams): Task
// 新增参数: type?: string, parent_task_id?: string (taskId 格式)
```

### 11.4 前端设计

**新增页面：** `web/src/pages/Requirements.tsx`

**路由：** `/requirements`

**组件结构：**

```
Requirements
├── TreeToolbar（全展开/收起、Domain 筛选、新建 Epic）
└── TreeNode（递归组件）
    ├── NodeRow（展开箭头、类型图标、标题、徽章、进度、操作）
    └── TreeNode[]（子节点，递归）
```

**TreeNode 组件核心逻辑：**

```tsx
// 每个节点维护自己的展开状态
const [expanded, setExpanded] = useState(depth < 2); // 默认展开前两层

// 类型配置
const TYPE_CONFIG = {
  epic:    { icon: '◈', label: '史诗',   color: 'purple', indent: 0  },
  story:   { icon: '◎', label: '用户故事', color: 'blue',  indent: 20 },
  task:    { icon: '◻', label: '任务',   color: 'green', indent: 40 },
  subtask: { icon: '○', label: '子任务',  color: 'gray',  indent: 60 },
};

// 创建子节点时根据父类型自动确定子类型
const childType = { epic: 'story', story: 'task', task: 'subtask' }[type];
```

**新增导航项：**

```
{ to: '/requirements', label: '需求树', icon: '◈' }
```

### 11.5 API Client 新增

```typescript
getTaskTree: (domain?: string) =>
  request<TreeNode[]>(`/tasks/tree${domain ? '?domain=' + domain : ''}`),
getTaskChildren: (taskId: string) =>
  request<any[]>(`/tasks/${taskId}/children`),
```

---

## 十、安全设计

| 维度 | 措施 |
|------|------|
| **认证** | 所有 API 和 MCP 请求需 Bearer Token |
| **CORS** | 可配置允许的前端域名 |
| **输入校验** | Zod schema 校验所有输入 |
| **SQL 注入** | Drizzle ORM 参数化查询 |
| **速率限制** | Fastify rate-limit 插件 |
| **数据备份** | SQLite 文件可直接 cp 备份 |
