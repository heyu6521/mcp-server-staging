import crypto from "node:crypto";
import express from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import type { RuntimeConfig } from "../config/types.js";
import { ConfirmationService } from "../confirmation/service.js";
import { buildMcpServer } from "../mcp/server.js";
import { log } from "../observability/logger.js";
import type { GitPlatformProvider } from "../provider/types.js";
import { WRITE_TOOLS } from "../tooling/inventory.js";

function bearerOk(
  actual: string | undefined,
  expected: string | undefined,
): boolean {
  if (!actual?.startsWith("Bearer ") || !expected) return false;
  const a = Buffer.from(actual.slice(7));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

type Bucket = { minute: number; count: number };
function consume(bucket: Bucket, limit: number): boolean {
  const minute = Math.floor(Date.now() / 60_000);
  if (bucket.minute !== minute) {
    bucket.minute = minute;
    bucket.count = 0;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

export function createApp(
  config: RuntimeConfig,
  provider: GitPlatformProvider,
) {
  const app = createMcpExpressApp({
    host: config.host,
    allowedHosts: config.allowedHosts,
    allowedOrigins: config.allowedOrigins,
  });
  app.use(express.json({ limit: "2mb" }));
  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));
  app.get(
    [
      "/.well-known/oauth-protected-resource/mcp",
      "/.well-known/oauth-protected-resource",
    ],
    (_req, res) => res.sendStatus(404),
  );
  const allBucket: Bucket = { minute: 0, count: 0 };
  const writeBucket: Bucket = { minute: 0, count: 0 };
  let inFlight = 0;
  app.use((req, res, next) => {
    const requestId = crypto.randomUUID();
    res.setHeader("x-request-id", requestId);
    if (
      config.authMode === "bearer" &&
      !bearerOk(req.header("authorization"), config.bearerToken)
    ) {
      res.status(401).json({ error: "unauthorized", requestId });
      return;
    }
    if (!consume(allBucket, config.rateLimitPerMinute)) {
      res.status(429).json({ error: "rate_limited", requestId });
      return;
    }
    const body = req.body as
      | { method?: string; params?: { name?: string } }
      | undefined;
    const isWrite =
      body?.method === "tools/call" &&
      typeof body.params?.name === "string" &&
      WRITE_TOOLS.has(body.params.name);
    if (isWrite && !consume(writeBucket, config.writeRateLimitPerMinute)) {
      res.status(429).json({ error: "write_rate_limited", requestId });
      return;
    }
    if (req.path === "/mcp") {
      if (inFlight >= config.maxConcurrency) {
        res.status(503).json({ error: "concurrency_limit", requestId });
        return;
      }
      inFlight += 1;
      let released = false;
      const release = () => {
        if (!released) {
          released = true;
          inFlight -= 1;
        }
      };
      res.once("finish", release);
      res.once("close", release);
    }
    log("info", "http_request", {
      requestId,
      method: req.method,
      path: req.path,
    });
    next();
  });
  app.get("/readyz", async (_req, res) => {
    try {
      await provider.getMe();
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "not_ready" });
    }
  });
  const confirmation = new ConfirmationService(config.confirmationSecret);
  const handler = createMcpHandler(
    () => buildMcpServer(config, provider, confirmation),
    { legacy: "reject" },
  );
  const node = toNodeHandler(handler);
  app.post("/mcp", (req, res) => void node(req, res, req.body));
  return app;
}
