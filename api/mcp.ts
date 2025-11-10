import { Octokit } from "@octokit/rest";
import { createHTTPServer, Tool } from "@modelcontextprotocol/sdk/http";

// Use the environment variable you set in Vercel/GitHub
const GITHUB_TOKEN = process.env.MY_GITHUB_TOKEN || "";

/**
 * Helper: build an authenticated Octokit instance
 */
function gh() {
  if (!GITHUB_TOKEN) {
    throw new Error("MY_GITHUB_TOKEN environment variable is not set");
  }
  return new Octokit({ auth: GITHUB_TOKEN });
}

/**
 * Tool: github.readFile
 * Reads a UTF-8 text file from a GitHub repo (supports private repos).
 */
const readFileTool: Tool = {
  name: "github.readFile",
  description: "Read a UTF-8 text file from GitHub (private repos supported).",
  inputSchema: {
    type: "object",
    required: ["owner", "repo", "path"],
    properties: {
      owner: { type: "string", description: "GitHub username or org" },
      repo:  { type: "string", description: "Repository name" },
      path:  { type: "string", description: "File path in repo" },
      ref:   { type: "string", description: "Branch, tag, or commit SHA (optional)" }
    }
  },
  async execute(input) {
    const { owner, repo, path, ref } = input as any;
    const octo = gh();
    try {
      const res = await octo.repos.getContent({ owner, repo, path, ref });
      if (!Array.isArray(res.data) && "content" in res.data) {
        const buff = Buffer.from((res.data as any).content || "", "base64");
        return { ok: true, result: { text: buff.toString("utf8") } };
      }
      return { ok: false, error: "Path is not a file or could not be read." };
    } catch (err: any) {
      return { ok: false, error: err.message || "Failed to read file." };
    }
  }
};

/**
 * Tool: github.listTree
 * Lists files and folders within a GitHub repo path.
 */
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
        return {
          ok: true,
          result: res.data.map(item => ({
            type: item.type,
            name: item.name,
            path: item.path,
            size: (item as any).size ?? null
          }))
        };
      }
      const d: any = res.data;
      return {
        ok: true,
        result: [{ type: "file", name: d.name, path: d.path, size: d.size ?? null }]
      };
    } catch (err: any) {
      return { ok: false, error: err.message || "Failed to list files." };
    }
  }
};

/**
 * Expose MCP over HTTP/SSE at /api/mcp
 */
export const config = {
  runtime: "nodejs18.x" // ensure proper Vercel runtime
};

export default createHTTPServer({
  endpoint: "/api/mcp",
  tools: [readFileTool, listTreeTool]
});

