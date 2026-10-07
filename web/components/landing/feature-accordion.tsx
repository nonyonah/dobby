"use client";

import { useState } from "react";
import {
  Accordion,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@/components/ui/accordion";

const ITEMS = [
  {
    title: "Automatic bookkeeping",
    body: "Upload a statement or forward a receipt. We categorize it, you just confirm.",
  },
  {
    title: "Always know what you owe",
    body: "A running tax estimate that updates as you go, not once a year under deadline pressure.",
  },
  {
    title: "One view of your whole financial life",
    body: "Stablecoin wallets, bank accounts (coming soon) tracked together in real time.",
  },
  {
    title: "You're always in control",
    body: "Read-only connections, editable categories, and rules you set. Nothing happens without your say.",
  },
  {
    title: "Never get caught by a renewal",
    body: "Subscription tracking that flags upcoming charges and price increases before they hit (coming soon).",
  },
];

export function FeatureAccordion() {
  const [value, setValue] = useState<string[]>(["0"]);

  return (
    <Accordion value={value} onValueChange={setValue} className="flex w-[528px] flex-col gap-3">
      {ITEMS.map((item, index) => {
        const active = value.includes(String(index));
        return (
          <AccordionItem
            key={item.title}
            value={String(index)}
            className="overflow-hidden rounded-[4px] bg-[#131517]"
          >
            <div className="min-w-0 flex-1">
              <AccordionTrigger className="h-[57.5px] pl-[20px] pr-5 py-0 text-[16px] font-normal text-foreground">
                <span className="flex items-center gap-4">
                  <span
                    aria-hidden="true"
                    className={`h-4 w-[2px] shrink-0 rounded-full transition-colors ${
                      active ? "bg-success" : "bg-paper-200"
                    }`}
                  />
                  {item.title}
                </span>
              </AccordionTrigger>
              <AccordionPanel className="pt-[8.5px]">
                <p className="m-0 pl-[20px] pr-5 text-[14px] font-normal leading-relaxed text-muted-foreground">{item.body}</p>
              </AccordionPanel>
            </div>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
