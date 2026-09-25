import { Composio } from "@composio/core";
import { AppError } from "../middleware/errors.js";
import { composioClient } from "../lib/composio.js";
import { logger } from "../lib/logger.js";
import { gmailQueries, outlookListFilters } from "./classify.js";

export type EmailProvider = "gmail" | "outlook";

export type RawAttachment = { id: string; filename: string; mimeType?: string };

export type RawMessage = {
  id: string;
  subject: string;
  from: string;
  receivedAt?: Date;
  snippet?: string;
  body?: string;
  attachments: RawAttachment[];
};

export type DownloadedAttachment = { bytes: Buffer; filename: string; mimeType: string };

const EXECUTE_TIMEOUT_MS = 45_000;
const TOOL_VERSION_TTL_MS = 10 * 60_000;

/**
 * Composio refuses to execute a tool when the resolved toolkit version is
 * "latest" — manual execution has to name a concrete version. We look the
 * current version up once per tool and pass it on every call.
 */
const toolVersionCache = new Map<string, { version: string; expiresAt: number }>();

function forgetToolVersion(slug?: string) {
  if (slug) toolVersionCache.delete(slug);
  else toolVersionCache.clear();
}

/** The pinned toolkit version was retired or never accepted. */
function isVersionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: unknown }).code;
  if (typeof code === "string" && code.includes("TOOL_VERSION_REQUIRED")) return true;
  return /toolkit version not specified|tool version|version .*(not found|invalid|retired|unsupported)/i.test(error.message);
}

/**
 * Composio wraps tool output as `{ data, error, successful }`, and the inner
 * payload may itself be a JSON string. Unwrap until we reach the real object.
 */
export function unwrapToolPayload(response: { data?: unknown; error?: string | null; successful?: boolean }): unknown {
  if (response.successful === false) {
    throw new AppError(502, response.error ?? "Composio tool execution failed.", "EMAIL_TOOL_FAILED");
  }
  let payload: unknown = response.data;
  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
        continue;
      } catch {
        return payload;
      }
    }
    if (payload && typeof payload === "object" && !Array.isArray(payload) && "data" in (payload as Record<string, unknown>)) {
      const inner = (payload as Record<string, unknown>).data;
      if (inner !== undefined && inner !== null && inner !== "") {
        payload = inner;
        continue;
      }
    }
    break;
  }
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    if (record.successful === false) {
      throw new AppError(502, typeof record.error === "string" && record.error ? record.error : "Composio tool execution failed.", "EMAIL_TOOL_FAILED");
    }
  }
  return payload;
}

function pickArray(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function decodeBody(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    return decoded.trim() || undefined;
  } catch {
    return value.trim() || undefined;
  }
}

/** Gmail bodies are HTML-ish; flatten them so the classifier/AI see plain text. */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function headerValue(headers: unknown, name: string): string | undefined {
  if (!Array.isArray(headers)) return undefined;
  const match = headers.find((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const key = (entry as Record<string, unknown>).name;
    return typeof key === "string" && key.toLowerCase() === name.toLowerCase();
  });
  const value = match ? (match as Record<string, unknown>).value : undefined;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseTimestamp(value: unknown): Date | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms);
  }
  if (typeof value === "string" && value.trim()) {
    // Gmail internalDate is a millisecond epoch string.
    if (/^\d{10,14}$/.test(value)) return new Date(Number(value));
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return undefined;
}

function walkParts(part: unknown, collect: (part: Record<string, unknown>) => void) {
  if (!part || typeof part !== "object") return;
  const record = part as Record<string, unknown>;
  collect(record);
  const parts = record.parts;
  if (Array.isArray(parts)) for (const child of parts) walkParts(child, collect);
}

function normalizeGmailAttachments(payload: unknown, record: Record<string, unknown>): RawAttachment[] {
  const attachments: RawAttachment[] = [];
  const direct = record.attachmentList ?? record.attachments;
  if (Array.isArray(direct)) {
    for (const entry of direct) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      const id = item.attachmentId ?? item.id;
      const filename = item.filename ?? item.name;
      if (typeof id === "string" && typeof filename === "string" && filename) {
        attachments.push({ id, filename, mimeType: typeof item.mimeType === "string" ? item.mimeType : undefined });
      }
    }
  }
  walkParts(payload, (part) => {
    const filename = part.filename;
    if (typeof filename !== "string" || !filename) return;
    const body = part.body as Record<string, unknown> | undefined;
    const id = (body && typeof body.attachmentId === "string" ? body.attachmentId : undefined) ?? (typeof part.attachmentId === "string" ? part.attachmentId : undefined);
    if (!id) return;
    if (attachments.some((existing) => existing.id === id)) return;
    attachments.push({ id, filename, mimeType: typeof part.mimeType === "string" ? part.mimeType : undefined });
  });
  return attachments;
}

