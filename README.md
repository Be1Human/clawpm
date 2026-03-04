# ClawPM

**Self-hosted project management hub with MCP integration for AI agents.**

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

- **MCP Server** — AI Agent 通过 MCP 协议领取任务、上报进度、创建需求
- **Web Dashboard** — 看板、任务列表、需求池、项目仪表盘
- **需求池管理** — 需求收集、分类、排期、生命周期流转
- **目标管理** — OKR 式目标拆解、关联任务、进度追踪
- **风险分析** — 逾期检测、停滞预警、健康度评分
- **轻量部署** — SQLite + Docker，单容器运行

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

# 3. 启动（Windows 双击 start.bat 即可，或手动执行）
start.bat
```

启动后自动打开两个窗口：

| 服务 | 地址 |
|------|------|
| Web 前端 | http://localhost:5173 |
| 后端 API | http://localhost:3210 |
| MCP SSE | http://localhost:3210/mcp/sse |
| 健康检查 | http://localhost:3210/health |

默认 API Token 为 `dev-token`，生产环境请在 `.env` 中修改 `CLAWPM_API_TOKEN`。

### Docker 部署（可选）

```bash
cp .env.example .env
# 编辑 .env，设置 CLAWPM_API_TOKEN
docker-compose up -d
# 访问 http://localhost:3210
```

## MCP 连接配置

ClawPM 同时支持 **stdio** 和 **SSE** 两种 MCP 传输方式。

### CodeBuddy（推荐 stdio 模式）

编辑用户级配置文件 `~/.codebuddy/mcp.json`（Windows: `C:\Users\<用户名>\.codebuddy\mcp.json`），添加：

```json
{
  "mcpServers": {
    "clawpm": {
      "command": "npx",
      "args": ["tsx", "<项目绝对路径>/server/src/mcp/stdio.ts"],
      "transportType": "stdio",
      "disabled": false
    }
  }
}
```

> **注意**：`args` 中的路径需要替换为你本机的项目绝对路径，如 `e:\\clawpm\\server\\src\\mcp\\stdio.ts`。
>
> 修改后**重启 CodeBuddy** 生效。

### Cursor Agent（SSE 模式）

在项目的 `.cursor/mcp.json` 中添加：

```json
{
  "mcpServers": {
    "clawpm": {
      "type": "sse",
      "url": "http://localhost:3210/mcp/sse?token=dev-token"
    }
  }
}
```

> SSE 模式需要先启动 ClawPM 服务（`start.bat` 或 `pnpm dev`）。

### 其他 MCP 客户端

SSE 端点支持两种认证方式：
- **Header**：`Authorization: Bearer <token>`
- **URL 参数**：`?token=<token>`

## MCP 工具列表（21 个）

### 任务管理
| Tool | 描述 |
|------|------|
| `create_task` | 创建需求节点（只需 title，其余可选） |
| `get_task` | 获取任务详情 |
| `get_my_tasks` | 获取我的任务列表 |
| `list_tasks` | 查询节点列表（支持按状态/板块/里程碑/负责人筛选） |
| `update_task` | 更新节点信息 |
| `update_progress` | Agent 上报任务进度 |
| `complete_task` | 标记任务完成 |
| `report_blocker` | 报告任务阻塞 |
| `add_task_note` | 给任务添加备注 |
| `request_next_task` | 请求推荐下一个任务 |

### 需求池
| Tool | 描述 |
|------|------|
| `create_backlog_item` | 录入需求池 |
| `list_backlog` | 查看需求池 |
| `schedule_backlog_item` | 将需求排期并创建任务 |

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

## Tech Stack

- **Backend**: Node.js + TypeScript + Fastify
- **Database**: SQLite (Drizzle ORM)
- **MCP**: @modelcontextprotocol/sdk（支持 stdio + SSE 双模式）
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **Deploy**: Docker / start.bat 一键启动

## 项目结构

```
clawpm/
├── server/src/
│   ├── index.ts          # 服务入口（Fastify + SSE MCP）
│   ├── config.ts         # 配置（端口/Token/数据库路径）
│   ├── mcp/
│   │   ├── server.ts     # MCP 工具定义（21个工具）
│   │   └── stdio.ts      # MCP stdio 入口（CodeBuddy 用）
│   ├── api/routes.ts     # REST API 路由
│   ├── db/               # 数据库 schema + 连接
│   └── services/         # 业务逻辑层
├── web/src/              # React 前端
├── start.bat             # Windows 一键启动
├── docker-compose.yml    # Docker 部署
├── .env.example          # 环境变量模板
└── .codebuddy/mcp.json   # 项目级 MCP 配置（参考用）
```

## Documentation

- [产品需求文档 (PRD)](./docs/PRD.md)
- [技术设计文档](./docs/TechDesign.md)

## License

MIT
