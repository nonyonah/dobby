"use client";

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Button } from "./ui/button";
import { FileIcon, ManualIcon, ReceiptIcon } from "./icons";
import { TX_CATEGORIES, type TxFull } from "@/lib/transactions";

interface TxImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (rows: TxFull[], file?: File) => void;
}

type Mode = "choose" | "statement" | "receipt" | "manual";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-[#55565c] dark:text-[#a2a3a8]">{label}</span>
      {children}
    </label>
  );
}

function ModeButton({
  icon,
  title,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-3 rounded-[10px] border border-[#e0ddd7] dark:border-[#2d2d31] px-3 py-2.5 text-left outline-none transition-colors hover:bg-[#f1efeb] dark:hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-[#4a55c9]"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#f1efeb] dark:bg-[#26262a] text-[#55565c] dark:text-[#a2a3a8]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium">{title}</span>
        <span className="block truncate text-[12px] text-[#8a8b91] dark:text-[#a2a3a8]">{sub}</span>
      </span>
    </button>
  );
}

function parseStatement(text: string, filename: string): TxFull[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("No rows found");
  const split = (row: string) =>
    row.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.replace(/^"|"$/g, "").trim());
  const header = split(lines[0]).map((h) => h.toLowerCase());
  const di = header.findIndex((h) => h.includes("date"));
  const mi = header.findIndex((h) => /descript|merchant|narrative|details|payee/.test(h));
  const ai = header.findIndex((h) => h.includes("amount"));
  const dateIdx = di >= 0 ? di : 0;
  const nameIdx = mi >= 0 ? mi : 1;
  const amtIdx = ai >= 0 ? ai : 2;
  const rows: TxFull[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = split(lines[i]);
    if (cols.length < 3) continue;
    const parsed = Date.parse(cols[dateIdx]);
    const amount = Number.parseFloat((cols[amtIdx] ?? "").replace(/[^0-9.-]/g, ""));
    if (!Number.isFinite(parsed) || !Number.isFinite(amount)) continue;
    const d = new Date(parsed);
    rows.push({
      id: `imp-${Date.now()}-${i}`,
      name: cols[nameIdx] || "Imported transaction",
      account: "Imported",
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      amount,
      category: "other",
      taxable: false,
      source: "manual",
      parse: { state: "manual" },
      note: `Imported from ${filename}`,
    });
    if (rows.length >= 200) break;
  }
  if (rows.length === 0) throw new Error("Could not read any rows");
  return rows;
}

