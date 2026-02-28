# ClawPM — 全自动项目管理中枢 产品需求文档 (PRD)

> **版本**: v1.0  
> **日期**: 2026-02-28  
> **状态**: 待评审  
> **变更记录**:  
> - v1.0 (2026-02-28): 初始版本 — 基于 PM-Agent PRD v0.4 重构为独立服务 + 纯 MCP 架构

---

## 一、背景与愿景

### 1.1 现状痛点

在 AI Agent 驱动的开发流程中，多个本地 Cursor Agent 并行开发，OpenClaw 作为服务器端 AI 通过飞书协调团队。当前存在以下核心问题：

| 痛点 | 描述 |
|------|------|
| **进度黑箱** | 多个 Agent 各自开发，PM 无法实时掌握各模块进展 |
| **需求散落** | 决策者口头提的需求、Agent 开发中发现的需求，没有统一收纳 |
| **目标脱节** | 决策者定了里程碑目标，但缺乏系统化拆解和跟进 |
| **协调成本高** | Agent 不知道下一步该做什么，需要人工分配 |
| **决策者失明** | 不知道各方向投入了多少人力、项目是否在正确航向上 |
| **缺少闭环** | 需求提出 → 设计 → 开发 → 完成的全链路缺乏追踪 |
| **无可视化** | 没有看板、甘特图等直观的项目全景视图 |

### 1.2 产品愿景

> **ClawPM 是一个可自托管的轻量级项目管理中枢。** 它通过 MCP 协议与 AI Agent 双向通信：Agent 从中领取任务、上报进度；决策者通过 AI 助手或 Web 界面管理需求和目标。它是连接"决策者的想法"和"Agent 的执行"的桥梁。

**核心定位**：

```
┌─────────────────────────────────────────────────────────┐
│                 ClawPM — 项目管理中枢                      │
│                                                         │
│   决策者/PM          ClawPM Server          开发 Agent    │
│                                                         │
│   "做积分系统" ──►  需求池 ──► 拆解 ──► 任务 ──►  领取开工  │
│                                                         │
│   "进度如何?" ◄──  仪表盘 ◄── 分析 ◄── 上报 ◄──  汇报进度  │
│                                                         │
│              Web UI / 飞书 / MCP  全通道交互              │
└─────────────────────────────────────────────────────────┘
```

### 1.3 核心价值主张

ClawPM 服务于三个层次：

```
┌─────────────────────────────────────────────────────────┐
│  层次一：执行层 — "谁在做什么"                              │
│  任务分配、进度追踪、阻塞上报、完成确认                      │
└───────────────────────┬─────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────┐
│  层次二：管理层 — "下一步该做什么"                          │
│  需求池管理、排期调度、目标拆解、生命周期流转                 │
└───────────────────────┬─────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────┐
│  层次三：战略层 — "方向对不对"                              │
│  资源投入分析、航向偏离检测、决策简报、里程碑可达性评估        │
└─────────────────────────────────────────────────────────┘
```

---

## 二、系统角色与交互模型

### 2.1 三方角色

```
           ┌──────────────────────────────────────┐
           │         ClawPM Server (中枢)          │
           │                                      │
           │   Web UI + REST API + MCP Server     │
           │   SQLite (Single Source of Truth)     │
           │                                      │
           └───┬──────────────┬───────────────┬───┘
               │              │               │
   MCP (SSE)   │   MCP (SSE)  │    Web/API    │
               │              │               │
  ┌────────────┴──┐   ┌──────┴────────┐  ┌───┴──────────┐
  │ Cursor Agent   │   │  OpenClaw      │  │  决策者/PM    │
  │ (本地开发端)    │   │  (服务器端 AI)  │  │  (浏览器)     │
  └───────────────┘   └───────────────┘  └──────────────┘
```

### 2.2 角色职责

