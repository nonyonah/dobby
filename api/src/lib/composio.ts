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
