import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/http/app.js";
import type { RuntimeConfig } from "../src/config/types.js";

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
  principal: "test",
  toolsets: ["context"],
  tools: [],
  excludeTools: [],
  readOnly: false,
  lockdown: true,
  forgejoBaseUrl: "http://forgejo.invalid",
  policy,
  confirmationSecret: "x".repeat(32),
  allowedHosts: ["127.0.0.1", "localhost"],
  allowedOrigins: [],
  maxConcurrency: 4,
  rateLimitPerMinute: 60,
  writeRateLimitPerMinute: 20,
  requestTimeoutMs: 100,
  longRequestTimeoutMs: 100,
};
const provider = { getMe: async () => ({ login: "bot" }) } as any;

describe("http", () => {
  it("health does not leak internals", async () => {
    const r = await request(createApp(base, provider))
      .get("/healthz")
      .set("Host", "localhost");
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toContain("forgejo.invalid");
  });
  it("ready verifies provider", async () => {
    const r = await request(createApp(base, provider))
      .get("/readyz")
      .set("Host", "localhost");
    expect(r.status).toBe(200);
  });
  it("rejects missing bearer token", async () => {
    const cfg: RuntimeConfig = {
      ...base,
      authMode: "bearer",
      bearerToken: "test-token",
    };
    const r = await request(createApp(cfg, provider))
      .get("/healthz")
      .set("Host", "localhost");
    expect(r.status).toBe(401);
  });
});
