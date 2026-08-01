# ClawPM Vault 协议

## 文件边界

```text
.clawpm/
  AGENTS.md
  clawpm.json
  domains.json
  milestones.json
  fields.json
  links.json
  people.json
  tasks/<TASK-ID>.json
  archive/<TASK-ID>.json
```

任务文件使用单任务格式。`revision` 每次写入递增，业务对象内不要保存 `__file` 或 `__revision`。

```json
{
  "format": "clawpm-task@2",
  "revision": 3,
  "task": {
    "id": "APP-014",
    "title": "实现登录流程",
    "type": "feature",
    "status": "active",
    "priority": "P1",
    "domain": "APP",
    "parent": "APP-003",
    "description": ["实现本地登录状态流转"],
    "acceptanceCriteria": ["正确凭据可以登录", "错误凭据显示明确提示"],
    "verification": { "required": true },
    "progress": 60,
    "deps": [],
    "assignee": "codex",
    "claim": {
      "agent": "codex",
      "claimedAt": "2026-08-01T02:00:00.000Z",
      "leaseUntil": "2026-08-01T04:00:00.000Z",
      "active": true
    },
    "testResults": [],
    "history": [],
    "createdAt": "2026-08-01T01:30:00.000Z",
    "updatedAt": "2026-08-01T02:30:00.000Z"
  }
}
```

## 历史事件

所有改变任务执行状态的操作都追加历史，不修改旧事件。

```json
{
  "id": "evt-1754013600000-4",
  "type": "progress",
  "actor": "codex",
  "summary": "完成表单校验与错误提示",
  "progress": 60,
  "fromStatus": "active",
  "toStatus": "active",
  "at": "2026-08-01T02:30:00.000Z",
  "recordedAt": "2026-08-01T02:30:00.000Z"
}
```

常用 `type`：`created`、`split`、`claimed`、`released`、`progress`、`blocked`、`unblocked`、`test_passed`、`test_failed`、`completed`、`reopened`。

## 测试记录

```json
{
  "id": "test-1754017200000-1",
  "status": "passed",
  "command": "pnpm test -- login",
  "summary": "登录成功、失败与会话恢复用例通过",
  "evidence": ["artifacts/test/login-results.xml"],
  "actor": "codex",
  "at": "2026-08-01T03:30:00.000Z"
}
```

## 完成记录

```json
{
  "at": "2026-08-01T03:40:00.000Z",
  "actor": "codex",
  "summary": "登录流程通过验收",
  "evidence": ["commit abc1234", "pnpm test -- login"]
}
```

`clawpm.json` 的 `workflow.statuses[].id` 是合法状态的唯一来源。不要根据本示例假设某项目一定存在某个状态。
