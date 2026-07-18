import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticFiles from '@fastify/static';
import multipart from '@fastify/multipart';
import { config } from './config.js';
import { registerRoutes } from './api/routes.js';
import { createMcpServer } from './mcp/server.js';
import { getDb } from './db/connection.js';
import { markVaultDirty, flushVaultStore, getVaultStore } from './store/vault-store.js';
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
const uploadsDir = path.join(config.dataDir, 'uploads');
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

// ── Vault 落盘触发：非 GET 的 API 写请求成功后标脏，防抖落盘 ──
app.addHook('onResponse', async (req, reply) => {
  const m = req.method;
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return;
  if (reply.statusCode >= 400) return;
  const pathname = req.url?.split('?')[0] || '';
  if (pathname.startsWith('/api/v1') || pathname === '/upload/image') markVaultDirty();
});

// ── Health check ───────────────────────────────────────────────────
// vault 字段供其他实例判断「同一需求库是否已在运行」（见 findRunningInstance）。
// 取自 store 而非 config：切换需求库后 config.vaultDir 仍是启动时那个，会误报。
app.get('/health', async () => {
  const store = getVaultStore();
  return {
    status: 'ok',
    version: '1.0.0',
    vault: store ? path.resolve(store.vaultDir) : undefined,
  };
});

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
  markVaultDirty();
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

// ── 退出前落盘：确保防抖窗口内未落盘的写入不丢失 ──
let flushed = false;
const flushOnce = () => {
  if (flushed) return;
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

// ── 实例锁与端口 ────────────────────────────────────────────────────
// 一个需求库同时只应有一个写者。锁文件记录 {pid, port}，放在库的 .clawpm/ 下
// （运行时产物，不入 git）。锁可能因强杀残留，故以「端口上确实跑着本库的服务」
// 为准做二次确认，而非只看文件存在。

const LOCK_FILE = 'instance.json';

function lockPath(vaultDir: string): string {
  return path.join(vaultDir, '.clawpm', LOCK_FILE);
}

function writeInstanceLock(vaultDir: string, port: number): void {
  try {
    const file = lockPath(vaultDir);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ pid: process.pid, port }), 'utf8');
    const cleanup = () => {
      try {
        const cur = JSON.parse(fs.readFileSync(file, 'utf8')) as { pid?: number };
        if (cur.pid === process.pid) fs.unlinkSync(file); // 只清自己的锁
      } catch {
        /* 锁已被清理或损坏，忽略 */
      }
    };
    process.on('exit', cleanup);
  } catch {
    /* 锁只是优化，写不了不影响启动 */
  }
}

/** 返回该库正在运行的实例端口；无则 null（锁陈旧会被忽略） */
async function findRunningInstance(vaultDir: string): Promise<number | null> {
  let port: number;
  try {
    const raw = JSON.parse(fs.readFileSync(lockPath(vaultDir), 'utf8')) as { port?: number };
    if (!raw.port) return null;
    port = raw.port;
  } catch {
    return null;
  }
  // 端口可能已被别的程序（甚至另一个库的 clawpm）占用，故校验 vault 路径一致
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const info = (await res.json()) as { vault?: string };
    if (!info.vault) return null;
    return path.resolve(info.vault) === path.resolve(vaultDir) ? port : null;
  } catch {
    return null; // 端口无响应 = 锁陈旧
  }
}

/** 从 startPort 起顺延监听，返回实际端口 */
async function listenWithFallback(host: string, startPort: number): Promise<number> {
  const MAX_TRIES = 20;
  for (let i = 0; i < MAX_TRIES; i++) {
    const port = startPort + i;
    try {
      await app.listen({ port, host });
      if (i > 0) console.log(`端口 ${startPort} 被占用，已改用 ${port}`);
      return port;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw e;
    }
  }
  throw new Error(`端口 ${startPort}-${startPort + MAX_TRIES - 1} 均被占用`);
}

// ── Start ──────────────────────────────────────────────────────────
// 用异步 IIFE 而非顶层 await，保证 esbuild 可输出 CJS（Node SEA 单 exe 需要）
void (async () => {
  try {
    // 同一需求库已在运行 → 直接打开它的窗口并退出。
    // 文本存储必须单写者：两个进程同时写同一批 tasks/*.json 会互相覆盖。
    if (process.env.CLAWPM_DESKTOP === '1') {
      const running = await findRunningInstance(config.vaultDir);
      if (running) {
        console.log(`该需求库已在运行（端口 ${running}），打开其窗口。`);
        // detach：窗口归已在运行的实例管，本进程开完就退，不滞留
        openDesktopWindow(`http://127.0.0.1:${running}`, () => {}, {
          detach: true,
          profileKey: String(running),
        });
        return;
      }
    }

    getDb(); // init DB
    // Vault 是本地单写者，默认只监听回环；可用 CLAWPM_HOST 覆盖。
    const host = process.env.CLAWPM_HOST || '127.0.0.1';
    // 端口被占（多开不同需求库是常态）→ 顺延，而非崩溃退出：
    // GUI 子系统下没有控制台，崩溃对用户表现为「双击没反应」。
    const port = await listenWithFallback(host, config.port);
    console.log(`🚀 ClawPM running at http://${host}:${port}`);
    console.log(`📡 MCP SSE endpoint: http://${host}:${port}/mcp/sse`);
    console.log(`📁 存储引擎: vault（文本文件真源）→ ${path.resolve(config.vaultDir)}`);
    writeInstanceLock(config.vaultDir, port);

    // 调度运行态不属于 Vault 格式，Vault-only 运行时不启动调度器。
    console.log('⏸️  SchedulerWorker 已禁用');

    // 桌面模式（exe 启动器设置）：开应用窗口而非浏览器标签页，关窗即退出
    if (process.env.CLAWPM_DESKTOP === '1') {
      // profileKey 按端口区分：多个需求库同时打开时各自是独立的浏览器进程，
      // 否则后开的会被并入先开的实例并立即退出，被误判为「窗口已关闭」而关掉本服务。
      const { appWindow } = openDesktopWindow(
        `http://127.0.0.1:${port}`,
        () => {
          console.log('窗口已关闭，正在保存并退出…');
          shutdown();
        },
        { profileKey: String(port) }
      );
      console.log(appWindow ? '🖥️  已打开应用窗口（关闭窗口即退出）' : '🌐 未找到 Edge/Chrome，已用默认浏览器打开');
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
})();
