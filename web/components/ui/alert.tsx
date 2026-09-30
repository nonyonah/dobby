"use client";

import { Alert as HeroAlert } from "@heroui/react";

/**
 * Alerts, on HeroUI v3's `Alert`.
 *
 * When to reach for an alert rather than a toast: a message that persists until
 * the user acts on it or dismisses it. Toasts time out on their own and are for
 * confirming something that already finished, so they cannot carry a state the
 * user still has to deal with. Concretely, in this app:
 *
 *   Alert  — subscription ending or trial lapsed, failed imports and syncs,
 *            review items needing a decision, tax filing deadlines, and any
 *            scope caveat that changes how the number should be read.
 *   Toast  — the save/archive/delete/import actually succeeded, and the brief
 *            "couldn't do that" that follows a failed action.
 *
 * The compound import surface is unchanged from the hand-rolled version this
 * replaced, so call sites did not have to move. `status` keeps the same
 * `default | success | warning | danger` vocabulary HeroUI uses, so
 * `data-status` styling and semantics still line up.
 */
export const Alert = HeroAlert.Root;
export const AlertIndicator = HeroAlert.Indicator;
export const AlertContent = HeroAlert.Content;
export const AlertTitle = HeroAlert.Title;
export const AlertDescription = HeroAlert.Description;
