# 自动上传代码规则（Auto Git Push）

## 规则说明

每次完成代码修改后，**必须** 自动将代码提交并推送到远程仓库。

## 触发时机

当满足以下条件时，自动执行代码上传：

1. 完成了对项目文件的新增、修改或删除操作
2. 所有代码修改已经完成（不是中间步骤）
3. 确认修改没有明显的语法错误

## 执行步骤

完成代码修改后，按以下顺序执行：

### 第 1 步：检查变更

```bash
cd /data/workspace/clawpm && git status --short
```

如果没有变更，则跳过后续步骤。

### 第 2 步：暂存变更

```bash
git add -A
```

### 第 3 步：生成 commit message 并提交

- commit message 使用 **英文**
- 遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范
- 格式：`<type>(<scope>): <description>`
- 常用 type：
  - `feat` — 新功能
  - `fix` — 修复 bug
  - `refactor` — 重构
  - `style` — 代码格式调整
  - `docs` — 文档变更
  - `chore` — 构建/工具变更
  - `perf` — 性能优化
- scope 可选，使用变更的模块名，如 `server`、`web`、`scripts` 等
- description 简洁明了地描述本次变更

示例：
```bash
git commit -m "feat(server): add user authentication endpoint"
git commit -m "fix(web): resolve sidebar collapse issue on mobile"
git commit -m "docs: update README with deployment instructions"
```

### 第 4 步：推送到远程仓库

```bash
git push origin main
```

如果推送失败（例如远程有新提交），先执行：
```bash
git pull --rebase origin main
git push origin main
```

## 注意事项

- 不要提交 `.env`、`node_modules/`、`data/`、`*.db` 等被 `.gitignore` 忽略的文件
- 每次提交应该是一个完整的、有意义的变更单元，不要把无关的修改混在一起
- 如果一次任务涉及多个不相关的功能，可以分多次 commit
- 推送前确认当前在 `main` 分支上
- 如果用户明确要求 **不要提交/推送**，则遵从用户意愿
