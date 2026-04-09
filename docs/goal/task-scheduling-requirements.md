# 任务调度能力需求文档

## 1. 背景与问题

### 1.1 当前现状

ClawPM 目前已经在任务模型中引入了以下字段：

- `schedule_mode`
- `schedule_cron`
- `schedule_config`

前端已经支持为任务选择以下调度类型：

- `once`：一次性
- `recurring`：周期循环
- `scheduled`：定时触发
- `milestone_driven`：里程碑驱动
- `on_demand`：按需触发

但当前实现仍存在以下问题：

1. **只有字段，没有真正的调度执行**
   - 后端会保存调度字段
   - 前端会展示调度类型样式
   - 但系统没有真正的周期调度器、定时触发器或里程碑事件触发器

2. **配置能力不完整**
   - 创建弹窗目前只能选择 `schedule_mode`
   - 无法在 UI 中配置 cron、具体时间、里程碑事件、时区等细节
   - `TaskDetail` 中的 `scheduleCron` 目前只能展示，不能编辑

3. **调度语义不清晰**
   - “触发”到底意味着什么没有统一定义
   - 不同调度模式需要哪些字段没有清晰规则
   - 触发后是改状态、发通知、记日志还是创建实例，没有明确约束

4. **OpenClaw / MCP / REST / 前端体验不一致**
   - 一部分能力能存字段
   - 一部分能力不能配置
   - 一部分调用链路之前 schema 不完整
   - 用户感知上像“有功能”，实际上还不可用

### 1.2 为什么必须补齐

任务调度不是单纯的视觉标签，而是项目管理中的核心能力。用户希望系统支持：

- 周期性例行任务自动到点提醒或激活
- 某个具体时间点自动触发任务
- 某个里程碑完成后自动触发后续任务
- 某些任务只能人工手动触发，但需要被明确建模

如果调度字段只是元数据，会造成：

- 用户误以为系统会自动执行
- AI / MCP 调用方无法可靠配置任务触发策略
- 数据模型与业务体验长期不一致

---

## 2. 目标

### 2.1 核心目标

为 ClawPM 建立一套**真正可执行的任务调度能力**，使任务不仅能保存调度信息，还能根据配置被系统自动或手动触发。

### 2.2 具体目标

1. 明确每种 `schedule_mode` 的语义
2. 为不同模式提供完整的配置规则
3. 提供真实可运行的后端触发机制
4. 提供前端可配置、可查看、可追踪的交互
5. 保证 REST API、MCP、前端三端语义一致
6. 为后续扩展更复杂规则保留空间

### 2.3 非目标

本期不追求：

1. 支持复杂 RRULE 标准（如 iCal 全量规则）
2. 支持节假日/工作日历联动
3. 支持分布式多实例抢占调度
4. 支持调度后自动克隆出多份任务实例
5. 支持秒级高精度触发

---

## 3. 关键概念定义

### 3.1 任务调度模板

带有 `schedule_mode != 'once'` 的任务，可以被视为一个具备触发规则的任务模板。

### 3.2 触发（Trigger）

“触发”指系统根据调度配置，执行一次任务唤起动作。首版触发行为定义为：

1. 记录一条调度运行记录
2. 给任务增加一条系统备注/历史记录
3. 如任务当前状态为 `backlog` 或 `planned`，自动变更为 `active`
4. 如配置要求通知，则通知 `owner` / `assignee`

### 3.3 一次运行（Run）

每一次被调度器或手动触发，都应有一条独立的运行记录，用于审计、排错和展示历史。

---

## 4. 调度模式需求

### 4.1 `once` 一次性

语义：普通任务，不参与任何自动调度。

规则：

- `schedule_cron` 必须为空
- `schedule_config` 默认为空对象 `{}`
- 系统不会自动扫描触发

### 4.2 `recurring` 周期循环

语义：按固定 cron 周期重复触发。

必填字段：

