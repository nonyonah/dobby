import { auth } from "@clerk/nextjs/server";
import { CategoriesRulesPage } from "@/components/settings/categories-rules-page";

export default async function CategoriesRulesRoute() {
  await auth.protect();
  return <CategoriesRulesPage />;
}
