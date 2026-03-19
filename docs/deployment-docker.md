# ClawPM Docker 部署方案

本文档基于当前项目代码和已验证的服务器环境整理，目标服务器为 `49.234.185.193`。

## 1. 当前服务器约束

已确认的环境信息：

- 系统：`OpenCloudOS 9.4`
- SSH：可通过本机别名 `petgo-old` 登录
- Docker：已安装并验证可运行
- Docker Compose：已安装并验证可运行
- `80` 端口：已被现有 `nginx` 占用

结论：

- ClawPM 容器仍监听宿主机 `3210` 端口
- 当前公网入口已通过现有 `nginx` 暴露为 `http://49.234.185.193/clawpm/`
- `http://49.234.185.193/` 根路径继续保留给现有站点

## 2. 生产部署形态

采用单机单容器部署：

- `Fastify` 同时提供 Web 静态文件、REST API、MCP SSE
- `SQLite` 和上传文件存放在 Docker volume `clawpm-data`
- 容器内部监听 `3210`
- 宿主机默认映射 `3210:3210`

访问入口：

- Web：`http://49.234.185.193/clawpm/`
- Health：`http://49.234.185.193/clawpm/health`
- MCP SSE：`http://49.234.185.193/clawpm/mcp/sse?token=<CLAWPM_API_TOKEN>`

## 3. 认证模型说明

当前 Web 前端会在浏览器加载时从 `/runtime-config.js` 读取共享 API Token，并用该 Token 调用后端 API。

这意味着：

- 当前版本适合内网、受控团队或小范围可信用户使用
- 如果直接对公网开放，任何能打开页面的人都能在浏览器中看到该 Token
- 若要公开开放给非可信用户，需要额外加一层访问控制，例如：
  - Nginx Basic Auth
  - VPN / 零信任访问
  - 后续补真正的用户登录体系

## 4. 本地需要准备的文件

在项目根目录创建 `.env`：

```bash
cp .env.example .env
```

建议生产环境至少修改：

```dotenv
CLAWPM_API_TOKEN=replace-with-a-long-random-token
CLAWPM_HOST_PORT=3210
CLAWPM_LOG_LEVEL=info
NODE_ENV=production
```

说明：

- `CLAWPM_HOST_PORT` 是宿主机暴露端口
- 容器内服务端口固定为 `3210`
- 容器内数据库路径固定为 `/app/data/clawpm.db`

## 5. 推荐部署流程

### 5.1 首次部署

先在服务器准备工作目录并克隆仓库：

```bash
ssh petgo-old 'mkdir -p /opt && cd /opt && git clone git@github.com:Be1Human/clawpm.git clawpm'
```

如果服务器尚未配置 GitHub SSH 凭据，需要先在服务器上配置可读取仓库的 deploy key 或其他 SSH key。

再把生产 `.env` 传上去：

```bash
scp /Users/huilan/projects/clawpm/.env petgo-old:/opt/clawpm/.env
```

最后在服务器启动：

```bash
ssh petgo-old 'cd /opt/clawpm && CLAWPM_DEPLOY_BRANCH=main bash scripts/deploy-server.sh'
```

### 5.2 日常更新

```bash
ssh petgo-old 'cd /opt/clawpm && CLAWPM_DEPLOY_BRANCH=main bash scripts/deploy-server.sh'
```

## 6. 部署后验证

```bash
ssh petgo-old 'cd /opt/clawpm && docker compose ps'
ssh petgo-old 'cd /opt/clawpm && docker compose logs --tail=200 clawpm'
ssh petgo-old 'curl -fsS http://127.0.0.1:3210/health'
```

预期结果：

- `docker compose ps` 中 `clawpm` 为 `running`
- `/health` 返回 `{"status":"ok","version":"1.0.0"}`
- 浏览器可打开 `http://49.234.185.193/clawpm/`

## 7. 回滚与排障

常用命令：

```bash
ssh petgo-old 'cd /opt/clawpm && docker compose logs -f clawpm'
ssh petgo-old 'cd /opt/clawpm && docker compose restart clawpm'
ssh petgo-old 'cd /opt/clawpm && docker compose down'
ssh petgo-old 'cd /opt/clawpm && docker compose up -d'
```

如需完整重建镜像：

```bash
ssh petgo-old 'cd /opt/clawpm && docker compose down && docker compose up -d --build'
```

## 8. 当前 Nginx 接入方式

当前服务器 `80` 端口已有现有 `nginx`，ClawPM 已通过子路径接入：

```text
/clawpm/ -> http://127.0.0.1:3210
```

推荐方式：

- 新增独立域名，如 `pm.example.com`
- 在 Nginx 中反代到 `http://127.0.0.1:3210`
- 反代完成后，再把 Cursor / 其他 MCP 客户端地址切到域名

当前不建议直接复用 `80` 端口站点根路径 `/`，因为该路径仍由现有站点占用。

## 9. GitHub Actions 自动部署

如果希望每次推送 `main` 后自动更新服务器，可以直接使用仓库内的 `.github/workflows/ci.yml`。

自动部署逻辑：

- 所有 `push` / `pull_request` 先执行 lint 和 build
- 只有 `push` 到 `main` 时才会执行部署
- GitHub Actions 会 SSH 到服务器 `/opt/clawpm`
- 服务器先执行 `git fetch / checkout / reset / clean`
- 然后执行 `docker compose up -d --build`

### 9.1 需要配置的 GitHub Secrets

建议在 GitHub 仓库的 `Settings -> Secrets and variables -> Actions` 中配置：

- `DEPLOY_HOST`
  当前值：`49.234.185.193`
- `DEPLOY_USER`
  当前值：`root`
- `DEPLOY_SSH_KEY`
  用于登录服务器的私钥内容
- `DEPLOY_KNOWN_HOSTS`
  服务器指纹，建议通过本机执行 `ssh-keyscan -H 49.234.185.193` 获取

### 9.2 服务器上的一次性准备

自动部署不会上传 `.env`，服务器需要自行从 GitHub 拉代码，因此需要提前完成两件事：

1. 服务器能通过 SSH 读取 GitHub 仓库
2. 服务器本地已存在 `/opt/clawpm` 仓库工作副本

首次准备示例：

```bash
ssh petgo-old 'mkdir -p /opt && cd /opt && git clone git@github.com:Be1Human/clawpm.git clawpm'
```

然后手动放好生产环境配置：

```bash
scp /Users/huilan/projects/clawpm/.env petgo-old:/opt/clawpm/.env
```

### 9.3 自动部署触发方式

```bash
git push origin main
```

推送成功后：

- GitHub Actions 自动执行 CI
- CI 通过后自动 SSH 到服务器部署
- 服务器执行 `git fetch origin main && git checkout -B main origin/main && git reset --hard origin/main`
- 服务会通过 `http://127.0.0.1:3210/health` 做健康检查

### 9.4 推荐做法

- 先手动部署成功一次，再启用 CI/CD
- `.env` 只保留在服务器，不放进 GitHub
- 如果后续不想继续用 `root`，再切换为专门的部署用户
- 服务器工作副本不要手改文件；当前脚本会自动 hard reset 到远端分支
