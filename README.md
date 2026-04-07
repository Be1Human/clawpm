<div align="center">
  <img src="./web/src/assets/logo.png" alt="ClawPM Logo" width="100" />
  <h1>ClawPM</h1>
  <p><strong>Self-hosted project management hub with MCP integration for AI agents.</strong></p>

  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
  [![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen)](https://nodejs.org/)
  [![pnpm](https://img.shields.io/badge/pnpm-monorepo-orange)](https://pnpm.io/)
  [![MCP](https://img.shields.io/badge/MCP-59%20tools-purple)](https://modelcontextprotocol.io/)
  [![CI](https://github.com/your-org/clawpm/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/clawpm/actions/workflows/ci.yml)
</div>

---

ClawPM 是一个可自托管的轻量级项目管理中枢。它通过 [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) 与 AI Agent 双向通信——Agent 从中领取任务、上报进度；决策者通过 AI 助手或 Web 界面管理需求和目标。

```
┌────────────────┐     ┌──────────────┐     ┌───────────────┐
│  Cursor Agent  │     │   ClawPM     │     │   OpenClaw    │
│  (本地开发)     │◄───►│   Server     │◄───►│  (AI 管家)     │
│                │ MCP │  Web UI+API  │ MCP │  飞书集成      │
└────────────────┘     │  + MCP Server│     └───────────────┘
                       └──────┬───────┘
                              │ Web
                       ┌──────┴───────┐
                       │  决策者/PM    │
                       │  (浏览器)     │
                       └──────────────┘
```

## Features

- **思维导图驱动** — 一切皆节点，需求管理如 XMind 般丝滑，Tab/Enter 内联创建
- **多项目隔离** — 项目间数据完全隔离，一键切换
- **MCP Server（54 个工具）** — AI Agent 通过 MCP 协议领取任务、上报进度、创建需求、管理迭代
- **Web Dashboard** — 思维导图、看板、任务列表、甘特图、需求池、项目仪表盘
- **个人工作台** — "我的需求子树"三视图（列表/思维导图/甘特图），账号登录后自动恢复成员上下文
- **Intake 收件箱** — 外部无需登录即可提交 Bug/功能建议/反馈，项目成员审核后一键转正式节点
- **迭代管理** — 带时间盒约束的 Sprint 管理，关联任务，完成率跟踪
- **节点附件** — Markdown 文档、外部链接、TAPD 关联，节点即信息中枢
- **节点权限** — Owner 可授权 edit/view 权限，细粒度访问控制
- **站内通知** — 任务指派/状态变更/新评论自动通知
- **Cmd+K 命令面板** — 全局快捷搜索和快速操作
- **批量操作** — 多选任务后批量修改状态/负责人/优先级
- **归档机制** — 安全的软删除，支持恢复
- **需求池 + 目标管理** — OKR 式目标拆解，需求收集排期
- **风险分析** — 逾期检测、停滞预警、健康度评分
- **轻量部署** — SQLite + Docker，单容器运行

## 常用文档

- [Mac 本地开发启动](./docs/local-development-macos.md)
- [服务器运维与服务巡检](./docs/server-operations.md)
- [Docker 部署方案](./docs/deployment-docker.md)
- [MCP Skills — AI Agent 任务拆解与管理指南](./docs/mcp-skills.md)

## 新电脑快速部署（3 步搞定）

### 前置要求

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/)（或运行 `corepack enable` 自动启用）

### 步骤

```bash
# 1. 克隆项目
git clone https://github.com/your-org/clawpm.git
cd clawpm

# 2. 安装依赖
pnpm install
```

**Mac / Linux：**

```bash
# 3. 给脚本添加执行权限并启动
chmod +x start.sh
./start.sh
```

`start.sh` 会自动：

- 优先使用本机 `pnpm`，否则回退到 `corepack pnpm`
- 如果存在 `.env`，自动加载本地环境变量
- 首次运行时自动安装依赖
- 同时启动后端和前端

Mac 详细说明见 [docs/local-development-macos.md](./docs/local-development-macos.md)。

**Windows：**

```bat
# 3. 双击 start.bat 即可，或在命令行执行
start.bat
```

启动后两个服务同时运行：

| 服务 | 地址 |
|------|------|
| Web 前端 | http://localhost:5173 |
| 后端 API | http://localhost:3210 |
| MCP SSE | http://localhost:3210/mcp/sse |
| 健康检查 | http://localhost:3210/health |

默认兼容 Token 为 `dev-token`，生产环境请在 `.env` 中修改 `CLAWPM_API_TOKEN`。新版本同时支持：

- 人类用户：通过账号登录获取会话 token
- Agent / OpenClaw：通过专属 Agent token 接入 MCP

> **Mac 提示**：按 `Ctrl+C` 可同时停止后端和前端两个进程。

### Docker 部署（可选）

```bash
cp .env.example .env
# 编辑 .env，设置 CLAWPM_API_TOKEN
docker-compose up -d
# 访问 http://localhost:3210
```

## MCP 连接配置

ClawPM 同时支持 **stdio** 和 **SSE** 两种 MCP 传输方式。

### 人类用户登录

首次进入 Web 界面时，使用 `/onboarding` 页面完成：

1. 注册账号或直接登录
2. 自动绑定默认成员，或在引导页中绑定/创建成员
3. 进入个人工作台

后续浏览器会自动恢复登录态与当前成员上下文。

### CodeBuddy（推荐 stdio 模式）

编辑用户级配置文件 `~/.codebuddy/mcp.json`（Windows: `C:\Users\<用户名>\.codebuddy\mcp.json`），添加：

```json
{
  "mcpServers": {
    "clawpm": {
      "command": "npx",
      "args": ["tsx", "<项目绝对路径>/server/src/mcp/stdio.ts"],
      "transportType": "stdio",
      "env": {
        "CLAWPM_AGENT_TOKEN": "<在成员页生成的 Agent Token>"
      },
      "disabled": false
    }
  }
}
```

> **注意**：`args` 中的路径需要替换为你本机的项目绝对路径，如 `e:\\clawpm\\server\\src\\mcp\\stdio.ts`。
>
> 修改后**重启 CodeBuddy** 生效。

**兼容模式**：如果你还没有升级到 Agent token，也可以继续使用旧身份绑定方式：

```json
{
  "mcpServers": {
    "clawpm": {
      "command": "npx",
      "args": ["tsx", "<路径>/server/src/mcp/stdio.ts", "--agent-id=cursor-agent"],
      "transportType": "stdio"
    }
  }
}
```

或使用环境变量 `CLAWPM_AGENT_ID=cursor-agent`。但推荐优先使用 `CLAWPM_AGENT_TOKEN`，这样 MCP 会自动识别绑定后的 Agent 身份。

### Cursor Agent（SSE 模式）

在成员管理页为某个 Agent 点击“OpenClaw 接入配置”后，会直接生成专属 SSE 地址。`.cursor/mcp.json` 可配置为：

```json
{
  "mcpServers": {
    "clawpm": {
      "type": "sse",
      "url": "http://localhost:3210/mcp/sse?token=<agent-token>"
    }
  }
}
```

> SSE 模式需要先启动 ClawPM 服务（Mac: `./start.sh`，Windows: `start.bat`，或直接 `pnpm dev`）。
>
> 推荐不要再把全局 `dev-token` 暴露给 MCP 客户端，而是为每个 Agent 单独生成 token。

### 其他 MCP 客户端

SSE 端点支持两种认证方式：
- **Header**：`Authorization: Bearer <agent-token>`
- **URL 参数**：`?token=<agent-token>`

其中：
- 人类 Web 登录使用账号会话 token
- Agent / OpenClaw MCP 连接使用专属 Agent token
- `CLAWPM_API_TOKEN` 仅作为兼容与开发模式兜底

## MCP 工具列表（59 个）

> 所有工具均支持可选的 `project` 参数（项目 slug），不传时使用默认项目。

### 项目管理
| Tool | 描述 |
|------|------|
| `list_projects` | 列出所有项目 |
| `create_project` | 创建新项目 |
| `get_project` | 获取项目详情 |
| `update_project` | 更新项目信息 |
| `delete_project` | 删除项目（默认项目不可删除） |

### 任务管理
| Tool | 描述 |
|------|------|
| `create_task` | 创建需求节点（只需 title，其余可选） |
| `get_task` | 获取任务详情 |
| `get_my_tasks` | 获取我的任务列表（owner 可选，自动关联 Agent 身份） |
| `get_my_task_tree` | 获取我的需求子树（带祖先路径上下文） |
| `list_tasks` | 查询节点列表（支持按状态/板块/里程碑/负责人筛选） |
| `update_task` | 更新节点信息 |
| `delete_task` | 删除任务及其所有子任务 |
| `update_progress` | Agent 上报任务进度 |
| `complete_task` | 标记任务完成 |
| `report_blocker` | 报告任务阻塞 |
| `add_task_note` | 给任务添加备注 |
| `request_next_task` | 请求推荐下一个任务 |
| `batch_update_tasks` | 批量更新任务（状态/负责人/优先级） |

### 需求池
| Tool | 描述 |
|------|------|
| `create_backlog_item` | 录入需求池 |
| `list_backlog` | 查看需求池 |
| `schedule_backlog_item` | 将需求排期并创建任务 |

### 附件管理
| Tool | 描述 |
|------|------|
| `add_task_attachment` | 为节点添加附件（文档/链接/TAPD 关联） |
| `list_task_attachments` | 查询节点的附件列表 |
| `update_task_attachment` | 更新附件内容 |
| `delete_task_attachment` | 删除附件 |

### 权限管理
| Tool | 描述 |
|------|------|
| `grant_permission` | 为节点授予权限（仅 Owner 可操作） |
| `revoke_permission` | 撤销节点权限 |
| `list_permissions` | 查看节点的权限列表 |

### 迭代管理
| Tool | 描述 |
|------|------|
| `create_iteration` | 创建迭代（Cycle） |
| `list_iterations` | 查询迭代列表 |
| `get_iteration` | 获取迭代详情（含任务列表和统计） |
| `update_iteration` | 更新迭代信息 |
| `delete_iteration` | 删除迭代 |
| `add_task_to_iteration` | 将任务添加到迭代 |
| `remove_task_from_iteration` | 将任务从迭代移除 |

### 归档
| Tool | 描述 |
|------|------|
| `archive_task` | 归档任务 |
| `unarchive_task` | 恢复已归档任务 |
| `list_archived_tasks` | 查看已归档任务列表 |

### 通知
| Tool | 描述 |
|------|------|
| `list_notifications` | 获取通知列表 |
| `get_unread_notification_count` | 获取未读通知数量 |
| `mark_notification_read` | 标记通知为已读 |
| `mark_all_notifications_read` | 标记所有通知为已读 |

### Intake 收件箱
| Tool | 描述 |
|------|------|
| `submit_intake` | 提交收件箱条目（Bug 报告/功能建议/一般反馈） |
| `list_intake` | 查看收件箱条目列表（支持按状态/类别筛选） |
| `review_intake` | 审核收件箱条目（接受/拒绝/暂缓/标记重复） |

### 项目概览
| Tool | 描述 |
|------|------|
| `get_project_status` | 获取项目整体状态概览 |
| `get_risk_report` | 获取风险报告（逾期/阻塞/停滞） |
| `get_resource_allocation` | 获取资源投入分布 |

### 配置管理
| Tool | 描述 |
|------|------|
| `create_domain` | 创建业务板块 |
| `list_domains` | 列出所有业务板块 |
| `create_milestone` | 创建里程碑 |
| `list_milestones` | 列出所有里程碑 |
| `create_goal` | 创建目标（OKR） |

### 成员管理
| Tool | 描述 |
|------|------|
| `list_members` | 列出项目成员（含擅长领域、任务统计 taskCount/activeCount） |
| `get_member` | 获取单个成员详情（含擅长领域和任务负载） |
| `create_member` | 创建项目成员（人类或 AI Agent） |
| `update_member` | 更新成员信息（名称、描述/擅长领域、类型等） |
| `delete_member` | 删除成员 |

### 身份
| Tool | 描述 |
|------|------|
| `whoami` | 查询当前 Agent 绑定的身份信息 |

## Intake 收件箱使用指南

Intake 收件箱是 ClawPM 的外部反馈入口，让非项目成员也能提交 Bug、功能建议或一般反馈。

### 提交反馈（无需登录）

**Web 方式**：访问 `/intake/submit`，填写表单即可提交。

**MCP 方式**（AI Agent）：
```
submit_intake(
  title: "登录页点击按钮无反应",
  description: "## 复现步骤\n1. 打开登录页\n2. 点击登录\n3. 无反应",
  category: "bug",
  submitter: "张三",
  priority: "P1"
)
```

**REST API**（`POST /api/v1/intake`，无需 Token）：
```json
{
  "title": "登录页点击按钮无反应",
  "description": "复现步骤...",
  "category": "bug",
  "submitter": "张三",
  "priority": "P1",
  "project": "letsgo"
}
```

提交成功后返回 Intake ID（如 `IN-042`）。

### 审核管理（项目成员）

**Web 方式**：侧边栏点击"收件箱"进入管理列表，展开条目后可执行审核操作。

**审核动作**：

| 动作 | 说明 | 后续 |
|------|------|------|
| 接受 | 认可提交，转为正式节点 | 自动创建 Task，可指定父节点/负责人/优先级 |
| 拒绝 | 不予采纳 | 需填写拒绝理由 |
| 暂缓 | 有价值但暂不处理 | 后续可重新打开 |
| 标记重复 | 与已有节点重复 | — |

**MCP 方式**：
```
review_intake(
  intake_id: "IN-042",
  action: "accept",
  review_note: "确认是 Bug",
  parent_task_id: "FE-1",
  owner: "frontend-agent",
  priority: "P1"
)
```

### 典型场景

1. **测试同学提 Bug**：打开 `/intake/submit` → 选 Bug 报告 → 填写标题和复现步骤 → 提交
2. **用户反馈功能建议**：打开提交页 → 选功能建议 → 描述需求 → PM 审核后暂缓或接受
3. **AI Agent 自动提交**：OpenClaw 从飞书群消息识别 Bug → 通过 MCP `submit_intake` 提交 → PM 一键审核

## REST API 概览

所有 API 基础路径为 `/api/v1`，需 `Authorization: Bearer <token>` 认证（Intake 提交接口除外）。

| 模块 | 端点 | 说明 |
|------|------|------|
| **项目** | `GET/POST /projects` | 项目 CRUD |
| **任务** | `GET/POST /tasks`, `PATCH/DELETE /tasks/:id` | 节点 CRUD + 树/筛选 |
| **批量** | `PATCH /tasks/batch` | 批量更新状态/负责人/优先级 |
| **归档** | `POST /tasks/:id/archive`, `GET /tasks/archived` | 任务归档与恢复 |
| **附件** | `GET/POST /tasks/:id/attachments` | 节点附件管理 |
| **权限** | `GET/POST/DELETE /tasks/:id/permissions` | 节点权限管理 |
| **迭代** | `GET/POST /iterations`, `POST /iterations/:id/tasks` | 迭代 CRUD + 任务关联 |
| **通知** | `GET /notifications`, `PATCH /notifications/:id/read` | 站内通知 |
| **Intake** | `POST /intake`（公开）, `GET /intake`, `POST /intake/:id/review` | 收件箱提交与审核 |
| **需求池** | `GET/POST /backlog` | 需求收集排期 |
| **概览** | `GET /dashboard/*`, `GET /gantt` | 仪表盘与甘特图 |
| **配置** | `GET/POST /members`, `/domains`, `/milestones`, `/goals` | 成员（含擅长领域/任务统计）/板块/里程碑/目标 |

## Tech Stack

- **Backend**: Node.js + TypeScript + Fastify
- **Database**: SQLite (Drizzle ORM)
- **MCP**: @modelcontextprotocol/sdk（支持 stdio + SSE 双模式）
- **Frontend**: React + Vite + Tailwind CSS + ReactFlow
- **Charts**: Recharts
- **Deploy**: Docker / start.sh（Mac/Linux）/ start.bat（Windows）一键启动

## 项目结构

```
clawpm/
├── server/src/
│   ├── index.ts              # 服务入口（Fastify + SSE MCP）
│   ├── config.ts             # 配置（端口/Token/数据库路径）
│   ├── mcp/
│   │   ├── server.ts         # MCP 工具定义（59 个工具）
│   │   └── stdio.ts          # MCP stdio 入口（CodeBuddy 用）
│   ├── api/routes.ts         # REST API 路由
│   ├── db/
│   │   ├── schema.ts         # Drizzle schema 定义
│   │   └── connection.ts     # SQLite 连接 + 自动迁移
│   └── services/
│       ├── task-service.ts       # 节点业务逻辑
│       ├── project-service.ts    # 项目管理
│       ├── intake-service.ts     # Intake 收件箱
│       ├── iteration-service.ts  # 迭代管理
│       ├── notification-service.ts # 站内通知
│       ├── attachment-service.ts # 附件管理
│       ├── permission-service.ts # 权限控制（未独立文件时在 task-service 中）
│       ├── backlog-service.ts    # 需求池
│       ├── goal-service.ts       # 目标管理
│       ├── risk-service.ts       # 风险分析
│       └── id-generator.ts      # ID 生成器
├── web/src/
│   ├── App.tsx               # 路由配置
│   ├── api/client.ts         # API 客户端
│   ├── components/
│   │   ├── Layout.tsx            # 侧边栏 + 导航
│   │   ├── CommandPalette.tsx    # Cmd+K 命令面板
│   │   ├── FilterBar.tsx         # 统一筛选栏
│   │   ├── BatchActionBar.tsx    # 批量操作栏
│   │   ├── NotificationPanel.tsx # 通知面板
│   │   └── ...
│   └── pages/
│       ├── Dashboard.tsx         # 仪表盘
│       ├── MindMap.tsx           # 思维导图（核心视图）
│       ├── KanbanBoard.tsx       # 看板
│       ├── TaskList.tsx          # 任务列表
│       ├── TaskDetail.tsx        # 任务详情
│       ├── MyTasks.tsx           # 个人工作台（三视图）
│       ├── IntakeSubmit.tsx      # Intake 公开提交页
│       ├── IntakeList.tsx        # Intake 管理列表
│       ├── Iterations.tsx        # 迭代列表
│       ├── GanttChart.tsx        # 甘特图
│       ├── Archive.tsx           # 归档箱
│       └── ...
├── start.sh                  # Mac/Linux 一键启动
├── start.bat                 # Windows 一键启动
├── docker-compose.yml        # Docker 部署
└── docs/
    ├── PRD.md                # 产品需求文档
    └── TechDesign.md         # 技术设计文档
```

## 环境变量

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `CLAWPM_PORT` | `3210` | 服务端口 |
| `CLAWPM_DB_PATH` | `./data/clawpm.db` | SQLite 数据库路径 |
| `CLAWPM_API_TOKEN` | `dev-token` | 兼容模式与开发态全局 Token，生产环境建议仅作为管理员/迁移用途 |
| `CLAWPM_LOG_LEVEL` | `info` | 日志级别 |
| `CLAWPM_AGENT_TOKEN` | — | MCP stdio 模式下的 Agent 专属 Token，推荐使用 |
| `CLAWPM_AGENT_ID` | — | 旧版 MCP stdio Agent 身份标识，保留兼容 |

## Documentation

- [产品需求文档 (PRD)](./docs/PRD.md)
- [技术设计文档](./docs/TechDesign.md)

## Contributing

欢迎贡献！请先阅读以下内容：

1. **Fork** 本仓库，基于 `main` 分支新建功能分支
2. 遵循现有代码风格（TypeScript + ESLint）
3. 提交 PR 时请填写 PR 模板
4. 提交 Bug 或功能建议请使用 [Issue 模板](https://github.com/your-org/clawpm/issues/new/choose)

## Changelog

查看 [Releases](https://github.com/your-org/clawpm/releases) 了解版本历史。

## License

[MIT](./LICENSE) © 2026 ClawPM Contributors
