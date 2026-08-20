# Deployment runbook (for operations/Codex)

This repository does not deploy itself. The following commands are intended for the later deployment stage on the target host.

1. Check out the reviewed commit/PR merge.
2. Create `.env` and `config/repositories.yaml` from examples; inject Forgejo token and confirmation secret using the approved secret mechanism.
3. Keep Compose published on `127.0.0.1:3100` unless an explicitly reviewed network/auth design says otherwise.
4. Validate with `docker compose config`, then `docker compose up -d`.
5. Check `curl http://127.0.0.1:3100/healthz` and `/readyz`.
6. Perform MCP discovery and one read call against a dedicated test repository before enabling writes.
7. Validate branch create, expected-SHA conflict, issue/draft-PR flow, delete prepare/apply and merge prepare/apply only in a disposable test repository.
8. Roll back by checking out the previous reviewed image/commit and recreating the service. Repository data remains in Forgejo; this MCP service owns no durable repository database.

Do not mount the Docker socket, run privileged, expose Forgejo credentials to tunnel containers, or publish port 3100 publicly without a separately reviewed HTTPS/OAuth design.