| 角色 | 身份 | 与 ClawPM 的交互 |
|------|------|----------------|
| **Cursor Agent** | 本地开发者/AI | 通过 MCP 领取任务、上报进度、创建需求、报告阻塞 |
| **OpenClaw** | 服务器端 AI 管家 | 通过 MCP 收集需求、拆解任务、排期调度、战略分析，通过飞书通知团队 |
| **决策者/PM** | 人类管理者 | 通过 Web UI 查看看板/甘特图、管理需求池和目标；通过飞书与 OpenClaw 对话 |

### 2.3 数据流

```
输入 ──────────────────────────────────────────────► ClawPM DB

  Cursor Agent  ──MCP──►  创建任务、更新进度、报告阻塞、完成任务
  OpenClaw      ──MCP──►  录入需求、拆解任务、排期调度、设定目标
  Web UI        ──API──►  手动创建/编辑任务、管理需求池

ClawPM DB ──────────────────────────────────────────► 输出

  ClawPM DB  ──API──►  Web UI（看板/甘特图/仪表盘）
  ClawPM DB  ──MCP──►  Cursor Agent（领取任务、获取上下文）
  ClawPM DB  ──MCP──►  OpenClaw（读取数据做分析 → 飞书通知）
```

---

## 三、核心概念与术语

### 3.1 需求生命周期

```
决策者/Agent 提出想法
       │
       ▼
┌──────────────┐
│  需求池       │  决策者口头提的、Agent 开发中发现的、未来要做的
│  (Backlog)   │  分类、排优先级、持续维护
└──────┬───────┘
       │ 决策者决定排期 / OpenClaw 建议调度
       ▼
┌──────────────┐
│  已排期       │  纳入里程碑，分配 owner，设定截止日期
│  (Planned)   │  通知对应 Agent
└──────┬───────┘
       │ Agent 通过 MCP 领取
       ▼
┌──────────────┐
│  开发中       │  Agent 通过 MCP 实时上报进度
│  (Active)    │  ClawPM 实时更新
└──────┬───────┘
       │ Agent 标记完成
       ▼
┌──────────────┐
│  评审中       │  技术评审 / 产品验收
│  (Review)    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  已完成       │  自动归档、更新统计
│  (Done)      │
└──────────────┘
```

### 3.2 关键术语

| 术语 | 定义 |
|------|------|
| **需求池 (Backlog)** | 存放未来要做的需求。决策者或 Agent 告诉 ClawPM "后面要做XX"，自动分类存入 |
| **任务 (Task)** | 可执行的工作单元，有明确的 owner、状态、进度、截止日期 |
| **业务板块 (Domain)** | 按业务领域划分的功能分组（如用户系统、支付系统等） |
| **里程碑 (Milestone)** | 时间节点目标（如 v1.0-MVP），包含一组任务 |
| **目标 (Goal)** | 决策者设定的高层目标，可拆解为里程碑目标 + 关键结果 (KR) |
| **文档绑定 (Doc Binding)** | 本地 DesignDoc 通过 head 中的 pm_task_id 与 ClawPM 任务建立关联 |

---

## 四、目标用户与角色

| 角色 | 使用场景 | 需求 |
|------|---------|------|
| **决策者** | 设定方向、管理需求、查看全局 | Web 仪表盘、飞书对话、决策简报、目标管理 |
| **技术负责人 / TL** | 掌握全局进度、识别风险 | 看板、甘特图、风险预警、资源分布 |
| **开发 Agent (Cursor)** | 领取任务、写代码、上报进度 | MCP 工具（get_my_tasks、update_progress 等） |
| **OpenClaw AI** | 需求管理、分析、协调 | MCP 工具（全套管理操作）+ 飞书推送能力 |

---

## 五、系统范围

### 5.1 一期 (MVP)

