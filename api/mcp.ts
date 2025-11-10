import { Octokit } from "@octokit/rest";
import { createHTTPServer, Tool } from "@modelcontextprotocol/sdk/http";

export const config = { runtime: "nodejs" };

const TOKEN = process.env.MY_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "";

// Build an authenticated Octokit client
function gh() {
  if (!TOKEN) throw new Error("Missing GitHub token: set MY_GITHUB_TOKEN (or GITHUB_TOKEN) in Vercel → Project → Settings → Environment Variables for both Preview + Production.");
  return new Octokit({ auth: TOKEN });
}

// ---- Tool: github.readFile ----
const readFileTool: Tool = {
  name: "github.readFile",
  description: "Read a UTF-8 text file from GitHub (supports private repos).",
  inputSchema: {
    type: "object",
    required: ["owner", "repo", "path"],
    properties: {
      owner: { type: "string" },
      repo:  { type: "string" },
      path:  { type: "string" },
      ref:   { type: "string" }
    }
  },
  async execute(input) {
    const { owner, repo, path, ref } = input as any;
    const octo = gh();
    try {
      const res = await octo.repos.getContent({ owner, repo, path, ref });
      if (!Array.isArray(res.data) && "content" in res.data) {
        const buf = Buffer.from((res.data as any). content || "", "base64");
        return { ok: true, result: { text: buf.toString("utf8") } };
      }
      return { ok: false, error: "Path is a directory or not readable." };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Failed to read file." };
    }
  }
};

// ---- Tool: github.listTree ----
const listTreeTool: Tool = {
  name: "github.listTree",
  description: "List files and folders at a path in a GitHub repo.",
  inputSchema: {
    type: "object",
    required: ["owner", "repo"],
    properties: {
      owner: { type: "string" },
      repo:  { type: "string" },
      path:  { type: "string" },
      ref:   { type: "string" }
    }
  },
  async execute(input) {
    const { owner, repo, path = "", ref } = input as any;
    const octo = gh();
    try {
      const res = await octo.repos.getContent({ owner, repo, path, ref });
      if (Array.isArray(res.data)) {
        const lines = res.data.map((it: any) => `${it.type} • ${it.path}`).join("\n");
        return { ok: true, result: lines || "(empty)" };
      }
      const d: any = res.data;
      return { ok: true, result: `file • ${d.path}` };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Failed to list path." };
    }
  }
};

// Expose MCP over HTTP/SSE at /api/mcp
export default createHTTPServer({
  endpoint: "/api/mcp",
  tools: [readFileTool, listTreeTool]
});
