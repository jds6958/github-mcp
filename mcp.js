// api/mcp.js  (ESM, no TypeScript)
import { Octokit } from '@octokit/rest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

export const config = { runtime: 'nodejs' };

const TOKEN = process.env.MY_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '';
function gh() {
  if (!TOKEN) throw new Error('Missing GitHub token (MY_GITHUB_TOKEN or GITHUB_TOKEN)');
  return new Octokit({ auth: TOKEN });
}

const server = new McpServer({ name: 'github-mcp', version: '1.0.0' });

server.registerTool(
  'github.readFile',
  {
    title: 'Read file from GitHub',
    description: 'Read a UTF-8 text file from a GitHub repo',
    inputSchema: {
      type: 'object',
      required: ['owner','repo','path'],
      properties: {
        owner:{type:'string'}, repo:{type:'string'}, path:{type:'string'},
        ref:{type:'string'}
      }
    }
  },
  async ({ owner, repo, path, ref }) => {
    const res = await gh().repos.getContent({ owner, repo, path, ref });
    if (Array.isArray(res.data)) return { content:[{type:'text', text:'Path is a directory.'}] };
    const buf = Buffer.from(res.data.content || '', 'base64');
    return { content:[{ type:'text', text: buf.toString('utf8') }] };
  }
);

server.registerTool(
  'github.listTree',
  {
    title: 'List files at path',
    description: 'List files/folders at a path in a GitHub repo',
    inputSchema: {
      type: 'object',
      required: ['owner','repo'],
      properties: {
        owner:{type:'string'}, repo:{type:'string'},
        path:{type:'string'},  ref:{type:'string'}
      }
    }
  },
  async ({ owner, repo, path = '', ref }) => {
    const res = await gh().repos.getContent({ owner, repo, path, ref });
    if (Array.isArray(res.data)) {
      const lines = res.data.map(it => `${it.type} • ${it.path}`).format?.() || res.data.map(it=>`${it.type} • ${it.path}`).join('\n');
      return { content: [{ type]()
