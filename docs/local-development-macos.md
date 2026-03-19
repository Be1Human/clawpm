# ClawPM Mac 本地开发启动

本文档面向 macOS 开发环境，说明如何在本机启动 ClawPM，以及 `start.sh` 实际会做什么。

## 1. 前置要求

- macOS
- Git
- Node.js 18+
- `pnpm`，或可用的 `corepack`

推荐先确认：

```bash
node -v
corepack --version
```

如果还没有启用 Corepack：

```bash
corepack enable
```

## 2. 首次启动

```bash
git clone <你的仓库地址>
cd clawpm
chmod +x start.sh
./start.sh
```

脚本会自动完成这些动作：

- 优先使用本机 `pnpm`
- 如果本机没有 `pnpm`，回退到 `corepack pnpm`
- 如果存在 `.env`，自动加载其中的环境变量
- 首次运行时自动执行依赖安装
- 自动创建本地 `data/` 目录
- 同时启动后端和前端

启动成功后，常用入口如下：

- Web 前端: `http://localhost:5173`
- 后端 API: `http://localhost:3210`
- Health: `http://localhost:3210/health`
- MCP SSE: `http://localhost:3210/mcp/sse`

停止方式：

```bash
Ctrl+C
```

## 3. 本地 `.env` 用法

本地开发不强制要求 `.env`。如果没有 `.env`，默认值如下：

- `CLAWPM_PORT=3210`
- `CLAWPM_DB_PATH=./data/clawpm.db`
- `CLAWPM_API_TOKEN=dev-token`
- `CLAWPM_LOG_LEVEL=info`

如果你希望本地自定义端口或 token，可以创建：

```bash
cp .env.example .env
```

建议本地开发只保留你真正需要覆盖的值，例如：

```dotenv
CLAWPM_PORT=3210
CLAWPM_DB_PATH=./data/clawpm.db
CLAWPM_API_TOKEN=my-local-token
CLAWPM_LOG_LEVEL=debug
```

本地开发通常不建议把 `NODE_ENV` 固定成 `production`，除非你就是想模拟生产行为。

## 4. 不用脚本时，手动启动方式

如果你不想使用 `start.sh`，也可以手动分开启动：

```bash
corepack enable
corepack pnpm install
corepack pnpm dev
```

另开一个终端窗口：

```bash
cd /path/to/clawpm
corepack pnpm dev:web
```

## 5. 本地运行检查

检查后端是否正常：

```bash
curl -fsS http://127.0.0.1:3210/health
```

预期返回：

```json
{"status":"ok","version":"1.0.0"}
```

检查前端开发服务器是否起来：

```bash
curl -I http://127.0.0.1:5173
```

## 6. 常见问题

### 6.1 提示 `pnpm not found`

执行：

```bash
corepack enable
```

然后重新运行：

```bash
./start.sh
```

### 6.2 3210 端口被占用

查看占用：

```bash
lsof -iTCP:3210 -sTCP:LISTEN
```

如果只是想换端口，可以在 `.env` 中调整：

```dotenv
CLAWPM_PORT=3211
```

### 6.3 5173 端口被占用

查看占用：

```bash
lsof -iTCP:5173 -sTCP:LISTEN
```

如果是别的 Vite 项目占用，先停掉它，再重启 ClawPM。

### 6.4 想看后端日志

如果使用 `./start.sh`，日志就在当前终端里。

如果是手动启动，查看运行那个终端窗口即可。

## 7. 与服务器部署的区别

Mac 本地开发默认是：

- 前端用 Vite 开发服务器，端口 `5173`
- 后端用 `tsx watch` 热更新
- 数据默认落在本地 `data/clawpm.db`

服务器生产环境则是：

- 使用 Docker Compose
- 前后端打包后由 Fastify 提供静态文件
- 服务入口通常是 `http://服务器IP:3210`

服务器运维请看 [server-operations.md](./server-operations.md)。
