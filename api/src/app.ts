import "./config/env.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { pinoHttp } from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { requestId } from "./middleware/request-id.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import { healthRouter } from "./routes/health.js";
import { meRouter } from "./routes/me.js";
import { walletsRouter } from "./routes/wallets.js";
import { accountsRouter } from "./routes/accounts.js";
import { categoriesRouter } from "./routes/categories.js";
import { transactionsRouter } from "./routes/transactions.js";
import { importsRouter } from "./routes/imports.js";
import { reviewsRouter } from "./routes/reviews.js";
import { insightsRouter } from "./routes/insights.js";
import { rulesRouter } from "./routes/rules.js";
import { taxRouter } from "./routes/tax.js";
import { budgetsRouter } from "./routes/budgets.js";
import { goalsRouter } from "./routes/goals.js";

export const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(requestId);
app.use(pinoHttp({ logger }));
app.use(helmet());
app.use(
  cors({
    origin: env.WEB_ORIGIN,
    credentials: true,
  }),
);
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "50kb" }));

// Clerk must run before any route that reads authentication state.
app.use(clerkMiddleware());

app.get("/", (_req, res) => {
  res.json({ name: "dobby-api", status: "ok", version: "v1" });
});
app.use("/health", healthRouter);
app.use("/v1/me", meRouter);
app.use("/v1/wallets", walletsRouter);
app.use("/v1/accounts", accountsRouter);
app.use("/v1/categories", categoriesRouter);
app.use("/v1/transactions", transactionsRouter);
app.use("/v1/imports", importsRouter);
app.use("/v1/reviews", reviewsRouter);
app.use("/v1/insights", insightsRouter);
app.use("/v1/rules", rulesRouter);
app.use("/v1/tax", taxRouter);
app.use("/v1/budgets", budgetsRouter);
app.use("/v1/goals", goalsRouter);

app.use(notFoundHandler);
app.use(errorHandler);
