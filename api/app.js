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

const shutdown = (signal) => {
  logger.info({ signal }, "shutting down");
  server.close(() => process.exit(0));
};

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason instanceof Error ? reason : String(reason) }, "unhandled promise rejection");
});

module.exports = app;
module.exports.server = server;