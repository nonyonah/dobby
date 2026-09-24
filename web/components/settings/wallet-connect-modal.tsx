"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Button } from "../ui/button";
import { useApi } from "@/hooks/use-api";

export interface ConnectedWallet {
  id: string;
  chain: "BASE" | "SOLANA";
  address: string;
  displayName: string;
  color: string;
}

export interface WalletSummary {
  provider?: string;
  transfers?: Array<{ hash: string; from: string; to: string; value?: number | string; asset?: string | null }>;
}

const CHAINS = [
  { value: "BASE", label: "Base" },
  { value: "SOLANA", label: "Solana" },
] as const;

const COLORS = ["#4a55c9", "#22C55E", "#F04438", "#F59E0B", "#a855f7", "#0d9488", "#e11d48", "#8a8b91"];

function addressError(chain: string, address: string): string | null {
  const value = address.trim();
  if (!value) return "Enter a wallet address.";
  if (chain === "BASE" && !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    return "Base addresses are 20-byte hex values starting with 0x.";
  }
  if (chain === "SOLANA" && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) {
    return "Solana addresses are Base58 public keys.";
  }
  return null;
}

export function WalletConnectModal({
  open,
  onOpenChange,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected: (wallet: ConnectedWallet, summary: WalletSummary | null) => void;
}) {
  const api = useApi();
  const [chain, setChain] = useState<"BASE" | "SOLANA">("BASE");
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setAddress("");
    setName("");
    setColor(COLORS[0]);
    setError(null);
    setSaving(false);
  };

  const connect = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Give the wallet a name.");
      return;
    }
    const invalid = addressError(chain, address);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await api.post<{ data: ConnectedWallet }>("/v1/wallets", {
        chain,
        address: address.trim(),
        displayName: trimmedName,
        color,
      });
      let summary: WalletSummary | null = null;
      try {
        const response = await api.get<{ data: WalletSummary }>(`/v1/wallets/${created.data.id}/summary`);
        summary = response.data;
      } catch {
        summary = null;
      }
      onConnected(created.data, summary);
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect this wallet.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect wallet</DialogTitle>
          <DialogDescription>
            Track on-chain activity. Balances and transfers load through Alchemy for Base wallets.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Chain</span>
            <Select value={chain} onValueChange={(value) => setChain(value === "SOLANA" ? "SOLANA" : "BASE")}>
              <SelectTrigger aria-label="Chain" className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHAINS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Wallet address</span>
            <Input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder={chain === "BASE" ? "0x…" : "Base58 public key…"}
              autoComplete="off"
              spellCheck={false}
              className="mono h-8"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-muted-foreground">Display name</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Trading wallet 🎯"
              maxLength={80}
              className="h-8"
            />
          </label>
          <div>
            <span id="wallet-color-label" className="mb-1 block text-[12px] font-medium text-muted-foreground">
              Color dot
            </span>
            <div role="radiogroup" aria-labelledby="wallet-color-label" className="flex flex-wrap gap-2">
              {COLORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={color === option}
                  aria-label={`Color ${option}`}
                  title={option}
                  onClick={() => setColor(option)}
                  style={{ backgroundColor: option }}
                  className={`size-6 cursor-pointer rounded-full outline-none transition-transform focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 ${
                    color === option ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : "hover:scale-110"
                  }`}
                />
              ))}
            </div>
          </div>
          {error ? (
            <p role="alert" className="m-0 text-[12px] text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void connect()} disabled={saving}>
            {saving ? "Connecting…" : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
