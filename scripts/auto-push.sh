#!/usr/bin/env bash
#
# auto-push.sh — 自动暂存、提交、推送当前变更到远程仓库
#
# 用法:
#   bash scripts/auto-push.sh "feat(server): add new endpoint"
#   bash scripts/auto-push.sh           # 不传 message 则自动生成
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BRANCH="${CLAWPM_PUSH_BRANCH:-main}"

cd "$PROJECT_DIR"

# ── 检查是否是 git 仓库 ──
if [[ ! -d .git ]]; then
  echo "[ERROR] $PROJECT_DIR is not a git repository"
  exit 1
fi

# ── 检查是否有变更 ──
if git diff --quiet HEAD && git diff --cached --quiet; then
  # 也检查是否有未跟踪的文件
  UNTRACKED=$(git ls-files --others --exclude-standard)
  if [[ -z "$UNTRACKED" ]]; then
    echo "[INFO] No changes to commit. Working tree is clean."
    exit 0
  fi
fi

# ── 暂存所有变更 ──
echo "[INFO] Staging all changes..."
git add -A

# ── 生成或使用 commit message ──
if [[ -n "${1:-}" ]]; then
  COMMIT_MSG="$1"
else
  # 自动生成简单的 commit message
  CHANGED_FILES=$(git diff --cached --name-only | head -5)
  FILE_COUNT=$(git diff --cached --name-only | wc -l | tr -d ' ')

  if [[ "$FILE_COUNT" -eq 1 ]]; then
    COMMIT_MSG="chore: update $CHANGED_FILES"
  else
    COMMIT_MSG="chore: update ${FILE_COUNT} files"
  fi
fi

echo "[INFO] Committing: $COMMIT_MSG"
git commit -m "$COMMIT_MSG"

# ── 推送到远程 ──
echo "[INFO] Pushing to origin/${BRANCH}..."
if ! git push origin "$BRANCH" 2>/dev/null; then
  echo "[WARN] Push failed, attempting rebase and retry..."
  git pull --rebase origin "$BRANCH"
  git push origin "$BRANCH"
fi

echo "[OK] Changes pushed to origin/${BRANCH} successfully."
