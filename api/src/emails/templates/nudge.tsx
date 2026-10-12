import * as React from "react";
import { Cta, Detail, Footnote, Lead, Layout, Meta, Title } from "../components.js";

/**
 * The one nudge template.
 *
 * Every nudge is the same shape on purpose: a headline, one short body, one
 * button. They were near-identical already and had drifted apart; a shared
 * template means a nudge written tomorrow cannot arrive looking like a different
 * product.
 *
 * No guilt, one call to action, and the figure or the benefit first — the same
 * rules the copy in the config file is written to.
 */
export function NudgeEmail({
  firstName,
  subject,
  headline,
  body,
  ctaLabel,
  ctaHref,
  preferencesHref,
  preview,
}: {
  firstName?: string | null;
  subject: string;
  headline: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  preferencesHref?: string;
  preview?: string;
}) {
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  return (
    <Layout preview={preview ?? headline}>
      <Title>{headline}</Title>
      <Meta>{greeting.replace(/,$/, "")}</Meta>
      <Detail>{body}</Detail>
      <Cta href={ctaHref}>{ctaLabel}</Cta>
      <Footnote>
        You are receiving this because nudges are on in your settings.{" "}
        {preferencesHref ? <a href={preferencesHref} style={{ color: "var(--text)" }}>Turn them off</a> : null}
      </Footnote>
    </Layout>
  );
}

/** Fires the send. Kept beside the template so the pair cannot drift. */
export async function sendNudgeEmail(input: {
  to: string;
  firstName?: string | null;
  subject: string;
  headline: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  preferencesHref?: string;
}) {
  const { sendEmail } = await import("../../lib/mailer.js");
  const { render } = await import("@react-email/components");
  const html = await render(<NudgeEmail {...input} />);
  const text = `${input.headline}\n\n${input.body}\n\n${input.ctaLabel}: ${input.ctaHref}`;
  return sendEmail({ to: input.to, subject: input.subject, html, text });
}
