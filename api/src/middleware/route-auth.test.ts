import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Every `/v1` router requires auth, and two did not.
 *
 * `stablecoin-events` and `known-entities` were mounted in app.ts without
 * `.use(requireAuth)`. The handlers read `req.auth!.userId`, which does not
 * throw when `req.auth` is unset — the non-null assertion is a promise to the
 * compiler, not a runtime check — so an unauthenticated caller got `null` as
 * their owner id and an empty result rather than a 401. That reads as "no data"
 * instead of "not allowed", which is the hardest kind of auth bug to notice.
 *
 * Structural rather than behavioural: exercising it needs a running server with
 * Clerk configured, and the thing worth protecting is that a *new* router cannot
 * be added without the guard. A test that boots the app would not catch the next
 * one being written the same way.
 */

const ROUTES_DIR = join(import.meta.dirname, "..", "routes");

/** Routers mounted outside `/v1` or deliberately unauthenticated. */
const EXEMPT = new Set(["health.ts", "billing.ts"]);

describe("route authentication", () => {
  const files = readdirSync(ROUTES_DIR).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));

  it("finds the route files this check is supposed to cover", () => {
    // Guards against the glob silently matching nothing, which would make every
    // assertion below vacuously true.
    expect(files.length).toBeGreaterThan(10);
  });

  for (const file of files) {
    if (EXEMPT.has(file)) continue;
    it(`${file} requires auth`, () => {
      const source = readFileSync(join(ROUTES_DIR, file), "utf8");
      const hasRouter = /Router\(\)/.test(source);
      if (!hasRouter) return;
      expect(source, `${file} mounts routes but never calls requireAuth`).toMatch(/\.use\(requireAuth\)/);
    });
  }

  it("mounts the stablecoin routers behind /v1", () => {
    const app = readFileSync(join(import.meta.dirname, "..", "app.ts"), "utf8");
    expect(app).toMatch(/app\.use\("\/v1\/stablecoin-events", stablecoinRouter\)/);
    expect(app).toMatch(/app\.use\("\/v1\/known-entities", knownEntitiesRouter\)/);
  });

  it("never reads a user id without auth in place", () => {
    // The assertion that cannot fail silently: a handler that reaches for
    // `req.auth!.userId` is fine, but only if the file guards it first.
    for (const file of files) {
      if (EXEMPT.has(file)) continue;
      const source = readFileSync(join(ROUTES_DIR, file), "utf8");
      if (!/req\.auth!\.userId/.test(source)) continue;
      expect(source, `${file} reads req.auth.userId without requiring auth`).toMatch(/\.use\(requireAuth\)/);
    }
  });
});