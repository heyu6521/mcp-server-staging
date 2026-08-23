# Toolsets

Configuration priority is: hard-coded prohibitions > `MCP_EXCLUDE_TOOLS` > `MCP_READ_ONLY` > explicit `MCP_TOOLS` + selected `MCP_TOOLSETS`. Unknown toolsets/tools fail startup.

`default` means `context,repos,issues,pull_requests`. `all` means every toolset implemented by this project, never prohibited capabilities.

Read tools use `readOnlyHint: true`. Writes use `readOnlyHint: false`. Delete, merge, issue/PR close paths are marked destructive. Tool annotations are UI hints only; server-side policy remains authoritative.

Repository reads and writes require allowlist membership. Writes additionally require `access: write`, the relevant repository ACL flag, and Forgejo's actual service-account permission. Worktree file writes require a configured work-branch pattern such as `chatgpt/*`; protected/default branches are not direct write targets in v0.1.

Issue/PR/comment/review tools represent the user externally and should be client-approved. Delete and merge require `prepare_*` followed by the matching apply tool with an unexpired one-time token.
