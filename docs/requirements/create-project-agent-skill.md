# 创建项目时生成 Agent Skill 到 .clawpm

**状态：已实现（源码已完成，TS 编译通过；需重新构建 desktop 包生效）**
**日期：2026-07-25**
**关联：** `docs/goal/git-project-vault-product-goal.md`、`docs/requirements/pure-client-vault.md`

## 1. 背景

新版 ClawPM 是本地优先产品：一个 Git 工程对应一个项目，项目的全部需求数据保存在工程根目录的 `.clawpm` 中（`clawpm.json`、`tasks/*.json` 等）。agent（任意 AI 编码助手）应能直接读取 `.clawpm` 下的文件来建任务、更改进度，而不依赖服务端口或数据库。

为了让"换台机器 / 别人 clone 工程"后，agent 也能立刻知道如何操作该 vault，需要在**创建项目时**就把一份 agent 操作手册（skill）自动生成进该项目的 `.clawpm` 目录，随工程一起被 Git 提交与同步。

## 2. 现状分析（基于代码阅读）

- 创建项目（vault）的核心逻辑在 `desktop/src/main.ts` 的 `createVault(projectPath)`（约 189-213 行）。它：
  - 计算 vault 路径：`vaultPath = path.join(projectPath, '.clawpm')`（见 `vaultPathForProject`，第 38-40 行）。
  - 写入 6 个 root 文件：`clawpm.json`、`domains.json`、`milestones.json`、`fields.json`、`links.json`、`people.json`（均为内联静态字符串）。
  - **不生成任何 agent 说明文档**。
- 服务端 `server/src/store/vault-store.ts` 的 `VaultStore.open()`（第 87 行）在打开 vault 时会调用 `writeAgentsDoc(absDir, ...)`，把 `AGENTS.md` 写到 `absDir`（vault 根）。该文件即 agent 操作手册。
  - 在桌面端，vault 根就是 `.clawpm`，所以 `AGENTS.md` 最终也会落进 `.clawpm`——但这是**服务端 open 时**才补写的，创建那一刻 `.clawpm` 里还没有；且依赖服务端进程运行。
- `server/src/store/format-doc.ts` 第 8-10 行注释称".clawpm/ 是运行时目录（不入 git），说明必须放 vault 根"。这是**旧模型**（旧模型 vault 根是 `data/vault/`，`.clawpm` 只是其运行时子目录）的推理，已不适用于新版。
- 实际 `.gitignore` 只忽略 `data/`，**并未忽略 `.clawpm`**。新版 `.clawpm` 是 vault 本体、应随 Git 提交，旧注释具有误导性。
- `desktop` 是独立 TS 包（`@clawpm/desktop`，`tsconfig` 的 `rootDir` 为 `src`），不便直接 import `server/src/store/format-doc.ts`，且 `createVault` 当前所有 root 文件均为内联字符串——保持一致，skill 文档也以内联字符串写入。

## 3. 需求目标

1. 桌面端"创建需求库"（`createVault`）完成后，`.clawpm/` 下立即可见一份 agent 操作手册（文件名沿用现有约定 `AGENTS.md`）。
2. 该手册聚焦两件事：**如何创建一个任务**、**如何更新任务进度**，并标注最易踩的坑（运行时内存为权威副本、domain 与文件名必须一致等）。
3. 手册随工程 Git 提交/同步，换机或 clone 后 agent 无需任何外部文档即可操作。
4. 修正 `format-doc.ts` 中过时的".clawpm 是运行时目录"注释，使其符合"vault 即 `.clawpm`"的新模型。

## 4. 设计

### 4.1 落点
`desktop/src/main.ts`：
- 新增常量 `AGENTS_FILE = 'AGENTS.md'`（与 `server/src/store/format-doc.ts` 的 `AGENTS_FILE` 同名，避免文件名分歧）。
- 新增纯函数 `buildAgentSkillDoc(vaultName: string): string`，返回聚焦版 agent 操作手册（中文，与现有 `AGENTS.md` 风格一致）。
- 在 `createVault` 写完 6 个 root 文件后，调用 `atomicWrite(path.join(vaultPath, AGENTS_FILE), buildAgentSkillDoc(name))`。

### 4.2 与服务端 `writeAgentsDoc` 的关系
- 服务端 `VaultStore.open()` 仍会在打开时刷新 `AGENTS.md`（内容为完整版）。两者写入同一文件 `AGENTS.md`，不冲突；创建时由桌面端先落一份聚焦版，服务端 open 时刷新为完整版，最终 `.clawpm/AGENTS.md` 始终存在且为最新。
- 不做跨包抽取重构（避免改动 `desktop` 的 `rootDir`/打包与引入复杂度），保持 `createVault` 内联风格。

### 4.3 边界与兼容性
- `AGENTS.md` 不在 `safeRelativePath` 的允许列表（仅 root 文件与 `tasks/`、`archive/`），因此渲染端 `vault:write` 不会误写它；`createVault` 用 `atomicWrite` 直接写，不受该限制影响。
- 快照（`readSnapshot`）不读取 `AGENTS.md`，不影响现有加载逻辑。
- 仅改动桌面创建路径；CLI `vault.ts init` 已通过 `writeAgentsDoc` 生成 `AGENTS.md`，不在本次范围。

## 5. 验收
1. 桌面端对一空目录执行"创建需求库"后，该目录的 `.clawpm/` 下出现 `AGENTS.md`，内容包含"创建任务 / 更新进度"操作说明。
2. `pnpm --filter @clawpm/desktop build` 通过（TS 严格模式）。
3. `AGENTS.md` 可被正常提交到该工程的 Git（不被 `.gitignore` 忽略）。
