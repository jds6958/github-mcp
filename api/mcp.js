// api/mcp.js — ESM, Node.js 22 serverless handler exposing an MCP HTTP/SSE endpoint

import { Octokit } from '@octokit/rest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

// Vercel injects env at build/run; use a non-reserved name for GitHub PAT
const TOKEN = process.env.MY_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '';
if (!TOKEN) {
  throw new Error('Missing GitHub token env (set MY_GITHUB_TOKEN or GITHUB_TOKEN in Vercel → Project → Settings → Environment Variables, then redeploy).');
}

export const config = { runtime: 'nodejs' };

// ---- GitHub client helper
function gh() {
  return new Octokit({ auth: TOKEN });
}

// ---- Build MCP server and register tools
function buildServer() {
  const server = new McpServer({ name: 'github-mcp', version: '1.0.0' });

  // Read a UTF-8 file from a repo
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
      const buf = Buffer.from(res.data.content || '', 'base64');
      return { content: [{ type: 'text', text: buf.toString('utf8') }] };
    }
  );

  // List files/folders at a path
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
        const items = res.data.map((it) => ({
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
