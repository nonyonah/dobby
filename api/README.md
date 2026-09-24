# Dobby API

Node.js/Express backend for Dobby. The API is intentionally separate from the Next.js frontend in `../web`.

## Runtime

- Node.js `22.22.3+` (required by the planned Composio TypeScript SDK)
- TypeScript + native ESM
- Express
- Clerk Express middleware
- Prisma with Supabase PostgreSQL

## Local setup

```sh
cp .env.example .env
npm install

# PDF statement extraction dependencies (macOS/Homebrew-safe)
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
# Add this to .env so the API uses the project virtual environment:
# PYTHON_BIN=.venv/bin/python

npm run prisma:generate
npm run prisma:validate
npm run dev
```

The server listens on `http://localhost:4000` by default.

## AI document and summary providers

Set these values in `.env`:

```sh
GROQ_API_KEY=...
GROQ_MODEL=qwen/qwen3.8-27b
AI_GATEWAY_API_KEY=...
AI_GATEWAY_MODEL=alibaba/qwen3.7-flash
```

Groq vision is the primary AI provider for bank-statement extraction. PDF pages are rendered and processed independently; local PDF text extraction and Tesseract are used to provide OCR text for source checks and fallback parsing. Mistral is disabled. Vercel AI Gateway is used for AI tax and monthly insight summaries.

Summary endpoints:

- `GET /v1/tax/summary` — informational AI-assisted tax estimate summary
- `GET /v1/insights/monthly-summary?month=YYYY-MM` — AI-assisted monthly summary
- `GET /v1/imports/jobs/:jobId` — poll a background PDF import job

- `GET /` — service metadata
- `GET /health/live` — liveness check; does not require the database
- `GET /health/ready` — database readiness check
- `GET /v1/me` — authenticated Clerk user bootstrap/profile endpoint

`GET /v1/me` requires a Clerk session token. The API uses the Clerk user ID as the ownership boundary and upserts the application user/profile record on first access.

## Database

Use a dedicated Prisma database role. For the persistent Express server, `DATABASE_URL` should be a direct Postgres or Supavisor session-mode URL. Keep `DIRECT_URL` available for Prisma CLI migrations when runtime and migration connection strings differ.

Create the first migration only after setting real database credentials:

```sh
npm run prisma:migrate -- --name initial
```

Do not commit `.env` or credentials. R2, Gemini, and Composio clients will be added behind feature-specific services as their workflows are implemented.