| # | 模块 | 描述 | 优先级 |
|---|------|------|--------|
| 1 | **MCP Server** | 暴露项目管理操作为 MCP 工具，SSE 传输，支持远程连接 | P0 |
| 2 | **任务管理** | 创建/查询/更新/完成任务，状态流转，进度追踪 | P0 |
| 3 | **需求池管理** | 需求录入、分类、排优先级、排期流转 | P0 |
| 4 | **目标管理** | 目标设定、拆解为 KR、关联任务、进度计算 | P0 |
| 5 | **业务板块** | 业务领域分组、任务自动归类 | P0 |
| 6 | **里程碑管理** | 里程碑定义、任务归属、完成率统计 | P0 |
| 7 | **风险分析** | 逾期检测、停滞检测、健康度评分 | P1 |
| 8 | **REST API** | Web UI 使用的 HTTP API | P0 |
| 9 | **Web UI — 看板** | Kanban 风格任务看板 | P0 |
| 10 | **Web UI — 任务详情** | 任务详情、进度历史、备注 | P0 |
| 11 | **Web UI — 需求池** | 需求池列表、分类筛选 | P1 |
| 12 | **Web UI — 仪表盘** | 项目概览、进度统计、健康度 | P1 |
| 13 | **数据库** | SQLite 持久化存储 | P0 |
| 14 | **Docker 部署** | docker-compose 一键启动 | P0 |

### 5.2 二期

| # | 模块 | 描述 |
|---|------|------|
| 1 | **甘特图** | 按里程碑/板块展示任务时间线 |
| 2 | **战略洞察引擎** | 资源投入分析、航向偏离检测、决策简报数据 |
| 3 | **燃尽图 & 趋势** | 里程碑燃尽图、进度趋势图 |
| 4 | **通知 Webhook** | 状态变更时触发 Webhook，供 OpenClaw 订阅 |
| 5 | **多项目支持** | 管理多个独立项目 |
| 6 | **用户认证** | 基础的用户认证和权限 |

### 5.3 排除范围

- 飞书集成（由 OpenClaw 负责，ClawPM 不直接对接飞书）
- AI 分析能力（由 OpenClaw 负责，ClawPM 只提供数据）
- 代码仓库管理（ClawPM 不管代码，只管任务）
- CI/CD 集成

---

## 六、MCP 工具定义

ClawPM 通过 MCP Server (SSE 传输) 暴露以下工具，供 Cursor Agent 和 OpenClaw 调用。

### 6.1 任务管理工具

| Tool | 参数 | 返回 | 使用者 | 描述 |
|------|------|------|--------|------|
| `create_task` | title, description, domain?, priority?, milestone?, owner?, due_date?, parent_task_id? | task 对象 (含 task_id) | Agent / OpenClaw | 创建新任务 |
| `get_task` | task_id | task 详情 | Agent / OpenClaw | 获取任务详情 |
| `update_task` | task_id, 可更新字段... | 更新后的 task | Agent / OpenClaw | 更新任务信息 |
| `update_progress` | task_id, progress(0-100), summary? | 确认 | Agent | 上报进度 |
| `complete_task` | task_id, summary? | 确认 | Agent | 标记任务完成 |
| `report_blocker` | task_id, blocker_description | 确认 | Agent | 报告阻塞 |
| `add_task_note` | task_id, content | 确认 | Agent / OpenClaw | 添加备注 |
| `list_tasks` | filters (status?, domain?, milestone?, owner?, priority?) | task 列表 | 所有 | 按条件查询任务 |
| `get_my_tasks` | owner | 该 owner 的任务列表 | Agent | 获取我的任务 |
| `request_next_task` | owner?, domain? | 推荐的下一个任务 | Agent | 请求下一个推荐任务 |

### 6.2 需求池工具

| Tool | 参数 | 返回 | 使用者 | 描述 |
|------|------|------|--------|------|
| `create_backlog_item` | title, description, source?, domain?, priority?, tags? | backlog item | Agent / OpenClaw | 录入需求池 |
| `list_backlog` | filters (domain?, priority?, status?) | backlog 列表 | 所有 | 查看需求池 |
| `schedule_backlog_item` | backlog_id, milestone, owner?, due_date? | 创建的 task | OpenClaw | 排期：从需求池移入任务 |
| `update_backlog_item` | backlog_id, 可更新字段... | 更新后的 item | OpenClaw | 更新需求池条目 |

