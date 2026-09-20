"use client";

import { useMemo, useState } from "react";
import { ChartBar, FlowArrow } from "@phosphor-icons/react";

import { MONTH_LABELS } from "@/lib/insights-data";
import { buildSankey } from "@/lib/cashflow";

import { SankeyDiagram } from "./sankey";
import { StackedBars } from "./stacked-bars";
import { Card } from "./ui/card";
import { Toggle } from "./ui/toggle";


type Viz = "sankey" | "bars";

/**
 * Cashflow visual slot: AI-summary title, Sankey ↔ stacked-bar switch,
 * both driven by the selected month.
 */
export function CashflowViz({ month }: { month: number }) {
  const [viz, setViz] = useState<Viz>("sankey");

  const graph = useMemo(() => buildSankey(month), [month]);

  const monthName = MONTH_LABELS[month] ?? "Month";
  const daysInMonth = new Date(2026, month + 1, 0).getDate();

  return (
    <Card className="gap-3 p-5 sm:p-6" aria-label="Cash flow diagram">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="m-0 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Cashflow</h2>
          <p className="m-0 mt-1 text-sm font-bold text-foreground">{monthName} 1 - {daysInMonth}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 rounded-md bg-secondary p-0.5" role="group" aria-label="Cashflow chart type">
          <Toggle
            pressed={viz === "sankey"}
            onPressedChange={(pressed) => pressed && setViz("sankey")}
            aria-label="Show Sankey diagram"
            title="Sankey diagram"
            size="sm"
            className="size-7 min-w-7 px-0 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            <FlowArrow size={16} weight="fill" aria-hidden="true" />
          </Toggle>
          <Toggle
            pressed={viz === "bars"}
            onPressedChange={(pressed) => pressed && setViz("bars")}
            aria-label="Show stacked bar chart"
            title="Stacked bar chart"
            size="sm"
            className="size-7 min-w-7 px-0 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            <ChartBar size={16} weight="fill" aria-hidden="true" />
          </Toggle>
        </div>
      </div>
      {viz === "sankey" ? (
        <SankeyDiagram graph={graph} month={`${monthName} 1 - ${daysInMonth}`} />
      ) : (
        <StackedBars />
      )}
    </Card>
  );
}
