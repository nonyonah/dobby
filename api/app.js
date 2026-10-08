/**
 * Deploy entrypoint. Vercel runs this file directly, so it must bootstrap the
 * HTTP server itself — re-exporting the bare Express app (as this used to do)
 * leaves the process alive but bound to no socket, and the compute plane gives
 * up waiting for the routed port.
 */
const { app } = require("./dist/app.js");
const { env } = require("./dist/config/env.js");
const { logger } = require("./dist/lib/logger.js");

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, environment: env.NODE_ENV }, "Dobby API listening");
});

// The compute plane probes a routed port and only reports "not ready" if
// nothing answers within two minutes. If the socket never opens, say so here
// instead of leaving an unexplained hang in the deploy log.
server.on("error", (error) => {
  logger.error({ err: error, port: env.PORT }, "HTTP server failed to bind");
  process.exit(1);
});

const startupWatchdog = setTimeout(() => {
  const address = server.address();
  if (!address) {
    logger.error({ port: env.PORT }, "Server did not bind a port before the readiness deadline");
    process.exit(1);
  }
  clearTimeout(startupWatchdog);
}, 60_000);
startupWatchdog.unref();

server.once("listening", () => clearTimeout(startupWatchdog));

const shutdown = (signal) => {
  logger.info({ signal }, "shutting down");
  server.close(() => process.exit(0));
};

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

// Config validation throws while this file is still being required, which
// surfaces as an opaque module-load failure. Echo it plainly so a missing
// CLERK_SECRET_KEY or DATABASE_URL is readable in the deploy log.
process.on("uncaughtException", (error) => {
  console.error("[dobby-api] fatal error during startup:", error instanceof Error ? error.message : error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason instanceof Error ? reason : String(reason) }, "unhandled promise rejection");
});

module.exports = app;
module.exports.server = server;