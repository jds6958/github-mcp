import { Octokit } from "@octokit/rest";
import { createHTTPServer, Tool } from "@modelcontextprotocol/sdk/http";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";

/**
 * Helper: build an authenticated Octokit instance
 */
function gh() {
  if (!GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is not set");
  return new Octokit({ auth: GITHUB_TOKEN });
}

/**
 * Tool: github.readFile
 * params: { owner: string, repo: string, path: string, ref?: string }
 */
const readFileTool: Tool = {
  name: "github.readFile",
  description: "Read a UTF-8 text file from GitHub (private repos supported).",
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
    const res = await octo.repos.getContent({ owner, repo, path, ref });
    // GitHub returns file contents base64-encoded
    if (!Array.isArray(res.data) && "content" in res.data) {
      const buff = Buffer.from((res.data as any).content || "", "base64");
      return { ok: true, result: { text: buff.toString("utf8") } };
    }
    return { ok: false, error: "Path is not a file or could not be read." };
  }
};

/**
 * Tool: github.listTree
 * params: { owner: string, repo: string, path?: string, ref?: string }
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
    const res = await octo.repos.getContent({ owner, repo, path, ref });
    if (Array.isArray(res.data)) {
      return {
        ok: true,
        result: res.data.map(item => ({
          type: item.type, // "file" | "dir"
          name: item.name,
          path: item.path,
          size: (item as any).size ?? null
        }))
      };
    }
    // single file ⇒ return just that file’s info
    const d: any = res.data;
    return {
      ok: true,
      result: [{ type: "file", name: d.name, path: d.path, size: d.size ?? null }]
    };
  }
};

/**
 * Expose MCP over HTTP/SSE at /api/mcp
 */
export default createHTTPServer({
  endpoint: "/api/mcp",
  tools: [readFileTool, listTreeTool]
});
