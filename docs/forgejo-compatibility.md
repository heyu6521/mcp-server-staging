# Forgejo compatibility

Target: Forgejo 15.0.5, compatibility identifier `gitea-1.22.0`.

The target server's exported `swagger.v1.json` was checked directly. It confirms exact branch lookup, textual `pulls/{index}.diff`, combined commit status, Contents API writes, pull-review create/submit, and pull-request merge endpoints used by the provider.

Forgejo 15.0.5 exposes only read operations for the git-data blob/tree/commit/ref API families. It does not expose the create-blob/create-tree/create-commit/create-ref operations needed for an atomic multi-file commit. `push_files` therefore fails closed in v0.1 rather than silently using multiple Contents API writes. The low-level public `git` toolset remains unregistered.

PR review writes are restricted to the confirmed operations: create via `POST pulls/{index}/reviews`, or submit an existing pending review via `POST pulls/{index}/reviews/{id}`. Other review methods are rejected by the MCP schema. Merge requests send the required `Do`, the expected `head_commit_id`, and Forgejo's exact `MergeTitleField` / `MergeMessageField` names, then re-read the PR to verify the merged state.

Forgejo 15.0.5 does not expose a `draft` field in `CreatePullRequestOption`. Draft state is derived from the configured work-in-progress title prefixes (defaults: `WIP:` and `[WIP]:`). The provider maps `draft=true` to `WIP:` and verifies the returned draft state; it does not send the unsupported field.

