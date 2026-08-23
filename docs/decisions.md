# Architecture decisions

1. **MCP SDK v2 only.** Use `@modelcontextprotocol/server` 2.x, Express/Node adapters and `createMcpHandler(..., { legacy: 'reject' })` for a fresh server per HTTP request.
2. **Provider boundary.** MCP registration never constructs arbitrary URLs; Forgejo base URL comes only from deployment config.
3. **Fail closed.** Empty allowlist, invalid tool config, unsafe network/auth combinations and undersized confirmation secret prevent startup/readiness.
4. **No unsafe atomic-write fallback.** The requirements make `push_files` a single commit; until Forgejo 15.0.5 git-data API behavior is contract-tested, the tool returns a clear unsupported error.
5. **Confirmation nonce cache is process-local.** This matches the specified single-instance first release; multi-replica deployment requires shared short-lived replay state.
6. **Direct push to protected/default branches is not implemented in v0.1**, even if a future policy flag permits it. This is narrower than the maximum scope and preserves safety.
7. **LocalGitReadProvider is deferred.** All v0.1 reads use the Forgejo API; this avoids filesystem mount and symlink boundary complexity until profiling demonstrates a need.
8. **Known implementation follow-up:** before production deployment, contract tests must validate Forgejo review endpoints and the atomic git-data path, then implement/enable `push_files` and optional `git` toolset without weakening compare-and-swap semantics.
