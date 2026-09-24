import pino, { type DestinationStream, type LoggerOptions } from "pino";
import { Writable } from "node:stream";

function levelName(level: number) {
  if (level >= 60) return "FATAL";
  if (level >= 50) return "ERROR";
  if (level >= 40) return "WARN";
  if (level >= 30) return "INFO";
  if (level >= 20) return "DEBUG";
  return "TRACE";
}

function createDevelopmentStream(): DestinationStream {
  return new Writable({
    write(chunk, _encoding, callback) {
      const line = String(chunk).trim();
      try {
        const entry = JSON.parse(line) as Record<string, unknown>;
        const request = entry.req as Record<string, unknown> | undefined;
        const response = entry.res as Record<string, unknown> | undefined;
        const method = String(request?.method ?? entry.method ?? "").toUpperCase();
        const url = String(request?.url ?? entry.url ?? "");
        const status = response?.statusCode ?? entry.statusCode;
        const duration = entry.responseTime !== undefined ? ` ${Number(entry.responseTime).toFixed(0)}ms` : "";
        const requestPart = method && url ? ` ${method} ${url}${status ? ` ${status}` : ""}${duration}` : "";
        const error = entry.err as Record<string, unknown> | undefined;
        const structuredError = typeof entry.error === "string" ? entry.error : undefined;
        const detailMessage = error?.message ?? structuredError;
        const detail = detailMessage ? ` — ${String(detailMessage).replace(/\s+/g, " ")}` : "";
        const requestId = entry.requestId ? ` [${entry.requestId}]` : "";
        process.stdout.write(`${levelName(Number(entry.level))}${requestId}${requestPart} ${String(entry.msg ?? "")}${detail}\n`);
        if (error?.stack && Number(entry.level) >= 50) {
          process.stdout.write(`  ${String(error.stack).split("\n")[0]}\n`);
        }
      } catch {
        process.stdout.write(`${line}\n`);
      }
      callback();
    },
  });
}

const isDevelopment = (process.env.NODE_ENV ?? "development") !== "production";
const options: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? "info",
  redact: ["req.headers.authorization", "req.headers.cookie"],
  timestamp: pino.stdTimeFunctions.isoTime,
};

export const logger = pino(options, isDevelopment ? createDevelopmentStream() : process.stdout);