- `schedule_mode = 'recurring'`
- `schedule_cron`：标准 5 段 cron 表达式

可选配置（存于 `schedule_config`）：

```json
{
  "timezone": "Asia/Shanghai",
  "start_at": "2026-04-10T00:00:00+08:00",
  "end_at": "2026-06-30T23:59:59+08:00",
  "auto_activate": true,
  "notify_owner": true,
  "notify_assignee": false,
  "reopen_on_trigger": false,
  "reset_progress_on_trigger": false
}
```

说明：

- `timezone`：用于 cron 计算时区，默认 `Asia/Shanghai`
- `start_at` / `end_at`：控制生效时间范围
- `auto_activate`：触发后是否自动把任务置为 `active`
- `reopen_on_trigger`：若任务已 `done`，是否重新打开
- `reset_progress_on_trigger`：若重新打开，是否重置进度

示例：

- 每天早上 9 点：`0 9 * * *`
- 每周一早上 9 点：`0 9 * * 1`
- 每月 1 号上午 10 点：`0 10 1 * *`

### 4.3 `scheduled` 定时触发

语义：在一个明确的时间点触发一次。

必填字段：

- `schedule_mode = 'scheduled'`
- `schedule_config.trigger_at`

示例：

```json
{
  "trigger_at": "2026-04-12T09:30:00+08:00",
  "timezone": "Asia/Shanghai",
  "auto_activate": true,
  "notify_owner": true
}
```

规则：

- `schedule_cron` 为空
- 到达 `trigger_at` 后仅触发一次
- 触发完成后，该任务仍保留 `scheduled` 配置历史，但不会再次自动执行

### 4.4 `milestone_driven` 里程碑驱动

语义：当绑定的里程碑达到指定事件时触发。

必填字段：

- `schedule_mode = 'milestone_driven'`
- `schedule_config.milestone_id`
- `schedule_config.trigger_on`

示例：

```json
{
  "milestone_id": 12,
  "trigger_on": "completed",
  "auto_activate": true,
  "notify_owner": true
}
```

首版支持：

- `trigger_on = 'completed'`

说明：

- 当目标里程碑状态从非 `completed` 变为 `completed` 时，触发任务
- 若目标里程碑不存在、被删除或任务未绑定权限，则在 UI 中给出异常提示

### 4.5 `on_demand` 按需触发

语义：不会自动触发，只能由用户、API 或 MCP 显式触发。

规则：

- `schedule_mode = 'on_demand'`
- `schedule_cron` 为空
- `schedule_config` 可为空，也可存入手动触发策略

首版能力：

- 在任务详情页提供“立即触发”按钮
- 提供 REST API 触发接口
- 提供 MCP 工具触发接口

---

## 5. 配置与校验规则

### 5.1 字段合法性

| mode | schedule_cron | schedule_config | 说明 |
|------|---------------|----------------|------|
| once | 必须为空 | 可为空对象 | 普通任务 |
| recurring | 必填 | 可选 | cron + 额外配置 |
| scheduled | 必须为空 | 必填 `trigger_at` | 单次时间点触发 |
| milestone_driven | 必须为空 | 必填 `milestone_id` + `trigger_on` | 事件驱动 |
| on_demand | 必须为空 | 可为空 | 手动触发 |

### 5.2 后端校验要求

保存时必须做以下校验：

1. `schedule_mode` 必须属于允许枚举
2. `recurring` 模式下 `schedule_cron` 必须可解析
3. `scheduled` 模式下 `trigger_at` 必须是合法时间
4. `milestone_driven` 模式下 `milestone_id` 必须存在且属于当前项目
5. 无效组合必须返回 400，并给出明确错误原因

---

## 6. 触发行为需求

### 6.1 统一触发动作

一次成功触发后，系统应：

