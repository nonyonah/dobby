"use client";

import { ResponsiveSankey } from "@nivo/sankey";
import { formatUSD } from "@/lib/format";
import type { SankeyGraph } from "@/lib/cashflow";

/** Responsive Nivo Sankey for income sources flowing into spending and savings. */
export function SankeyDiagram({ graph, month }: { graph: SankeyGraph; month: string }) {
  return (
    <div role="img" aria-label={`Cash flow for ${month}: income sources flowing into spending categories and savings`}>

      <div className="h-[460px] w-full text-foreground sm:h-[540px]">
        <ResponsiveSankey
        data={graph}
        margin={{ top: 10, right: 124, bottom: 10, left: 124 }}
        align="justify"
        colors={(node) => graph.nodes.find((item) => item.id === node.id)?.color ?? "var(--primary)"}
        nodeOpacity={1}
        nodeHoverOpacity={1}
        nodeThickness={12}
        nodeSpacing={12}
        nodeBorderWidth={0}
        nodeBorderRadius={3}
        nodeInnerPadding={0}
        label={(node) => graph.nodes.find((item) => item.id === node.id)?.label ?? node.id}
        labelPosition="outside"
        labelPadding={8}
        labelTextColor="currentColor"
        labelOrientation="horizontal"
        linkOpacity={0.35}
        linkHoverOpacity={0.65}
        linkContract={3}
        enableLinkGradient

        valueFormat={(value) => formatUSD(Number(value))}
        theme={{
          labels: {
            text: {
              fontSize: 12,
              fontWeight: 500,
              fill: "currentColor",
            },
          },
          tooltip: {
            container: {
              background: "var(--card)",
              color: "var(--card-foreground)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              fontSize: 12,
            },
          },
        }}
        role="application"
        ariaLabel={`Cash flow Sankey for ${month}`}
        />
      </div>
    </div>
  );
}
