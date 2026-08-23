export type Access = "read" | "write";
export interface RepositoryRule {
  access: Access;
  allowed_work_branch_patterns: string[];
  protected_branches: string[];
  allow_direct_push: boolean;
  allow_issue_write: boolean;
  allow_pull_request_write: boolean;
  allow_merge: boolean;
}
export interface RepositoryPolicy {
  repositories: Record<string, RepositoryRule>;
}
export interface RuntimeConfig {
  env: "development" | "test" | "production";
  host: string;
  port: number;
  authMode: "none" | "bearer";
  bearerToken?: string;
  principal: string;
  toolsets: string[];
  tools: string[];
  excludeTools: string[];
  readOnly: boolean;
  lockdown: boolean;
  forgejoBaseUrl: string;
  forgejoToken?: string;
  policy: RepositoryPolicy;
  confirmationSecret: string;
  allowedHosts: string[];
  allowedOrigins: string[];
  maxConcurrency: number;
  rateLimitPerMinute: number;
  writeRateLimitPerMinute: number;
  requestTimeoutMs: number;
  longRequestTimeoutMs: number;
}
