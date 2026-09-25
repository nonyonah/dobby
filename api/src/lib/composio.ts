import { Composio } from "@composio/core";
import { env } from "../config/env.js";
import { AppError } from "../middleware/errors.js";

let client: Composio | null = null;

/**
 * Shared Composio client. Throws a 503 with setup guidance when the API
 * key is missing so routes degrade with a clear message instead of a
 * cryptic SDK error.
 */
export function composioClient(): Composio {
  if (!env.COMPOSIO_API_KEY) {
    throw new AppError(
      503,
      "Composio is not configured. Set COMPOSIO_API_KEY on the API service.",
      "COMPOSIO_NOT_CONFIGURED",
    );
  }
  client ??= new Composio({ apiKey: env.COMPOSIO_API_KEY });
  return client;
}

const AUTH_CONFIG_CACHE_TTL_MS = 5 * 60_000;
const authConfigCache = new Map<string, { id: string; expiresAt: number }>();

/**
 * Ask Composio which auth config is enabled for a toolkit. Results are cached
 * briefly so a reconnect does not re-query on every click.
 */
export async function lookupAuthConfigId(toolkit: string): Promise<string | null> {
  const cached = authConfigCache.get(toolkit);
  if (cached && cached.expiresAt > Date.now()) return cached.id;

  const response = await composioClient().authConfigs.list({ toolkit, showDisabled: false, limit: 20 });
  const selected = response.items.find((item) => item.status === "ENABLED") ?? response.items[0];
  if (!selected?.id) return null;

  authConfigCache.set(toolkit, { id: selected.id, expiresAt: Date.now() + AUTH_CONFIG_CACHE_TTL_MS });
  return selected.id;
}

/**
 * Resolve the auth-config ID used to start a connection for a toolkit.
 *
 * The pinned env override (`COMPOSIO_AUTH_CONFIG_*`) wins when set; otherwise
 * the enabled auth config Composio already has for the toolkit is used, so a
 * config created in the dashboard works without redeploying the API.
 *
 * Returns null when neither source has one, which is what the caller turns
 * into the "create one in the Composio dashboard" error.
 */
export async function resolveAuthConfigId(toolkit: string, override?: string): Promise<string | null> {
  if (override) return override;
  return lookupAuthConfigId(toolkit);
}

/** Drop a cached lookup so a newly created auth config is picked up immediately. */
export function clearAuthConfigCache(toolkit?: string) {
  if (toolkit) authConfigCache.delete(toolkit);
  else authConfigCache.clear();
}
