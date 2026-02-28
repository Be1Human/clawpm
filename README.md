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

## Quick Start

### Docker (推荐)

```bash
# 克隆项目
git clone https://github.com/your-org/clawpm.git
cd clawpm

# 配置
cp .env.example .env
# 编辑 .env，设置 CLAWPM_API_TOKEN

# 启动
docker-compose up -d

# 访问 Web UI
open http://localhost:3210
```

### 本地开发

```bash
# 安装依赖
corepack enable
pnpm install

# 启动后端开发服务器
pnpm dev

# 另一个终端，启动前端开发服务器
pnpm dev:web
```

## MCP 连接

### Cursor Agent

在项目的 `.cursor/mcp.json` 中添加：

```json
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

### OpenClaw

在 OpenClaw 配置中添加 ClawPM 作为 MCP 服务器。

## MCP Tools

| Tool | 描述 |
|------|------|
| `create_task` | 创建新任务 |
| `get_task` | 获取任务详情 |
| `get_my_tasks` | 获取我的任务列表 |
| `update_progress` | 上报任务进度 |
| `complete_task` | 标记任务完成 |
| `report_blocker` | 报告阻塞 |
| `request_next_task` | 请求推荐下一个任务 |
| `create_backlog_item` | 录入需求池 |
| `list_backlog` | 查看需求池 |
| `schedule_backlog_item` | 需求排期 |
| `create_goal` | 创建目标 |
| `get_project_status` | 获取项目状态概览 |
| `get_risk_report` | 获取风险报告 |
| ... | [完整列表见文档](./docs/PRD.md) |

## Tech Stack

- **Backend**: Node.js + TypeScript + Fastify
- **Database**: SQLite (Drizzle ORM)
- **MCP**: @modelcontextprotocol/sdk (SSE transport)
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **Deploy**: Docker

## Documentation

- [产品需求文档 (PRD)](./docs/PRD.md)
- [技术设计文档](./docs/TechDesign.md)

## License

MIT
