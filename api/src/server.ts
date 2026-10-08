import { env } from "./config/env.js";
import { app } from "./app.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { startScheduler } from "./jobs/scheduler.js";

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, environment: env.NODE_ENV }, "Dobby API listening");
});

const stopScheduler = startScheduler();

const shutdown = async (signal: string) => {
  logger.info({ signal }, "shutting down");
  stopScheduler();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

// Background work (e.g. integration status reconciliation) must not take the
// API down if one of its promises rejects after the response was sent.
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason instanceof Error ? reason : String(reason) }, "unhandled promise rejection");
});
