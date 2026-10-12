import * as React from "react";
import { Cta, Detail, Divider, Figure, Footnote, Layout, Lead, Meta, Title } from "../components.js";
import { appUrl } from "../links.js";

/**
 * Import finished — the success, duplicate and failure cases.
 *
 * One template, three outcomes, because a failure should look like part of the
 * same product rather than a different email. What changes is the tone of the
 * figure and the sentence under it; the shell never moves.
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
        <Title>Already imported</Title>
        <Meta>{filename}</Meta>

        <Figure tone="accent" caption="Already in your ledger">
          0 new
        </Figure>
        <Lead>Nothing was added.</Lead>
        <Detail>
          This looks like a statement you have already imported. That keeps your totals honest —
          the same statement twice would count it twice.
        </Detail>

        <Cta href={appUrl("/transactions")}>See what is imported</Cta>
        <Footnote>From {filename}. Dobby never files or submits anything on your behalf.</Footnote>
      </Layout>
    );
  }

  return (
    <Layout preview={preview}>
      <Title>Import complete</Title>
      <Meta>
        {filename} · {needsReview ? `${reviewCount} awaiting review` : "nothing waiting"}
      </Meta>

      <Figure tone="accent" caption={needsReview ? "Transactions imported" : "Transactions imported, all sorted"}>
        {importedCount}
      </Figure>
      <Lead>{needsReview ? `${reviewCount} of these need you.` : "All of them were categorised."}</Lead>
      <Detail>
        {needsReview
          ? "Dobby flagged the ones it was not sure about. Approve those and they join your ledger."
          : "Nothing is waiting for you. Every row is already sorted and in your ledger."}
      </Detail>

      {needsReview ? (
        <>
          <Divider />
          <Detail>
            These figures do not include the {reviewCount} awaiting review, so they may move once
            you confirm them.
          </Detail>
        </>
      ) : null}

      <Cta href={appUrl(needsReview ? "/transactions?view=review" : "/transactions")}>
        {needsReview ? "Review your transactions" : "See what was imported"}
      </Cta>
      <Footnote>From {filename}. Dobby never files or submits anything on your behalf.</Footnote>
    </Layout>
  );
}

/**
 * The same email when the import failed. Same shell and same one CTA, so a
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
      <Title>Import failed</Title>
      <Meta>{filename}</Meta>

      <Figure tone="danger" caption="Nothing was added">
        0
      </Figure>
      <Lead>We could not read that file.</Lead>
      <Detail>{reason}</Detail>

      <Cta href={appUrl("/transactions")}>Try another file</Cta>
      <Footnote>
        If the file is password-protected, remove the password first — Dobby cannot read locked
        files.
      </Footnote>
    </Layout>
  );
}