import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

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
    return [
      // Proxy PostHog through our origin so ad blockers don't drop events.
      { source: "/ph/:path*", destination: "https://eu.i.posthog.com/:path*" },
    ];
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
