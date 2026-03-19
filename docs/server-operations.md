# ClawPM 服务器运维与服务巡检

本文档用于日常查看线上服务状态、看日志、重启、重新部署与排障。

当前约定：

- 服务器: `49.234.185.193`
- SSH 别名: `petgo-old`
- 部署目录: `/opt/clawpm`
- 容器服务名: `clawpm`
- 对外端口: `3210`
- 数据卷: `clawpm_clawpm-data`
- 当前公网访问入口: `http://49.234.185.193/clawpm/`

注意：

- `http://49.234.185.193/` 仍然是现有的宠物梦视页面
- ClawPM 现在挂在 Nginx 的 `/clawpm/` 路径下
- 容器内部健康检查仍然走 `http://127.0.0.1:3210/health`

如果本机没有 `petgo-old` 别名，也可以把下面命令里的 `ssh petgo-old` 替换成：

```bash
ssh root@49.234.185.193
```

## 1. 最常用的检查命令

查看容器状态：

```bash
ssh petgo-old 'cd /opt/clawpm && docker compose ps'
```

查看健康检查：

```bash
ssh petgo-old 'curl -fsS http://127.0.0.1:3210/health'
```

查看公网入口是否可打开：

```bash
curl -I http://49.234.185.193/clawpm/
```

查看当前部署代码版本：

```bash
ssh petgo-old 'cd /opt/clawpm && git rev-parse --short HEAD'
```

查看最近日志：

```bash
ssh petgo-old 'cd /opt/clawpm && docker compose logs --tail=200 clawpm'
```

持续跟日志：

```bash
ssh petgo-old 'cd /opt/clawpm && docker compose logs -f clawpm'
```

## 2. 如何判断服务是否正常

正常情况下，下面两个检查都应该通过。

### 2.1 Docker Compose 状态

```bash
ssh petgo-old 'cd /opt/clawpm && docker compose ps'
```

重点看：

- `clawpm` 容器存在
- `STATUS` 为 `Up`
- 最好是 `healthy`

### 2.2 应用健康检查

```bash
ssh petgo-old 'curl -fsS http://127.0.0.1:3210/health'
```

预期返回：

```json
{"status":"ok","version":"1.0.0"}
```

如果服务器本机健康检查没问题，再从你本地机器检查公网入口：

```bash
curl -I http://49.234.185.193/clawpm/
curl -fsS http://49.234.185.193/clawpm/health
```

## 3. 查看更详细的运行信息

查看容器详细状态：

```bash
ssh petgo-old "docker inspect clawpm --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}'"
```

查看端口监听：

```bash
ssh petgo-old 'ss -ltnp | grep 3210 || true'
```

查看资源占用：

```bash
ssh petgo-old 'docker stats --no-stream clawpm'
```

查看 Compose 渲染后的最终配置：

```bash
ssh petgo-old 'cd /opt/clawpm && docker compose config'
```

## 4. 查看部署目录与配置是否正常

确认仓库目录存在：

```bash
ssh petgo-old 'test -d /opt/clawpm/.git && echo repo-ok'
```

确认 `.env` 存在：

```bash
ssh petgo-old 'test -f /opt/clawpm/.env && echo env-ok'
```

只查看非敏感配置项：

```bash
ssh petgo-old "cd /opt/clawpm && grep -E '^(CLAWPM_HOST_PORT|CLAWPM_LOG_LEVEL|NODE_ENV)=' .env || true"
```

不要直接把完整 `.env` 输出到终端或截图里，因为里面包含 `CLAWPM_API_TOKEN`。

## 5. 手动重新部署

当前生产部署脚本：

```bash
ssh petgo-old 'cd /opt/clawpm && CLAWPM_DEPLOY_BRANCH=main bash scripts/deploy-server.sh'
```

这个脚本会做几件事：

- 从远端拉取 `main`
- 清理服务器工作树中的临时改动
- 执行 `docker compose up -d --build`
- 检查 `http://127.0.0.1:3210/health`

如果只是重启容器，不重建镜像：

```bash
ssh petgo-old 'cd /opt/clawpm && docker compose restart clawpm'
```

如果要停止服务：

```bash
ssh petgo-old 'cd /opt/clawpm && docker compose down'
```

如果要重新拉起：

```bash
ssh petgo-old 'cd /opt/clawpm && docker compose up -d'
```

如果要强制重新构建：

```bash
ssh petgo-old 'cd /opt/clawpm && docker compose up -d --build'
```

## 6. 数据与卷

查看数据卷：

```bash
ssh petgo-old 'docker volume ls | grep clawpm'
```

查看数据卷详情：

```bash
ssh petgo-old 'docker volume inspect clawpm_clawpm-data'
```

当前生产 SQLite 数据库在容器里挂载到：

```text
/app/data/clawpm.db
```

## 7. CI/CD 触发关系

当前 CI/CD 流程是：

1. 推送到 GitHub `main`
2. GitHub Actions 执行 lint/build
3. CI 通过后，SSH 到服务器 `/opt/clawpm`
4. 服务器执行 `scripts/deploy-server.sh`

所以如果你已经把修复推到 `main`，但线上还没更新，优先检查：

- GitHub Actions 是否成功
- 服务器能否拉到最新代码
- `docker compose up -d --build` 是否报错

## 8. 常见排障

### 8.1 `docker compose ps` 里没有 `clawpm`

说明容器没起来，先看：

```bash
ssh petgo-old 'cd /opt/clawpm && docker compose logs --tail=200 clawpm'
```

如果连容器都没创建出来，再跑一次部署脚本：

```bash
ssh petgo-old 'cd /opt/clawpm && CLAWPM_DEPLOY_BRANCH=main bash scripts/deploy-server.sh'
```

### 8.2 `/health` 访问失败

先确认容器是否在运行：

```bash
ssh petgo-old 'cd /opt/clawpm && docker compose ps'
```

再看应用日志：

```bash
ssh petgo-old 'cd /opt/clawpm && docker compose logs --tail=200 clawpm'
```

### 8.3 外网打不开，但服务器本机 `health` 正常

检查：

- 安全组是否放行 `3210`
- 服务器防火墙是否拦截
- 是否有别的服务占用了宿主机端口

可执行：

```bash
ssh petgo-old 'ss -ltnp | grep 3210 || true'
curl -v http://49.234.185.193:3210/health
```

### 8.4 部署时 Docker 构建失败

优先看日志尾部，一般会直接指出原因：

```bash
ssh petgo-old 'cd /opt/clawpm && docker compose logs --tail=200 clawpm'
```

如果失败发生在镜像构建阶段，通常要重新执行完整部署命令而不是单纯 `restart`。

### 8.5 服务器目录被手工改脏

当前 `scripts/deploy-server.sh` 已经在同步远端前自动清理大多数临时改动。

如果你手工在服务器里改过代码，重新部署时这些改动会被覆盖。

## 9. 推荐日常巡检命令

下面这组命令基本够用：

```bash
ssh petgo-old 'cd /opt/clawpm && docker compose ps'
ssh petgo-old 'curl -fsS http://127.0.0.1:3210/health'
ssh petgo-old 'cd /opt/clawpm && git rev-parse --short HEAD'
ssh petgo-old 'cd /opt/clawpm && docker compose logs --tail=100 clawpm'
```

如果这四条都正常，线上服务通常就是正常的。

## 10. 首次部署与环境准备

如果是第一次部署服务器，请先看 [deployment-docker.md](./deployment-docker.md)。
