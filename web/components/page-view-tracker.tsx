"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { identify, initAnalytics, track } from "@/lib/analytics";

/**
 * Page-view tracking, mounted once inside the authenticated shell.
 *
 * Only the route *name* is recorded — `/transactions`, never the query string,
 * because query strings are where ids and search terms end up. No financial
 * value is ever in scope here: this sees a pathname and nothing else.
 *
 * It also restores a previously recorded consent choice on boot, so a returning
 * visitor who already accepted does not get asked again.
 */
export function PageViewTracker() {
  const pathname = usePathname();
  const booted = React.useRef(false);

  React.useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void initAnalytics().then((consent) => {
      if (consent === "granted") identify();
    });
  }, []);

  React.useEffect(() => {
    // Signalled only when consent is already recorded; `track` itself is a no-op
    // otherwise, so this cannot fire an event at someone who declined.
    track("Page Viewed", { path: pathname });
  }, [pathname]);

  return null;
}