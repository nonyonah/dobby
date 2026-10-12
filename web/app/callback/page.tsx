import { redirect } from "next/navigation";

/**
 * Where Composio sends the browser after an OAuth consent screen.
 *
 * It exists to be a real destination, not a page with anything on it. Composio
 * records the connection server-side whether or not this route is reached, so
 * the callback's only job is to hand the user back into the app on the screen
 * they were connecting from — and not to be a 404, which is what it was when
 * `COMPOSIO_CALLBACK_URL` pointed at a localhost address nothing was listening
 * on.
 *
 * A server redirect rather than a rendered page: this is a hand-off, and
 * anything the user sees here would only be in the way of getting back to work.
 */
export default function OAuthCallbackPage() {
  redirect("/settings#connections");
}
