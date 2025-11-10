// api/mcp.js  (ESM, no TypeScript)
import { Octokit } from '@octokit/rest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPSServerTransport as StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

export const config = { runtime: 'nodejs' };

// Accept either MY_GITHUB_TOKEN or GITHUB_TOKEN
const TOKEN = process.env.MY_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '';

function gh() {
  if (!TOKEN) throw new Error('Missing GitHub token: set MY_GITHUB_TOKEN (or GITHUB_TOKEN) in Vercel → Project → Settings → Environment Variables (enable for Preview + Production).');
  return new Octokit({ auth: TOKEN });
}

// ---- build a single server instance (reused across invocations) ----
const server = new McpServer({ name: 'github-mcp', version: '1.0.0' });

// Tool: github.readFile
server.registerTool(
  'github.readFile',
  {
    title: 'Read file from GitHub',
    description: 'Read a UTF-8 text file from a GitHub repo',
    inputSchema: {
      type: 'object',
      required: ['owner', 'repo', 'path'],
      properties: {
        owner: { type: 'string' },
        repo:  { type: 'string' },
        path:  { type: 'string' },
        ref:   { type: 'string' }
      }
    }
  },
  async ({ owner, repo, path, ref }) => {
    const res = await gh().repos.getContent({ owner, repo, path, ref });
    if (Array.isArray(res.data)) {
      return { content: [{ type: 'text', text: 'Path is a directory.' }] };
    }
    const data = res.data;
    const text = Buffer.from(data.content || '', 'base64').toString('utf8');
    return { content: [{ type: 'text', text }] };
  }
);

// Tool: github.listTree
server.registerTool(
  'github.listTree',
  {
    title: 'List files at path',
    description: 'List files/folders at a path in a GitHub repo',
    inputSchema: {
      type: 'object',
      required: ['owner', 'repo'],
      properties: {
        owner: { type: 'string' },
        repo:  { type: 'string' },
        path:  { type: 'string' },
        ref:   { type: 'string' }
      }
    }
  },
  async ({ owner, repo, path = '', ref }) => {
    const res = await gh().repos.getContent({ owner, repo, path, ref });
    if (Array.isArray(res.data)) {
      const lines = res.data.map((it) => `${it.type} • ${it.path}`).join('\n');
      return { content: [{ type: 'text', text: lines || '(empty)' }] };
    }
    const d = res.data;
    return { content: [{ type: 'text', text: `file • ${d.path}` }] };
  }
);

// HTTP/SSE endpoint for MCP
export default async function handler(req, res) {
  const transport = new StreamableHTTPServerTransport({ /* defaults ok */ });
  res.on('close', () => { try { transport.close(); } catch {} });
  await server.connect(transport);

  // Parse POST body if present
  let payload;
  if (req.method === 'POST') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    try { payload = raw ? JSON.parse(raw) : undefined; } catch (_) { payload = undefined; }
  }

  await transport.handleRequest(req, res, payload);
}
