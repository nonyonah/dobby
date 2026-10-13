"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { ChainLogo } from "@/components/ui/chain-logo";
import { useApi } from "@/hooks/use-api";

/**
 * Which providers and protocols Dobby should recognise.
 *
 * Shaped as pick-then-fill rather than a long editable list. The previous
 * version rendered every seeded provider as its own row with a text input, which
 * meant the page was a wall of a dozen mostly-irrelevant empty fields: the
 * answer to "which of these do I actually use?" is usually one or two, and the
 * page was asking all of them at once.
 *
 * Picking first means the address box only ever appears for something the user
 * has said they use, and adding an unknown provider is one action rather than a
 * hunt for a free row at the bottom.
 *
 * Nothing here files, pays or moves money. An address only affects which
 * suggestions Dobby offers. An address is also an identity claim — a wrong one
 * marks a stranger's transfer as this user's yield — which is why an empty one
 * is a legitimate, non-error state rather than something to nag about.
 */

type Kind = "offramp_provider" | "onramp_provider" | "yield_protocol" | "yield_token";

type KnownEntity = { id: string; kind: string; name: string; chain: string | null; address: string | null; narrationPatterns: string[] };
type UserEntity = { id: string; kind: string; name: string; chain: string | null; address: string | null; narrationPatterns: string[] };

const KIND_LABEL: Record<Kind, string> = {
  offramp_provider: "Offramp — converts tokens to naira",
  onramp_provider: "Onramp — converts naira to tokens",
  yield_protocol: "Yield protocol",
  yield_token: "Yield token",
};

const KINDS = Object.keys(KIND_LABEL) as Kind[];

/** Yield tokens are identified by symbol, so they never need an address. */
const takesAddress = (kind: string) => kind !== "yield_token";

