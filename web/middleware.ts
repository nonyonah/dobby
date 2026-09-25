import { clerkMiddleware } from "@clerk/nextjs/server";

// Auth checks live at each resource (layouts/pages) instead of path matching in
// middleware — see app/(app)/layout.tsx and each page.tsx.
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico|csv|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
