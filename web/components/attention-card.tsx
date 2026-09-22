"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useApi } from "@/hooks/use-api";
import { AlertIcon, CaretDownIcon, CheckIcon, CloseSmallIcon } from "./icons";

import { ModuleCard } from "./module-card";


export function AttentionCard() {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [liveItems, setLiveItems] = useState<Array<{ id: string; title: string; sub: string; action: string }>>([]);
  const api = useApi();
  const { isLoaded, isSignedIn } = useAuth();
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    void Promise.all([
      api.get<{ data: Array<{ id: string; rowNumber: number; errorMessage?: string | null; status: string }> }>("/v1/reviews?status=PENDING"),
      api.get<{ data: { items: Array<{ key: string; label: string; status: "READY" | "OUTSTANDING" }> } }>("/v1/tax/checklist"),
    ]).then(([reviews, checklist]) => {
      const reviewItems = reviews.data.slice(0, 3).map((item) => ({ id: `review-${item.id}`, title: `CSV row ${item.rowNumber} needs review`, sub: item.errorMessage ?? "Confirm the imported transaction details", action: "Review" }));
      const docs = checklist.data.items.filter((item) => item.status === "OUTSTANDING").slice(0, 2).map((item) => ({ id: `tax-${item.key}`, title: `Tax document outstanding`, sub: item.label, action: "Docs" }));
      setLiveItems([...reviewItems, ...docs]);
    }).catch(() => setLiveItems([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);
  const items = liveItems.filter((item) => !dismissed.includes(item.id));
  const dismiss = (id: string) => setDismissed((current) => [...current, id]);

  return <ModuleCard title="Needs attention" linkLabel={`${items.length} open`}>
    {items.length === 0 ? <div className="rounded-md bg-muted px-3 py-4 text-center" role="status"><p className="m-0 text-[13px] font-medium">You’re all caught up</p><p className="m-0 mt-1 text-[12px] text-muted-foreground">New review items will appear as your tracked data changes.</p></div> : <ul className="m-0 list-none p-0">{items.map((item) => <li key={item.id} className="border-b border-soft-line py-2 last:border-b-0"><div className="flex items-center gap-2.5"><span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground"><AlertIcon /></span><span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{item.title}</span><span className="block truncate text-[12px] text-muted-foreground">{item.sub}</span></span><button type="button" onClick={() => dismiss(item.id)} className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Dismiss ${item.title}`}><CloseSmallIcon /></button><button type="button" onClick={() => dismiss(item.id)} className="flex shrink-0 items-center gap-0.5 rounded px-1 text-[12px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><CheckIcon /> {item.action}<span aria-hidden="true" className="inline-flex -rotate-90"><CaretDownIcon /></span></button></div></li>)}</ul>}
    <p className="m-0 mt-3 text-[11px] leading-relaxed text-muted-foreground">Suggestions are advisory only. Dobby will never change a transaction without your approval.</p>
  </ModuleCard>;
}
