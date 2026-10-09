"use client";

import { useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
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
    image: "/image-card/automate-bookkeeping.png",
  },
  {
    title: "Always know what you owe",
    body: "A running tax estimate that updates as you go, not once a year under deadline pressure.",
    image: "/image-card/tax-estimates.jpeg",
  },
  {
    title: "One view of your whole financial life",
    body: "Stablecoin wallets tracked in real time — one on Free, unlimited on Pro. Bank accounts coming soon.",
    image: "/image-card/one-view-financial-life.jpeg",
  },
  {
    title: "You're always in control",
    body: "Read-only connections, editable categories, and rules you set. Nothing happens without your say.",
    image: "/image-card/in-control.png",
  },
  {
    title: "Never get caught by a renewal",
    body: "Subscription tracking that flags upcoming charges and price increases before they hit (coming soon).",
    image: "/image-card/never-get-caught-renewal.jpeg",
  },
];

export function FeatureAccordion() {
  const [value, setValue] = useState<string[]>(["0"]);
  const active = Number(value[0] ?? 0);

  return (
    <div className="flex flex-col items-stretch gap-6 sm:flex-row">
      <Accordion value={value} onValueChange={setValue} className="flex w-full flex-col gap-3 sm:w-[528px]">
        {ITEMS.map((item, index) => {
          const isActive = value.includes(String(index));
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
                        isActive ? "bg-success" : "bg-paper-200"
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
      <div className="min-w-0 w-full overflow-hidden rounded-[4px] border border-line/60 bg-card sm:flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={ITEMS[active]?.image ?? ITEMS[0].image}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="h-full w-full"
          >
            <Image
              src={ITEMS[active]?.image ?? ITEMS[0].image}
              alt={ITEMS[active]?.title ?? ITEMS[0].title}
              width={2304}
              height={1160}
              sizes="(min-width: 1152px) 50vw, 100vw"
              className="h-full w-full object-cover"
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
