---
name: clawpm-project-workflow
description: 在包含 .clawpm/clawpm.json 的本地 Git 项目中规划、拆分、创建、领取、推进、测试、验收或重新打开任务时使用。让 Agent 直接维护 ClawPM Vault，并遵守状态、依赖、租约、测试证据和并发约束。
---

# ClawPM 项目执行工作流

把 `.clawpm` 视为项目唯一的任务事实源。使用本 Skill 完成完整闭环，不要只领取任务。

## 开始前

1. 从当前目录向上寻找 `.clawpm/clawpm.json`；找不到时停止并询问用户是否要用 ClawPM 初始化。
2. 完整阅读 `.clawpm/AGENTS.md`，其项目约束优先于本 Skill。
3. 读取 `clawpm.json`、`domains.json`、`milestones.json`、`people.json`、`links.json` 及相关 `tasks/*.json`。
4. 执行 `git diff -- .clawpm`。遇到同一任务文件的未提交修改时停止，不能覆盖或整体格式化。
5. 写入前阅读 [Vault 协议](references/vault-protocol.md)。

## 选择动作

- 新需求：找到所属领域和父任务，定义验收标准，再创建任务。
- 大任务：拆成可独立验收的实现任务，并创建至少一个测试任务。
- 开始工作：检查依赖和有效租约，再领取任务。
- 执行中：更新 0–99 的进度、摘要、时间与历史；遇到问题记录阻塞。
- 实现完成：运行测试并写入命令、结果及证据。失败时回到执行状态。
- 准备完成：检查所有 Gate，通过后才能写入 `done` 和 100%。
- 发现回归：重新打开任务，保留旧测试与历史证据。

## 拆分和创建任务

1. 为每个子任务写明单一目标和可验证的 `acceptanceCriteria`。
2. 使用 `parent` 指向父任务 ID，并继承合理的 `domain`、`milestone` 和优先级。
3. 测试工作必须是 `type: "test"` 的任务，或在被测任务的 `testResults` 中形成独立记录。
4. ID 在整个 Vault 唯一：领域根任务使用 `<DOMAIN>-NNN`，子任务使用 `<PARENT-ID>-NNN`，取现有最大序号后递增。
5. 每个任务单独写入 `tasks/<TASK-ID>.json`，使用 `clawpm-task@2` 格式并维护 `revision`。

## 领取和推进任务

1. 确认 `deps` 全部为 `done`；未完成时报告依赖，不得领取后绕过。
2. 检查 `claim.active` 和 `claim.leaseUntil`。其他 Agent 的有效租约存在时停止并报告。
3. 领取时写入 `assignee`、`claim.agent`、`claimedAt`、`leaseUntil`、`active: true`，将可执行任务推进到 `active`。
4. 在 `history` 追加 `claimed` 事件。Agent identifier 应存在于 `people.json`；不存在时先登记为 `type: "agent"`。
5. 更新进度时同步更新 `progress`、`updatedAt` 和 `history`。不要用 100% 绕过完成 Gate。
6. 阻塞时写入 `blocker`、`blockedAt`、`blockedBy` 和 `blocked` 历史；解除后追加 `unblocked` 历史。

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
- 不复用或修改已有任务 ID。
- 不删除历史、测试结果或失败证据来制造“通过”。
- 不改动无关任务文件，不把整个 Vault 重新序列化。

## 提交前验证

1. 解析所有修改过的 JSON。
2. 校验 ID 唯一性，以及父任务、领域、状态、人员和依赖引用。
3. 校验完成任务的 Gate 与证据。
4. 执行 `git diff --check -- .clawpm` 和 `git diff -- .clawpm`。
5. 向用户报告创建、拆分、领取、测试或完成了哪些任务，以及验证结果。
