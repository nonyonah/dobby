import { auth } from "@clerk/nextjs/server";
import { SettingsPage } from "@/components/settings/settings-page";

export default async function SettingsRoute() {
  await auth.protect();
  return <SettingsPage />;
}
