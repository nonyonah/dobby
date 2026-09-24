"use client";

import { DownloadSimple, FileCsv, GoogleDriveLogo, MicrosoftExcelLogo } from "@phosphor-icons/react";
import * as XLSX from "xlsx";
import { categoryMeta, type TxFull } from "@/lib/transactions";

import { Dropdown } from "@heroui/react";

interface ExportMenuProps {
  rows: TxFull[];
  filename: string;
}

type ExportKind = "sheets" | "xero" | "quickbooks" | "csv" | "xlsx";

const OPTIONS: { id: ExportKind; label: string; detail: string }[] = [
  { id: "sheets", label: "Google Sheets", detail: "XLSX workbook" },
  { id: "xero", label: "Xero", detail: "XLSX workbook" },
  { id: "quickbooks", label: "QuickBooks", detail: "XLSX workbook" },
  { id: "csv", label: "CSV", detail: "Comma-separated file" },
  { id: "xlsx", label: "XLSX", detail: "Excel workbook" },
];

function OptionIcon({ kind }: { kind: ExportKind }) {
  if (kind === "sheets") return <GoogleDriveLogo size={17} weight="fill" className="text-[#34a853]" aria-hidden="true" />;
  if (kind === "xlsx") return <MicrosoftExcelLogo size={17} weight="fill" className="text-[#217346]" aria-hidden="true" />;
  if (kind === "csv") return <FileCsv size={17} weight="fill" className="text-[#35754e]" aria-hidden="true" />;
  if (kind === "xero") return <span className="flex size-[17px] items-center justify-center rounded bg-[#13b5ea] text-[9px] font-bold text-white" aria-hidden="true">X</span>;
  return <span className="flex size-[17px] items-center justify-center rounded bg-[#2ca01c] text-[8px] font-bold text-white" aria-hidden="true">QB</span>;
}

function exportRows(rows: TxFull[], filename: string, kind: ExportKind) {
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
    <Dropdown>
      <Dropdown.Trigger aria-label="Export data" className="inline-flex h-7 items-center gap-1.5 rounded-[10px] bg-primary px-[10px] text-[12px] font-medium text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2">
        <DownloadSimple size={14} weight="bold" aria-hidden="true" />
        Export
      </Dropdown.Trigger>
      <Dropdown.Popover placement="bottom end" className="w-52">
        <Dropdown.Menu aria-label="Export options" onAction={(key) => exportRows(rows, filename, String(key) as ExportKind)}>
          {OPTIONS.map((option) => (
            <Dropdown.Item key={option.id} id={option.id} textValue={option.label} className="gap-2.5 py-2">
              <span className="flex size-6 shrink-0 items-center justify-center"><OptionIcon kind={option.id} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold">{option.label}</span>
                <span className="block text-[11px] font-medium text-muted-foreground">{option.detail}</span>
              </span>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