### 6.3 目标管理工具

| Tool | 参数 | 返回 | 使用者 | 描述 |
|------|------|------|--------|------|
| `create_goal` | title, description, target_date, objectives[] | goal 对象 | OpenClaw | 创建目标 |
| `get_goal` | goal_id | goal 详情（含进度） | 所有 | 获取目标进度 |
| `update_goal` | goal_id, 可更新字段... | 更新后的 goal | OpenClaw | 更新目标 |
| `link_task_to_goal` | goal_id, objective_id, task_id | 确认 | OpenClaw | 关联任务到目标 KR |
| `list_goals` | status? | goal 列表 | 所有 | 列出所有目标 |

### 6.4 项目概览工具

| Tool | 参数 | 返回 | 使用者 | 描述 |
|------|------|------|--------|------|
| `get_project_status` | — | 项目整体状态摘要 | 所有 | 进度、风险、健康度概览 |
| `get_risk_report` | — | 风险清单 | OpenClaw | 逾期/阻塞/停滞任务 |
| `get_resource_allocation` | — | 按 owner/domain 的资源分布 | OpenClaw | 谁在做什么 |
| `get_milestone_status` | milestone_id? | 里程碑完成度 | 所有 | 里程碑进度 |

### 6.5 配置管理工具

| Tool | 参数 | 返回 | 使用者 | 描述 |
|------|------|------|--------|------|
| `create_domain` | name, task_prefix, keywords[] | domain 对象 | OpenClaw | 创建业务板块 |
| `list_domains` | — | domain 列表 | 所有 | 列出所有业务板块 |
| `create_milestone` | name, target_date, domain_weights? | milestone 对象 | OpenClaw | 创建里程碑 |
| `list_milestones` | — | milestone 列表 | 所有 | 列出所有里程碑 |

---

## 七、文档绑定机制 (Doc Binding)

### 7.1 设计原则

本地 Cursor Agent 在开发时仍会编写 DesignDocs（设计文档、PRD 等）。每个文档通过头部的 frontmatter 与 ClawPM 中的任务建立绑定关系。

### 7.2 文档 Head 格式

```yaml
---
pm_task_id: "T-042"
pm_server: "https://pm.example.com"
title: "用户登录模块技术设计"
---
```

### 7.3 绑定工作流

```
Agent 打开/创建一个 DesignDoc
    │
    ├─ head 中有 pm_task_id
    │   └─ 调用 get_task(task_id) 获取任务上下文
    │      Agent 了解任务背景后开始工作
    │
    └─ head 中没有 pm_task_id
        └─ 调用 create_task(title=文档标题, ...)
           ← 返回 task_id
           └─ 自动写入文档 head 的 pm_task_id 字段
              文档与任务建立绑定
```

### 7.4 进度上报时机

Agent 在以下时机通过 MCP 上报：

| 时机 | MCP 调用 | 说明 |
|------|---------|------|
| 打开已绑定文档 | `get_task` | 同步最新任务状态 |
| 新建文档（无 task_id） | `create_task` | 自动创建并绑定 |
| 完成阶段性工作 | `update_progress` | 进度百分比 + 摘要 |
| 遇到问题 | `report_blocker` | 阻塞描述 |
| 发现额外需求 | `create_backlog_item` | 录入需求池 |
| 任务完成 | `complete_task` | 完成摘要 |

---

## 八、OpenClaw 集成

### 8.1 OpenClaw 的角色

OpenClaw 是 ClawPM 的"AI 大脑层"。ClawPM 本身只负责数据存储和展示，**不包含 AI 分析能力**。所有智能分析由 OpenClaw 通过 MCP 读取 ClawPM 数据后完成。

### 8.2 OpenClaw 通过 MCP 执行的操作

