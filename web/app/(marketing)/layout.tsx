import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

/**
 * Marketing shell. Everything in this group is public — signed-in users are
 * sent straight to the dashboard instead of ever seeing the landing page.
 * `redirect` throws, so this layout never renders for them; there is no
 * client flash of marketing content first.
 */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (userId) redirect("/app");
  return <>{children}</>;
}
