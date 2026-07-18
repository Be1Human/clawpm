# 纯客户端 Vault 改造执行约束

本工作包的单一真相源是 `prd.json`。每次只完成一个交付物；只处理 `reviewStatus: "approved"` 且依赖已完成的 story。

## 交付顺序

每个 story 必须依次完成：需求文档、设计文档、框架图、测试用例、代码实现、测试报告。完成后只更新当前交付物的状态，并运行：

```powershell
node scripts/ralph/pure-client-vault/render-dashboard.mjs scripts/ralph/pure-client-vault/prd.json
```

## 硬约束

- 不得重新引入 Fastify、REST、SSE、MCP、SQLite 文件库、`localhost` API 或后台 Node 服务。
- 必须保持 `clawpm-vault@1` 的文件格式、文件名、分片和稳定排序兼容。
- 文件系统访问必须由用户通过 File System Access API 明确授权；最近仓库句柄只存 IndexedDB。
- 写入必须原子化；读取、权限或写入失败时不得静默丢数据。
- 不得手工编辑进度看板 HTML。
- 任何需要变更 Vault 文件格式、添加运行时依赖或保留服务端能力的情况，创建 `.ralph-need-decision` 并停止。

## 质量门

代码实现完成前必须通过：

```powershell
pnpm --filter web lint
pnpm --filter web build
```
