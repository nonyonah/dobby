"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import UserbackWidgetLoader, { getUserback, type UserbackWidget } from "@userback/widget";

const TOKEN = process.env.NEXT_PUBLIC_USERBACK_TOKEN;

/**
 * The widget initialises asynchronously: the CDN script loads, then `on_init`
 * fires, and only then is `getUserback()` populated. Anything that needs the
 * instance has to subscribe to that transition — an effect that merely polls
 * `getUserback()` runs once (almost always before init) and never again, which
 * is how identity and any programmatic `show()` calls were being dropped.
 */
let instance: UserbackWidget | undefined;
const listeners = new Set<(widget: UserbackWidget | undefined) => void>();

const publish = (widget: UserbackWidget | undefined) => {
  instance = widget;
  for (const listener of listeners) listener(widget);
};

const subscribe = (listener: (widget: UserbackWidget | undefined) => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const currentWidget = () => instance ?? getUserback();

/**
 * Subscribe to the Userback widget instance. `ready` stays false until the
 * script loads and init fires, which is what lets callers hold back their own
 * fallback affordance until the real widget can take over.
 */
export function useUserbackWidget(): { widget: UserbackWidget | undefined; ready: boolean } {
  const [widget, setWidget] = useState<UserbackWidget | undefined>(currentWidget);

  useEffect(() => subscribe(setWidget), []);

  return { widget, ready: widget !== undefined };
}

/**
 * Open the feedback form from app code (menu items, buttons). Returns false
 * when the widget is not available so the caller can fall back to mailto.
 */
export function openUserback(): boolean {
  const ub = currentWidget();
  if (!ub) return false;
  ub.show();
  return true;
}

/**
 * Userback feedback widget. Initialized once on mount; signed-in users are
 * attached via identify() so support can see who reported what.
 */
export function UserbackProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!TOKEN) {
      // Fail loudly in development: the token is inlined at build time, so an
      // empty value silently compiles the whole loader call away in production.
      console.warn(
        "[userback] NEXT_PUBLIC_USERBACK_TOKEN is unset — the feedback widget is disabled. " +
          "Set it in web/.env and restart the dev server.",
      );
      return;
    }

    const existing = getUserback();
    if (existing) {
      publish(existing);
      return;
    }

    let cancelled = false;
    const onError = (context: string) => (error: unknown) => {
      if (cancelled) return;
      // Previously the promise was discarded with `void` and no callbacks, so a
      // bad token or an origin missing from the Userback project whitelist
      // produced no widget and no log.
      console.error(`[userback] ${context}`, error);
    };

    // `on_init` is required: the loader only assigns `USERBACK` inside it, so
    // resolving the returned promise is not enough to observe the instance.
    UserbackWidgetLoader(TOKEN, {
      on_init: () => {
        if (cancelled) return;
        publish(getUserback());
      },
      on_init_error: onError("widget init failed — check the token and that this origin is whitelisted"),
    })
      .then((widget) => {
        if (!cancelled && !instance) publish(widget);
      })
      .catch(onError("widget script failed to load"));

    return () => {
      cancelled = true;
    };
  }, []);

  return <>{children}</>;
}

export function UserbackIdentify() {
  const { user, isLoaded } = useUser();
  const { widget, ready } = useUserbackWidget();

  useEffect(() => {
    if (!ready || !widget || !isLoaded || !user) return;
    const email = user.primaryEmailAddress?.emailAddress;
    if (!email) return;
    widget.identify(user.id, {
      email,
      name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || undefined,
    });
  }, [ready, widget, isLoaded, user]);

  return null;
}