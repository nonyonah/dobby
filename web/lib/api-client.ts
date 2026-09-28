export type TokenProvider = () => Promise<string | null>;

/**
 * Error carrying the API's machine-readable code, so callers can tell an
 * expired trial from a generic failure.
 */
export class ApiError extends Error {
  readonly code: string | null;
  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

/**
 * Endpoints worth reusing across components for a moment. Everything else is
 * only de-duplicated while a request is in flight, so callers always see
 * fresh data after their own mutations.
 */
const CACHEABLE_PREFIXES = ["/v1/me", "/v1/categories", "/v1/rules", "/v1/integrations", "/v1/wallets"];
const CACHE_TTL_MS = 8_000;

type CacheEntry = { value: unknown; expires: number };
const responseCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

function isCacheable(path: string) {
  return CACHEABLE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}?`) || path.startsWith(`${prefix}/`));
}

/** Mutations make cached reads stale — drop everything we might reuse. */
function invalidateCache() {
  responseCache.clear();
}

export function createApiClient(
  getToken: TokenProvider,
  baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
) {
  const root = baseUrl.replace(/\/$/, "");

  async function request<T>(path: string, init: RequestInit = {}, options: { timeoutMs?: number } = {}): Promise<T> {
    const token = await getToken();
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    if (token) headers.set("authorization", `Bearer ${token}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);
    let response: Response;
    try {
      response = await fetch(`${root}${path}`, {
        ...init,
        headers,
        credentials: "include",
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error("The request timed out. Check your connection and try again.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: string; code?: string } }
        | null;
      const message = payload?.error?.message ?? `API request failed with status ${response.status}.`;
      const code = payload?.error?.code ?? null;
      // A lapsed trial surfaces as UPGRADE_REQUIRED with plain-language copy;
      // the caller toasts it, so no shared dialog needs to hear about it.
      throw new ApiError(message, code);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  async function get<T>(path: string): Promise<T> {
    const key = `${root}${path}`;

    const cached = responseCache.get(key);
    if (cached && cached.expires > Date.now()) {
      // Clone so one consumer can't mutate the value another one reads.
      return structuredClone(cached.value) as T;
    }

    const pending = inflight.get(key);
    if (pending) return pending as Promise<T>;

    const promise = request<T>(path)
      .then((value) => {
        if (isCacheable(path)) responseCache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
        return value;
      })
      .finally(() => {
        inflight.delete(key);
      });

    inflight.set(key, promise);
    return promise;
  }

  return {
    get,
    post: <T>(path: string, body: unknown, options?: { timeoutMs?: number }) => request<T>(path, { method: "POST", body: JSON.stringify(body) }, options ?? {}).then((value) => { invalidateCache(); return value; }),
    put: <T>(path: string, body: BodyInit, contentType: string) => request<T>(path, { method: "PUT", body, headers: { "content-type": contentType } }).then((value) => { invalidateCache(); return value; }),
    patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }).then((value) => { invalidateCache(); return value; }),
    delete: <T>(path: string) => request<T>(path, { method: "DELETE" }).then((value) => { invalidateCache(); return value; }),
  };
}
