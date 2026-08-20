# Forgejo compatibility

Target: Forgejo 15.0.5, compatibility identifier `gitea-1.22.0`.

The provider uses the stable `/api/v1` repository, contents, branch, issue and pull-request families. Exact pending-review behavior and git-data blob/tree/commit/ref write semantics vary across Forgejo/Gitea releases and must be confirmed against the target-compatible mock/container before enabling them.

`push_files` therefore fails closed in v0.1 rather than silently using multiple Contents API writes. The low-level public `git` toolset is not registered by the current implementation even if selected; enabling it is blocked until compatibility tests establish exact endpoint and fast-forward semantics.

PR review subresource support is best-effort through Forgejo review endpoints. Unsupported server behavior must surface as an upstream error; no fabricated success is permitted.
