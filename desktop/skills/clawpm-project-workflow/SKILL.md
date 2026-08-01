---
name: clawpm-project-workflow
description: 在包含 .clawpm/clawpm.json 的本地 Git 项目中分析问题、递归拆分、创建、领取、推进、测试、验收或重新打开任务时使用。让 Agent 把需求拆成目标、阶段和可独立验证的叶子任务，直接维护 ClawPM Vault，并遵守状态、依赖、租约、测试证据和并发约束。
---

# ClawPM 项目执行工作流

把 `.clawpm` 视为项目唯一的任务事实源。使用本 Skill 完成完整闭环，不要只领取任务。

## 开始前

1. 从当前目录向上寻找 `.clawpm/clawpm.json`；找不到时停止并询问用户是否要用 ClawPM 初始化。
2. 完整阅读 `.clawpm/AGENTS.md`，其项目约束优先于本 Skill。
3. 读取 `clawpm.json`、`domains.json`、`milestones.json`、`people.json`、`links.json` 及相关 `tasks/*.json`。
4. 执行 `git status --short -- .clawpm` 和 `git diff -- .clawpm`，同时检查未跟踪文件。遇到同一任务文件的并行修改时停止，不能覆盖或整体格式化。
5. 写入前阅读 [Vault 协议](references/vault-protocol.md)。
6. 规划或拆分任务时必须阅读 [递归拆解协议](references/decomposition-protocol.md)。

## 选择动作

- 新需求：先建立“目标 → 阶段/问题 → 叶子任务”的问题树，再写入 Vault。
- 大任务：递归拆分，直到每个叶子都能由一个 Agent 独立实现并验证；不得用领域标签或依赖链冒充父子层级。
- 开始工作：检查依赖和有效租约，再领取任务。
- 执行中：更新 0–99 的进度、摘要、时间与历史；遇到问题记录阻塞。
- 实现完成：运行测试并写入命令、结果及证据。失败时回到执行状态。
- 准备完成：检查所有 Gate，通过后才能写入 `done` 和 100%。
- 发现回归：重新打开任务，保留旧测试与历史证据。

## 拆分和创建任务

1. 每个需求只创建一个结果根任务；根任务表达用户可观察的最终结果，不按前端、后端、模块或领域平铺多个根任务。
2. 先拆根任务的阶段或问题分支，再逐个检查分支；不满足叶子准入条件的任务必须继续向下拆。
3. 叶子任务必须有单一结果、明确边界、具体 `acceptanceCriteria`、验证方式和依赖；描述中的清单不能代替子任务。
4. 使用 `parent` 表达工作分解，使用 `deps` 表达先后关系。除结果根任务外，本次需求的所有任务都必须有 `parent`。
5. 分支任务只用于汇总子任务，不得领取并直接实现；只能领取没有子任务且满足准入条件的叶子任务。
6. 每个实现分支至少有一个 `type: "test"` 的验收任务；每个实现叶子自身也必须说明验证方法或记录独立 `testResults`。
7. ID 在整个 Vault 唯一：领域根任务使用 `<DOMAIN>-NNN`，子任务使用 `<PARENT-ID>-NNN`，取现有最大序号后递增。
8. 每个任务单独写入 `tasks/<TASK-ID>.json`，使用 `clawpm-task@2` 格式并维护 `revision`。
9. 创建子任务后，在父任务 `history` 追加 `split` 事件，记录新子任务 ID。

## 领取和推进任务

1. 确认任务是满足 [递归拆解协议](references/decomposition-protocol.md) 的叶子；仍可继续拆分或已有子任务时不得领取父任务。
2. 确认 `deps` 全部为 `done`；未完成时报告依赖，不得领取后绕过。
3. 检查 `claim.active` 和 `claim.leaseUntil`。其他 Agent 的有效租约存在时停止并报告。
4. 领取时写入 `assignee`、`claim.agent`、`claimedAt`、`leaseUntil`、`active: true`，将可执行任务推进到 `active`。
5. 在 `history` 追加 `claimed` 事件。Agent identifier 应存在于 `people.json`；不存在时先登记为 `type: "agent"`。
6. 更新进度时同步更新 `progress`、`updatedAt` 和 `history`。不要用 100% 绕过完成 Gate。
7. 阻塞时写入 `blocker`、`blockedAt`、`blockedBy` 和 `blocked` 历史；解除后追加 `unblocked` 历史。

## 测试和验收

1. 测试记录至少包含 `status`、`command` 或 `evidence`、`summary`、`actor` 和 `at`。
2. 测试失败：追加 `test_failed` 历史，设置阻塞，并把状态退回 `active`。
3. 测试通过：追加 `test_passed` 历史，可进入 `review`。
4. 完成前逐项检查：
   - 至少一条验收标准；
   - 无未解决阻塞；
   - 所有依赖和子任务已完成；
   - 需要测试的任务存在通过记录；
   - 存在提交、代码路径、测试命令或产物位置等交付证据；
   - 当前 Agent 持有有效租约。
5. 全部通过后写入 `status: "done"`、`progress: 100`、`completion`，释放租约并追加 `completed` 历史。

## 禁止事项

- 不引入 HTTP API、Server、数据库、端口或 token；直接维护当前项目 `.clawpm`。
- 不复制其他项目的领域、状态或人员。
- 不把领域、组件、目录或团队名单直接当作任务拆解结果。
- 不创建一批全部 `parent: null` 的平铺任务；依赖关系不能代替父子分解。
- 不把多个实现动作塞进 description，再配一条笼统验收标准伪装成叶子任务。
- 不复用或修改已有任务 ID。
- 不删除历史、测试结果或失败证据来制造“通过”。
- 不改动无关任务文件，不把整个 Vault 重新序列化。

## 提交前验证

1. 解析所有修改过的 JSON。
2. 校验 ID 唯一性，以及父任务、领域、状态、人员和依赖引用。
3. 校验完成任务的 Gate 与证据。
4. 对新计划执行递归拆解自检：单一结果根、父子引用、叶子准入、测试覆盖和无环依赖均通过。
5. 执行 `git diff --check -- .clawpm`、`git status --short -- .clawpm` 和 `git diff -- .clawpm`。
6. 向用户报告创建、拆分、领取、测试或完成了哪些任务，以及验证结果。
