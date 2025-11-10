import { Octokit } from "@octokit/rest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export const config = { runtime: "nodejs" };

const TOKEN = process.env.MY_GITHUB_TOKEN || "";

function github() {
  if (!TOKEN) throw new Error("MY_GITHUB_TOKEN environment variable is not set");
  return new Octokit({ auth: TOKEN });
}

function buildServer() {
  const server = new McpServer({ name: "github-mcp", version: "1.0.0" });

  // ---- Tool: github.readFile ----
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
        const gh = github();
        const res = await gh.repos.getContent({ owner, repo, path, ref });
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

  // ---- Tool: github.listTree ----
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
        const gh = github();
        const res = await gh.repos.getContent({ owner, repo, path, ref });
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

export default async function handler(req: any, res: any) {
  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { try { transport.close(); server.close(); } catch {} });

    // Read JSON body (if present)
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const bodyText = chunks.length ? Buffer.concat(chunks).toString("utf8") : "";
    let payload: any;
    if (bodyText) { try { payload = JSON.parse(bodyText); if (typeof payload === "string") payload = JSON.parse(payload); } catch {} }

    await server.connect(transport);
    await transport.handleRequest(req, res, payload);
  } catch (e) {
    console.error("[github-mcp] fatal:", e);
    if (!res.headersSent) res.status(500).json({ error: "A server error has occurred" });
  }
}
