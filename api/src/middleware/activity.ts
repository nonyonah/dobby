import type { NextFunction, Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { prisma } from "../lib/prisma.js";

/**
 * Records that the account was here, so "are they still around" has an answer.
 *
 * Measuring dormancy from the newest transaction instead cannot tell a dormant
 * account from one that has been reading and not acting — and sends the "your
 * numbers are stale" email to someone who was here yesterday.
 *
 * Throttled to one write per ten minutes. This runs on every authenticated
 * request, and an unbounded write there is a database round-trip per page view
 * for a field that only ever needs to be roughly right.
 *
 * Fire and forget: the response must not wait on this, and a failure here is
 * never worth failing a request over.
 */
const THROTTLE_MS = 10 * 60 * 1000;

/** In-process guard, so the cheap path costs no query at all. */
const recentlyTouched = new Map<string, number>();

export const touchLastActive = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return next();

    const last = recentlyTouched.get(userId) ?? 0;
    if (Date.now() - last < THROTTLE_MS) return next();
    recentlyTouched.set(userId, Date.now());

    void prisma.user
      .updateMany({
        // The condition is the throttle's real form: two instances behind a load
        // balancer would each hold their own map, so the write has to be safe
        // without it or they would double-write on every request.
        where: {
          clerkId: userId,
          OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: new Date(Date.now() - THROTTLE_MS) } }],
        },
        data: { lastActiveAt: new Date() },
      })
      .catch(() => undefined);
  } catch {
    // Never let a background signal break a request.
  }
  next();
};