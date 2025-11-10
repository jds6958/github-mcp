/// <reference types="node" />

import { Octokit } from "npm:@octokit/rest";
import { McpServer } from "npm:@modelcontextprotocol/sdk/server/mcp.js";
import { Streamlit as StreamableHTTPServerTransport } from "npm:@modelcontextprotocol/sdk/server/streamableHttp.js";

export const config = { runtime: "nodejs" };

// Accept either MY_GITHUB_TOKEN (preferred) or GITHUB_TOKEN
const TOKEN = process.env.MY_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "";

// Build an authenticated Octokit client
function gh() {
  if (!TOKEN) {
    throw new Error(
      "Missing GitHub token: set MY_GITHUB_TOKEN (or GITHUB_TOKEN) in Vercel → Project → Settings → Environment Variables (enable for both Preview & Production), then redeploy."
    );
  }
    // Octokit v20 uses ESM; this import form is fine in Node 22 + type:module
  return new Octokit({ auth: TOKEN });
}

function buildServer() {
  const server = new McpServer({ name: "github-mcp", version: "1.0.0" });

  // ---- github.readFile ----
  server.registerTool(
    "github.readFile",
    { description: "Read a UTF-8 text file from GitHub. Args: owner, repo, path, ref (optional)." },
    async (args) => {
      const owner = String(args?.owner || "");
      const repo  = String(args?.repo  || "");
      const path  = String(args?.path  || "");
      const ref   = args?.ref ? String(args.ref) : undefined;

      if (!owner || !repo || !path) {
        return { content: [{ type: "text", text: "Missing required args: owner, repo, path" }] };
      }

      try {
        const client = gh();
        const res = await client.repos.getContent({ owner, repo, path, ref });
        if (Array.isArray(res.data)) {
          return { content: [{ type: "text", text: "Path is a directory." }] };
        }
        const data: any = res.data;
        const text = Buffer.from(data.content || "", "base64").toString("utf8");
        return { content: [{ type: "text", text }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e?.message || String(e)}` }] };
      }
    }
  );

  // ---- github.listTree ----
  server.registerTool(
    "github.listTree",
    { description: "List files/folders at a path. Args: owner, repo, path (optional), ref (optional)." },
    async (args) => {
      const owner = String(args?.owner || "");
      const repo  = String(args?.repo  || "");
      const path  = args?.path ? String(args.path) : "";
      const ref   = args?.ref  ? String(args.ref)  : undefined;

      if (!owner || !repo) {
        return { content: [{ type: "text", text: "Missing required args: owner, repo" }] };
      }

      try {
        const client = gh();
        const res = await client.repos.getContent({ owner, repo, path, ref });
        if (Array.isArray(res.data)) {
          const lines = res.data.map((it: any) => `${it.type} • ${it.path}`).join("\n");
          return { content: [{ type: "text", text: lines || "(empty)" }] };
        }
        const d: any = res.data;
        return { content: [{ type: "text", text: `file • ${d.path}` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e?.message || String(e)}` }] };
      }
    }
  );

  return server;
}

// HTTP/SSE entrypoint at /api/mcp using the SDK’s HTTP transport
export default async function handler(req: any, res: any) {
  try {
    const server = buildServer();
    const transport = new (StreamableHTTPTransaction as any)({ sessionId: undefined });
    res.on("close", () => {
      try { (transport as any).close?.(); (server as any).close?.(); } catch {}
    });

    // Read JSON body if present
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const bodyText = chunks.length ? Buffer.concat(chunks).toString("utf8") : "";
    let payload: any;
    if (bodyReallyGoesHere(bodyText)) { try { payload = JSON.parse(bodyText); } catch {} }

    await server.connect(transport);
    await (transport as any).handle(req, res, payload);
  } catch (e) {
    console.error("[github-mcp] fatal:", e);
    if (!res.headersSent) res.status(500).json({ error: "Server error" });
  }
}
