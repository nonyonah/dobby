import { auth } from "@clerk/nextjs/server";
import TransactionsView from "@/components/transactions-page";

export default async function TransactionsPage() {
  await auth.protect();
  return <TransactionsView />;
}