1. 写入一条调度运行记录
2. 写入任务历史或备注：记录触发时间、触发类型、触发来源
3. 若任务状态为 `backlog` / `planned` 且 `auto_activate = true`，则更新为 `active`
4. 若任务状态为 `done` / `review`：
   - 若 `reopen_on_trigger = true`，则重新打开
   - 否则不改状态，只记录触发
5. 按配置发送通知

### 6.2 幂等要求

同一“触发时刻 / 触发事件”不能重复执行多次。系统必须提供幂等机制，避免：

- cron 轮询重复触发
- 里程碑状态变更重复触发
- 服务重启后重复补跑同一轮

### 6.3 跳过规则

以下情况应跳过触发并记录原因：

- 任务已归档
- 任务已删除
- 配置非法
- 里程碑不存在
- 已超过 `end_at`

---

## 7. 前端需求

### 7.1 创建任务弹窗

在 `CreateTaskModal` 中新增动态调度配置区域：

- 选择 `recurring` 时显示 cron 输入与预设模板
- 选择 `scheduled` 时显示时间选择器
- 选择 `milestone_driven` 时显示里程碑下拉和事件类型
- 选择 `on_demand` 时显示触发说明

### 7.2 任务详情页

在 `TaskDetail` 中支持：

- 编辑 `schedule_mode`
- 编辑与当前模式对应的配置
- 展示下次触发时间 `next_run_at`
- 展示最近触发时间 `last_triggered_at`
- 展示最近几条调度运行记录
- 对 `on_demand` 模式显示“立即触发”按钮

### 7.3 列表 / 思维导图

继续保留调度耳标与样式提示，同时增加：

- tooltip 显示调度描述
- 可选显示下次触发时间
- 配置异常时显示警告态

---

## 8. 核心交互理念：Agent 与调度系统的关系

### 8.1 基本原则

**任务调度系统不会主动调用 Agent。** ClawPM 的调度模块是一套"状态机 + 事件记录器"，它做的事情是：

1. 按照配置好的规则（cron、时间点、里程碑事件）**改变任务的状态**
2. **记录每一次触发的日志**（谁触发的、什么时间、结果如何、有没有跳过）
3. **计算并暴露"下一次会发生什么"的元数据**

而 Agent（OpenClaw / 任何 MCP 客户端）通过主动查询这些信息来做决策。整个链路是：

```
调度系统自动维护任务状态 → Agent 通过 MCP 拉取最新状态 → Agent 自行判断该做什么
```

### 8.2 每种调度模式给 Agent 提供什么信息

Agent 不需要理解 cron 怎么解析，不需要自己算时间。它只需要通过 MCP 工具查询到以下信息，就能知道任务当前处于什么阶段、该不该行动：

#### `once` 一次性任务

| Agent 可获取的信息 | 说明 |
|---|---|
| `status` | 当前任务状态（backlog/planned/active/review/done） |
| `scheduleMode = 'once'` | 这是个普通任务，没有自动触发 |
| `progress` | 当前完成百分比 |

Agent 的判断：**看 status 和 progress 即可。** 一次性任务没有调度事件，Agent 按普通任务处理。

#### `recurring` 周期循环任务

| Agent 可获取的信息 | 说明 |
|---|---|
| `scheduleMode = 'recurring'` | 这个任务会被系统周期性激活 |
| `scheduleCron` | cron 表达式（Agent 可展示给用户但不需要自己解析） |
| `scheduleNextRunAt` | **下一次系统将自动触发的时间**（已算好，ISO 格式） |
| `scheduleLastTriggeredAt` | 上一次被触发的时间 |
| `schedulePaused` | 调度是否被暂停 |
| `scheduleLastError` | 上一次触发是否出错（空 = 正常） |
| `status` | 当前状态（每次触发后可能被系统自动改为 active） |
| 调度运行日志（通过 `list_task_schedule_runs`）| 历史触发记录列表 |

