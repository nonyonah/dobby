interface Env {
  FRAMER_ORIGIN: string;
}

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const RESPONSE_HEADERS_TO_DROP = new Set([
  "content-security-policy",
  "content-security-policy-report-only",
  "x-frame-options",
]);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const framerOrigin = new URL(env.FRAMER_ORIGIN);
    const incomingUrl = new URL(request.url);
    const upstreamUrl = new URL(incomingUrl.pathname + incomingUrl.search, framerOrigin);

    const upstreamRequest = new Request(upstreamUrl, request);
    const requestHeaders = new Headers(upstreamRequest.headers);

    for (const header of HOP_BY_HOP_HEADERS) {
      requestHeaders.delete(header);
    }

    requestHeaders.set("host", framerOrigin.host);
    requestHeaders.set("x-forwarded-host", incomingUrl.host);
    requestHeaders.set("x-forwarded-proto", incomingUrl.protocol.replace(":", ""));

    const upstreamResponse = await fetch(upstreamUrl, {
      body: request.body,
      headers: requestHeaders,
      method: request.method,
      redirect: "manual",
    });

    const responseHeaders = new Headers(upstreamResponse.headers);

    for (const header of RESPONSE_HEADERS_TO_DROP) {
      responseHeaders.delete(header);
    }

    const location = responseHeaders.get("location");
    if (location) {
      responseHeaders.set("location", rewriteLocation(location, framerOrigin, incomingUrl));
    }

    responseHeaders.set("x-proxied-by", "dobby-framer-proxy");

    return new Response(upstreamResponse.body, {
      headers: responseHeaders,
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
    });
  },
};

function rewriteLocation(location: string, upstreamOrigin: URL, incomingUrl: URL): string {
  const rewritten = new URL(location, upstreamOrigin);

  if (rewritten.origin !== upstreamOrigin.origin) {
    return location;
  }

  rewritten.protocol = incomingUrl.protocol;
  rewritten.host = incomingUrl.host;
  return rewritten.toString();
}
