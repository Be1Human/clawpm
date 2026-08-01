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
