import { env } from "./config/env.js";
import { app } from "./app.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, environment: env.NODE_ENV }, "Dobby API listening");
});

const shutdown = async (signal: string) => {
  logger.info({ signal }, "shutting down");
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
