import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "../lib/logger.js";

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
  res.status(statusCode).json({
    error: { code: appError?.code ?? "INTERNAL_ERROR", message },
    requestId: req.requestId,
  });
};