function normalizeGmailBody(payload: unknown): string | undefined {
  let plain: string | undefined;
  let html: string | undefined;
  walkParts(payload, (part) => {
    const mimeType = typeof part.mimeType === "string" ? part.mimeType : "";
    const body = part.body as Record<string, unknown> | undefined;
    const data = body ? body.data : undefined;
    if (typeof data !== "string" || !data) return;
    if (!plain && mimeType === "text/plain") plain = decodeBody(data);
    if (!html && mimeType === "text/html") html = decodeBody(data);
  });
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : undefined;
  const topLevel = record ? record.body : undefined;
  if (!plain && topLevel && typeof topLevel === "object") {
    const data = (topLevel as Record<string, unknown>).data;
    if (typeof data === "string" && data) plain = decodeBody(data);
  }
  if (!plain && typeof record?.body === "string") plain = decodeBody(record.body);
  return plain ?? (html ? stripHtml(html) : undefined);
}

export function normalizeGmailMessage(raw: unknown, fallbackId?: string): RawMessage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : typeof record.messageId === "string" ? record.messageId : fallbackId;
  if (!id) return undefined;
  const payload = record.payload ?? record.messagePayload;
  const headers = payload && typeof payload === "object" ? (payload as Record<string, unknown>).headers : undefined;
  const subject = [record.subject, headerValue(headers, "Subject")].find((value): value is string => typeof value === "string" && value.trim().length > 0);
  const from = [record.from, record.sender, record.fromAddress, headerValue(headers, "From"), headerValue(headers, "sender")]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  const receivedAt = parseTimestamp(record.internalDate ?? record.receivedDateTime ?? record.receivedAt ?? record.date);
  const body = normalizeGmailBody(payload) ?? (typeof record.bodyPreview === "string" ? stripHtml(record.bodyPreview) : undefined);
  const snippet = typeof record.snippet === "string" ? record.snippet : typeof record.preview === "string" ? record.preview : undefined;
  const attachments = normalizeGmailAttachments(payload, record);
  return { id, subject: subject ?? "", from: from ?? "", receivedAt, body: body ?? snippet, snippet, attachments };
}

export function normalizeOutlookMessage(raw: unknown, fallbackId?: string): RawMessage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : typeof record.messageId === "string" ? record.messageId : fallbackId;
  if (!id) return undefined;
  const fromRecord = record.from as Record<string, unknown> | undefined;
  const emailAddress = fromRecord && typeof fromRecord === "object" ? (fromRecord.emailAddress as Record<string, unknown> | undefined) : undefined;
  const from = [emailAddress?.address, fromRecord?.name, record.sender, record.fromAddress]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  const bodyValue = record.body;
  const body =
    typeof bodyValue === "string"
      ? stripHtml(bodyValue)
      : bodyValue && typeof bodyValue === "object" && typeof (bodyValue as Record<string, unknown>).content === "string"
        ? stripHtml(String((bodyValue as Record<string, unknown>).content))
        : typeof record.bodyPreview === "string"
          ? stripHtml(record.bodyPreview)
          : undefined;
  const attachments: RawAttachment[] = [];
  const rawAttachments = record.attachments;
  if (Array.isArray(rawAttachments)) {
    for (const entry of rawAttachments) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      const itemFrom = (item.from ?? item.attachment) as Record<string, unknown> | undefined;
      const idValue = item.id ?? itemFrom?.id;
      const name = item.name ?? item.filename ?? itemFrom?.name;
      if (typeof idValue === "string" && typeof name === "string" && name) {
        attachments.push({ id: idValue, filename: name, mimeType: typeof item.contentType === "string" ? item.contentType : undefined });
      }
    }
  }
  return {
    id,
    subject: typeof record.subject === "string" ? record.subject : "",
    from: from ?? "",
    receivedAt: parseTimestamp(record.receivedDateTime ?? record.receivedAt ?? record.sentDateTime),
    body: body ?? (typeof record.snippet === "string" ? record.snippet : undefined),
    snippet: typeof record.snippet === "string" ? record.snippet : undefined,
    attachments,
  };
}

