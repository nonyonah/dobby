import { Prisma } from "@prisma/client";

/**
 * Bind a JS Date so it compares correctly against one of Prisma's naive UTC
 * `timestamp` columns (`occurredAt`, and anything else generated without a
 * timezone).
 *
 * Prisma serializes a Date in `$queryRaw` using the *local* UTC offset, so
 * `${from}` arrives as `2026-01-01 01:00:00+01` on a server east of UTC. Left
 * alone, Postgres casts that timestamptz back to a naive timestamp through the
 * session timezone and the filter silently loses the first hour of the range.
 * Converting the instant to naive UTC explicitly makes the bound timezone
 * independent — the same value Prisma's own `gte`/`lte` would have used.
 */
export function utcTimestamp(value: Date): Prisma.Sql {
  return Prisma.sql`(${value}::timestamptz AT TIME ZONE 'UTC')`;
}

/**
 * Month label for a naive UTC timestamp column, e.g. `to_char(t."occurredAt", 'YYYY-MM')`.
 *
 * Deliberately no `AT TIME ZONE 'UTC'`: that would convert the column to an
 * instant, which `to_char` then renders in the *session* timezone, labelling a
 * 2026-01-31T23:30Z row as `2026-02` on any server east of UTC. The column is
 * already UTC, so format it directly.
 *
 * Kept as a note rather than a helper on purpose: the column identifier cannot
 * be a bind parameter, so a helper would need `Prisma.raw`, which is one
 * careless call away from an injection. There is a single call site, so the
 * expression is written out inline there instead.
 */