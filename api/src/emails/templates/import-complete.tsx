import * as React from "react";
import { Cta, Detail, Figure, Footnote, Lead, Layout } from "../components.js";
import { appUrl } from "../links.js";

/**
 * Import completed — deliberately the quietest of the three.
 *
 * An import is background work: the user asked for it and can see it happening.
 * So this informs and points at the queue, in a neutral accent rather than the
 * success green, and the figure is the row count. The review count is the part
 * that needs a decision, so it is the line that gets emphasis.
 */
export function ImportCompleteEmail({
  firstName,
  filename,
  importedCount,
  reviewCount,
  duplicate = false,
}: {
  firstName?: string | null;
  filename: string;
  importedCount: number;
  reviewCount: number;
  duplicate?: boolean;
}) {
  const needsReview = reviewCount > 0;
  const preview = duplicate
    ? `${filename} was already imported.`
    : `${importedCount} transactions imported from ${filename}.`;

  if (duplicate) {
    return (
      <Layout preview={preview}>
        <Figure tone="accent" caption="Already in your ledger">
          0 new
        </Figure>
        <Lead>
          {filename} looks like a statement you have already imported, so nothing was added.
        </Lead>
        <Detail>That keeps your totals honest — the same statement twice would double-count it.</Detail>
        <Cta href={appUrl("/transactions")}>See what is imported</Cta>
        <Footnote>
          Dobby never files or submits anything on your behalf.
          {firstName ? ` — ${firstName}` : ""}
        </Footnote>
      </Layout>
    );
  }

  return (
    <Layout preview={preview}>
      <Figure
        tone="accent"
        caption={needsReview ? `${importedCount} imported · ${reviewCount} need a look` : `${importedCount} imported from ${filename}`}
      >
        {importedCount}
      </Figure>
      <Lead>
        {needsReview
          ? `${reviewCount} of these need your review before they count.`
          : "All of them were categorised automatically."}
      </Lead>
      <Detail>
        {needsReview
          ? "Approve the ones that look right and Dobby will add them to your ledger."
          : "Nothing is waiting for you."}
      </Detail>
      <Cta href={appUrl("/transactions")}>
        {needsReview ? "Review your transactions" : "See what was imported"}
      </Cta>
      <Footnote>
        From {filename}. Dobby never files or submits anything on your behalf.
        {firstName ? ` — ${firstName}` : ""}
      </Footnote>
    </Layout>
  );
}

/**
 * The same email when the import failed. Same shape and same one CTA, so a
 * failure is recognisably part of the same product rather than a different
 * template — only the tone changes.
 */
export function ImportFailedEmail({
  firstName,
  filename,
  reason,
}: {
  firstName?: string | null;
  filename: string;
  reason: string;
}) {
  return (
    <Layout preview={`Could not import ${filename}.`}>
      <Figure tone="danger" caption="Nothing was added">
        0
      </Figure>
      <Lead>{filename} could not be imported.</Lead>
      <Detail>{reason}</Detail>
      <Cta href={appUrl("/transactions")}>Try another file</Cta>
      <Footnote>
        If the file is password-protected, remove the password first — Dobby cannot read locked files.
        {firstName ? ` — ${firstName}` : ""}
      </Footnote>
    </Layout>
  );
}
