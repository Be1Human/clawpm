import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticFiles from '@fastify/static';
import multipart from '@fastify/multipart';
import { config } from './config.js';
import { registerRoutes } from './api/routes.js';
import { createMcpServer } from './mcp/server.js';
import { getDb } from './db/connection.js';
import { markVaultDirty, flushVaultStore } from './store/vault-store.js';
import { SchedulerWorker } from './scheduler/worker.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { AuthService, type AuthPrincipal } from './services/auth-service.js';
import fs from 'fs';
import path from 'path';
import { openDesktopWindow } from './desktop.js';

const app = Fastify({ logger: { level: config.logLevel } });
const transports: Record<string, { transport: SSEServerTransport; mcp: ReturnType<typeof createMcpServer> }> = {};

// ── Middleware ─────────────────────────────────────────────────────
// 注意：不用顶层 await（Fastify 内部按注册顺序排队加载插件，listen/ready 时统一解析），
// 以便 esbuild 打成 CJS 供 Node SEA 打包单 exe
app.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
});

// ── Multipart (image upload) ──────────────────────────────────────
app.register(multipart, {
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// ── Uploads static file serving ───────────────────────────────────
const uploadsDir = path.join(path.dirname(config.dbPath), 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.register(staticFiles, {
  root: uploadsDir,
  prefix: '/uploads/',
  decorateReply: false, // 避免与后面 web dist 的 static 冲突
});

// ── Auth hook + User identity extraction ──────────────────────────
app.decorateRequest('clawpmUser', null);
app.decorateRequest('clawpmMember', null);
app.decorateRequest('clawpmPrincipal', null);

app.addHook('onRequest', async (req, reply) => {
  // Skip auth for health check and static files
  if (req.url === '/health' || req.url === '/runtime-config.js' || req.url?.startsWith('/assets') || req.url === '/' || req.url?.startsWith('/uploads/')) return;

  const pathname = req.url?.split('?')[0] || req.url;
  const sessionId = (req.query as any)?.sessionId as string | undefined;
  const isPublicApi = pathname === '/api/v1/auth/register'
    || pathname === '/api/v1/auth/login'
    || pathname === '/api/v1/intake';
  const isKnownMcpSessionMessage = pathname === '/mcp/messages' && !!sessionId && !!transports[sessionId];

  const auth = req.headers.authorization;
  const queryToken = (req.query as any).token;
  const bearerToken = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  const providedToken = bearerToken || queryToken || null;
  const preferredMember = (req.headers['x-clawpm-member'] as string) || (req.headers['x-clawpm-user'] as string) || null;
  let principal: AuthPrincipal | null = null;

  if (providedToken) {
    principal = AuthService.resolvePrincipalByToken(providedToken, preferredMember);
    if (!principal && providedToken === config.apiToken) {
      principal = {
        type: 'legacy',
        authSource: 'legacy_api_token',
        memberIdentifier: preferredMember,
      };
    }
  }

  if (!principal) {
    // Allow unauthenticated access in dev for Web UI
    if (config.isDev && !req.url?.startsWith('/api') && !req.url?.startsWith('/mcp')) return;
    if ((req.url?.startsWith('/api') || req.url?.startsWith('/mcp')) && !isPublicApi && !isKnownMcpSessionMessage) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  }

  (req as any).clawpmPrincipal = principal;
  (req as any).clawpmMember = principal?.memberIdentifier || preferredMember || null;
  (req as any).clawpmUser = (req as any).clawpmMember;
});

// ── Vault 落盘触发（storage=vault）：非 GET 的 API 写请求成功后标脏，防抖落盘 ──
if (config.storage === 'vault') {
  app.addHook('onResponse', async (req, reply) => {
    const m = req.method;
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return;
    if (reply.statusCode >= 400) return;
    const pathname = req.url?.split('?')[0] || '';
    if (pathname.startsWith('/api/v1') || pathname === '/upload/image') markVaultDirty();
  });
}

// ── Health check ───────────────────────────────────────────────────
app.get('/health', async () => ({ status: 'ok', version: '1.0.0' }));

// ── Runtime config for web client ──────────────────────────────────
app.get('/runtime-config.js', async (_req, reply) => {
  reply.type('application/javascript; charset=utf-8');
  reply.header('Cache-Control', 'no-store');
  return `window.__CLAWPM_RUNTIME_CONFIG__ = ${JSON.stringify({
    apiBase: `${config.basePath}/api/v1`,
    apiToken: config.apiToken,
    basePath: config.basePath,
    publicUrl: config.publicUrl || '',
  })};`;
});

// ── MCP Server (SSE) ───────────────────────────────────────────────
app.get('/mcp/sse', async (req, reply) => {
  const principal = (req as any).clawpmPrincipal as AuthPrincipal | null;
  if (!principal) return reply.code(401).send({ error: 'Unauthorized' });
  const transport = new SSEServerTransport('/mcp/messages', reply.raw);
  const mcp = createMcpServer({
    principal,
    memberIdentifier: principal.memberIdentifier || undefined,
  });
  // _sessionId 在构造函数里生成，与发给客户端的 endpoint URL 中的 sessionId 一致
  const sessionId = (transport as any)._sessionId as string;
  transports[sessionId] = { transport, mcp };
  reply.raw.on('close', () => { delete transports[sessionId]; });
  await mcp.connect(transport);
});

app.post('/mcp/messages', async (req, reply) => {
  const sessionId = (req.query as any).sessionId;
  const session = sessionId ? transports[sessionId] : Object.values(transports)[0];
  if (!session) return reply.code(404).send({ error: 'No MCP session' });
  // 将 Fastify 已解析的 body 直接传入，避免 SDK 重复读取 stream
  await session.transport.handlePostMessage(req.raw, reply.raw, req.body);
  // MCP 工具可能写库，保守标脏（无变更时 flush 的差量比对为空，落盘为空操作）
  if (config.storage === 'vault') markVaultDirty();
});

// ── REST API ───────────────────────────────────────────────────────
registerRoutes(app);

// ── Serve Web UI ───────────────────────────────────────────────────
if (fs.existsSync(config.webDistPath)) {
  app.register(staticFiles, {
    root: config.webDistPath,
    prefix: '/',
    // wildcard 必须开启（默认 true），否则 /assets/* 等子目录文件无法被自动路由匹配
  });

  // SPA fallback：非 API / MCP / 静态资源的路由 fallback 到 index.html
  app.setNotFoundHandler(async (req, reply) => {
    if (!req.url?.startsWith('/api') && !req.url?.startsWith('/mcp')) {
      return reply.sendFile('index.html', config.webDistPath);
    }
    return reply.code(404).send({ error: 'Not found' });
  });
}

// ── 退出前落盘（storage=vault）：确保防抖窗口内未落盘的写入不丢失 ──
let flushed = false;
const flushOnce = () => {
  if (flushed || config.storage !== 'vault') return;
  flushed = true;
  flushVaultStore();
};
/** 落盘后退出（信号、窗口关闭共用） */
const shutdown = () => {
  flushOnce();
  process.exit(0);
};
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, shutdown);
}
process.on('beforeExit', flushOnce);

// ── Start ──────────────────────────────────────────────────────────
// 用异步 IIFE 而非顶层 await，保证 esbuild 可输出 CJS（Node SEA 单 exe 需要）
void (async () => {
  try {
    getDb(); // init DB
    // 本地 exe（vault 模式）默认只监听回环，避免暴露到局域网；可用 CLAWPM_HOST 覆盖
    const host = process.env.CLAWPM_HOST || (config.storage === 'vault' ? '127.0.0.1' : '0.0.0.0');
    await app.listen({ port: config.port, host });
    console.log(`🚀 ClawPM running at http://${host}:${config.port}`);
    console.log(`📡 MCP SSE endpoint: http://${host}:${config.port}/mcp/sse`);
    if (config.storage === 'vault') {
      console.log(`📁 存储引擎: vault（文本文件真源）→ ${path.resolve(config.vaultDir)}`);
    }

    // 启动调度器轮询（可通过环境变量关闭；vault 模式默认关闭：调度态不在文本格式内）
    const schedulerEnabled =
      process.env.CLAWPM_SCHEDULER_ENABLED !== 'false' && config.storage !== 'vault';
    if (schedulerEnabled) {
      SchedulerWorker.start();
    } else {
      console.log('⏸️  SchedulerWorker 已禁用');
    }

    // 桌面模式（exe 启动器设置）：开应用窗口而非浏览器标签页，关窗即退出
    if (process.env.CLAWPM_DESKTOP === '1') {
      const { appWindow } = openDesktopWindow(`http://127.0.0.1:${config.port}`, () => {
        console.log('窗口已关闭，正在保存并退出…');
        shutdown();
      });
      console.log(appWindow ? '🖥️  已打开应用窗口（关闭窗口即退出）' : '🌐 未找到 Edge/Chrome，已用默认浏览器打开');
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
})();
