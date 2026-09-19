import { AlertIcon, CaretDownIcon } from "./icons";
import { ATTENTION } from "@/lib/finance";
import { ModuleCard } from "./module-card";

export function AttentionCard() {
  return (
    <ModuleCard
      title={`Needs attention`}
      linkLabel={`${ATTENTION.length} open`}
    >
      <ul className="m-0 list-none p-0">
        {ATTENTION.map((a) => (
          <li key={a.id} className="border-b border-[#f1efeb] dark:border-[#26262a] last:border-b-0">
            <a
              href="#"
              className="group flex items-center gap-2.5 rounded-md py-2 outline-none focus-visible:outline-2 focus-visible:outline-[#4a55c9] focus-visible:outline-offset-2"
            >
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-md border border-[#ecdfc2] bg-[#f6ecd6]"
              >
                <AlertIcon className="text-[#ad7f22] dark:text-[#d9a441]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-[#1c1d20] dark:text-[#eceef0]">
                  {a.title}
                </span>
                <span className="block truncate text-[12px] text-[#8a8b91] dark:text-[#a2a3a8]">
                  {a.sub}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-0.5 text-[12px] font-medium text-[#8a8b91] dark:text-[#a2a3a8] group-hover:text-[#1c1d20]">
                {a.action}
                <span aria-hidden="true" className="inline-flex -rotate-90">
                  <CaretDownIcon />
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </ModuleCard>
  );
}
