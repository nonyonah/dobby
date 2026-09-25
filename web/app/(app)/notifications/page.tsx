import { auth } from "@clerk/nextjs/server";
import NotificationsView from "@/components/notifications-page";

export default async function NotificationsPage() {
  await auth.protect();
  return <NotificationsView />;
}
