---
name: clawpm-deploy
description: Use this skill whenever the user asks to deploy, redeploy, publish, restart, or update the ClawPM app running at 9.134.173.79:3210. Triggers include phrases like "部署一下", "更新下部署", "重启 clawpm", "推上去", "发布", "deploy", or any request to make recent code changes visible on the live site. This skill encapsulates ClawPM's non-standard deployment workflow — the app runs as a bare Node process (not Docker, not systemd), hot-reloads frontend via static files, and requires specific environment PATH setup.
---

# ClawPM 部署工作流

## 核心事实 (读之前必须知道)

ClawPM 部署**不走 Docker**、**不走 systemd**、**不走 CI/CD**。运行形态是：

- **本地裸 Node 进程**，`PPID=1`（nohup 脱离终端启动）
- **工作目录**：`/data/workspace/clawpm`（即当前仓库根）
- **宿主 = 构建机 = 运行机**：本机 IP `9.134.173.79`，开发/构建/运行都在同一台
- **前端静态文件直读** `web/dist/`，后端通过 `@fastify/static` 实时 serve
- **端口** `3210`，健康检查 `GET /health` → `{"status":"ok"}`
- **stdout/stderr** 重定向到 `/tmp/clawpm.log`

## 三种部署场景（按频率排序）

### 场景 1：只改了前端（最常见）

**零停机**。只需重新 build，node 进程继续复用磁盘上的新 `web/dist/`。

```bash
bash .codebuddy/skills/clawpm-deploy/scripts/redeploy.sh --frontend-only
```

或手动：

```bash
export PATH=/data/home/cloudboyguo/.workbuddy/binaries/node/versions/20.18.0/bin:$PATH
cd /data/workspace/clawpm/web && npm run build
```

验证：浏览器强刷 `http://9.134.173.79:3210/` 即可。

### 场景 2：改了后端（server/ 目录）

需要重 build server + 重启 node 进程。

```bash
bash .codebuddy/skills/clawpm-deploy/scripts/redeploy.sh --full
```

### 场景 3：前后端都改

同场景 2，脚本会 build 两边并重启。

## 关键操作细节（绕坑用）

### PATH 里没有 node / npm / pnpm

**当前环境默认 PATH 没有任何 Node 工具**，必须显式导出：

```bash
export PATH=/data/home/cloudboyguo/.workbuddy/binaries/node/versions/20.18.0/bin:$PATH
```

可用版本：`20.18.0`（线上运行版本）和 `22.12.0`。**优先用 20.18.0**，与线上一致。

### pnpm 没装，用 npm

虽然仓库根有 `pnpm-lock.yaml`，但 `web/` 和 `server/` 各自有 `package-lock.json`，**可以用 `npm run build`** 直接构建，**不要重装依赖**（已通过 pnpm symlink 到 `node_modules/.pnpm/`，重装会破坏结构）。

### 找到当前运行的 node 进程

```bash
ss -tlnp 2>&1 | grep 3210
# LISTEN 0 511 0.0.0.0:3210 users:(("node",pid=XXXXXX,fd=24))
ls -l /proc/<PID>/cwd   # 应该指向 /data/workspace/clawpm
```

### 重启 node 进程（只在后端变更时需要）

```bash
# 1. 找 PID
PID=$(ss -tlnp 2>&1 | grep ':3210 ' | grep -oP 'pid=\K[0-9]+')

# 2. 杀掉
kill $PID
sleep 2

# 3. 以原参数启动（注意 CLAWPM_DB_PATH 必须一致！）
export PATH=/data/home/cloudboyguo/.workbuddy/binaries/node/versions/20.18.0/bin:$PATH
cd /data/workspace/clawpm
CLAWPM_DB_PATH=/data/workspace/clawpm/data/clawpm.db \
  nohup node server/dist/index.js > /tmp/clawpm.log 2>&1 &
disown
```

### 验证

```bash
curl -fsS http://127.0.0.1:3210/health
# 预期 {"status":"ok","version":"1.0.0"}

# 确认新 hash 生效：对比 HTML 引用与磁盘
curl -s http://127.0.0.1:3210/ | grep -oE 'index-[A-Za-z0-9_-]+\.(js|css)' | sort -u
ls /data/workspace/clawpm/web/dist/assets/
# 两者应一致
```

## 不要做的事

- ❌ 不要执行 `scripts/deploy-server.sh`（要求 docker，本机没 daemon）
- ❌ 不要运行 `docker compose up`（Docker daemon 未启动）
- ❌ 不要在 `web/` 或 `server/` 里跑 `npm install` / `pnpm install` 覆盖现有依赖
- ❌ 不要重启时忘了设 `CLAWPM_DB_PATH`，否则会创建新 DB 丢数据
- ❌ 不要修改 `/tmp/clawpm.log` 的路径，排错时要读它

## 推送到 GitHub（可选，部署与推送是两回事）

部署只需本地 build；如需同步到远端仓库（`Be1Human/clawpm`），见 `references/env-notes.md` 的 GitHub 凭据部分。

## 详细参考

需要更多环境细节时查看：

- `references/env-notes.md` — 进程识别、端口占用、日志位置、GitHub 推送凭据等
- `scripts/redeploy.sh` — 一键部署脚本，支持 `--frontend-only` / `--backend-only` / `--full` / `--status`