/**
 * Reads a file produced by Composio's file modifier: either a local `uri`
 * (already downloaded to disk) or an `s3url` we have to fetch ourselves.
 */
async function bytesFromFilePayload(payload: unknown): Promise<{ bytes: Buffer; mimeType: string }> {
  const candidates: unknown[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    candidates.push(record);
    for (const nested of Object.values(record)) visit(nested);
  };
  visit(payload);

  const fileRecord = candidates.find(
    (entry) => typeof (entry as Record<string, unknown>).uri === "string" || typeof (entry as Record<string, unknown>).s3url === "string",
  ) as Record<string, unknown> | undefined;
  if (!fileRecord) throw new AppError(502, "Email attachment download returned no file.", "EMAIL_ATTACHMENT_DOWNLOAD_FAILED");

  const mimeType = String(fileRecord.mimeType ?? fileRecord.mimetype ?? "application/octet-stream");
  const uri = typeof fileRecord.uri === "string" ? fileRecord.uri : "";
  if (uri) {
    try {
      const { readFile } = await import("node:fs/promises");
      return { bytes: await readFile(uri), mimeType };
    } catch (error) {
      // Fall through to the remote URL when the local copy is missing.
    }
  }
  const remote = typeof fileRecord.s3url === "string" ? fileRecord.s3url : typeof fileRecord.url === "string" ? fileRecord.url : undefined;
  if (!remote) throw new AppError(502, "Email attachment could not be downloaded.", "EMAIL_ATTACHMENT_DOWNLOAD_FAILED");
  const response = await fetch(remote);
  if (!response.ok) throw new AppError(502, `Email attachment download failed (${response.status}).`, "EMAIL_ATTACHMENT_DOWNLOAD_FAILED");
  return { bytes: Buffer.from(await response.arrayBuffer()), mimeType: response.headers.get("content-type") ?? mimeType };
}

export class EmailProviderClient {
  readonly provider: EmailProvider;
  private readonly ownerClerkId: string;
  private readonly client: Composio;

  /**
   * `ownerClerkId` must be the same external user id the account was linked
   * with, otherwise Composio has no connected account to execute against.
   */
  constructor(provider: EmailProvider, ownerClerkId: string, client = composioClient()) {
    this.provider = provider;
    this.ownerClerkId = ownerClerkId;
    this.client = client;
  }

  /** Resolved tool version, or undefined when Composio will not name one. */
  private async toolVersion(slug: string): Promise<string | undefined> {
    const cached = toolVersionCache.get(slug);
    if (cached && cached.expiresAt > Date.now()) return cached.version;
    try {
      const tool = await this.client.tools.getRawComposioToolBySlug(slug, undefined, {
        signal: AbortSignal.timeout(EXECUTE_TIMEOUT_MS),
      });
      if (!tool.version) return undefined;
      toolVersionCache.set(slug, { version: tool.version, expiresAt: Date.now() + TOOL_VERSION_TTL_MS });
      return tool.version;
    } catch (error) {
      logger.warn(
        { tool: slug, error: error instanceof Error ? error.message : String(error) },
        "could not resolve Composio tool version",
      );
      return undefined;
    }
  }

  private async execute(slug: string, args: Record<string, unknown>): Promise<unknown> {
    const version = await this.toolVersion(slug);
    const run = (pinned?: string) =>
      this.client.tools.execute(
        slug,
        {
          userId: this.ownerClerkId,
          arguments: args,
          ...(pinned ? { version: pinned } : { dangerouslySkipVersionCheck: true }),
        },
        { signal: AbortSignal.timeout(EXECUTE_TIMEOUT_MS) },
      );

    try {
      return unwrapToolPayload(await run(version));
    } catch (error) {
      let failure: unknown = error;
      // A pinned version can be retired by Composio — refresh it and retry once.
      if (version && isVersionError(error)) {
        forgetToolVersion(slug);
        const fresh = await this.toolVersion(slug);
        if (fresh && fresh !== version) {
          try {
            return unwrapToolPayload(await run(fresh));
          } catch (retryError) {
            failure = retryError;
          }
        }
      }
      if (failure instanceof AppError) throw failure;
      const message = failure instanceof Error ? failure.message : String(failure);
      throw new AppError(502, `Email search failed: ${message}`, "EMAIL_SEARCH_FAILED");
    }
  }