export function StablecoinProvidersPage() {
  const api = useApi();
  const [known, setKnown] = useState<KnownEntity[] | null>(null);
  const [mine, setMine] = useState<UserEntity[]>([]);
  const [kind, setKind] = useState<Kind>("offramp_provider");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");

  const load = useCallback(async () => {
    try {
      const [shared, own] = await Promise.all([
        api.get<{ data: KnownEntity[] }>("/v1/known-entities"),
        api.get<{ data: UserEntity[] }>("/v1/known-entities/mine"),
      ]);
      setKnown(shared.data);
      setMine(own.data);
      setDrafts((previous) => ({
        ...Object.fromEntries(shared.data.map((entity) => [entity.id, entity.address ?? ""])),
        ...Object.fromEntries(own.data.map((entity) => [entity.id, entity.address ?? ""])),
        ...previous,
      }));
    } catch {
      setKnown([]);
      toast.error("Could not load providers. Try again.");
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Chosen names are stable across the shared and personal lists. */
  const chosen = useMemo(() => {
    const byName = new Map<string, { id: string; name: string; kind: string; address: string | null; own: boolean }>();
    for (const entity of mine) byName.set(`${entity.kind}:${entity.name}`, { id: entity.id, name: entity.name, kind: entity.kind, address: entity.address, own: true });
    for (const entity of known ?? []) {
      const key = `${entity.kind}:${entity.name}`;
      if (!byName.has(key)) byName.set(key, { id: entity.id, name: entity.name, kind: entity.kind, address: entity.address, own: false });
    }
    return byName;
  }, [known, mine]);

  const options = useMemo(() => [...chosen.values()].filter((entity) => entity.kind === kind).sort((a, b) => a.name.localeCompare(b.name)), [chosen, kind]);

  const toggle = (key: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const save = async (id: string) => {
    const raw = (drafts[id] ?? "").trim();
    if (raw && raw.length < 8) {
      toast.error("That address looks too short to be real. Paste the whole thing, or leave it empty.");
      return;
    }
    setSaving(id);
    try {
      const own = mine.some((entity) => entity.id === id);
      const path = own ? `/v1/known-entities/mine/${id}` : `/v1/known-entities/${id}`;
      await api.patch(path, { address: raw || null });
      await load();
      toast.success(raw ? "Address saved." : "Address cleared.");
    } catch {
      toast.error("Could not save that address. Try again.");
    } finally {
      setSaving(null);
    }
  };

  const remove = async (entity: { id: string; name: string; kind: string; own: boolean }) => {
    try {
      if (entity.own) await api.delete(`/v1/known-entities/mine/${entity.id}`);
      else await api.patch(`/v1/known-entities/${entity.id}`, { address: null });
      setSelected((previous) => {
        const next = new Set(previous);
        next.delete(`${entity.kind}:${entity.name}`);
        return next;
      });
      await load();
      toast.success(entity.own ? `Removed ${entity.name}.` : `${entity.name} cleared.`);
    } catch {
      toast.error("Could not remove that. Try again.");
    }
  };

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving("add");
    try {
      await api.post("/v1/known-entities/mine", {
        kind,
        name,
        address: newAddress.trim() || null,
        narrationPatterns: name.toLowerCase().split(/\s+/),
      });
      setNewName("");
      setNewAddress("");
      setAdding(false);
      await load();
      toast.success(`${name} added. Remember to enter its address below.`);
    } catch {
      toast.error("Could not add that provider. Try again.");
    } finally {
      setSaving(null);
    }
  };

  const chosenForKind = options.filter((option) => selected.has(`${option.kind}:${option.name}`));

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <h1 data-tour="stablecoin-providers" className="m-0 text-[20px] font-semibold tracking-[-0.01em]">Stablecoin providers</h1>
      <p className="m-0 mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
        Pick the ones you use and add their addresses. Dobby already matches bank narrations by name; an address lets it also
        recognise transfers on chain. Leaving an address empty is fine — that provider is then matched by name only.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {KINDS.map((value) => (
          <Button key={value} variant={kind === value ? "primary" : "secondary"} size="small" onClick={() => setKind(value)}>
            {KIND_LABEL[value].split(" — ")[0]}
          </Button>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-line bg-background">
        <ul className="m-0 max-h-64 list-none overflow-y-auto p-0">
          {options.length === 0 ? (
            <li className="px-4 py-3 text-[13px] text-muted-foreground">Nothing here yet — add one below.</li>
          ) : (
            options.map((option) => {
              const key = `${option.kind}:${option.name}`;
              const active = selected.has(key);
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => toggle(key)}
                    aria-pressed={active}
                    className={`flex w-full items-center gap-2.5 border-b border-line px-4 py-2.5 text-left outline-none transition-colors last:border-b-0 hover:bg-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${
                      active ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex size-4 shrink-0 items-center justify-center rounded-[4px] border ${active ? "border-primary bg-primary" : "border-input"}`}
                    >
                      {active ? <span className="size-1.5 rounded-[2px] bg-primary-foreground" /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{option.name}</span>
                    {option.address ? <span className="shrink-0 text-[11px] text-muted-foreground">address added</span> : null}
                    {option.own ? <span className="shrink-0 text-[11px] text-muted-foreground">yours</span> : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <div className="border-t border-line px-4 py-2.5">
          <Button variant="ghost" size="small" onClick={() => setAdding((previous) => !previous)}>
            {adding ? "Cancel" : `Add a ${KIND_LABEL[kind].split(" — ")[0].toLowerCase()} not on this list`}
          </Button>
          {adding ? (
            <div className="mt-2 flex flex-col gap-2">
              <Input
                aria-label="Name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Provider or protocol name"
                className="h-8 text-[13px]"
              />
              {takesAddress(kind) ? (
                <Input
                  aria-label="Address"
                  value={newAddress}
                  onChange={(event) => setNewAddress(event.target.value)}
                  placeholder="0x… or the mint address (optional)"
                  className="h-8 font-mono text-[12px]"
                />
              ) : null}
              <div className="flex justify-end">
                <Button variant="secondary" size="small" disabled={saving === "add" || !newName.trim()} onClick={() => void add()}>
                  {saving === "add" ? "Adding…" : "Add"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {chosenForKind.length > 0 ? (
        <div className="mt-6 flex flex-col gap-3">
          <h2 className="m-0 text-[13px] font-semibold">Addresses</h2>
          {chosenForKind.map((option) => {
            const key = `${option.kind}:${option.name}`;
            return (
              <div key={key} className="flex flex-wrap items-center gap-2 border-b border-line pb-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{option.name}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {takesAddress(option.kind) ? "Leave empty to match by name only" : "Identified by symbol — no address needed"}
                  </span>
                </span>
                {takesAddress(option.kind) ? (
                  <Input
                    aria-label={`Address for ${option.name}`}
                    value={drafts[option.id] ?? ""}
                    onChange={(event) => setDrafts((previous) => ({ ...previous, [option.id]: event.target.value }))}
                    placeholder="0x…"
                    className="h-8 min-w-0 flex-1 font-mono text-[12px]"
                  />
                ) : null}
                {takesAddress(option.kind) ? (
                  <Button variant="secondary" size="small" disabled={saving === option.id} onClick={() => void save(option.id)}>
                    {saving === option.id ? "Saving…" : "Save"}
                  </Button>
                ) : null}
                <Button variant="ghost" size="small" onClick={() => void remove(option)}>
                  Remove
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="m-0 mt-6 text-[13px] text-muted-foreground">
          Pick a provider above to enter its address, or add one we do not have yet.
        </p>
      )}

      {kind === "yield_token" ? (
        <p className="m-0 mt-4 flex items-start gap-2 text-[12px] leading-relaxed text-muted-foreground">
          <ChainLogo chain="BASE" className="mt-0.5 block size-3.5 shrink-0 rounded-full ring-1 ring-inset ring-foreground/10" />
          Yield tokens are recognised by symbol, so they need no address.
        </p>
      ) : null}

      <p className="m-0 mt-6 text-[12px] leading-relaxed text-muted-foreground">
        An estimate, not advice. Dobby never files, pays or moves money.
      </p>
    </div>
  );
}

export default StablecoinProvidersPage;