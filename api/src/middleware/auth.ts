import { getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { AppError } from "./errors.js";

export const requireAuth: RequestHandler = (req, _res, next) => {
  const { userId } = getAuth(req);

  if (!userId) {
    next(new AppError(401, "Authentication is required.", "UNAUTHENTICATED"));
    return;
  }

  req.auth = { userId };
  next();
};
