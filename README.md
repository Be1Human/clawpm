# ClawPM

ClawPM 是一个 local-first 的 Electron 桌面项目管理应用。项目数据保存在你选择的 Git 项目目录中的 `.clawpm/`，不依赖本地服务端、Docker、Tauri 或远程 API。

## 开发

```powershell
pnpm install
pnpm dev
```

## 构建 Windows 安装包

```powershell
pnpm build:desktop
```

构建产物位于 `desktop/release-build/`。首次启动时，选择一个 Git 项目目录；ClawPM 会在其中创建或打开 `.clawpm/` 数据目录。

## Agent 一键配置

打开侧边栏“设置 → Agent 配置”，点击“一键安装”即可把内置的 `clawpm-project-workflow` 自动安装到 Claude Code、Cursor、Codex 和 CodeBuddy，无需选择平台或配置路径。

一次点击会完成以下配置：

- 安装到 `~/.claude/skills`、`~/.cursor/skills`、`~/.agents/skills`、`~/.codex/skills` 和 `~/.codebuddy/skills`；
- 在 `~/.codex/AGENTS.md` 中写入可重复更新的 ClawPM 托管段落；
- 在 ClawPM 用户数据目录的 `skill-installations/clawpm-project-workflow.json` 中记录安装位置、版本、备份和失败项；
- 更新已有 Skill 前，在 `skill-backups/` 中自动创建可恢复备份。

默认配置对本机所有项目生效且不会产生项目 Git 改动。ClawPM Skill 直接维护项目内的 `.clawpm` Vault，不依赖全局 CLI、Server、端口或 token。需要随项目分享 Skill 时，可在折叠的“高级设置”中选择项目级安装。
