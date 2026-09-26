import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Composio } from "@composio/core";
import { EmailProviderClient } from "./providers.js";

type ExecuteCall = { slug: string; args: Record<string, unknown> };

function fakeComposio(calls: ExecuteCall[], handlers: Record<string, (args: Record<string, unknown>) => unknown>) {
  return {
    tools: {
      getRawComposioToolBySlug: async () => ({ version: "test" }),
      execute: async (slug: string, opts: { arguments: Record<string, unknown> }) => {
        calls.push({ slug, args: opts.arguments });
        const handler = handlers[slug];
        if (!handler) throw new Error(`unexpected tool ${slug}`);
        return { data: handler(opts.arguments), successful: true };
      },
    },
  } as unknown as Composio;
}

const outlookMessage = {
  id: "out-1",
  subject: "Your statement is ready",
  from: { emailAddress: { address: "alerts@example-bank.com" } },
  receivedDateTime: "2026-09-20T10:00:00Z",
  bodyPreview: "Your September statement is ready",
};

describe("EmailProviderClient — outlook wiring", () => {
  it("searches with attachment + date filters, hydrates, and downloads bytes", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "dobby-outlook-"));
    const pdfPath = join(tmp, "stmt.pdf");
    writeFileSync(pdfPath, Buffer.from("%PDF-1.4 fake"));
    const calls: ExecuteCall[] = [];
    const client = new EmailProviderClient(
      "outlook",
      "user_test",
      fakeComposio(calls, {
        OUTLOOK_LIST_MESSAGES: () => ({ value: [outlookMessage] }),
        OUTLOOK_GET_MESSAGE: () => ({ ...outlookMessage, body: { content: "<p>statement ready</p>" } }),
        OUTLOOK_LIST_OUTLOOK_ATTACHMENTS: () => ({
          value: [{ id: "a1", name: "statement.pdf", contentType: "application/pdf" }],
        }),
        OUTLOOK_DOWNLOAD_OUTLOOK_ATTACHMENT: () => ({ uri: pdfPath, mimeType: "application/pdf" }),
      }),
    );

    const since = new Date("2026-08-27T00:00:00Z");
    const until = new Date("2026-09-26T00:00:00Z");
    const messages = await client.search(since, 10, until);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.subject).toBe("Your statement is ready");

    const listCalls = calls.filter((call) => call.slug === "OUTLOOK_LIST_MESSAGES");
    expect(listCalls).toHaveLength(2);
    expect(listCalls[0]!.args).toMatchObject({ has_attachments: "true" });
    expect(listCalls[0]!.args.received_date_time_ge).toBe(since.toISOString());
    expect(listCalls[0]!.args.received_date_time_le).toBe(until.toISOString());

    const full = await client.hydrate(messages[0]!);
    expect(full.attachments).toEqual([{ id: "a1", filename: "statement.pdf", mimeType: "application/pdf" }]);

    const file = await client.download(full, full.attachments[0]!);
    expect(file.filename).toBe("statement.pdf");
    expect(file.bytes.length).toBeGreaterThan(0);
  });
});

describe("EmailProviderClient — gmail discovery queries", () => {
  it("sends one selective pass per attachment family with epoch bounds", async () => {
    const calls: ExecuteCall[] = [];
    const client = new EmailProviderClient(
      "gmail",
      "user_test",
      fakeComposio(calls, {
        GMAIL_FETCH_EMAILS: () => ({ messages: [] }),
      }),
    );
    const since = new Date("2026-08-27T00:00:00Z");
    const until = new Date("2026-09-26T00:00:00Z");
    await client.search(since, 10, until);
    const queries = calls.filter((call) => call.slug === "GMAIL_FETCH_EMAILS").map((call) => String(call.args.query));
    expect(queries).toHaveLength(3);
    expect(queries[0]).toContain("filename:pdf");
    expect(queries[1]).toContain("filename:csv");
    for (const query of queries) {
      expect(query).toContain(`after:${Math.floor(since.getTime() / 1000)}`);
      expect(query).toContain(`before:${Math.floor(until.getTime() / 1000)}`);
    }
  });
});
