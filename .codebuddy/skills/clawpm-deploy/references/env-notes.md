# ClawPM 部署环境参考

本文档收录具体到**这台机器**的环境细节，避免每次部署重新探测。

## 运行环境

| 项 | 值 |
|---|---|
| 主机 IP | `9.134.173.79` |
| 服务端口 | `3210` |
| 访问 URL | http://9.134.173.79:3210 |
| 项目目录 | `/data/workspace/clawpm` |
| 数据库文件 | `/data/workspace/clawpm/data/clawpm.db` |
| 运行日志 | `/tmp/clawpm.log` |
| Node 二进制 | `/data/home/cloudboyguo/.workbuddy/binaries/node/versions/20.18.0/bin/node` |
| Node 版本 | 20.18.0（线上一致）/ 22.12.0（备选） |
| 当前用户 | `cloudboyguo` |

## 运行形态识别

**不是**通过以下方式运行的：
- Docker：Docker daemon 未启动（`Cannot connect to /var/run/docker.sock`）
- systemd：`systemctl list-units | grep clawpm` 无结果
- pm2 / forever：无对应进程

**实际**是：
```
node server/dist/index.js     # PPID=1, nohup 脱离终端
  stdout/stderr → /tmp/clawpm.log
  CWD = /data/workspace/clawpm
  唯一显式环境变量 = CLAWPM_DB_PATH
```

## 找运行中进程的方法

```bash
# 通过端口
ss -tlnp 2>&1 | grep ':3210 '
# LISTEN 0 511 0.0.0.0:3210 users:(("node",pid=897004,fd=24))

# 通过 PID 看详情
PID=$(ss -tlnp 2>&1 | grep ':3210 ' | grep -oP 'pid=\K[0-9]+')
ps -p "$PID" -o pid,ppid,user,etime,cmd
ls -l /proc/$PID/cwd             # 工作目录
cat /proc/$PID/environ | tr '\0' '\n' | grep CLAWPM   # 环境变量
readlink /proc/$PID/fd/1         # stdout 指向
```

## 静态文件路径

后端 `server/src/config.ts` 里：

```ts
webDistPath: path.join(__dirname, '../../web/dist')
// 即 /data/workspace/clawpm/web/dist
```

后端用 `@fastify/static` 直读该目录，**前端改动只需重 build，不需要重启 node**。

## 包管理器

仓库根有 `pnpm-lock.yaml`，但 `web/` `server/` 各自有 `package-lock.json`。**pnpm 未安装**，但依赖已经通过 pnpm 安装过，`node_modules` 是 symlink 到 `../node_modules/.pnpm/`。

**重要**：直接用 `npm run build` 即可，**不要** `npm install` 或 `pnpm install`，会破坏现有 symlink 结构。

## 关键环境变量

参考 `docker-compose.yml` 和正在运行进程的 `environ`：

| 变量 | 运行时值 | 说明 |
|---|---|---|
| `CLAWPM_DB_PATH` | `/data/workspace/clawpm/data/clawpm.db` | **必填**，SQLite 路径，重启时必须保持一致 |
| `CLAWPM_PORT` | 默认 `3210` | 当前进程未显式设置，走默认 |
| `CLAWPM_API_TOKEN` | 未设置 | 线上当前裸跑未加 token；docker 方式才强制 |
| `CLAWPM_BASE_PATH` | 未设置 | 反代前缀，当前直接裸端口访问无需 |
| `NODE_ENV` | 未设置 | 同上 |

重启时最小必要集：`CLAWPM_DB_PATH`

## 部署策略决策树

```
改了什么？
├── 只改 web/        → --frontend-only  （不重启，零停机）
├── 只改 server/     → --backend-only   （约 2 秒停机）
├── web + server     → --full           （约 2 秒停机）
└── 只想重启         → --restart        （不重新 build）
```

## GitHub 推送

仓库：https://github.com/Be1Human/clawpm.git

推送命令（token 已嵌在 URL 内）：

```bash
cd /data/workspace/clawpm
git push https://Be1Human:<TOKEN>@github.com/Be1Human/clawpm.git main
```

Token 保存在主 agent memory（ID 92674914），不要写入此文件或提交到仓库。

**注意**：推送 GitHub ≠ 部署。本项目没有 webhook / CI 自动触发，推送后仍需在本机执行部署。

## 常见故障

### health 检查 200 但页面显示旧内容

HTML 引用的资源 hash 与 `web/dist/assets/` 不一致。执行：

```bash
bash .codebuddy/skills/clawpm-deploy/scripts/redeploy.sh --status
```

如显示不一致，重新 build：`--frontend-only`。浏览器需强刷（Ctrl+Shift+R）。

### 端口被占但 /health 超时

进程僵死。`kill -9` 后重启：

```bash
bash .codebuddy/skills/clawpm-deploy/scripts/redeploy.sh --restart
```

### better-sqlite3 native 模块报错

通常出现在 node 版本切换后。必须用 **20.18.0**（初始安装时的版本）。
