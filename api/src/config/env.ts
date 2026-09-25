import "dotenv/config";
import { z } from "zod";

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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
