"use client";

import { useMemo, useState } from "react";
import { ChartBar, FlowArrow } from "@phosphor-icons/react";


import { buildSankey, buildStacks, type InsightCategory, type InsightSource, type MonthlyCategory, type MonthlySummary } from "@/lib/cashflow";

import { SankeyDiagram } from "./sankey";
import { StackedBars } from "./stacked-bars";
import { Card } from "./ui/card";
import { Toggle } from "./ui/toggle";

type Viz = "sankey" | "bars";

type CashflowVizProps = {
  year: number;
  sources: InsightSource[];
  categories: InsightCategory[];
  monthly: MonthlySummary[];
  monthlyCategories: MonthlyCategory[];
};

export function CashflowViz({ year, sources, categories, monthly, monthlyCategories }: CashflowVizProps) {
  const [viz, setViz] = useState<Viz>("sankey");
  const graph = useMemo(() => buildSankey(sources, categories), [sources, categories]);
  const stacks = useMemo(() => buildStacks(monthly, monthlyCategories), [monthly, monthlyCategories]);


  const hasStackData = stacks.some((item) => item.savings > 0 || item.segments.some((segment) => segment.value > 0));
  const showEmpty = viz === "sankey" ? graph.nodes.length === 0 || graph.links.length === 0 : !hasStackData;

  return (
    <Card className="gap-3 p-5 sm:p-6" aria-label="Cash flow diagram">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="m-0 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Cashflow</h2>
          <p className="m-0 mt-1 text-sm font-bold text-foreground">Full-year activity · {year}</p>
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
      {showEmpty ? (
        <div className="flex h-[460px] items-center justify-center rounded-lg border border-dashed border-line text-center sm:h-[540px]" role="status">
          <div className="max-w-sm px-4">
            <p className="m-0 text-[13px] font-medium">No cashflow data for this period</p>
            <p className="m-0 mt-1 text-[12px] text-muted-foreground">Approve imported transactions in To review to include them in Insights.</p>
          </div>
        </div>
      ) : viz === "sankey" ? (
        <SankeyDiagram graph={graph} month={`${year}`} />
      ) : (
        <StackedBars data={stacks} />
      )}
    </Card>
  );
}
