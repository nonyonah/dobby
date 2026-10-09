import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

// Where the API lives. This is read at build time by the server, so it is
// always present regardless of NEXT_PUBLIC_* plumbing — same-origin requests
// for /v1 and /health are proxied here.
const API_ORIGIN =
  process.env.API_PROXY_ORIGIN ??
  "https://dobby-production-c0ce.up.railway.app";

const nextConfig: NextConfig = {
  images: {
    // The app currently only renders bundled public assets. Serving them
    // directly avoids production failures in the image optimizer/proxy path.
    unoptimized: true,
  },
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return {
      // The API proxy must be checked before the filesystem, otherwise the
      // prerendered 404 page answers /v1/* with HTML instead of JSON.
      beforeFiles: [
        {
          source: "/v1/:path*",
          destination: `${API_ORIGIN}/v1/:path*`,
        },
        { source: "/health", destination: `${API_ORIGIN}/health` },
        { source: "/health/:path*", destination: `${API_ORIGIN}/health/:path*` },
      ],
      afterFiles: [
        // Proxy PostHog through our origin so ad blockers don't drop events.
        { source: "/ph/:path*", destination: "https://eu.i.posthog.com/:path*" },
      ],
    };
  },
};

const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

// Source maps are what make a production stack trace readable; without them a
// report points at minified frames and is close to useless. They are uploaded
// only when SENTRY_AUTH_TOKEN is set, so a DSN-only environment (or none at all)
// builds and runs normally and simply has no symbolication.
export default withSentryConfig(nextConfig, {
  silent: !sentryEnabled,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  // Route browser envelopes through the app itself (/monitoring → Sentry),
  // so ad blockers that block *.ingest.sentry.io stop dropping events.
  tunnelRoute: "/monitoring",
});
