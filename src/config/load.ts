import fs from "node:fs";
import YAML from "yaml";
import { AppError } from "../errors.js";
import type { RepositoryPolicy, RuntimeConfig } from "./types.js";

const csv = (v?: string) =>
  (v ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
const bool = (v: string | undefined, d: boolean) =>
  v === undefined ? d : v === "true";
const num = (v: string | undefined, d: number) =>
  v === undefined ? d : Number(v);

export function loadPolicy(file: string): RepositoryPolicy {
  if (!fs.existsSync(file))
    throw new AppError(
      "internal_error",
      "Repository policy file is missing",
      500,
    );
  const parsed = YAML.parse(fs.readFileSync(file, "utf8")) as RepositoryPolicy;
  if (!parsed?.repositories || Object.keys(parsed.repositories).length === 0)
    throw new AppError(
      "internal_error",
      "Repository allowlist must not be empty",
      500,
    );
  return parsed;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  const runtimeEnv = (env.NODE_ENV ?? "development") as RuntimeConfig["env"];
  if (!["development", "test", "production"].includes(runtimeEnv))
    throw new AppError("internal_error", "Invalid NODE_ENV", 500);
  const host = env.HOST ?? "127.0.0.1";
  const authMode = (env.AUTH_MODE ?? "none") as "none" | "bearer";
  if (!["none", "bearer"].includes(authMode))
    throw new AppError("internal_error", "Invalid AUTH_MODE", 500);
  if (authMode === "none" && runtimeEnv === "production")
    throw new AppError(
      "internal_error",
      "AUTH_MODE=none is development/test only",
      500,
    );
  if (host !== "127.0.0.1" && host !== "::1" && authMode === "none")
    throw new AppError(
      "internal_error",
      "Non-loopback binding requires authentication",
      500,
    );
  const bearerToken = env.BEARER_TOKEN;
  if (authMode === "bearer" && (!bearerToken || bearerToken.length < 16))
    throw new AppError(
      "internal_error",
      "Bearer authentication requires a non-empty deployment token",
      500,
    );
  const policy = loadPolicy(
    env.REPOSITORY_POLICY_FILE ?? "./config/repositories.yaml",
  );
  const confirmationSecret = env.CONFIRMATION_SECRET ?? "";
  if (confirmationSecret.length < 32)
    throw new AppError(
      "internal_error",
      "CONFIRMATION_SECRET must be at least 32 characters",
      500,
    );
  const forgejoBaseUrl = env.FORGEJO_BASE_URL ?? "";
  if (!/^https?:\/\//.test(forgejoBaseUrl))
    throw new AppError(
      "internal_error",
      "FORGEJO_BASE_URL must be an absolute HTTP(S) URL",
      500,
    );
  const values = {
    port: num(env.PORT, 3000),
    maxConcurrency: num(env.MAX_CONCURRENCY, 4),
    rateLimitPerMinute: num(env.RATE_LIMIT_PER_MINUTE, 60),
    writeRateLimitPerMinute: num(env.WRITE_RATE_LIMIT_PER_MINUTE, 20),
    requestTimeoutMs: num(env.REQUEST_TIMEOUT_MS, 15000),
    longRequestTimeoutMs: num(env.LONG_REQUEST_TIMEOUT_MS, 30000),
  };
  if (Object.values(values).some((v) => !Number.isFinite(v) || v <= 0))
    throw new AppError(
      "internal_error",
      "Numeric runtime limits must be positive numbers",
      500,
    );
  const forgejoToken = env.FORGEJO_TOKEN;
  return {
    env: runtimeEnv,
    host,
    port: values.port,
    authMode,
    ...(bearerToken ? { bearerToken } : {}),
    principal: env.MCP_PRINCIPAL ?? "chatgpt-business-workspace",
    toolsets: csv(env.MCP_TOOLSETS ?? "default"),
    tools: csv(env.MCP_TOOLS),
    excludeTools: csv(env.MCP_EXCLUDE_TOOLS),
    readOnly: bool(env.MCP_READ_ONLY, false),
    lockdown: bool(env.MCP_LOCKDOWN_MODE, true),
    forgejoBaseUrl,
    ...(forgejoToken ? { forgejoToken } : {}),
    policy,
    confirmationSecret,
    allowedHosts: csv(env.ALLOWED_HOSTS ?? "localhost,127.0.0.1"),
    allowedOrigins: csv(env.ALLOWED_ORIGINS),
    maxConcurrency: values.maxConcurrency,
    rateLimitPerMinute: values.rateLimitPerMinute,
    writeRateLimitPerMinute: values.writeRateLimitPerMinute,
    requestTimeoutMs: values.requestTimeoutMs,
    longRequestTimeoutMs: values.longRequestTimeoutMs,
  };
}
