# ClawPM 项目协作规范

## 发行版验收

- 本项目的用户验收对象仅为 Windows Electron 发行版，不以源码修改、开发服务器或 Web 构建结果作为最终交付。
- 每次完成功能、修复或界面调整后，必须执行 `pnpm release:build:win`，生成当前版本的安装包。
- 交付前必须确认 `release-artifacts/v<version>/windows/` 中存在 `.exe`，并校验 `manifest.json` 与 `checksums.txt` 已更新。
- 最终回复必须给出安装包的绝对路径、文件大小和 SHA-256；构建或发行包验证失败时不得宣称任务完成。
- 桌面端技术栈为 Electron。已删除的 Tauri 与 Server 目录不得恢复或重新纳入发行流程。
