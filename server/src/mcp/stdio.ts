/**
 * ClawPM MCP Server — stdio transport entry point
 * Used by CodeBuddy / Cursor to communicate via stdin/stdout
 * 
 * Agent identity binding:
 *   - Environment variable: CLAWPM_AGENT_ID=my-agent
 *   - Command line argument: --agent-id=my-agent
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';
import { getDb } from '../db/connection.js';

// Initialize database
getDb();

// Resolve agent identity from env or CLI args
const agentId = process.env.CLAWPM_AGENT_ID
  || process.argv.find(a => a.startsWith('--agent-id='))?.split('=')[1]
  || undefined;

if (agentId) {
  console.error(`[ClawPM MCP] Agent identity bound: ${agentId}`);
}

// Create MCP server and connect via stdio
const mcp = createMcpServer({ agentId });
const transport = new StdioServerTransport();
await mcp.connect(transport);
