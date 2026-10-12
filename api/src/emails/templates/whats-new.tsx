import * as React from "react";
import { Cta, Detail, Divider, Footnote, Layout, Lead, Meta, Title } from "../components.js";
import { appUrl } from "../links.js";

/** One shipped change, as the customer should hear it. */
export type ReleaseNote = {
  /** What it is, in the customer's words rather than the commit's. */
  title: string;
  /** Why they would care, in one sentence. */
  body: string;
};

/**
 * What changed.
 *
 * Sent when something shipped, not on a schedule. A changelog nobody reads is
 * worse than none, so this is deliberately short: at most five notes, each one
 * saying what changed and why it matters, with the noise already cut.
 */
export function WhatsNewEmail({
  firstName,
  releaseName,
  notes,
  href,
}: {
  firstName?: string | null;
  releaseName: string;
  notes: ReleaseNote[];
  href?: string | null;
}) {
  const name = firstName ? `, ${firstName}` : "";
  const shown = notes.slice(0, 5);

  return (
    <Layout preview={`${releaseName} — ${shown.length} new thing${shown.length === 1 ? "" : "s"} in Dobby.`}>
      <Title>{releaseName}</Title>
      <Meta>{shown.length} new thing{shown.length === 1 ? "" : "s"}{name ? ` for you` : ""}</Meta>

      <Lead>Here is what changed{name}.</Lead>

      {shown.map((note) => (
        <React.Fragment key={note.title}>
          <Divider />
          <Detail>
            <strong>{note.title}</strong> — {note.body}
          </Detail>
        </React.Fragment>
      ))}

      <Cta href={appUrl(href ?? "/app")}>Open Dobby</Cta>

      <Footnote>
        You are receiving this because you have a Dobby account. No other mail from us looks
        like this one.
      </Footnote>
    </Layout>
  );
}