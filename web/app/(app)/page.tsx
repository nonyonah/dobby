import { auth } from "@clerk/nextjs/server";
import { Dashboard } from "@/components/dashboard";

export default async function Home() {
  await auth.protect();
  return <Dashboard />;
}
