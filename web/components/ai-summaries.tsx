import { formatUSD } from "@/lib/format";

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="mono mx-0.5 inline-block rounded bg-[#f1efeb] dark:bg-[#26262a] px-1.5 py-px text-[12px] font-medium tabular-nums">
      {children}
    </span>
  );
}

export interface Summary {
  title: string;
  icon: React.ReactNode;
  body: React.ReactNode;
}

/**
 * AI-style plain-language summaries — the financial-journal blocks,
 * each with a stock icon (money mark for runway).
 */
export function AiSummaries({ items }: { items: Summary[] }) {
  return (
    <div className="flex flex-col gap-5">
      {items.map((s) => (
        <section key={s.title} aria-label={s.title} className="flex gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[#f1efeb] dark:bg-[#26262a] text-[#55565c] dark:text-[#a2a3a8]"
          >
            {s.icon}
          </span>
          <p className="m-0 min-w-0 text-[13px] leading-relaxed">
            <span className="font-semibold">{s.title}.</span> {s.body}
          </p>
        </section>
      ))}
      <p className="m-0 text-[12px] text-[#8a8b91] dark:text-[#a2a3a8]">
        Generated from your tracked data — review before acting on it.
      </p>
    </div>
  );
}

export { Chip };
