import { auth } from "@clerk/nextjs/server";
import WalletDetailView from "@/components/wallet-detail";

export default async function WalletPage({ params }: { params: Promise<{ walletId: string }> }) {
  await auth.protect();
  const { walletId } = await params;
  return <WalletDetailView walletId={walletId} />;
}