**需求收集（飞书 → OpenClaw → ClawPM MCP）：**

```
决策者在飞书说: "后面要做积分系统"
    │
    ▼
OpenClaw 解析意图
    │
    ▼
调用 create_backlog_item(
    title="积分系统",
    description="用户完成任务获得积分，积分可兑换权益",
    source="决策者口述",
    domain="用户系统",
    priority="P1"
)
    │
    ▼
飞书回复: "✅ 已录入需求池 BL-042: 积分系统"
```

**需求拆解（OpenClaw → ClawPM MCP）：**

```
决策者说: "积分系统排到 v1.1"
    │
    ▼
OpenClaw 执行:
  1. schedule_backlog_item(backlog_id="BL-042", milestone="v1.1")
  2. create_task(title="积分系统-后端API", domain="用户系统", ...)
  3. create_task(title="积分系统-前端页面", domain="UI通用", ...)
  4. create_task(title="积分系统-App端", domain="用户系统", ...)
    │
    ▼
飞书回复: "已拆解为 3 个任务并排入 v1.1"
```

**定时分析（OpenClaw Cron → ClawPM MCP → 飞书）：**

| Cron | OpenClaw 行为 |
|------|-------------|
| 每工作日 18:00 | 调 `get_project_status` + `get_risk_report` → 生成日报 → 飞书推送 |
| 周一 09:30 | 调 `list_tasks` 按 owner 分组 → 生成周计划 → 飞书推送 |
| 周五 17:00 | 调 `get_resource_allocation` + `get_milestone_status` → 决策简报 → 飞书 |
| 每 4 小时 | 调 `get_risk_report` → 发现新逾期/阻塞 → 飞书 @相关人 |

**主动协调（OpenClaw → ClawPM MCP → 飞书）：**

| 场景 | OpenClaw 行为 |
|------|-------------|
| Agent 任务进度 > 85% | 调 `request_next_task` → 飞书告知"下一个建议做 XX" |
| 任务分配后 3 天未启动 | 调 `list_tasks(status=planned)` → 飞书跟催 |
| 需求池条目超 14 天 | 调 `list_backlog` → 飞书提醒排期 |
| 上游依赖完成 | 检测到依赖任务完成 → 飞书通知下游可启动 |

### 8.3 OpenClaw PM Skill 简化

原来 187 行的 SKILL.md 简化为一个轻量 Skill，核心内容：

```
你是 PM 助手。你的数据全部在 ClawPM 中。

操作方式：
- 收到飞书消息 → 解析意图 → 调用对应的 MCP 工具 → 回复结果
- Cron 触发 → 调用查询类 MCP 工具 → 分析数据 → 飞书推送

你不需要：
- 扫描文档仓库
- 管理 JSON 文件
- spawn 子 Session
- 解析 frontmatter
```

---

## 九、Web UI 功能

### 9.1 一期 (MVP)

| 页面 | 功能 | 优先级 |
|------|------|--------|
| **看板 (Kanban)** | 按状态列展示任务卡片，支持拖拽流转 | P0 |
| **任务详情** | 任务信息、进度历史曲线、备注时间线、阻塞记录 | P0 |
| **任务列表** | 表格视图，支持按板块/里程碑/状态/owner 筛选排序 | P0 |
| **需求池** | 需求列表、分类筛选、排期操作 | P1 |
| **项目仪表盘** | 整体进度、状态分布饼图、健康度评分、最近活动 | P1 |
| **里程碑** | 里程碑列表、完成率、包含的任务 | P1 |

### 9.2 二期

| 页面 | 功能 |
|------|------|
| **甘特图** | 按时间线展示任务，依赖关系连线 |
| **目标管理** | 目标 → 里程碑目标 → KR → 关联任务的树形视图 |
| **燃尽图** | 按里程碑的理想 vs 实际完成曲线 |
| **资源分布** | 按 owner/domain 的工作负载热力图 |

---

## 十、风险分析引擎

