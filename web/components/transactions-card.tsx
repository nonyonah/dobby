import { formatUSD } from "@/lib/format";
import { TRANSACTIONS, type TxSource } from "@/lib/finance";
import { ModuleCard } from "./module-card";
import { CardIcon, EmailIcon, ManualIcon, WalletIcon } from "./icons";

const SOURCE_ICON: Record<TxSource, (props: { className?: string }) => React.ReactNode> = {
  manual: ManualIcon,
  email: EmailIcon,
  card: CardIcon,
  wallet: WalletIcon,
};

const SOURCE_LABEL: Record<TxSource, string> = {
  manual: "Manual entry",
  email: "Email receipt",
  card: "Card sync",
  wallet: "Wallet sync",
};

export function TransactionsCard() {
  return (
    <ModuleCard title="Last transactions" linkLabel="View all">
      <ul className="m-0 list-none p-0">
        {TRANSACTIONS.map((t) => {
          const Icon = SOURCE_ICON[t.source];
          const income = t.amount >= 0;
          return (
            <li
              key={t.id}
              className="flex items-center gap-2.5 border-b border-[#f1efeb] dark:border-[#26262a] py-2 last:border-b-0 last:pb-0 first:pt-0"
            >
              <span
                title={SOURCE_LABEL[t.source]}
                aria-label={SOURCE_LABEL[t.source]}
                className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[#f1efeb] dark:bg-[#26262a] text-[#55565c] dark:text-[#a2a3a8]"
              >
                <Icon />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-[#1c1d20] dark:text-[#eceef0]">
                  {t.name}
                </span>
                <span className="block text-[12px] text-[#8a8b91] dark:text-[#a2a3a8]">{t.date}</span>
              </span>
              <span
                className={`mono shrink-0 text-[13px] font-medium tabular-nums ${income ? "text-[#35754e] dark:text-[#4cc38a]" : "text-[#1c1d20] dark:text-[#eceef0]"}`}
              >
                {income ? "+" : "−"}
                {formatUSD(Math.abs(t.amount))}
              </span>
            </li>
          );
        })}
      </ul>
    </ModuleCard>
  );
}