Agent 的判断逻辑示例：
- "这个任务的 `scheduleNextRunAt` 是明天早上 9 点，`status` 是 done → 说明上一轮已完成，下一轮还没开始，当前不需要做什么"
- "这个任务的 `status` 刚被系统改成了 active，`scheduleLastTriggeredAt` 是 5 分钟前 → 说明新一轮周期刚触发，Agent 应该开始处理"
- "这个任务的 `scheduleLastError` 不为空 → 需要通知用户调度出了问题"

#### `scheduled` 定时触发任务

| Agent 可获取的信息 | 说明 |
|---|---|
| `scheduleMode = 'scheduled'` | 这个任务会在特定时间点被触发一次 |
| `scheduleConfig.trigger_at` | 计划触发时间 |
| `scheduleNextRunAt` | 同 trigger_at（触发前有值，触发后清空） |
| `scheduleLastTriggeredAt` | 已触发则有值，未触发则为空 |
| `status` | 触发前可能是 planned，触发后可能变为 active |

Agent 的判断逻辑示例：
- "`scheduleNextRunAt` 有值且在未来 → 任务还没被触发，等着就行"
- "`scheduleNextRunAt` 为空且 `scheduleLastTriggeredAt` 有值 → 已经触发过了，看当前 status 决定是否要行动"

#### `milestone_driven` 里程碑驱动任务

| Agent 可获取的信息 | 说明 |
|---|---|
| `scheduleMode = 'milestone_driven'` | 这个任务在绑定的里程碑完成后被触发 |
| `scheduleConfig.milestone_id` | 绑定的里程碑 ID |
| `scheduleConfig.trigger_on` | 触发条件（首版只有 `completed`） |
| `scheduleLastTriggeredAt` | 是否已被触发 |
| `status` | 触发前是 planned/backlog，触发后可能变为 active |
| 里程碑本身的状态（通过 `list_milestones`）| Agent 可以自行查看里程碑进度 |

Agent 的判断逻辑示例：
- "这个任务绑定了里程碑 M-3，`scheduleLastTriggeredAt` 为空 → 里程碑还没完成，这个任务还不到行动的时候"
- "这个任务 `status` 被自动改为 active，最近触发记录显示来源是 `milestone_event` → 里程碑刚完成，Agent 应该开始处理"

#### `on_demand` 按需触发任务

| Agent 可获取的信息 | 说明 |
|---|---|
| `scheduleMode = 'on_demand'` | 只能手动触发，系统永远不会自动激活 |
| `scheduleLastTriggeredAt` | 上一次被手动触发的时间 |
| 调度运行日志 | 每次手动触发的历史 |
| `status` | 手动触发后可能变为 active |

Agent 的判断逻辑：
- "这个任务是 `on_demand`，当前 status 不是 active → 没人触发它，Agent 不该主动去做"
- "Agent 自己也可以通过 `trigger_task` MCP 工具来主动触发这个任务"

### 8.3 Agent 典型工作流

Agent 在接收到用户指令（如"帮我看看项目里有什么需要做的"）后，典型的查询和决策链路是：

```
1. 调用 get_my_tasks 或 list_tasks → 拿到自己负责的任务列表
2. 遍历任务，检查每个任务的：
   - status：是 active 吗？
   - scheduleMode：是什么类型？
   - scheduleLastTriggeredAt：最近触发过吗？
   - scheduleNextRunAt：下一次什么时候触发？
   - progress：进度到哪了？
3. 对于 recurring 任务：
   - 如果 status=active 且 progress<100 → 继续做
   - 如果 status=done → 看 scheduleNextRunAt，告诉用户"下次在 X 时间会重新激活"
4. 对于 milestone_driven 任务：
   - 如果尚未触发 → 调用 list_milestones 查看里程碑进度，告知用户"等 M-3 完成后会自动激活"
5. 对于 on_demand 任务：
   - 如果 status!=active → 告知用户"这个任务需要手动触发才会开始"
6. 如果需要看触发历史 → 调用 list_task_schedule_runs
7. 如果需要手动触发 → 调用 trigger_task
```

