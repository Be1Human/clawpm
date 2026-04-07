# ClawPM MCP Skills — AI Agent 任务拆解与管理指南

> **核心理念：万物可拆解、逐层分类、直到可执行。**
>
> ClawPM 以需求树为底层驱动逻辑——整个项目就是一棵树，所有需求从根节点衍生、开枝散叶。没有固定的 Epic / Story / Task 层级区分，一切皆节点，你可以无限深度地拆解，直到每个叶子节点都是一个可直接执行的工作项。

---

## 目录

1. [快速开始：认识自己](#1-快速开始认识自己)
2. [核心概念](#2-核心概念)
3. [第一课：理解项目结构](#3-第一课理解项目结构)
4. [第二课：任务拆解的艺术（核心技能）](#4-第二课任务拆解的艺术核心技能)
5. [第三课：分类与标记](#5-第三课分类与标记)
6. [第四课：工作流管理](#6-第四课工作流管理)
7. [第五课：迭代与排期](#7-第五课迭代与排期)
8. [第六课：需求池与收件箱](#8-第六课需求池与收件箱)
9. [第七课：项目监控与风险管理](#9-第七课项目监控与风险管理)
10. [实战演练：从零拆解一个完整需求](#10-实战演练从零拆解一个完整需求)
11. [最佳实践速查表](#11-最佳实践速查表)
12. [工具速查手册](#12-工具速查手册)

---

## 1. 快速开始：认识自己

连接 ClawPM MCP 后，第一件事——确认你的身份：

```
whoami()
```

返回你当前的 Agent 身份信息，包括绑定的成员名称、所属项目、权限等。所有后续操作都基于这个身份进行。

> **提示**：如果返回为空或未绑定，需要先在 ClawPM Web 界面的「成员管理」中为你的 Agent 生成 Token 并配置。

---

## 2. 核心概念

在开始拆解任务之前，你需要理解 ClawPM 的几个核心概念：

### 🌳 需求树（Task Tree）

```
项目根
├── 用户系统          ← 第1层：大模块
│   ├── 注册流程      ← 第2层：功能模块
│   │   ├── 手机号注册  ← 第3层：具体功能
│   │   │   ├── 发送验证码接口  ← 第4层：可执行任务
│   │   │   ├── 验证码校验      ← 可执行任务
│   │   │   └── 注册信息提交    ← 可执行任务
│   │   └── 邮箱注册
│   │       ├── 邮件发送服务
│   │       └── 邮箱验证回调
│   └── 登录流程
│       ├── 密码登录
│       └── 第三方登录
└── 商品系统
    ├── 商品管理
    └── 商品搜索
```

**关键规则**：
- 一切皆节点，没有类型限制
- 父子关系代表"拆解"关系
- 越往下越具体，叶子节点必须是可直接动手执行的
- 树可以无限深——只要你觉得还需要拆，就继续拆

### 🔄 五状态工作流

每个节点都有一个状态，遵循如下流转：

```
backlog → planned → active → review → done
(待定)    (已规划)   (进行中)  (待审查)  (已完成)
```

| 状态 | 含义 | 典型场景 |
|------|------|----------|
| `backlog` | 已创建但未纳入计划 | 新需求刚写下来 |
| `planned` | 已排入计划，等待开始 | 迭代规划后 |
| `active` | 正在执行中 | 开发者正在编码 |
| `review` | 完成开发，等待审查 | PR 已提交 |
| `done` | 审查通过，已完成 | 合入主分支 |

### 🎯 优先级体系

| 优先级 | 含义 | 响应预期 |
|--------|------|----------|
| `P0` | 紧急 - 阻断性问题 | 立即处理 |
| `P1` | 重要 - 核心功能 | 当前迭代内完成 |
| `P2` | 一般 - 常规需求 | 近期迭代安排 |
| `P3` | 低优 - 可延后 | 有空再做 |

### 👥 Owner 与 Assignee

- **Owner（负责人）**：对这个节点负责的决策者，决定"做不做、怎么拆"
- **Assignee（处理人）**：实际执行这个节点的人/Agent

---

## 3. 第一课：理解项目结构

### 3.1 查看项目列表

```
list_projects()
```

了解当前有哪些项目。ClawPM 支持多项目隔离，每个项目是一棵独立的需求树。

### 3.2 查看项目详情

```
get_project(slug: "my-project")
```

### 3.3 查看板块（Domain）

板块是对需求树的横向分类维度，例如"前端"、"后端"、"设计"、"运营"。

```
list_domains(project: "my-project")
```

### 3.4 查看里程碑（Milestone）

里程碑是时间维度的关键节点，例如"v1.0 发布"、"内测上线"。

```
list_milestones(project: "my-project")
```

### 3.5 查看成员

```
list_members(project: "my-project")
```

返回所有成员（人类 + Agent），包含擅长领域和当前任务负载（taskCount / activeCount）。

---

## 4. 第二课：任务拆解的艺术（核心技能）

这是 ClawPM 的灵魂所在。掌握拆解，你就掌握了 ClawPM。

### 4.1 拆解原则

> **拆解三问**：
> 1. **这个节点是否可以直接动手做？** → 如果不能，继续拆
> 2. **一个人 1-3 天能完成吗？** → 如果不能，继续拆
> 3. **做完后如何验证？** → 如果说不清，说明还需要拆更细

### 4.2 从顶向下创建需求树

**Step 1：创建顶层节点（大方向）**

```
create_task(
  title: "用户系统",
  description: "完整的用户注册、登录、个人中心模块",
  labels: ["epic"],
  priority: "P1",
  project: "my-project"
)
```

返回任务 ID，例如 `U-001`。

**Step 2：拆解为子模块**

```
create_task(
  title: "注册流程",
  parent_task_id: "U-001",
  description: "支持手机号和邮箱两种注册方式",
  priority: "P1"
)
```

```
create_task(
  title: "登录流程",
  parent_task_id: "U-001",
  description: "密码登录 + 第三方 OAuth 登录",
  priority: "P1"
)
```

**Step 3：继续拆解到可执行粒度**

```
create_task(
  title: "手机号注册 - 发送验证码接口",
  parent_task_id: "U-002",
  description: "POST /api/auth/sms-code，接入短信服务商，60秒冷却，5分钟过期",
  priority: "P1",
  assignee: "backend-agent",
  labels: ["api", "后端"]
)
```

```
create_task(
  title: "手机号注册 - 前端注册表单",
  parent_task_id: "U-002",
  description: "手机号输入 → 获取验证码 → 填写密码 → 提交注册，含表单校验",
  priority: "P1",
  assignee: "frontend-agent",
  labels: ["ui", "前端"]
)
```

### 4.3 查看任务树

查看你负责的需求子树：

```
get_my_task_tree(project: "my-project")
```

查看特定任务的详情（含子任务）：

```
get_task(task_id: "U-001")
```

列出所有任务（带筛选）：

```
list_tasks(
  project: "my-project",
  status: "active",
  owner: "my-agent-name"
)
```

### 4.4 拆解模式参考

以下是几种常见的拆解模式：

#### 模式 A：按功能模块拆解

```
电商平台
├── 用户系统（注册/登录/个人中心）
├── 商品系统（商品管理/搜索/详情页）
├── 订单系统（下单/支付/退款）
└── 运营系统（活动/优惠券/推送）
```

#### 模式 B：按技术栈拆解

```
登录功能
├── 后端 API
│   ├── 登录接口
│   ├── Token 刷新接口
│   └── 密码加密存储
├── 前端页面
│   ├── 登录表单组件
│   ├── 错误提示
│   └── 记住密码逻辑
└── 基础设施
    ├── Redis Session 配置
    └── JWT 密钥管理
```

#### 模式 C：按用户故事拆解

```
用户购物流程
├── 浏览商品（搜索、分类、推荐）
├── 加入购物车（数量、规格选择）
├── 下单结算（地址、优惠、支付）
├── 查看订单（列表、详情、物流）
└── 售后服务（退款、换货、评价）
```

---

## 5. 第三课：分类与标记

### 5.1 用标签分类

标签（labels）是灵活的多维度分类工具：

```
create_task(
  title: "实现购物车接口",
  labels: ["后端", "api", "P1-核心"],
  ...
)
```

常用标签建议：
- **功能维度**：`api`、`ui`、`数据库`、`配置`
- **模块维度**：`用户系统`、`商品系统`、`支付`
- **性质维度**：`bug`、`feature`、`refactor`、`tech-debt`
- **规模维度**：`epic`、`spike`、`quick-fix`

### 5.2 用板块归类

板块（Domain）是预定义的大分类，适合团队级别的组织：

```
# 先创建板块
create_domain(name: "前端", project: "my-project")
create_domain(name: "后端", project: "my-project")
create_domain(name: "设计", project: "my-project")

# 创建任务时关联板块
create_task(
  title: "登录页 UI 设计稿",
  domain: "设计",
  ...
)
```

### 5.3 用里程碑关联时间节点

```
# 创建里程碑
create_milestone(
  name: "v1.0 内测发布",
  due_date: "2025-06-30",
  project: "my-project"
)

# 创建任务时关联里程碑
create_task(
  title: "核心功能完成",
  milestone: "v1.0 内测发布",
  ...
)
```

### 5.4 指定负责人和处理人

```
create_task(
  title: "实现搜索功能",
  owner: "pm-wang",        # 负责人（决策）
  assignee: "dev-agent-1", # 处理人（执行）
  ...
)
```

---

## 6. 第四课：工作流管理

### 6.1 领取任务

查看自己的待办任务：

```
get_my_tasks(status: "planned", project: "my-project")
```

或者让系统推荐下一个最应该做的任务：

```
request_next_task(project: "my-project")
```

系统会根据优先级、截止日期、依赖关系等智能推荐。

### 6.2 开始执行

更新任务状态为进行中：

```
update_task(
  task_id: "U-005",
  status: "active"
)
```

### 6.3 上报进度

在执行过程中持续上报进度：

```
update_progress(
  task_id: "U-005",
  progress_pct: 60,
  message: "API 已完成，正在编写单元测试"
)
```

### 6.4 添加备注

记录重要信息或沟通内容：

```
add_task_note(
  task_id: "U-005",
  note: "与产品确认：密码最小长度改为 8 位"
)
```

### 6.5 报告阻塞

遇到阻塞及时上报：

```
report_blocker(
  task_id: "U-005",
  blocker_description: "短信服务商 API 密钥未提供，无法联调"
)
```

### 6.6 完成任务

```
complete_task(
  task_id: "U-005",
  summary: "短信验证码接口已完成，含发送、校验、冷却限流，单测覆盖率 95%"
)
```

### 6.7 批量更新

同时更新多个任务的状态或负责人：

```
batch_update_tasks(
  task_ids: ["U-005", "U-006", "U-007"],
  status: "active",
  assignee: "dev-agent-1"
)
```

---

## 7. 第五课：迭代与排期

### 7.1 创建迭代

迭代（Iteration/Sprint）是一个有时间盒约束的工作周期：

```
create_iteration(
  name: "Sprint 2025-W18",
  start_date: "2025-04-28",
  end_date: "2025-05-09",
  description: "本迭代聚焦用户系统核心功能",
  project: "my-project"
)
```

### 7.2 将任务纳入迭代

```
add_task_to_iteration(
  iteration_id: 1,
  task_id: "U-005"
)
```

### 7.3 查看迭代进度

```
get_iteration(iteration_id: 1)
```

返回迭代详情，包含关联的任务列表和完成率统计。

### 7.4 查看所有迭代

```
list_iterations(project: "my-project")
```

---

## 8. 第六课：需求池与收件箱

### 8.1 需求池（Backlog）

需求池用于收集还未纳入正式需求树的想法和需求：

```
# 录入需求池
create_backlog_item(
  title: "支持微信扫码登录",
  description: "接入微信 OAuth，支持手机微信扫码一键登录",
  priority: "P2",
  project: "my-project"
)

# 查看需求池
list_backlog(project: "my-project")

# 需求排期：从池中取出，创建为正式任务节点
schedule_backlog_item(
  backlog_id: 1,
  parent_task_id: "U-001",
  owner: "pm-wang"
)
```

### 8.2 收件箱（Intake）

收件箱是外部反馈入口，让非项目成员也能提交 Bug 和建议：

```
# 提交反馈（AI Agent 也可以代为提交）
submit_intake(
  title: "登录页点击按钮无反应",
  description: "## 复现步骤\n1. 打开登录页\n2. 输入账号密码\n3. 点击登录按钮\n4. 无任何响应",
  category: "bug",
  submitter: "测试小张",
  priority: "P1",
  project: "my-project"
)

# 查看收件箱
list_intake(project: "my-project", status: "pending")

# 审核：接受并转为正式任务
review_intake(
  intake_id: "IN-042",
  action: "accept",
  review_note: "确认是 Bug，复现成功",
  parent_task_id: "U-002",
  owner: "frontend-agent",
  priority: "P1"
)
```

审核动作：
- `accept` — 接受，自动创建正式任务节点
- `reject` — 拒绝（需填写理由）
- `defer` — 暂缓，有价值但暂不处理
- `duplicate` — 标记为重复

---

## 9. 第七课：项目监控与风险管理

### 9.1 项目全局概览

```
get_project_status(project: "my-project")
```

返回项目整体状态：总任务数、各状态分布、完成率等。

### 9.2 风险报告

```
get_risk_report(project: "my-project")
```

自动检测：
- **逾期任务**：已过截止日期但未完成
- **阻塞任务**：被标记了 blocker
- **停滞任务**：长时间没有更新
- **健康度评分**：综合评估项目健康状况

### 9.3 资源分配

```
get_resource_allocation(project: "my-project")
```

查看各成员的任务负载分布，避免某个人/Agent 过载。

### 9.4 通知管理

```
# 查看未读通知数量
get_unread_notification_count()

# 获取通知列表
list_notifications(unread_only: true)

# 标记已读
mark_notification_read(notification_id: 1)

# 全部标记已读
mark_all_notifications_read()
```

---

## 10. 实战演练：从零拆解一个完整需求

> **场景**：产品经理说"我们要做一个博客系统"。

### Step 1：创建项目（如果还没有）

```
create_project(
  name: "团队博客",
  slug: "team-blog",
  description: "支持 Markdown 编辑、评论、标签分类的团队博客系统"
)
```

### Step 2：搭建板块和里程碑

```
create_domain(name: "前端", project: "team-blog")
create_domain(name: "后端", project: "team-blog")
create_domain(name: "设计", project: "team-blog")

create_milestone(
  name: "MVP 发布",
  due_date: "2025-07-01",
  project: "team-blog"
)
```

### Step 3：创建顶层需求树

```
# 根节点 → 大模块
create_task(title: "文章管理", labels: ["epic"], priority: "P0",
  milestone: "MVP 发布", project: "team-blog")     # → BLOG-001

create_task(title: "用户与权限", labels: ["epic"], priority: "P1",
  milestone: "MVP 发布", project: "team-blog")      # → BLOG-002

create_task(title: "评论系统", labels: ["epic"], priority: "P2",
  project: "team-blog")                             # → BLOG-003
```

### Step 4：拆解「文章管理」到可执行层

```
# 第2层
create_task(title: "文章 CRUD", parent_task_id: "BLOG-001",
  priority: "P0", project: "team-blog")              # → BLOG-004

create_task(title: "Markdown 编辑器", parent_task_id: "BLOG-001",
  priority: "P0", project: "team-blog")              # → BLOG-005

create_task(title: "文章列表与搜索", parent_task_id: "BLOG-001",
  priority: "P1", project: "team-blog")              # → BLOG-006

# 第3层 - 拆到可执行
create_task(title: "创建文章 API (POST /api/posts)",
  parent_task_id: "BLOG-004", priority: "P0",
  domain: "后端", assignee: "backend-agent",
  description: "接收 title, content(md), tags; 返回文章对象; 含参数校验")

create_task(title: "文章列表 API (GET /api/posts)",
  parent_task_id: "BLOG-004", priority: "P0",
  domain: "后端", assignee: "backend-agent",
  description: "分页、按标签筛选、按时间排序、支持搜索关键词")

create_task(title: "集成 Markdown 编辑器组件",
  parent_task_id: "BLOG-005", priority: "P0",
  domain: "前端", assignee: "frontend-agent",
  description: "使用 react-markdown + codemirror，支持实时预览、代码高亮")

create_task(title: "文章详情页",
  parent_task_id: "BLOG-005", priority: "P0",
  domain: "前端", assignee: "frontend-agent",
  description: "Markdown 渲染、目录导航、作者信息、发布时间")
```

### Step 5：创建迭代并排入

```
create_iteration(
  name: "Sprint 1 - 文章核心",
  start_date: "2025-05-05",
  end_date: "2025-05-16",
  project: "team-blog"
)

# 将核心任务纳入迭代
add_task_to_iteration(iteration_id: 1, task_id: "BLOG-007")
add_task_to_iteration(iteration_id: 1, task_id: "BLOG-008")
add_task_to_iteration(iteration_id: 1, task_id: "BLOG-009")
add_task_to_iteration(iteration_id: 1, task_id: "BLOG-010")
```

### Step 6：开始执行并持续跟踪

```
# 开始工作
update_task(task_id: "BLOG-007", status: "active")

# 上报进度
update_progress(task_id: "BLOG-007", progress_pct: 50,
  message: "数据库表已建好，API 路由已注册，正在写业务逻辑")

# 遇到问题
report_blocker(task_id: "BLOG-007",
  blocker_description: "需要确认文章的最大长度限制")

# 完成
complete_task(task_id: "BLOG-007",
  summary: "创建文章 API 已完成，含参数校验、标签关联、slug 自动生成")

# 检查项目健康度
get_risk_report(project: "team-blog")
```

---

## 11. 最佳实践速查表

### ✅ 拆解清单

| 检查项 | 说明 |
|--------|------|
| 叶子节点可执行？ | 每个最底层节点都应该能直接动手做 |
| 粒度 1-3 天？ | 单个可执行任务不超过 3 天工作量 |
| 完成标准清晰？ | 做完后怎么验证？交付物是什么？ |
| 有负责人？ | 每个可执行任务都有明确的 assignee |
| 优先级已标注？ | P0-P3 已设置，团队对齐执行顺序 |
| 关联了迭代？ | 纳入具体 Sprint 的时间盒管理 |

### 🚫 常见错误

| 错误 | 正确做法 |
|------|----------|
| 把"用户系统"直接标 active | 大节点只做拆解，不直接执行 |
| 所有任务都是 P0 | 合理分配优先级，P0 应该控制在 20% 以内 |
| 叶子节点太大："实现登录功能" | 继续拆：前端表单 + 后端接口 + 密码加密 + 会话管理 |
| 忘记上报进度 | 每个关键节点完成时 update_progress |
| 遇到阻塞不上报 | 立刻 report_blocker，不要等 |

### 🔄 日常工作循环

```
每日开始：
  1. whoami()                        → 确认身份
  2. get_my_tasks(status: "active")  → 看手上有什么
  3. request_next_task()             → 看系统推荐
  4. get_unread_notification_count() → 看通知

执行中：
  5. update_task(status: "active")   → 开始
  6. update_progress(...)            → 过程上报
  7. add_task_note(...)              → 记录要点
  8. complete_task(...)              → 收工

收尾：
  9. get_risk_report()               → 查看风险
  10. get_project_status()           → 全局概览
```

---

## 12. 工具速查手册

### 身份
| 工具 | 用途 |
|------|------|
| `whoami` | 查询当前 Agent 身份 |

### 项目管理
| 工具 | 用途 |
|------|------|
| `list_projects` | 列出所有项目 |
| `create_project` | 创建新项目 |
| `get_project` | 获取项目详情 |
| `update_project` | 更新项目信息 |
| `delete_project` | 删除项目 |

### 任务管理（核心）
| 工具 | 用途 |
|------|------|
| `create_task` | 创建节点（title 必填，parent_task_id 建立树结构） |
| `get_task` | 获取任务详情 |
| `list_tasks` | 列表查询（支持状态/板块/里程碑/负责人筛选） |
| `get_my_tasks` | 获取我的任务列表 |
| `get_my_task_tree` | 获取我的需求子树（含祖先路径） |
| `update_task` | 更新任务信息 |
| `delete_task` | 删除任务（含所有子任务） |
| `update_progress` | 上报进度百分比和说明 |
| `complete_task` | 标记任务完成 |
| `report_blocker` | 报告任务阻塞 |
| `add_task_note` | 添加备注 |
| `request_next_task` | 请求系统推荐下一个任务 |
| `batch_update_tasks` | 批量更新状态/负责人/优先级 |

### 配置管理
| 工具 | 用途 |
|------|------|
| `create_domain` | 创建业务板块 |
| `list_domains` | 列出所有板块 |
| `create_milestone` | 创建里程碑 |
| `list_milestones` | 列出所有里程碑 |
| `create_goal` | 创建目标（OKR） |

### 需求池
| 工具 | 用途 |
|------|------|
| `create_backlog_item` | 录入需求池 |
| `list_backlog` | 查看需求池 |
| `schedule_backlog_item` | 需求排期并创建任务 |

### 迭代管理
| 工具 | 用途 |
|------|------|
| `create_iteration` | 创建迭代 |
| `list_iterations` | 查询迭代列表 |
| `get_iteration` | 获取迭代详情（含任务和统计） |
| `update_iteration` | 更新迭代信息 |
| `delete_iteration` | 删除迭代 |
| `add_task_to_iteration` | 将任务添加到迭代 |
| `remove_task_from_iteration` | 从迭代移除任务 |

### 收件箱（Intake）
| 工具 | 用途 |
|------|------|
| `submit_intake` | 提交外部反馈 |
| `list_intake` | 查看收件箱列表 |
| `review_intake` | 审核（accept/reject/defer/duplicate） |

### 附件管理
| 工具 | 用途 |
|------|------|
| `add_task_attachment` | 添加附件（文档/链接） |
| `list_task_attachments` | 查看附件列表 |
| `update_task_attachment` | 更新附件 |
| `delete_task_attachment` | 删除附件 |

### 权限管理
| 工具 | 用途 |
|------|------|
| `grant_permission` | 授予节点权限 |
| `revoke_permission` | 撤销权限 |
| `list_permissions` | 查看权限列表 |

### 归档
| 工具 | 用途 |
|------|------|
| `archive_task` | 归档任务 |
| `unarchive_task` | 恢复已归档任务 |
| `list_archived_tasks` | 查看归档列表 |

### 通知
| 工具 | 用途 |
|------|------|
| `list_notifications` | 获取通知列表 |
| `get_unread_notification_count` | 未读通知数量 |
| `mark_notification_read` | 标记已读 |
| `mark_all_notifications_read` | 全部标记已读 |

### 项目概览
| 工具 | 用途 |
|------|------|
| `get_project_status` | 项目状态概览 |
| `get_risk_report` | 风险报告（逾期/阻塞/停滞） |
| `get_resource_allocation` | 资源分配情况 |

### 成员管理
| 工具 | 用途 |
|------|------|
| `list_members` | 列出项目成员 |
| `get_member` | 获取成员详情 |
| `create_member` | 创建成员（人类或 Agent） |
| `update_member` | 更新成员信息 |
| `delete_member` | 删除成员 |

---

> **记住**：万物可拆解、逐层分类、直到可执行。
> 
> 不确定怎么拆？从用户能感知到的功能出发，一层层往下问"这个怎么实现"，答案就是下一层的子节点。
> 
> 祝你使用 ClawPM 愉快！🦀
