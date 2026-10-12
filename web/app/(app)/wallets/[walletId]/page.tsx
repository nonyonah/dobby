// Still async: it reads the route param, which is a promise in this Next
// version. Unlike the others it does no auth work — the layout covers that.
import WalletDetailView from "@/components/wallet-detail";

export default async function WalletPage({ params }: { params: Promise<{ walletId: string }> }) {
  const { walletId } = await params;
  return <WalletDetailView walletId={walletId} />;
}
