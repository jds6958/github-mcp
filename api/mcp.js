// api/mcp.js — ESM, Node 22, MCP over HTTP/SSE

import { Octokit } from '@octokit/rest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

export const config = { runtime: 'nodejs' };

// Accept either MY_GITHUB_TOKEN or GITHUB_TOKEN from Vercel env
const TOKEN = process.env.MY_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '';
function gh() {
  if (!TOKEN) throw new Error('Missing GitHub token (set MY_GITHUB_TOKEN or GITHUB_TOKEN).');
  return new Octokit({ auth: TOKEN });
}

// One server instance reused per invocation
const server = new McpServer({ name: 'github-mcp', version: '1.0.0' });

// ---- Tool: github.readFile ----
server.registerTool(
  'github.readFile',
  {
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
    const text = Buffer.from(res.data.content || '', 'base64').toString('utf8');
    return { content: [{ type: 'text', text }] };
  }
);

// ---- Tool: github.listTree ----
server.registerTool(
  'github.listTree',
  {
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
      const items = res.data.map(it => ({
        type: it.type,
        name: it.name,
        path: it.path,
        size: typeof it.size === 'number' ? it.size : null
      }));
      return { content: [{ type: 'json', json: items }] };
    }
    const d = res.data;
    return { content: [{ type: 'json', json: [{ type: 'file', name: d.name, path: d.path, size: d.size ?? null }] }] };
  }
);

// ---- Vercel serverless entrypoint (HTTP/SSE)
export default async function handler(req, res) {
  try {
    const transport = new StreamableHTTPServerTransport({ req, res });
    res.on?.('close', () => { try { transport.close(); } catch {} });
    await server.connect(transport);

    // Optional POST body passthrough
    let payload;
    if (req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      if (body) { try { payload = JSON.parse(body); } catch {} }
    }

    await transport.handleRequest(req, res, payload);
  } catch (e) {
    console.error('[github-mcp] handler error:', e);
    if (!res.headersSent) res.status(500).json({ error: e?.message || 'Server error' });
  }
}