### 8.4 为什么不让调度系统直接调用 Agent

1. **解耦**：调度模块只管状态和记录，不依赖 Agent 是否在线、响应是否及时
2. **可控**：Agent 可以自己决定频率、批量处理多个任务、优先级排序
3. **可审计**：所有信息变动都有日志，Agent 查到什么、做了什么都可追溯
4. **简单**：不需要建立调度→Agent 的推送通道、重试机制、超时处理

---

## 9. API 与 MCP 需求

### 9.1 REST API

任务创建与更新接口需要支持：

- `schedule_mode`
- `schedule_cron`
- `schedule_config`

返回字段必须包含（供 Agent 和前端消费）：

- `scheduleMode`
- `scheduleCron`
- `scheduleConfig`
- `scheduleNextRunAt`（新增）
- `scheduleLastTriggeredAt`（新增）
- `schedulePaused`（新增）
- `scheduleLastError`（新增）

新增接口：

- `POST /api/v1/tasks/:taskId/trigger`：手动触发（Agent 和前端均可用）
- `GET /api/v1/tasks/:taskId/schedule-runs`：查询运行记录

### 9.2 MCP 工具

#### 现有工具增强

| 工具 | 增强内容 |
|---|---|
| `get_task` | 返回值必须包含 `scheduleNextRunAt`、`scheduleLastTriggeredAt`、`schedulePaused`、`scheduleLastError` |
| `get_my_tasks` / `list_tasks` | 返回列表中每个任务都包含上述字段；新增 `schedule_mode` 筛选参数 |
| `get_tree_outline` | 大纲中包含 `scheduleMode` 和 `scheduleNextRunAt`，Agent 可快速扫描哪些任务有调度 |
| `create_task` | 可传入 `schedule_mode`、`schedule_cron`、`schedule_config` |
| `update_task` | 可修改调度字段 |
| `batch_update_tasks` | 可批量修改调度字段 |

#### 新增工具

| 工具 | 用途 | 参数 |
|---|---|---|
| `trigger_task` | Agent 或用户手动触发一个 on_demand 任务 | `task_id`、`reason?` |
| `list_task_schedule_runs` | 查看某个任务的调度触发历史 | `task_id`、`limit?` |
| `list_due_tasks` | 查询"即将触发"或"刚刚被触发"的任务 | `within_minutes?`（默认 60）、`project?` |
| `pause_task_schedule` | 暂停一个任务的调度 | `task_id` |
| `resume_task_schedule` | 恢复一个任务的调度 | `task_id` |

`list_due_tasks` 是专门为 Agent 设计的工具：Agent 不需要自己遍历所有任务再逐个判断时间，可以直接问系统"未来 1 小时内有哪些任务要触发或刚触发过"，系统返回一个精确列表。

### 9.3 MCP 返回示例

Agent 调用 `get_task` 拿到的返回（JSON），调度相关字段部分：

```json
{
  "taskId": "U-042",
  "title": "周报汇总",
  "status": "active",
  "scheduleMode": "recurring",
  "scheduleCron": "0 9 * * 1",
  "scheduleConfig": {
    "timezone": "Asia/Shanghai",
    "auto_activate": true,
    "notify_owner": true,
    "reopen_on_trigger": true,
    "reset_progress_on_trigger": true
  },
  "scheduleNextRunAt": "2026-04-14T09:00:00+08:00",
  "scheduleLastTriggeredAt": "2026-04-07T09:00:07+08:00",
  "schedulePaused": false,
  "scheduleLastError": null
}
```

Agent 看到这个返回后可以得出结论：
- 这是一个周期任务，每周一早 9 点触发
- 上一次触发是 4 月 7 日（周一），下一次是 4 月 14 日
- 当前 status=active，说明本轮周期正在进行中
- 没有报错，调度运行正常