export function TxImportDialog({ open, onOpenChange, onImport }: TxImportDialogProps) {
  const [mode, setMode] = useState<Mode>("choose");
  const [fileName, setFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<TxFull[]>([]);
  const [parseError, setParseError] = useState("");
  const [parsing, setParsing] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("2026-09-18");
  const [category, setCategory] = useState("other");
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setMode("choose");
    setFileName("");
    setSelectedFile(null);
    setParsed([]);
    setParseError("");
    setParsing(false);
    setName("");
    setAmount("");
    setCategory("other");
  };

  const close = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const pickStatement = async (file: File) => {
    setFileName(file.name);
    setSelectedFile(file);
    setParseError("");
    try {
      const text = await file.text();
      setParsed(parseStatement(text, file.name));
    } catch {
      setParsed([]);
      setParseError("Couldn't read that file — export CSV with date, description and amount columns.");
    }
  };

  const pickReceipt = async (file: File) => {
    setFileName(file.name);
    setParsing(true);
    setParseError("");
    const base = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Receipt";
    await new Promise((r) => setTimeout(r, 1200));
    setParsing(false);
    setName(base.charAt(0).toUpperCase() + base.slice(1));
    setParsed([]);
  };

  const addManual = () => {
    const value = Number.parseFloat(amount.replace(/[^0-9.-]/g, ""));
    if (!name.trim() || !Number.isFinite(value)) return;
    onImport([
      {
        id: `imp-${Date.now()}`,
        name: name.trim(),
        account: "Manual",
        date: date || "2026-09-18",
        amount: value,
        category,
        taxable: false,
        source: "manual",
        parse: { state: "manual" },
        note: "",
      },
    ]);
    close(false);
  };

  const addReceipt = () => {
    const value = Number.parseFloat(amount.replace(/[^0-9.-]/g, ""));
    if (!name.trim() || !Number.isFinite(value)) return;
    onImport([
      {
        id: `imp-${Date.now()}`,
        name: name.trim(),
        account: "Receipt",
        date: date || "2026-09-18",
        amount: -Math.abs(value),
        category,
        taxable: false,
        source: "email",
        parse: { state: "review", confidence: 62 },
        note: `Parsed from ${fileName}`,
      },
    ]);
    close(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import transaction</DialogTitle>
          <DialogDescription>Bring in a statement, snap a receipt, or type it in.</DialogDescription>
        </DialogHeader>

        {mode === "choose" ? (
          <div className="grid gap-2">
            <ModeButton icon={<FileIcon />} title="Bank statement" sub="CSV with date, description, amount" onClick={() => setMode("statement")} />
            <ModeButton icon={<ReceiptIcon />} title="Receipt" sub="Photo or PDF, parsed for review" onClick={() => setMode("receipt")} />
            <ModeButton icon={<ManualIcon />} title="Manual entry" sub="Type it in yourself" onClick={() => setMode("manual")} />
          </div>
        ) : null}

        {mode === "statement" ? (
          <div className="grid gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,.ofx,.qfx"
              className="hidden"
              aria-label="Choose statement file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pickStatement(f);
                e.target.value = "";
              }}
            />
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              {fileName || "Choose file"}
            </Button>
            {parseError ? <p className="m-0 text-[12px] text-[#b0402f]">{parseError}</p> : null}
            {parsed.length > 0 ? (
              <p className="m-0 text-[13px]" aria-live="polite">
                <span className="font-semibold">{parsed.length}</span>{" "}
                <span className="text-[#8a8b91] dark:text-[#a2a3a8]">transactions ready from {fileName}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        {mode === "receipt" ? (
          <div className="grid gap-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              aria-label="Choose receipt file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pickReceipt(f);
                e.target.value = "";
              }}
            />
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              {fileName || "Choose receipt"}
            </Button>
            {parsing ? (
              <p className="m-0 text-[13px] text-[#8a8b91] dark:text-[#a2a3a8]" aria-live="polite">Parsing receipt…</p>
            ) : null}
            {fileName && !parsing ? (
              <>
                <Field label="Merchant">
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 bg-white dark:bg-[#232327] text-[13px]" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Amount">
                    <div className="relative">
                      <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[13px] text-[#8a8b91] dark:text-[#a2a3a8]">$</span>
                      <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-label="Amount in dollars" className="mono h-8 bg-white dark:bg-[#232327] pr-2 pl-7 text-[13px]" />
                    </div>
                  </Field>
                  <Field label="Category">
                    <Select value={category} onValueChange={(v) => setCategory(v ?? "other")}>
                      <SelectTrigger aria-label="Category" className="h-8 w-full bg-white dark:bg-[#232327] text-[13px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TX_CATEGORIES.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {mode === "manual" ? (
          <div className="grid gap-3">
            <Field label="Merchant">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Whole Foods" className="h-8 bg-white dark:bg-[#232327] text-[13px]" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount">
                <div className="relative">
                  <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[13px] text-[#8a8b91] dark:text-[#a2a3a8]">$</span>
                  <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-label="Amount in dollars" className="mono h-8 bg-white dark:bg-[#232327] pr-2 pl-7 text-[13px]" />
                </div>
              </Field>
              <Field label="Date">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 bg-white dark:bg-[#232327] text-[13px]" />
              </Field>
            </div>
            <Field label="Category">
              <Select value={category} onValueChange={(v) => setCategory(v ?? "other")}>
                <SelectTrigger aria-label="Category" className="h-8 w-full bg-white dark:bg-[#232327] text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TX_CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        ) : null}

        <DialogFooter className="sm:justify-between">
          {mode === "choose" ? (
            <Button variant="ghost" onClick={() => close(false)}>Cancel</Button>
          ) : (
            <Button variant="ghost" onClick={() => { setMode("choose"); setParsed([]); setParseError(""); }}>
              Back
            </Button>
          )}
          {mode === "statement" ? (
            <Button variant="primary" disabled={parsed.length === 0} onClick={() => { onImport(parsed, selectedFile ?? undefined); close(false); }}>
              Import {parsed.length > 0 ? `${parsed.length} ` : ""}transactions
            </Button>
          ) : null}
          {mode === "receipt" ? (
            <Button variant="primary" disabled={!name.trim() || !amount.trim() || parsing} onClick={addReceipt}>
              Add transaction
            </Button>
          ) : null}
          {mode === "manual" ? (
            <Button variant="primary" disabled={!name.trim() || !amount.trim()} onClick={addManual}>
              Add transaction
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
