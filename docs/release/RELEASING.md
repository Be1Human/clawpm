# ClawPM Windows 发布流程

## 产物模型

Windows 发行版使用 Electron + NSIS：

- `ClawPM-Setup-<version>-x64.exe`：用户安装包；
- `latest.yml`、`.blockmap`：后续接入自动更新时使用；
- `manifest.json`：版本、Git commit、构建平台和文件 SHA-256；
- `checksums.txt`：供分发前校验产物完整性。

统一产物目录为 `release-artifacts/v<version>/`，`desktop/release/` 仅作为中间输出。

## 环境要求

- Windows x64；
- Node.js 20 或更高版本；
- pnpm 与已安装的 workspace dependencies；
- 可访问 Electron 与 NSIS 下载源。

## 构建命令

```powershell
pnpm run release:preflight
pnpm run release:build:win
```

清理全部发布产物：

```powershell
pnpm run release:clean
```

发布脚本依次执行 Electron 模式 Web 构建、桌面主进程编译、NSIS x64 打包，并生成校验清单。

## 版本发布清单

1. 同步修改根目录与 `desktop/package.json` 的 `version`；
2. 在 `CHANGELOG.md` 增加对应版本条目；
3. 保证 TypeScript 构建通过；
4. 在干净工作区执行 `pnpm run release:build:win`；
5. 安装并验证首次启动、工程选择、最近工程恢复、需求读写和卸载；
6. 对照 `checksums.txt` 校验安装包；
7. 创建与版本一致的 Git tag，例如 `v0.1.0`；
8. 分发 `release-artifacts/v<version>/windows/` 下的安装包。

## 签名策略

当前构建未配置 Windows Authenticode 证书，因此系统可能显示“未知发布者”。正式外部分发前应在 CI 中注入代码签名证书，私钥不得提交到仓库。签名后仍需重新生成 SHA-256 清单。
