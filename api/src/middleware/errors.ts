import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "../lib/logger.js";
import { Sentry, hashUserId } from "../lib/sentry.js";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = "APP_ERROR",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `Route ${req.method} ${req.path} was not found.` },
    requestId: req.requestId,
  });
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Request validation failed.", details: error.flatten() },
      requestId: req.requestId,
    });
    return;
  }

  const appError = error instanceof AppError ? error : undefined;
  const statusCode = appError?.statusCode ?? 500;
  const message = appError?.message ?? "An unexpected error occurred.";

  logger.error({ err: error, requestId: req.requestId }, "request failed");

  // Only genuine 5s are incidents. AppError carries an intentional status, and
  // a 402 paywall or a 404 is correct behaviour, not something to wake anyone for.
  if (!appError || statusCode >= 500) {
    Sentry.withScope((scope) => {
      scope.setTag("requestId", req.requestId ?? "unknown");
      if (req.method) scope.setTag("method", req.method);
      // Hashed, never the raw Clerk id, so a report can be grouped per user
      // without identifying them.
      const userTag = hashUserId(req.auth?.userId);
      if (userTag) scope.setTag("user", userTag);
      Sentry.captureException(error);
    });
  }

  res.status(statusCode).json({
    error: { code: appError?.code ?? "INTERNAL_ERROR", message },
    requestId: req.requestId,
  });
};
