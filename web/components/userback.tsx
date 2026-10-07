"use client";

import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import UserbackWidgetLoader, { getUserback } from "@userback/widget";

const TOKEN = process.env.NEXT_PUBLIC_USERBACK_TOKEN;

/**
 * Userback feedback widget. Initialized once on mount; signed-in users are
 * attached via identify() so support can see who reported what.
 */
export function UserbackProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!TOKEN || getUserback()) return;
    void UserbackWidgetLoader(TOKEN, {});
  }, []);

  return <>{children}</>;
}

export function UserbackIdentify() {
  const { user, isLoaded } = useUser();

  useEffect(() => {
    const ub = getUserback();
    if (!isLoaded || !user || !ub) return;
    const email = user.primaryEmailAddress?.emailAddress;
    if (!email) return;
    ub.identify(user.id, {
      email,
      name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || undefined,
    });
  }, [isLoaded, user]);

  return null;
}
