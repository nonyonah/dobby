import * as React from "react";
import { Cta, Detail, Footnote, Layout, Lead, Meta, Title } from "../components.js";
import { appUrl } from "../links.js";

/**
 * Win-back, for someone who imported and then went quiet.
 *
 * The whole tone is that nothing happened while they were away, because the fear
 * that comes back to a finance app is that it moved something. Leading with what
 * is still there — rather than what is new — is what earns the second click.
 *
 * One send, and `maxSends: 1` on the nudge rule that drives it. An email about
 * coming back is the fastest way to be unsubscribed from.
 */
export function WinBackEmail({
  firstName,
  daysAway,
  daysSinceFirstImport,
}: {
  firstName?: string | null;
  daysAway: number;
  /** When their data last arrived, so the claim of "still here" is specific. */
  daysSinceFirstImport: number | null;
}) {
  const name = firstName ? `, ${firstName}` : "";
  const last = daysSinceFirstImport === null ? null : daysSinceFirstImport;

  return (
    <Layout preview="Your Dobby data is still here, exactly as you left it.">
      <Title>Your data is still here</Title>
      <Meta>Last seen {daysAway} days ago</Meta>

      <Lead>Nothing changed{name}.</Lead>
      <Detail>
        Your imports, categories and ledger are exactly where you left them. Nothing was
        deleted, nothing expired, and nothing moved.
      </Detail>
      {last !== null ? (
        <Detail>
          You last added data {last} day{last === 1 ? "" : "s"} ago. Pick up wherever that
          left off — the next statement takes a minute.
        </Detail>
      ) : null}

      <Cta href={appUrl("/transactions")}>Open your ledger</Cta>

      <Footnote>
        This is the last note of its kind. If Dobby is not useful to you, that is a fair
        answer.
      </Footnote>
    </Layout>
  );
}