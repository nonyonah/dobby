import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { composioClient } from "../lib/composio.js";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import { logger } from "../lib/logger.js";

export const integrationsRouter = Router();
integrationsRouter.use(requireAuth);

const PROVIDERS = {
  gmail: { toolkit: "gmail", authConfigEnv: "COMPOSIO_AUTH_CONFIG_GMAIL" as const },
  outlook: { toolkit: "outlook", authConfigEnv: "COMPOSIO_AUTH_CONFIG_OUTLOOK" as const },
  quickbooks: { toolkit: "quickbooks", authConfigEnv: "COMPOSIO_AUTH_CONFIG_QUICKBOOKS" as const },
  xero: { toolkit: "xero", authConfigEnv: "COMPOSIO_AUTH_CONFIG_XERO" as const },
} as const;

export type IntegrationProvider = keyof typeof PROVIDERS;

const providerSchema = z.object({ provider: z.enum(["gmail", "outlook", "quickbooks", "xero"]) });

type ListedAccount = { id?: unknown; status?: unknown; toolkit?: unknown };

function readAccounts(payload: unknown): ListedAccount[] {
  if (Array.isArray(payload)) return payload as ListedAccount[];
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.items)) return record.items as ListedAccount[];
    if (Array.isArray(record.data)) return record.data as ListedAccount[];
  }
  return [];
}

function isActiveForToolkit(account: ListedAccount, toolkit: string): string | null {
  if (typeof account.id !== "string") return null;
  const slug =
    account.toolkit && typeof account.toolkit === "object"
      ? (account.toolkit as Record<string, unknown>).slug
      : undefined;
  if (account.status === "ACTIVE" && (slug === undefined || slug === toolkit)) return account.id;
  return null;
}

async function refreshProviderStatus(ownerClerkId: string, provider: IntegrationProvider) {
  const { toolkit } = PROVIDERS[provider];
  let status = "disconnected";
  let connectedAccountId: string | null = null;
  try {
    const accounts = readAccounts(
      await composioClient().connectedAccounts.list({ userIds: [ownerClerkId], toolkitSlugs: [toolkit], statuses: ["ACTIVE"] }),
    );
    for (const account of accounts) {
      const id = isActiveForToolkit(account, toolkit);
      if (id) {
        status = "connected";
        connectedAccountId = id;
        break;
      }
    }
  } catch (error) {
    // Composio unreachable or unconfigured: fall back to the stored status.
    logger.info(
      { error: error instanceof Error ? error.message : String(error), provider },
      "Composio status check failed; using stored integration status",
    );
    const stored = await prisma.integrationConnection.findUnique({
      where: { ownerClerkId_provider: { ownerClerkId, provider } },
    });
    return { provider, status: stored?.status ?? "disconnected", connectedAccountId: null as string | null, live: false };
  }
  await prisma.integrationConnection.upsert({
    where: { ownerClerkId_provider: { ownerClerkId, provider } },
    create: { ownerClerkId, provider, status, metadata: connectedAccountId ? { connectedAccountId } : undefined },
    update: { status, metadata: connectedAccountId ? { connectedAccountId } : undefined, lastSyncedAt: new Date() },
  });
  return { provider, status, connectedAccountId, live: true };
}

integrationsRouter.get("/", async (req, res) => {
  const ownerClerkId = req.auth!.userId;
  const providers = Object.keys(PROVIDERS) as IntegrationProvider[];
  const [stored, live] = await Promise.all([
    prisma.integrationConnection.findMany({ where: { ownerClerkId } }),
    Promise.all(providers.map((provider) => refreshProviderStatus(ownerClerkId, provider))),
  ]);
  const storedByProvider = new Map(stored.map((row) => [row.provider, row]));
  res.json({
    data: live.map((item) => ({
      provider: item.provider,
      status: item.live ? item.status : (storedByProvider.get(item.provider)?.status ?? "disconnected"),
      connectedAccountId: item.connectedAccountId,
      live: item.live,
      updatedAt: storedByProvider.get(item.provider)?.updatedAt ?? null,
    })),
  });
});

integrationsRouter.post("/:provider/connect", async (req, res) => {
  const { provider } = providerSchema.parse(req.params);
  const authConfigId = env[PROVIDERS[provider].authConfigEnv];
  if (!authConfigId) {
    res.status(503).json({
      error: {
        code: "COMPOSIO_AUTH_CONFIG_MISSING",
        message: `No auth config is configured for ${provider}. Create one in the Composio dashboard and set ${PROVIDERS[provider].authConfigEnv}.`,
      },
    });
    return;
  }
  try {
    const request = await composioClient().connectedAccounts.link(req.auth!.userId, authConfigId, {
      ...(env.COMPOSIO_CALLBACK_URL ? { callbackUrl: env.COMPOSIO_CALLBACK_URL } : {}),
    });
    res.status(201).json({ data: { redirectUrl: request.redirectUrl, connectionId: request.id } });
  } catch (error) {
    logger.warn({ error: error instanceof Error ? error.message : String(error), provider }, "Composio connect link failed");
    res.status(502).json({
      error: { code: "COMPOSIO_CONNECT_FAILED", message: "Could not start the connection flow. Try again." },
    });
  }
});

integrationsRouter.post("/:provider/refresh", async (req, res) => {
  const { provider } = providerSchema.parse(req.params);
  res.json({ data: await refreshProviderStatus(req.auth!.userId, provider) });
});

integrationsRouter.delete("/:provider", async (req, res) => {
  const { provider } = providerSchema.parse(req.params);
  const ownerClerkId = req.auth!.userId;
  try {
    const accounts = readAccounts(
      await composioClient().connectedAccounts.list({ userIds: [ownerClerkId], toolkitSlugs: [PROVIDERS[provider].toolkit] }),
    );
    await Promise.all(
      accounts
        .filter((account): account is ListedAccount & { id: string } => typeof account.id === "string")
        .map((account) => composioClient().connectedAccounts.delete(account.id).catch(() => undefined)),
    );
  } catch (error) {
    logger.info({ error: error instanceof Error ? error.message : String(error), provider }, "Composio revoke skipped; clearing stored status");
  }
  await prisma.integrationConnection.upsert({
    where: { ownerClerkId_provider: { ownerClerkId, provider } },
    create: { ownerClerkId, provider, status: "disconnected" },
    update: { status: "disconnected", metadata: undefined, lastSyncedAt: new Date() },
  });
  res.status(204).send();
});
