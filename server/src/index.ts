import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticFiles from '@fastify/static';
import { config } from './config.js';
import { registerRoutes } from './api/routes.js';
import { createMcpServer } from './mcp/server.js';
import { getDb } from './db/connection.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import fs from 'fs';
import path from 'path';

const app = Fastify({ logger: { level: config.logLevel } });

// ── Middleware ─────────────────────────────────────────────────────
await app.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
});

// ── Auth hook + User identity extraction ──────────────────────────
app.decorateRequest('clawpmUser', null);

app.addHook('onRequest', async (req, reply) => {
  // Skip auth for health check and static files
  if (req.url === '/health' || req.url?.startsWith('/assets') || req.url === '/') return;

  // Support token via Authorization header OR ?token= query param (for SSE clients)
  const auth = req.headers.authorization;
  const queryToken = (req.query as any).token;
  const isAuthed = auth === `Bearer ${config.apiToken}` || queryToken === config.apiToken;

  if (!isAuthed) {
    // Allow unauthenticated access in dev for Web UI
    if (config.isDev && !req.url?.startsWith('/api') && !req.url?.startsWith('/mcp')) return;
    if (req.url?.startsWith('/api') || req.url?.startsWith('/mcp')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  }

  // Extract user identity from X-ClawPM-User header (optional, for personal views)
  (req as any).clawpmUser = (req.headers['x-clawpm-user'] as string) || null;
});

// ── Health check ───────────────────────────────────────────────────
app.get('/health', async () => ({ status: 'ok', version: '1.0.0' }));

// ── MCP Server (SSE) ───────────────────────────────────────────────
const mcp = createMcpServer();
const transports: Record<string, SSEServerTransport> = {};

app.get('/mcp/sse', async (req, reply) => {
  const transport = new SSEServerTransport('/mcp/messages', reply.raw);
  // _sessionId 在构造函数里生成，与发给客户端的 endpoint URL 中的 sessionId 一致
  const sessionId = (transport as any)._sessionId as string;
  transports[sessionId] = transport;
  reply.raw.on('close', () => { delete transports[sessionId]; });
  await mcp.connect(transport);
});

app.post('/mcp/messages', async (req, reply) => {
  const sessionId = (req.query as any).sessionId;
  const transport = sessionId ? transports[sessionId] : Object.values(transports)[0];
  if (!transport) return reply.code(404).send({ error: 'No MCP session' });
  // 将 Fastify 已解析的 body 直接传入，避免 SDK 重复读取 stream
  await transport.handlePostMessage(req.raw, reply.raw, req.body);
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
