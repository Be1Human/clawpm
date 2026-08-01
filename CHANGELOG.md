# Changelog

## [0.1.7]

- 一键安装覆盖 Claude Code、Cursor、Codex 和 CodeBuddy 的 5 个用户 Skill 目录，Codex 同时兼容 `.agents/skills` 与 `.codex/skills`。
- 自动注入全局 `~/.codex/AGENTS.md` 指引，并持久化安装位置、版本、备份和失败项。
- 已安装状态支持重新同步和自修复，重复点击不会产生重复配置。

## [0.1.6]

- 将 Agent Skill 配置收敛为零配置的一键安装，自动适配全部支持平台。
- 默认安装用户级 Skill，不产生项目 Git 改动；平台和项目级选项移入高级设置。

## [0.1.5]

- 新增 Claude Code、Cursor、Codex、CodeBuddy 的用户级与项目级 Skill 注入界面。
- 支持安装状态检测、批量注入、幂等更新和旧版本自动备份。

## [0.1.4]

- 收束为 Electron 本地桌面应用，移除服务端、Tauri 与部署组件。
