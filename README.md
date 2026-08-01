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

默认安装到用户级目录，对本机所有项目生效且不会产生 Git 改动。需要随项目分享 Skill 时，可在折叠的“高级设置”中选择项目级安装。更新已有 Skill 前，ClawPM 会自动创建备份。
