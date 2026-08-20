# Deployment runbook (operations/Codex)

This repository does not deploy itself. Start with a disposable Forgejo repository in the allowlist and use a dedicated, least-privilege Forgejo service account. Do not point the first compatibility run at a production repository.

## Prepare configuration

1. Check out the reviewed commit or PR merge and record its commit ID.
2. Copy `.env.example` to `.env` and `config/repositories.example.yaml` to `config/repositories.yaml`.
3. Generate independent random values for `BEARER_TOKEN` (at least 16 bytes) and `CONFIRMATION_SECRET` (at least 32 bytes), set the Forgejo service-account token, and replace every placeholder.
4. On Linux, run `chmod 600 .env`. Give `config/repositories.yaml` to the deployment account and the container's configured group, with mode `0640` (for the default Compose user, use the group ID configured by `user: 1000:999`). Verify the non-root container can read it before rollout. Never commit either file, put them in an image, or send them to the Docker build context.
5. Keep the published MCP endpoint at `127.0.0.1:3100`. A container's `HOST=0.0.0.0` is required for Docker port forwarding and does not change the host-side loopback binding.

The current application reads secrets from environment variables. Compose `env_file` therefore remains the supported deployment mechanism. Docker Compose secrets are not yet wired into the application (`*_FILE` variables are not supported); adding a secret mount alone would not work. Treat `.env` as a sensitive deployment file and note that environment values may be visible to users allowed to inspect Docker containers.

## Connect to Forgejo

Choose one of these reviewed paths. Do not hard-code the real IP or Docker network in version control.

### Host gateway

The base Compose file maps `host.docker.internal` to Docker's host gateway on Linux. Set `FORGEJO_BASE_URL` to the Forgejo port published on a host address reachable from Docker, for example `http://host.docker.internal:3000`. A Forgejo port bound only to host `127.0.0.1` is normally not reachable through the bridge gateway; do not broaden that binding without reviewing its firewall and authentication exposure.

### Existing external Docker network (preferred for same-host containers)

Determine the exact existing Forgejo network with a read-only Docker inspection. Set `FORGEJO_DOCKER_NETWORK` in `.env`, set `FORGEJO_BASE_URL` to Forgejo's service DNS name and internal port, and start with both Compose files:

```bash
docker compose -f compose.yaml -f compose.forgejo-network.yaml config --quiet
docker compose -f compose.yaml -f compose.forgejo-network.yaml up -d --wait
```

The override only attaches this service to an existing external network. It does not create, rename, or reconfigure the Forgejo network.

## Validate and gate rollout

Validate the fully resolved Compose configuration before starting. Be careful: `docker compose config` without `--quiet` can render environment secrets, so do not paste its output into logs or tickets.

```bash
docker compose config --quiet
docker compose build --pull
docker compose up -d --wait
curl --fail --silent --show-error http://127.0.0.1:3100/healthz
read -rsp 'MCP Bearer token: ' MCP_BEARER_TOKEN; echo
curl --fail --silent --show-error \
  -H "Authorization: Bearer ${MCP_BEARER_TOKEN}" \
  http://127.0.0.1:3100/readyz
unset MCP_BEARER_TOKEN
```

`/healthz` proves only that the HTTP process is alive. `/readyz` is authenticated and calls Forgejo; it must succeed before MCP discovery or writes are attempted. Compose overrides the image liveness probe with this authenticated readiness check, so `up --wait` also fails closed when Forgejo or its credentials are unavailable.

Then perform MCP discovery and one read call against the disposable repository. Validate, in order:

MCP 2026-07-28 does not use the legacy `initialize` request shape. Every request must carry the modern `_meta` envelope (`io.modelcontextprotocol/protocolVersion` and `io.modelcontextprotocol/clientCapabilities`), together with the matching `MCP-Protocol-Version` and `Mcp-Method` headers. A `tools/call` request must also carry the matching `Mcp-Name` header. A 400 `UnsupportedProtocolVersion` response to a legacy-shaped `initialize` request is therefore expected, not a failed deployment.

1. repository and file reads;
2. branch creation and expected-SHA conflict behavior;
3. issue and draft-PR flow;
4. PR diff/status and pending-review behavior;
5. delete prepare/apply and merge prepare/apply, including stale state and replay rejection;
6. atomic `push_files` only after Forgejo 15.0.5 compatibility has been proven.

Do not enable a production allowlist until the compatibility results are recorded and the readiness gate remains healthy.

## Exposure and later ChatGPT access

The base deployment is deliberately loopback-only. Tailscale or an internal reverse proxy requires a separately reviewed listener, host/origin allowlist, TLS and authentication design. ChatGPT Business access through OpenAI Secure MCP Tunnel is a later deployment phase: deploy and authorize the tunnel independently after Forgejo compatibility validation. Do not place Forgejo credentials in the tunnel container and do not publish port 3100 directly to the internet. A domain, public HTTPS endpoint and OAuth can be added later only as a separate security change.

## Rollback

Record the previously reviewed image digest or commit. To roll back, restore that version and recreate only the MCP service, then require both the Compose health gate and the authenticated `/readyz` check to pass. This service owns no durable repository database; repository data remains in Forgejo.

Never mount the Docker socket, run privileged, add capabilities, use host networking, or relax the repository/branch policy as a compatibility workaround.
