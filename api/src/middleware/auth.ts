import { getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { AppError } from "./errors.js";
import { prisma } from "../lib/prisma.js";

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      next(new AppError(401, "Authentication is required.", "UNAUTHENTICATED"));
      return;
    }

    await prisma.user.upsert({
      where: { clerkId: userId },
      create: { clerkId: userId, profile: { create: {} } },
      update: {},
      select: { clerkId: true },
    });

    req.auth = { userId };
    next();
  } catch (error) {
    next(error);
  }
};
