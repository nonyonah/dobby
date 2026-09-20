import { formatUSD } from "@/lib/format";
import { Card } from "./ui/card";

interface StatDef {
  label: string;
  value: number;
  delta: number | null;
  invert?: boolean;
  minus?: boolean;
  format?: (n: number) => string;
}

function Delta({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null) return null;
  const good = invert ? value <= 0 : value >= 0;
  const up = value >= 0;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[12px] font-medium tabular-nums ${
        good
          ? "border-transparent bg-[#00afb9] text-white"
          : "border-transparent bg-[#ef476f] text-white"
      }`}
    >
      {up ? "+" : "−"}{Math.abs(value).toFixed(1)}%
    </span>
  );
}

export function MoneyStats({ stats }: { stats: StatDef[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((s) => (
        <Card key={s.label} className="gap-0 p-4" aria-label={s.label}>
          <section>
            <h2 className="m-0 text-[12px] font-medium text-muted-foreground">{s.label}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="mono m-0 text-lg font-semibold tracking-[-0.02em] tabular-nums sm:text-xl">
                {s.minus ? "−" : ""}{(s.format ?? formatUSD)(s.value)}
              </p>
              <Delta value={s.delta} invert={s.invert} />
            </div>
          </section>
        </Card>
      ))}
    </div>
  );
}
