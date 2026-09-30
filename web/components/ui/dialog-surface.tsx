"use client";

import * as React from "react";

/**
 * The element a dialog's content is rendered into, or `undefined` when there is
 * no open dialog.
 *
 * Overlays that portal to `<body>` sit *outside* the dialog's DOM subtree.
 * Radix's dialog is modal, so while it is open it sets `pointer-events: none`
 * on `<body>` and traps focus; a body-level portal therefore inherits the
 * pointer-events suppression and is read by the dialog's outside-click guard
 * as a click outside. That is why a select inside a dialog closed itself the
 * moment it opened.
 *
 * Portalling into the dialog content instead makes the overlay a real DOM
 * descendant: pointer events are unaffected, focus stays inside the trap
 * naturally, and the outside-click guard never fires.
 *
 * The default is `undefined`, never `null`, and that matters. Base UI's
 * `FloatingPortal` treats an explicit `container={null}` as "the container has
 * not resolved yet" and returns without rendering anything at all — so a `null`
 * default silently made every dropdown outside a dialog disappear. `undefined`
 * is what falls through to `<body>`.
 */
export const DialogSurfaceContext = React.createContext<HTMLElement | undefined>(undefined);

export function useDialogSurface(): HTMLElement | undefined {
  return React.useContext(DialogSurfaceContext);
}
