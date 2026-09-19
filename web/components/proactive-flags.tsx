"use client";

import { useState } from "react";
import { AlertIcon, CheckIcon, CloseSmallIcon } from "./icons";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

interface Flag { id: string; title: string; detail: string; action: string }
const INITIAL_FLAGS: Flag[] = [
  { id: "unusual-dining", title: "Unusual dining spend", detail: "Dining is 38% above your recent monthly pattern.", action: "Review transaction" },
  { id: "budget-investments", title: "Budget nearing its limit", detail: "Investments is at 92% of its September budget.", action: "Review budget" },
  { id: "deduction-receipt", title: "Possible missed deduction", detail: "A recurring software charge may need a business receipt.", action: "Review deduction" },
];

export function ProactiveFlags() {
  const [flags, setFlags] = useState(INITIAL_FLAGS);
  const dismiss = (id: string) => setFlags((current) => current.filter((flag) => flag.id !== id));
  return <Card>
    <CardHeader><CardTitle className="flex items-center gap-2"><AlertIcon className="text-warning" /> Needs your review</CardTitle></CardHeader>
    <CardContent>
      {flags.length === 0 ? <div className="rounded-lg bg-muted px-3 py-4 text-center" role="status"><p className="m-0 text-[13px] font-medium">You’re all caught up</p><p className="m-0 mt-1 text-[12px] text-muted-foreground">New suggestions will appear as your tracked data changes.</p></div> : <ul className="m-0 list-none divide-y divide-paper-200 p-0 dark:divide-border">{flags.map((flag) => <li key={flag.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"><span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-warning-soft text-warning" aria-hidden="true"><AlertIcon /></span><div className="min-w-0 flex-1"><p className="m-0 text-[13px] font-medium">{flag.title}</p><p className="m-0 mt-0.5 text-[12px] text-muted-foreground">{flag.detail}</p><div className="mt-2 flex items-center gap-2"><Button variant="ghost" size="small" className="px-0 text-primary hover:bg-transparent" onClick={() => dismiss(flag.id)}><CheckIcon /> Approve</Button><Button variant="ghost" size="small" className="px-0 text-muted-foreground hover:bg-transparent" onClick={() => dismiss(flag.id)}>Dismiss</Button><span className="sr-only">{flag.action}</span></div></div><button type="button" aria-label={`Dismiss ${flag.title}`} onClick={() => dismiss(flag.id)} className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"><CloseSmallIcon /></button></li>)}</ul>}
      <p className="m-0 mt-4 text-[11px] text-muted-foreground">Suggestions are advisory only. Dobby will not change transactions without your approval.</p>
    </CardContent>
  </Card>;
}
