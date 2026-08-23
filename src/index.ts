import { loadConfig } from "./config/load.js";
import { createApp } from "./http/app.js";
import { log } from "./observability/logger.js";
import { ForgejoProvider } from "./provider/forgejo.js";
import { resolveTools } from "./tooling/inventory.js";

const config = loadConfig();
const provider = new ForgejoProvider(
  config.forgejoBaseUrl,
  config.forgejoToken,
  config.requestTimeoutMs,
);
const app = createApp(config, provider);
const server = app.listen(config.port, config.host, () =>
  log("info", "server_started", {
    host: config.host,
    port: config.port,
    enabledTools: resolveTools(
      config.toolsets,
      config.tools,
      config.excludeTools,
      config.readOnly,
    ),
  }),
);
const shutdown = (signal: string) => {
  log("info", "shutdown", { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
