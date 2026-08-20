import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";
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
  { getMe: async () => ({ login: "mcp-bot" }) } as Record<string, unknown>,
  {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      return async () => [];
    },
  },
) as unknown as GitPlatformProvider;

async function connect(config: RuntimeConfig) {
  const server = buildMcpServer(
    config,
    provider,
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
});
