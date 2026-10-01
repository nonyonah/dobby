"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Csv01Icon, DownloadIcon, FileSpreadsheetIcon, GoogleDriveIcon } from "@hugeicons/core-free-icons";
import * as XLSX from "xlsx";
import { categoryMeta, type TxFull } from "@/lib/transactions";
import { toast } from "@/components/ui/toast";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface ExportMenuProps {
  rows: TxFull[];
  filename: string;
}

type ExportKind = "sheets" | "csv" | "xlsx";

const OPTIONS: { id: ExportKind; label: string; detail: string }[] = [
  // { id: "sheets", label: "Google Sheets", detail: "XLSX workbook" }, — temporarily disabled
  { id: "csv", label: "CSV", detail: "Comma-separated file" },
  { id: "xlsx", label: "XLSX", detail: "Excel workbook" },
];

function OptionIcon({ kind }: { kind: ExportKind }) {
  if (kind === "sheets") return <HugeiconsIcon icon={GoogleDriveIcon} strokeWidth={2} size={17} className="text-[#34a853]" aria-hidden="true"  />;
  if (kind === "xlsx") return <HugeiconsIcon icon={FileSpreadsheetIcon} strokeWidth={2} size={17} className="text-[#217346]" aria-hidden="true"  />;
  if (kind === "csv") return <HugeiconsIcon icon={Csv01Icon} strokeWidth={2} size={17} className="text-[#35754e]" aria-hidden="true"  />;
  return null;
}

function exportRows(rows: TxFull[], filename: string, kind: ExportKind) {
  if (rows.length === 0) {
    toast.info("There are no transactions to export for this view yet.");
    return;
  }
  const data = rows.map((row) => ({
    Date: row.date,
    Merchant: row.name,
    Account: row.account,
    Category: categoryMeta(row.categoryId ?? row.category, row.categoryName).label,
    Amount: row.amount,
    Taxable: row.taxable ? "yes" : "no",
    Source: row.source,
    Note: row.note,
  }));
  const sheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Transactions");
  const base = `${filename}-${kind}`;
  XLSX.writeFile(workbook, kind === "csv" ? `${base}.csv` : `${base}.xlsx`, { bookType: kind === "csv" ? "csv" : "xlsx" });
}

export function ExportMenu({ rows, filename }: ExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Export data"
        className="inline-flex h-7 items-center gap-1.5 rounded-[50px] bg-primary px-[10px] text-[12px] font-medium text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
      >
        <HugeiconsIcon icon={DownloadIcon} strokeWidth={2} size={14} aria-hidden="true"  />
        Export
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {OPTIONS.map((option) => (
          <DropdownMenuItem key={option.id} onClick={() => exportRows(rows, filename, option.id)} className="gap-2.5 py-2">
            <span className="flex size-6 shrink-0 items-center justify-center"><OptionIcon kind={option.id} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold">{option.label}</span>
              <span className="block text-[11px] font-medium text-muted-foreground">{option.detail}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
