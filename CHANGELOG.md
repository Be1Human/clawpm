# Changelog

## [0.1.2] - 2026-07-19

### Fixed

- Automatically refresh the active Vault when external tools update `.clawpm` files.

## [0.1.1] - 2026-07-19

### 修复

- 修复 Windows 安装包在打包后仍按开发目录查找 Web 入口，导致应用窗口空白的问题。

## [0.1.0] - 2026-07-19

### 新增

- 提供基于 Electron 与 NSIS 的 Windows x64 桌面安装包。
- 支持直接打开 Git 工程目录，并将需求数据保存在工程内的 `.clawpm` 目录。
- 提供可复现的发布前检查、构建编排、SHA-256 校验和产物清单。
