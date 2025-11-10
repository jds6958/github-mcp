import { Octokit } from "@octokit/rest";
import { createHTTPServer, Tool } from "@modelcontextprotocol/sdk-node/http";

const GITHUB_TOKEN = process.env.MY_GITHUB_TOKEN || "";

function gh() {
  if (!GITHUB_TOKEN) throw new Error("MY_GITHUB_TOKEN environment variable is not set");
  return new Octokit({ auth: GITHUB_TOKEN });
}

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
    try {
      const res = await octo.repos.getContent({ owner, repo, path, ref });
      if (!Array.isArray(res.data) && "content" in res.data) {
        const buff = Buffer.from((res.data as any).content || "", "base64");
        return { ok: true, result: { text: buff.toString("utf8") } };
      }
      return { ok: false, error: "Path is not a file or could not be read." };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Failed to read file." };
    }
  }
};

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
      return { ok: true, result: [{ type: "file", name: d.name, path: d.path, size: d.size ?? null }] };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Failed to list files." };
    }
  }
};

export const config = { runtime: "nodejs" };

export default createHTTPServer({
  endpoint: "/api/mcp",
  tools: [readFileTool, listTreeTool]
});
