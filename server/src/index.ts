import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticFiles from '@fastify/static';
import multipart from '@fastify/multipart';
import { config } from './config.js';
import { registerRoutes } from './api/routes.js';
import { createMcpServer } from './mcp/server.js';
import { getDb } from './db/connection.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { AuthService, type AuthPrincipal } from './services/auth-service.js';
import fs from 'fs';
import path from 'path';

const app = Fastify({ logger: { level: config.logLevel } });
const transports: Record<string, { transport: SSEServerTransport; mcp: ReturnType<typeof createMcpServer> }> = {};

// ── Middleware ─────────────────────────────────────────────────────
await app.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
});

// ── Multipart (image upload) ──────────────────────────────────────
await app.register(multipart, {
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// ── Uploads static file serving ───────────────────────────────────
const uploadsDir = path.join(path.dirname(config.dbPath), 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
await app.register(staticFiles, {
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

// ── Health check ───────────────────────────────────────────────────
app.get('/health', async () => ({ status: 'ok', version: '1.0.0' }));

// ── Runtime config for web client ──────────────────────────────────
app.get('/runtime-config.js', async (_req, reply) => {
  reply.type('application/javascript; charset=utf-8');
  reply.header('Cache-Control', 'no-store');
  return `window.__CLAWPM_RUNTIME_CONFIG__ = ${JSON.stringify({
    apiBase: '/api/v1',
    apiToken: config.apiToken,
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
});

// ── REST API ───────────────────────────────────────────────────────
await registerRoutes(app);

// ── Serve Web UI ───────────────────────────────────────────────────
if (fs.existsSync(config.webDistPath)) {
  await app.register(staticFiles, {
    root: config.webDistPath,
    prefix: '/',
    wildcard: false,
  });

  // SPA fallback
  app.setNotFoundHandler(async (req, reply) => {
    if (!req.url?.startsWith('/api') && !req.url?.startsWith('/mcp')) {
      return reply.sendFile('index.html', config.webDistPath);
    }
    return reply.code(404).send({ error: 'Not found' });
  });
}

// ── Start ──────────────────────────────────────────────────────────
try {
  getDb(); // init DB
  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`🚀 ClawPM running at http://0.0.0.0:${config.port}`);
  console.log(`📡 MCP SSE endpoint: http://0.0.0.0:${config.port}/mcp/sse`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
