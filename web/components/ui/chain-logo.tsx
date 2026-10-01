"use client";

/**
 * Chain marks, from each project's own brand assets:
 *  - Base:  base/brand-kit → logo/TheSquare/Digital/Base_square_blue.svg
 *  - Solana: solana-labs/solana → docs/static/img/logo.svg
 *
 * They lead the chain name wherever a chain is named, so Base and Solana are
 * distinguishable at a glance in a dense list.
 */
const CHAIN_LOGO: Record<string, string> = {
  BASE: "/chains/base.svg",
  SOLANA: "/chains/solana.svg",
};

export function chainLabel(chain: string): string {
  return chain === "BASE" ? "Base" : chain === "SOLANA" ? "Solana" : chain;
}

export function ChainLogo({ chain, className }: { chain: string; className?: string }) {
  const src = CHAIN_LOGO[chain.toUpperCase()];
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={16}
      height={16}
      // `block` keeps the mark off the text baseline, so it sits on the same
      // optical line as the chain name. Corners are squared (Base's identity is
      // a square) with a small radius so they don't read as harsh.
      className={className ?? "block size-4 shrink-0 rounded-[5px] ring-1 ring-inset ring-foreground/10"}
    />
  );
}

/**
 * Chain logo + a native `<select>`. A native select cannot render an image in
 * its options, so the mark is positioned inside the control and the text is
 * padded to clear it — the logo still leads the name, and the picker stays a
 * real `<select>`.
 */
export function ChainSelect({ chain, onChainChange, chains }: { chain: string; onChainChange: (chain: string) => void; chains: Array<{ value: string }> }) {
  return (
    <div className="relative w-full min-w-0">
      <span className="pointer-events-none absolute top-1/2 left-2.5 z-10 -translate-y-1/2">
        <ChainLogo chain={chain} className="block size-4 shrink-0 rounded-[5px] ring-1 ring-inset ring-foreground/10" />
      </span>
      <select
        aria-label="Chain"
        value={chain}
        onChange={(event) => onChainChange(event.target.value)}
        className="h-8 w-full cursor-pointer appearance-none rounded-[50px] border border-line bg-card py-0 pr-8 pl-9 text-[13px] text-foreground shadow-[0_0_0_0.5px_rgb(0_0_0/0.09),0_3px_6px_-2px_rgb(0_0_0/0.02),0_1px_1px_rgb(0_0_0/0.04)] outline-none transition-shadow duration-150 ease-out focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 bg-[length:16px] bg-[right_0.5rem_center] bg-no-repeat dark:shadow-[0_0_0_1px_rgb(255_255_255/0.08)]"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%238a8b91' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E\")" }}
      >
        {chains.map((c) => (
          <option key={c.value} value={c.value}>{chainLabel(c.value)}</option>
        ))}
      </select>
    </div>
  );
}

/** Chain logo followed by its name, left aligned and vertically centred. */
export function ChainLabel({ chain, className }: { chain: string; className?: string }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 leading-none ${className ?? ""}`}>
      <ChainLogo chain={chain} />
      <span className="min-w-0 truncate">{chainLabel(chain)}</span>
    </span>
  );
}
