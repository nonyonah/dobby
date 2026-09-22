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
npm run prisma:generate
npm run prisma:validate
npm run dev
```

The server listens on `http://localhost:4000` by default.

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