  /** Search the mailbox and return the newest matching messages. */
  async search(since: Date, limit: number): Promise<RawMessage[]> {
    if (this.provider === "gmail") {
      const seen = new Set<string>();
      const messages: RawMessage[] = [];
      for (const query of gmailQueries(since)) {
        const payload = await this.execute("GMAIL_FETCH_EMAILS", {
          query,
          max_results: Math.min(limit, 50),
          verbose: true,
          include_payload: true,
          user_id: "me",
        });
        for (const entry of pickArray(payload, ["messages", "items", "data"])) {
          const message = normalizeGmailMessage(entry);
          if (!message || seen.has(message.id)) continue;
          seen.add(message.id);
          messages.push(message);
        }
      }
      return sortAndCap(messages, limit);
    }

    const seen = new Set<string>();
    const messages: RawMessage[] = [];
    for (const args of outlookListFilters(since)) {
      const payload = await this.execute("OUTLOOK_LIST_MESSAGES", { ...args, user_id: "me" });
      for (const entry of pickArray(payload, ["messages", "items", "value", "data"])) {
        const message = normalizeOutlookMessage(entry);
        if (!message || seen.has(message.id)) continue;
        seen.add(message.id);
        messages.push(message);
      }
    }
    return sortAndCap(messages, limit);
  }

  /** Fetch full body + attachment list for one message. */
  async hydrate(message: RawMessage): Promise<RawMessage> {
    if (this.provider === "gmail") {
      const payload = await this.execute("GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID", { message_id: message.id, user_id: "me", format: "full" });
      const hydrated = normalizeGmailMessage(payload, message.id) ?? message;
      return {
        ...hydrated,
        subject: hydrated.subject || message.subject,
        from: hydrated.from || message.from,
        receivedAt: hydrated.receivedAt ?? message.receivedAt,
        body: hydrated.body ?? message.body,
        attachments: hydrated.attachments.length > 0 ? hydrated.attachments : message.attachments,
      };
    }

    const [detail, attachments] = await Promise.all([
      this.execute("OUTLOOK_GET_MESSAGE", { message_id: message.id, user_id: "me" }),
      this.execute("OUTLOOK_LIST_OUTLOOK_ATTACHMENTS", { message_id: message.id, user_id: "me", response_detail: "detailed" }),
    ]);
    const hydrated = normalizeOutlookMessage(detail, message.id) ?? message;
    const listed = pickArray(attachments, ["attachments", "items", "value", "data"]);
    const fromList: RawAttachment[] = [];
    for (const entry of listed) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      const id = item.id ?? item.attachmentId;
      const name = item.name ?? item.filename;
      if (typeof id === "string" && typeof name === "string" && name) {
        fromList.push({ id, filename: name, mimeType: typeof item.contentType === "string" ? item.contentType : undefined });
      }
    }
    return {
      ...hydrated,
      subject: hydrated.subject || message.subject,
      from: hydrated.from || message.from,
      receivedAt: hydrated.receivedAt ?? message.receivedAt,
      body: hydrated.body ?? message.body,
      attachments: fromList.length > 0 ? fromList : hydrated.attachments.length > 0 ? hydrated.attachments : message.attachments,
    };
  }

  async download(message: RawMessage, attachment: RawAttachment): Promise<DownloadedAttachment> {
    if (this.provider === "gmail") {
      const payload = await this.execute("GMAIL_GET_ATTACHMENT", {
        message_id: message.id,
        attachment_id: attachment.id,
        file_name: attachment.filename,
        user_id: "me",
      });
      const { bytes, mimeType } = await bytesFromFilePayload(payload);
      return { bytes, filename: attachment.filename, mimeType: mimeType || attachment.mimeType || "application/octet-stream" };
    }
    const payload = await this.execute("OUTLOOK_DOWNLOAD_OUTLOOK_ATTACHMENT", {
      message_id: message.id,
      attachment_id: attachment.id,
      file_name: attachment.filename,
      user_id: "me",
    });
    const { bytes, mimeType } = await bytesFromFilePayload(payload);
    return { bytes, filename: attachment.filename, mimeType: mimeType || attachment.mimeType || "application/octet-stream" };
  }
}

function sortAndCap(messages: RawMessage[], limit: number): RawMessage[] {
  return messages
    .sort((a, b) => (b.receivedAt?.getTime() ?? 0) - (a.receivedAt?.getTime() ?? 0))
    .slice(0, limit);
}
