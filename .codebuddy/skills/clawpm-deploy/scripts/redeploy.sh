#!/usr/bin/env bash
# ClawPM 一键部署脚本
# 用法:
#   ./redeploy.sh --frontend-only   # 仅重 build 前端（零停机，最常用）
#   ./redeploy.sh --backend-only    # 仅重 build 后端并重启进程
#   ./redeploy.sh --full            # 前后端都 build，然后重启
#   ./redeploy.sh --status          # 查看服务状态
#   ./redeploy.sh --restart         # 不重新 build，仅重启进程
#
# 默认: --frontend-only

set -euo pipefail

MODE="${1:---frontend-only}"
PROJECT_DIR="/data/workspace/clawpm"
NODE_BIN="/data/home/cloudboyguo/.workbuddy/binaries/node/versions/20.18.0/bin"
PORT=3210
DB_PATH="$PROJECT_DIR/data/clawpm.db"
LOG_FILE="/tmp/clawpm.log"

export PATH="$NODE_BIN:$PATH"

log() { echo -e "\033[1;34m[clawpm-deploy]\033[0m $*"; }
ok()  { echo -e "\033[1;32m[  OK  ]\033[0m $*"; }
err() { echo -e "\033[1;31m[ FAIL ]\033[0m $*" >&2; }

find_pid() {
  ss -tlnp 2>/dev/null | grep ":${PORT} " | grep -oP 'pid=\K[0-9]+' | head -1
}

status() {
  local pid; pid=$(find_pid || true)
  if [[ -z "$pid" ]]; then
    log "服务未运行（无进程监听 :${PORT}）"
    return 1
  fi
  log "运行中: PID=$pid"
  ps -p "$pid" -o pid,ppid,user,etime,cmd | sed 's/^/       /'
  log "工作目录: $(readlink /proc/$pid/cwd 2>/dev/null || echo '?')"
  log "健康检查:"
  curl -fsS -m 5 "http://127.0.0.1:${PORT}/health" | sed 's/^/       /' || err "健康检查失败"
  echo
  log "HTML 引用的资源 vs 磁盘产物:"
  local served disk
  served=$(curl -s -m 5 "http://127.0.0.1:${PORT}/" | grep -oE 'index-[A-Za-z0-9_-]+\.(js|css)' | sort -u)
  disk=$(ls "$PROJECT_DIR/web/dist/assets/" 2>/dev/null | grep -E 'index-.*\.(js|css)$' | sort -u)
  echo "  served:"; echo "$served" | sed 's/^/    /'
  echo "  disk:";   echo "$disk"   | sed 's/^/    /'
  if [[ "$served" == "$disk" ]]; then ok "一致，前端已生效"; else err "不一致，需 curl 强刷或重启"; fi
}

build_frontend() {
  log "构建前端 (vite build)..."
  ( cd "$PROJECT_DIR/web" && npm run build ) | tail -20
  ok "前端构建完成 → $PROJECT_DIR/web/dist/"
}

build_backend() {
  log "构建后端 (tsc)..."
  ( cd "$PROJECT_DIR/server" && npm run build ) | tail -20
  ok "后端构建完成 → $PROJECT_DIR/server/dist/"
}

stop_server() {
  local pid; pid=$(find_pid || true)
  if [[ -n "$pid" ]]; then
    log "停止旧进程 PID=$pid"
    kill "$pid" || true
    for _ in 1 2 3 4 5; do
      if ! kill -0 "$pid" 2>/dev/null; then ok "已停止"; return; fi
      sleep 1
    done
    log "强制 kill -9 $pid"
    kill -9 "$pid" 2>/dev/null || true
  else
    log "没有运行中的进程，跳过停止"
  fi
}

start_server() {
  log "启动 node server/dist/index.js（日志 → $LOG_FILE）"
  cd "$PROJECT_DIR"
  CLAWPM_DB_PATH="$DB_PATH" \
    nohup node server/dist/index.js > "$LOG_FILE" 2>&1 &
  disown
  log "等待健康检查..."
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS -m 2 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
      ok "服务已就绪 (尝试 $i 次)"
      curl -fsS "http://127.0.0.1:${PORT}/health"; echo
      return 0
    fi
    sleep 1
  done
  err "10 秒内未就绪，请查看 $LOG_FILE"
  tail -30 "$LOG_FILE" || true
  return 1
}

restart_server() {
  stop_server
  start_server
}

case "$MODE" in
  --frontend-only|-f)
    build_frontend
    log "后端未变更，不需要重启"
    status || true
    ;;
  --backend-only|-b)
    build_backend
    restart_server
    status || true
    ;;
  --full|-a)
    build_frontend
    build_backend
    restart_server
    status || true
    ;;
  --restart|-r)
    restart_server
    status || true
    ;;
  --status|-s)
    status
    ;;
  -h|--help)
    sed -n '1,12p' "$0" | sed 's/^# \{0,1\}//'
    ;;
  *)
    err "未知参数: $MODE"
    echo "用法: $0 [--frontend-only|--backend-only|--full|--restart|--status]"
    exit 2
    ;;
esac
