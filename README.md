# Forgejo/Git Read-Write MCP

Production-oriented MCP server for safely exposing allowlisted private Forgejo/Git repositories to ChatGPT Business and Codex. The service targets MCP 2026-07-28 over stateless Streamable HTTP (`POST /mcp`) with a fresh `McpServer` per request. No legacy HTTP+SSE endpoint is provided.

## Security model

Access is the intersection of deployment allowlist, repository ACL, Forgejo service-account permissions, branch policy, tool configuration, and authentication. Repository content is returned as `untrusted_repository_content` and is never executed. Sensitive paths, arbitrary URLs, shell execution, force-push, repository deletion, permission management, secrets, webhooks, releases/packages/actions and runner management are intentionally absent.

High-risk deletion and merge operations use a signed five-minute prepare/apply token bound to principal and operation state and are single-use. `MCP_READ_ONLY=true` removes write tools at registration time. `MCP_EXCLUDE_TOOLS` has highest priority.

## Toolsets

- `context`: `get_me`
- `repos`: repository/search/history/read tools plus guarded branch/file writes
- `issues`: list/search/read/create/update/comment
- `pull_requests`: list/search/read/create/update/comment/review plus prepare/apply merge
- `git`: reserved low-level git-data toolset; default disabled

`push_files` intentionally fails closed until Forgejo 15.0.5 git-data blob/tree/commit/ref compatibility is validated. It never degrades to unsafe sequential file writes.

## Configuration

Copy `.env.example` to `.env` and `config/repositories.example.yaml` to `config/repositories.yaml`. Set `.env` mode to `0600`. Never commit a real token or real repository policy; both files are excluded from the Git context and the Docker build context.

- `MCP_TOOLSETS=default|all|context,repos,issues,pull_requests,git`
- `MCP_TOOLS=...` adds individual implemented tools
- `MCP_EXCLUDE_TOOLS=...` always wins
- `MCP_READ_ONLY=true` removes all write tools
- `MCP_LOCKDOWN_MODE=true` restricts access to the repository allowlist
- `AUTH_MODE=none|bearer`; `none` is allowed only on loopback

Compose publishes only `127.0.0.1:3100:3000`. It can reach Forgejo through the host gateway or an explicitly selected external Docker network; neither a real address nor a network name is hard-coded. ChatGPT Business is expected to reach it through an independently operated Secure MCP Tunnel in a later, separately reviewed deployment step; Codex/operations may use Tailscale when explicitly configured. This repository does not deploy a tunnel, OAuth server, reverse proxy, or public listener.

## Development and acceptance

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
docker build -t git-readwrite-mcp:local .
docker compose config
```

`GET /healthz` is unauthenticated liveness only and reveals no topology. `GET /readyz` requires the configured Bearer token and verifies Forgejo service-account reachability. Compose uses readiness, not mere liveness, as its health gate.

## Architecture

`src/mcp` registers only enabled tools; `src/policy` enforces repository/branch/path policy; `src/provider` isolates Forgejo HTTP; `src/confirmation` provides replay-resistant high-risk confirmations; `src/http` owns transport/auth/header protection; `src/observability` emits redacted JSON logs.

See `docs/` for toolsets, security, Forgejo compatibility, deployment handoff and architecture decisions.
