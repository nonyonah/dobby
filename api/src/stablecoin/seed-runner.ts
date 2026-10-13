/**
 * Seeds the shared provider and protocol list.
 *
 * Runs at boot and is safe to run repeatedly: the upsert is keyed on
 * (kind, name, chain), so a deploy adds what is new and leaves what is already
 * there alone — including any address a user filled in through Settings, which
 * a create-only seed would otherwise be free to overwrite on the next deploy.
 *
 * That last point is why this upserts rather than replacing. The seed ships no
 * addresses, so an operator's verified address must survive every future deploy
 * that happens to include a newer seed file.
 */

import { logger } from "../lib/logger.js";
import { seedKnownEntities } from "./entities.js";
import { KNOWN_ENTITY_SEEDS } from "./seed.js";

export async function seedStablecoinReferenceData(): Promise<{ total: number; created: number }> {
  try {
    const { created } = await seedKnownEntities(KNOWN_ENTITY_SEEDS);
    if (created > 0) logger.info({ total: KNOWN_ENTITY_SEEDS.length, created }, "seeded known stablecoin entities");
    return { total: KNOWN_ENTITY_SEEDS.length, created };
  } catch (error) {
    // Never fatal: a missing provider name costs a weaker match, not a boot.
    logger.error({ error: error instanceof Error ? error.message : String(error) }, "known entity seed failed");
    return { total: 0, created: 0 };
  }
}