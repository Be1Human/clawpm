# Auth, Agent, OpenClaw PRD

## 1. 背景

ClawPM 当前采用“共享 API Token + 本地选择成员标识”的轻量身份模式：

- 人类用户并未真正登录账号，只是在前端本地选择一个 `member.identifier`
- Agent 也未通过专属凭证登录，而是依赖共享 token 与额外的 `agentId`
- MCP SSE 无法像 stdio 一样天然绑定某个 Agent 身份

该模式在单机试用阶段足够轻便，但已经不满足以下目标：

- 需要让人以账号身份持续登录
- 需要让 Agent 通过专属 token 免交互接入
- 需要让 OpenClaw 可以用最少步骤完成配置
- 需要让后端能够准确识别是谁在调用 API/MCP

## 2. 目标

### 2.1 核心目标

1. 人通过账号登录进入 ClawPM，并保持持久会话
2. Agent 通过绑定 token 登录，不要求输入账号密码
3. 业务层继续沿用 `members.identifier` 作为任务 owner / 通知 recipient / 权限 grantee
4. OpenClaw 可一键拿到可直接使用的 MCP 配置
5. 整体接入步骤尽量少，优先保证首次使用与长期使用都顺滑

### 2.2 非目标

1. 首版不接企业 SSO / OAuth
2. 首版不做多因子认证
3. 首版不承诺自动调用 OpenClaw 外部注册 API
4. 首版不重写现有任务、通知、权限的数据语义

## 3. 用户与主体

### 3.1 人类账号

- 拥有登录凭证
- 可绑定一个或多个项目成员身份
- 在进入项目后，以“当前成员上下文”工作

### 3.2 Agent 成员

- 本质上仍是项目成员
- 通过专属 token 登录
- 不需要账号密码，不需要交互式登录

### 3.3 OpenClaw 实例

- 作为某个 Agent 的运行载体
- 使用 Agent token 访问 ClawPM MCP
- 从 ClawPM 获取专属 SSE 地址和配置包

## 4. 关键体验目标

### 4.1 人的最少步骤

首次使用：

1. 注册账号
2. 自动创建或绑定一个人类成员
3. 进入系统

后续使用：

1. 打开系统
2. 自动恢复登录态
3. 直接进入上次工作上下文

### 4.2 Agent / OpenClaw 的最少步骤

创建新 Agent：

1. 在成员管理页创建 Agent 成员
2. 点击“一键接入 OpenClaw”
3. 系统生成 token、SSE 地址和配置包
4. OpenClaw 导入配置后即可使用

后续使用：

1. OpenClaw 使用已绑定 token 连接
2. MCP 自动识别 Agent 身份
3. 无需再传 `agentId` / `X-ClawPM-User`

## 5. 功能范围

### 5.1 账号系统

- 注册账号
- 登录账号
- 查看当前会话
- 登出
- 绑定项目成员
- 切换当前成员

### 5.2 Agent Token 系统

- 为 Agent 生成 token
- 查看 token 使用状态
- 轮换 token
- 吊销 token
- 生成 OpenClaw 配置包

### 5.3 MCP 身份绑定

- SSE 模式按 token 识别 Agent
- stdio 模式支持通过 token 识别 Agent
- 工具执行时统一从 principal 获取当前成员身份

### 5.4 OpenClaw 接入

- 生成专属 SSE URL
- 生成 JSON 配置片段
- 生成完整配置文件
- 生成一键复制命令

## 6. 信息架构

### 6.1 认证主体与业务身份分层

- 认证主体：账号或 Agent token
- 业务身份：`members.identifier`

设计原则：

- 账号层只负责“你是谁”
- 成员层负责“你在项目里以谁的身份工作”
- 业务数据继续以成员标识为准，避免大规模迁移现有表结构语义

## 7. 关键流程

### 7.1 人类首次进入

1. 用户进入登录页
2. 选择注册
3. 输入用户名、密码、显示名
4. 系统自动检查当前项目是否已有可绑定成员
5. 若无可绑定成员，直接创建一个人类成员并绑定
6. 注册成功后进入个人工作台

### 7.2 人类再次进入

1. 浏览器中存在会话 token
2. 前端调用 `auth/me`
3. 恢复账号与当前成员
4. 直接进入工作台

### 7.3 Agent 创建与接入

1. 管理员进入成员管理页
2. 创建一个 `type=agent` 的成员
3. 点击“生成 OpenClaw 配置”
4. 后端生成专属 Agent token
5. 前端展示：
   - SSE URL
   - token
   - 完整 `mcp.json`
   - 一键复制命令
6. OpenClaw 导入配置后连接成功

## 8. 成功标准

### 8.1 人的登录体验

- 默认登录状态可持久化
- 首次进入不超过 3 步
- 不再要求用户手动选择一个“伪身份”才能工作

### 8.2 Agent 使用体验

- Agent 首次接入不超过 3 步
- MCP 调用不再要求手填 `agentId`
- SSE 与 stdio 都能自动识别当前 Agent

### 8.3 系统一致性

- API 与 MCP 都能解析出统一 principal
- `member.identifier` 继续作为业务主身份
- 兼容旧共享 token / `X-ClawPM-User` 的过渡方案可用

## 9. 风险与约束

1. 现有权限逻辑默认“无授权记录即公开编辑”，账号化后需要继续兼容或单独收口
2. 当前 SSE MCP 是全局 server 实例，改为每连接 principal 绑定时需保证隔离
3. OpenClaw 是否支持自动导入配置取决于外部能力，首版需以“生成即用配置包”为准
