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

// ── Auth hook ──────────────────────────────────────────────────────
app.addHook('onRequest', async (req, reply) => {
  // Skip auth for MCP SSE endpoint initial connection and static files
  if (req.url === '/health' || req.url?.startsWith('/assets') || req.url === '/') return;

  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${config.apiToken}`) {
    // Allow unauthenticated access in dev for Web UI API calls from same origin
    if (config.isDev && !req.url?.startsWith('/api') && !req.url?.startsWith('/mcp')) return;
    if (req.url?.startsWith('/api') || req.url?.startsWith('/mcp')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  }
});

// ── Health check ───────────────────────────────────────────────────
app.get('/health', async () => ({ status: 'ok', version: '1.0.0' }));

// ── MCP Server (SSE) ───────────────────────────────────────────────
const mcp = createMcpServer();
const transports: Record<string, SSEServerTransport> = {};

app.get('/mcp/sse', async (req, reply) => {
  const transport = new SSEServerTransport('/mcp/messages', reply.raw);
  const sessionId = Math.random().toString(36).slice(2);
  transports[sessionId] = transport;

  reply.raw.on('close', () => { delete transports[sessionId]; });

  await mcp.connect(transport);
});

app.post('/mcp/messages', async (req, reply) => {
  const sessionId = (req.query as any).sessionId;
  const transport = sessionId ? transports[sessionId] : Object.values(transports)[0];
  if (!transport) return reply.code(404).send({ error: 'No MCP session' });
  await transport.handlePostMessage(req.raw, reply.raw);
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