ClawPM 内置基础的风险检测能力（不依赖 AI），供 Web UI 展示和 MCP 查询：

| ID | 功能 | 规则 | 优先级 |
|----|------|------|--------|
| RA-01 | 逾期检测 | `due_date < today && status != done` | P0 |
| RA-02 | 逾期预警 | `due_date - today <= 3天 && progress < 80%` | P0 |
| RA-03 | 停滞检测 | 连续 N 天进度无变化且状态为 active | P1 |
| RA-04 | 依赖阻塞 | 依赖项状态为 blocked | P1 |
| RA-05 | 健康度评分 | 综合逾期/停滞/阻塞计算 0-100 分 | P1 |

健康度评分算法：

```
健康度 = 100 - 逾期扣分 - 停滞扣分 - 阻塞扣分 + 提前完成加分

逾期扣分 = 逾期天数 × 5（上限 40 分）
停滞扣分 = 停滞天数 × 3（上限 20 分）
阻塞扣分 = 被阻塞依赖项数 × 10（上限 30 分）
提前完成加分 = 提前天数 × 2（上限 10 分）

>= 80: 健康  |  60-79: 需关注  |  < 60: 高风险
```

---

## 十一、非功能性需求

| 维度 | 要求 |
|------|------|
| **部署** | docker-compose 一键部署，单机运行，不依赖外部服务 |
| **数据库** | SQLite 单文件存储，零配置，易备份 |
| **性能** | 支持 1000+ 任务的流畅操作 |
| **MCP 传输** | SSE (Server-Sent Events) 支持远程连接 |
| **安全** | API Token 认证，防止未授权访问 |
| **备份** | SQLite 文件可直接复制备份 |
| **可观测性** | 操作日志记录，MCP 调用日志 |

---

## 十二、实施计划

### Phase 1: 核心引擎（第 1-2 周）
- [ ] 数据库 schema 设计与初始化 (SQLite)
- [ ] 任务 CRUD REST API
- [ ] 需求池 CRUD REST API
- [ ] MCP Server 骨架 (SSE 传输)
- [ ] 任务管理 MCP 工具 (create/get/update/complete)
- [ ] 需求池 MCP 工具 (create/list/schedule)

### Phase 2: 管理能力（第 3-4 周）
- [ ] 目标管理 API + MCP 工具
- [ ] 里程碑管理 API + MCP 工具
- [ ] 业务板块管理
- [ ] 风险分析引擎（逾期/停滞/健康度）
- [ ] 项目概览 MCP 工具 (status/risk/resource)
- [ ] request_next_task 推荐算法

### Phase 3: Web UI（第 5-7 周）
- [ ] React + Tailwind 项目搭建
- [ ] 看板视图 (Kanban)
- [ ] 任务详情页
- [ ] 任务列表（表格 + 筛选）
- [ ] 项目仪表盘
- [ ] 需求池页面

### Phase 4: 部署与集成（第 8 周）
- [ ] Dockerfile + docker-compose.yml
- [ ] 环境变量配置
- [ ] API Token 认证
- [ ] 文档完善
- [ ] OpenClaw PM Skill 适配

### Phase 5: 增强（后续）
- [ ] 甘特图
- [ ] 目标管理 Web 页面
- [ ] 燃尽图 & 趋势图
- [ ] 资源分布热力图
- [ ] Webhook 通知
- [ ] 多项目支持

---

## 十三、成功指标

| 指标 | 目标值 | 衡量方式 |
|------|--------|---------|
| MCP 工具响应时间 | < 500ms | P95 延迟 |
| Web UI 首屏加载 | < 2s | Lighthouse |
| 任务状态实时性 | 即时 | Agent 调用后立即可在 Web UI 看到 |
| 部署耗时 | < 5 分钟 | docker-compose up 到可用 |
| 数据准确性 | 100% | 任务状态与 MCP 上报一致 |
| Agent 接入成本 | < 10 分钟 | 配置 MCP 连接即可使用 |
