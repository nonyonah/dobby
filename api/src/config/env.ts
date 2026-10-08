import "dotenv/config";
import { z } from "zod";

/**
 * An unset optional variable. `.env.example` ships these as `KEY=`, and an
 * empty string must read as "not configured" rather than failing validation.
 */
const optionalString = z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_ORIGIN: z.string().url().default("http://localhost:4000"),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  CLERK_SECRET_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),
  BLOCKSCOUT_BASE_API_URL: z.string().url().optional(),
  BLOCKSCOUT_SOLANA_API_URL: z.string().url().optional(),
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET_NAME: z.string().min(1).optional(),
  R2_ENDPOINT: z.string().url().optional(),
  ALCHEMY_BASE_API_URL: z.string().url().optional(),
  ALCHEMY_API_KEY: z.string().min(1).optional(),
  COMPOSIO_API_KEY: z.string().min(1).optional(),
  COMPOSIO_AUTH_CONFIG_GMAIL: z.string().min(1).optional(),
  COMPOSIO_AUTH_CONFIG_OUTLOOK: z.string().min(1).optional(),
  COMPOSIO_CALLBACK_URL: z.string().url().optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GROQ_API_KEY: z.string().min(1).optional(),
  GROQ_MODEL: z.string().min(1).default("qwen/qwen3.8-27b"),
  GEMINI_MODEL: z.string().min(1).default("gemini-3.1-flash-lite"),
  AI_GATEWAY_API_KEY: z.string().min(1).optional(),
  AI_GATEWAY_MODEL: z.string().min(1).default("alibaba/qwen3.7-flash"),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_MODEL: z.string().min(1).default("qwen/qwen3.8-27b:free"),
  PYTHON_BIN: z.string().min(1).default("python3"),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  BACHS_API_KEY: optionalString,
  BACHS_WEBHOOK_SECRET: optionalString,
  BACHS_PRO_PRODUCT_ID: optionalString,
  BACHS_PRO_YEARLY_PRODUCT_ID: optionalString,
  // Error monitoring. Unset means Sentry is not initialised at all, so the API
  // runs identically without a DSN. Everything sent is scrubbed in lib/sentry.ts.
  SENTRY_DSN: optionalString,
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const fields = parsed.error.flatten().fieldErrors;
  const summary = Object.entries(fields)
    .map(([key, errors]) => `${key}: ${errors?.join(", ")}`)
    .join("; ");

  throw new Error(`Invalid environment configuration. ${summary}`);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
