import { ModuleCard } from "./module-card";

/**
 * Small AI-summary card: two or three plain-language sentences
 * generated from the section's own figures.
 */
export function FlowNarrative({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <ModuleCard title={title} className="h-fit self-start">
      <div className="space-y-2.5 text-[13px] leading-relaxed">{children}</div>
      <p className="m-0 mt-3 text-[12px] text-[#8a8b91] dark:text-[#a2a3a8]">
        Generated from your tracked data.
      </p>
    </ModuleCard>
  );
}
