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

## Agent Skill 注入

打开侧边栏“设置 → Skill 注入”，可以把内置的 `clawpm-project-workflow` 安装到 Claude Code、Cursor、Codex 或 CodeBuddy：

- 用户级：对本机所有项目生效，不写入 Git 项目；
- 项目级：写入当前项目的平台配置目录，可随 Git 分享；
- 更新已有 Skill 前，ClawPM 会先在桌面应用用户数据目录中创建备份。
