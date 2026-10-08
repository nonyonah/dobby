import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const healthRouter = Router();

// vercel.json rewrites the exact path `/health` here, so this route must exist
// or the probe 404s. Deliberately DB-free: liveness should never be gated on
// Postgres, or a cold/overloaded database would stall the deploy health check.
healthRouter.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

healthRouter.get("/live", (_req, res) => {
  res.json({ status: "ok" });
});

healthRouter.get("/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", checks: { database: "ok" } });
  } catch {
    res.status(503).json({ status: "not_ready", checks: { database: "failed" } });
  }
});
