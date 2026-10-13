-- Who started a free trial, and who came out of one paid.
--
-- Reads `AuditEvent`, which Dobby writes on trial start and on conversion. It is
-- recorded server-side, so these numbers hold regardless of analytics consent,
-- cleared cookies, or which browser someone signed up in.
--
-- psql "$DATABASE_URL" -f TRIAL-USAGE.sql
--
-- You also get an email on each of these, if ADMIN_ALERT_EMAIL is set in the
-- API environment. The queries are the durable record; the mail is a nudge so
-- you do not have to remember to look.

-- Trials started per day, last 30.
SELECT date_trunc('day', "createdAt") AS day,
       count(*)                        AS trials_started
FROM   "AuditEvent"
WHERE  action = 'trial.started'
  AND  "createdAt" > now() - interval '30 days'
GROUP  BY 1
ORDER  BY 1 DESC;

-- Totals, with the conversion rate.
SELECT count(*) FILTER (WHERE action = 'trial.started')   AS trials_started,
       count(*) FILTER (WHERE action = 'trial.converted') AS trials_converted,
       round(
         100.0 * count(*) FILTER (WHERE action = 'trial.converted')
         / nullif(count(*) FILTER (WHERE action = 'trial.started'), 0),
         1
       ) AS conversion_pct
FROM   "AuditEvent";

-- Trial accounts currently live or lapsed. Derivable from the user row rather
-- than from events, so a lapse costs no write and cannot drift out of date.
SELECT
  count(*) FILTER (WHERE "trialEndsAt" >  now()) AS live_now,
  count(*) FILTER (WHERE "trialEndsAt" <= now()) AS lapsed,
  count(*) FILTER (WHERE "trialEndsAt" IS NULL)  AS never_started
FROM   "User"
WHERE  "trialStartedAt" IS NOT NULL;

-- Everyone who started a trial, with whether they converted. The join is on the
-- user rather than a timestamp, so a conversion recorded days later still
-- attributes correctly.
SELECT u."clerkId",
       u.email,
       u."trialStartedAt",
       u."trialEndsAt",
       u."planStatus",
       (SELECT count(*) FROM "AuditEvent" e
         WHERE e."ownerClerkId" = u."clerkId" AND e.action = 'trial.converted') > 0 AS converted,
       (SELECT count(*) FROM "Transaction" t WHERE t."ownerClerkId" = u."clerkId") AS transactions
FROM   "User" u
WHERE  u."trialStartedAt" IS NOT NULL
ORDER  BY u."trialStartedAt" DESC;
