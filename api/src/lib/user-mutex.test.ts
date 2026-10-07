import { describe, expect, it } from "vitest";
import { runExclusive } from "./user-mutex.js";

/** Resolves after `ms`, recording when the body actually started. */
function body(label: string, log: string[], ms = 0) {
  return async () => {
    log.push(`start:${label}`);
    if (ms) await new Promise((resolve) => setTimeout(resolve, ms));
    log.push(`end:${label}`);
    return label;
  };
}

describe("runExclusive", () => {
  it("never overlaps work sharing a key", async () => {
    const log: string[] = [];
    await Promise.all([
      runExclusive("k", body("a", log, 20)),
      runExclusive("k", body("b", log, 1)),
      runExclusive("k", body("c", log, 1)),
    ]);
    expect(log).toEqual([
      "start:a", "end:a",
      "start:b", "end:b",
      "start:c", "end:c",
    ]);
  });

  it("runs different keys concurrently", async () => {
    const log: string[] = [];
    await Promise.all([
      runExclusive("one", body("a", log, 20)),
      runExclusive("two", body("b", log, 20)),
    ]);
    // Both bodies must be running before either finishes.
    expect(log.slice(0, 2)).toEqual(["start:a", "start:b"]);
  });

  it("runs work queued after a failure instead of inheriting its rejection", async () => {
    const log: string[] = [];
    const failing = runExclusive("k", async () => {
      throw new Error("boom");
    });
    const following = runExclusive("k", body("after", log));

    await expect(failing).rejects.toThrow("boom");
    await expect(following).resolves.toBe("after");
    expect(log).toEqual(["start:after", "end:after"]);
  });

  it("returns each caller its own result", async () => {
    const [first, second] = await Promise.all([
      runExclusive("k", async () => 1),
      runExclusive("k", async () => 2),
    ]);
    expect([first, second]).toEqual([1, 2]);
  });

  it("does not retain a key once its chain has drained", async () => {
    // A leaked entry per user/operation would be an unbounded memory growth
    // path on a long-lived server, so the chain must be dropped when it settles.
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 2000; i += 1) {
      await runExclusive(`leak-probe-${i}`, async () => i);
    }
    const after = process.memoryUsage().heapUsed;
    // Serialising 2000 distinct keys must not retain them all; allow generous
    // headroom for GC noise while still catching linear retention.
    expect(after - before).toBeLessThan(50 * 1024 * 1024);
  });
});