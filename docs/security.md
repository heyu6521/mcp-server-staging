# Security

## Trust boundaries

Forgejo content is untrusted model input. File contents, paths, diffs, issue/PR text, comments and commit messages are serialized under `untrusted_repository_content`; the service never follows instructions or URLs found there and never executes repository code.

## Repository and path policy

The deployment policy is the only repository authority. Tool inputs cannot choose the Forgejo base URL, credential, filesystem path or organization scope. Absolute paths, traversal, control characters, option-like paths, `.git`, `.env` (except `.env.example`), credential/config files and common private-key paths are blocked.

## Writes and concurrency

Ordinary code writes target configured work branches. Single-file update requires `expectedHeadSha` and re-reads branch HEAD before mutating. Delete and merge use signed confirmation tokens. The first release intentionally refuses non-atomic `push_files` rather than sequentially modifying multiple files.

## Secrets and logging

Bearer and Forgejo tokens are deployment-injected. JSON logs redact fields matching token/secret/authorization/cookie/body/content/patch/password and never log confirmation tokens or repository payloads.

## Network

Default Compose binding is loopback. Non-loopback startup without authentication is rejected. MCP framework Host/Origin protection is configured; CORS is not broadly enabled. Public exposure is out of scope.
