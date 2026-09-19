import { formatUSD } from "@/lib/format";

interface StatDef {
  label: string;
  value: number;
  delta: number | null;
  invert?: boolean;
  minus?: boolean;
}

function Delta({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null) return null;
  const good = invert ? value <= 0 : value >= 0;
  const up = value >= 0;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[12px] font-medium tabular-nums ${
        good
          ? "border-success/40 bg-success-soft text-success-soft-foreground"
          : "border-danger/40 bg-danger-soft text-danger-soft-foreground"
      }`}
    >
      {up ? "+" : "−"}{Math.abs(value).toFixed(1)}%
    </span>
  );
}

export function MoneyStats({ stats }: { stats: StatDef[] }) {
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3">
      {stats.map((s) => (
        <section key={s.label} aria-label={s.label}>
          <h2 className="m-0 text-[13px] font-semibold">{s.label}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="mono m-0 text-[20px] font-semibold tracking-[-0.02em] tabular-nums">
              {s.minus ? "−" : ""}{formatUSD(s.value)}
            </p>
            <Delta value={s.delta} invert={s.invert} />
          </div>
        </section>
      ))}
    </div>
  );
}