Agent 调用 `list_task_schedule_runs` 拿到的返回：

```json
[
  {
    "runId": 28,
    "taskId": "U-042",
    "triggerType": "recurring",
    "triggerSource": "scheduler_poller",
    "scheduledAt": "2026-04-07T09:00:00+08:00",
    "triggeredAt": "2026-04-07T09:00:07+08:00",
    "status": "triggered",
    "payload": {}
  },
  {
    "runId": 22,
    "taskId": "U-042",
    "triggerType": "recurring",
    "triggerSource": "scheduler_poller",
    "scheduledAt": "2026-03-31T09:00:00+08:00",
    "triggeredAt": "2026-03-31T09:00:04+08:00",
    "status": "triggered",
    "payload": {}
  }
]
```

Agent 看到这个返回后可以知道：
- 最近两次都按时触发成功了
- 触发来源都是系统自动轮询
- 没有 `skipped` 或 `failed` 的记录

### 9.4 语义一致性

前端、REST、MCP 必须全部使用同一套字段命名：

- 输入：`schedule_mode` / `schedule_cron` / `schedule_config`（snake_case）
- 输出：`scheduleMode` / `scheduleCron` / `scheduleConfig` / `scheduleNextRunAt` / `scheduleLastTriggeredAt` / `schedulePaused` / `scheduleLastError`（camelCase）

内部数据库字段使用 `schedule_mode` / `schedule_cron` 等 snake_case 存储。

---

## 10. 非功能需求

### 10.1 时区

- 系统默认时区为 `Asia/Shanghai`
- 后续允许按任务覆盖
- 所有展示时间需明确使用用户本地时区或配置时区

### 10.2 可靠性

- 调度轮询允许分钟级精度
- 服务重启后应能恢复下一次调度计算
- 不要求分布式多实例一致性，但单实例内必须稳定可重试

### 10.3 可观测性

需要可查看：

- 下次执行时间
- 上次执行时间
- 最近执行结果
- 执行失败原因

---

## 11. 不在本期范围内

以下内容明确不纳入本期：

1. 自动生成周期性子任务实例
2. 复杂工作日历/节假日策略
3. 多租户跨时区批量调度优化
4. 秒级触发与高频任务
5. 外部 webhook 触发器
6. 调度系统主动推送/调用 Agent（Agent 始终是主动拉取模式）

---

## 12. 验收标准

| 场景 | 预期行为 |
|------|---------|
| 创建 `recurring` 任务并填写合法 cron | 保存成功，任务展示调度信息，系统能计算下次执行时间 |
| 创建 `scheduled` 任务并设置未来时间 | 到点自动触发一次，并记录历史 |
| 创建 `milestone_driven` 任务并绑定里程碑 | 里程碑完成后任务被触发 |
| 创建 `on_demand` 任务 | 不会自动触发，但可在详情页手动触发 |
| 无效 cron 保存 | 后端拒绝并返回错误信息 |
| 同一 cron 周期被重复扫描 | 只触发一次，不重复执行 |
| 已归档任务到达触发条件 | 不执行，记录跳过原因 |
| OpenClaw 通过 MCP 创建调度任务 | 参数不丢失，字段持久化成功 |
| Agent 通过 `get_task` 拿到 recurring 任务 | 返回中包含 `scheduleNextRunAt`、`scheduleLastTriggeredAt` |
| Agent 通过 `list_tasks` 按 schedule_mode 筛选 | 只返回指定调度类型的任务 |
| Agent 调用 `list_due_tasks` | 返回即将触发或刚触发的任务列表 |
| Agent 调用 `list_task_schedule_runs` | 返回完整的触发历史 |
| Agent 调用 `trigger_task` 触发 on_demand 任务 | 触发成功，状态变更，写入运行记录 |
| Agent 调用 `pause_task_schedule` / `resume_task_schedule` | 调度暂停/恢复，`schedulePaused` 状态正确 |
