import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { describe, expect, it, vi } from "vitest";
import { ConfirmationService } from "../src/confirmation/service.js";
import type { RuntimeConfig } from "../src/config/types.js";
import { buildMcpServer } from "../src/mcp/server.js";
import type { GitPlatformProvider } from "../src/provider/types.js";

const policy = {
  repositories: {
    "heyu/repo": {
      access: "write" as const,
      allowed_work_branch_patterns: ["chatgpt/*"],
      protected_branches: ["main"],
      allow_direct_push: false,
      allow_issue_write: true,
      allow_pull_request_write: true,
      allow_merge: true,
    },
  },
};
const base: RuntimeConfig = {
  env: "test",
  host: "127.0.0.1",
  port: 3000,
  authMode: "none",
  principal: "workspace",
  toolsets: ["context", "repos"],
  tools: [],
  excludeTools: [],
  readOnly: false,
  lockdown: true,
  forgejoBaseUrl: "http://forgejo.invalid",
  policy,
  confirmationSecret: "x".repeat(32),
  allowedHosts: ["localhost"],
  allowedOrigins: [],
  maxConcurrency: 4,
  rateLimitPerMinute: 60,
  writeRateLimitPerMinute: 20,
  requestTimeoutMs: 100,
  longRequestTimeoutMs: 100,
};
const provider = new Proxy(
  {
    getMe: async () => ({ login: "mcp-bot" }),
    countAccessibleRepositories: async () => 1,
  } as Record<string, unknown>,
  {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      return async () => [];
    },
  },
) as unknown as GitPlatformProvider;

async function connect(
  config: RuntimeConfig,
  selectedProvider: GitPlatformProvider = provider,
) {
  const server = buildMcpServer(
    config,
    selectedProvider,
    new ConfirmationService(config.confirmationSecret),
  );
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

describe("MCP server", () => {
  it("discovers tools and invokes get_me", async () => {
    const { client, server } = await connect(base);
    const listed = await client.listTools();
    expect(listed.tools.some((t) => t.name === "get_me")).toBe(true);
    const result = await client.callTool({ name: "get_me", arguments: {} });
    expect(JSON.stringify(result)).toContain("mcp-bot");
    await client.close();
    await server.close();
  });
  it("does not register write tools in read-only mode", async () => {
    const { client, server } = await connect({ ...base, readOnly: true });
    const listed = await client.listTools();
    expect(listed.tools.some((t) => t.name === "create_branch")).toBe(false);
    await client.close();
    await server.close();
  });
  it("checks expectedSourceSha against an exact source-branch lookup", async () => {
    const createBranch = vi.fn();
    const selectedProvider = {
      ...provider,
      getBranch: vi.fn().mockResolvedValue({ commit: { id: "new-head" } }),
      createBranch,
    } as unknown as GitPlatformProvider;
    const { client, server } = await connect(base, selectedProvider);

    const result = await client.callTool({
      name: "create_branch",
      arguments: {
        owner: "heyu",
        repo: "repo",
        branch: "chatgpt/change",
        fromBranch: "main",
        expectedSourceSha: "old-head",
      },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("Source branch HEAD changed");
    expect(createBranch).not.toHaveBeenCalled();
    await client.close();
    await server.close();
  });

  it("validates branch HEAD and blob SHA while preparing deletion", async () => {
    const selectedProvider = {
      ...provider,
      getBranch: vi.fn().mockResolvedValue({ commit: { id: "head-1" } }),
      getFileContents: vi.fn().mockResolvedValue({ sha: "blob-2" }),
    } as unknown as GitPlatformProvider;
    const { client, server } = await connect(base, selectedProvider);

    const result = await client.callTool({
      name: "prepare_delete_file",
      arguments: {
        owner: "heyu",
        repo: "repo",
        branch: "chatgpt/change",
        path: "src/a.ts",
        sha: "blob-1",
        expectedHeadSha: "head-1",
      },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("File blob changed");
    await client.close();
    await server.close();
  });

  it("rechecks deletion state at apply time and preserves the file on drift", async () => {
    let head = "head-1";
    const deleteFile = vi.fn();
    const selectedProvider = {
      ...provider,
      getBranch: vi.fn().mockImplementation(async () => ({
        commit: { id: head },
      })),
      getFileContents: vi.fn().mockResolvedValue({ sha: "blob-1" }),
      deleteFile,
    } as unknown as GitPlatformProvider;
    const { client, server } = await connect(base, selectedProvider);
    const common = {
      owner: "heyu",
      repo: "repo",
      branch: "chatgpt/change",
      path: "src/a.ts",
      sha: "blob-1",
      expectedHeadSha: "head-1",
    };
    const prepared = await client.callTool({
      name: "prepare_delete_file",
      arguments: common,
    });
    const preparedText = (prepared.content[0] as { text: string }).text;
    const token = JSON.parse(preparedText).data.confirmationToken as string;
    head = "head-2";

    const result = await client.callTool({
      name: "delete_file",
      arguments: {
        ...common,
        confirmationToken: token,
        message: "remove stale file",
      },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("Branch HEAD changed");
    expect(deleteFile).not.toHaveBeenCalled();
    await client.close();
    await server.close();
  });

  it("fails merge preparation closed when commit status is not successful", async () => {
    const selectedProvider = {
      ...provider,
      getPullRequest: vi.fn().mockResolvedValue({
        state: "open",
        draft: false,
        merged: false,
        mergeable: true,
        head: { sha: "head-1" },
        base: { sha: "base-1" },
      }),
      getPullRequestStatus: vi.fn().mockResolvedValue({
        headSha: "head-1",
        status: { state: "pending" },
      }),
    } as unknown as GitPlatformProvider;
    const { client, server } = await connect(
      { ...base, toolsets: ["pull_requests"] },
      selectedProvider,
    );

    const result = await client.callTool({
      name: "prepare_merge_pull_request",
      arguments: {
        owner: "heyu",
        repo: "repo",
        pullNumber: 1,
        expectedHeadSha: "head-1",
        mergeMethod: "squash",
      },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("not confirmed successful");
    await client.close();
    await server.close();
  });

  it("rejects unsupported review methods at the MCP boundary", async () => {
    const { client, server } = await connect({
      ...base,
      toolsets: ["pull_requests"],
    });
    const result = await client.callTool({
      name: "pull_request_review_write",
      arguments: {
        owner: "heyu",
        repo: "repo",
        pullNumber: 1,
        method: "delete",
      },
    });
    expect(result.isError).toBe(true);
    await client.close();
    await server.close();
  });
});
