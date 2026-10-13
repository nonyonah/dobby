"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";
import { useApi } from "@/hooks/use-api";

/**
 * Add the addresses Dobby should recognise.
 *
 * The seed ships provider names and the words that appear in a bank narration,
 * and nothing else. An address is the only reliable way to recognise a protocol
 * on-chain, and inventing one would mark a stranger's transfer as this user's
 * yield — so until somebody looks one up, address matching stays off and
 * narration matching carries the weight on its own.
 *
 * Nothing here files, pays or moves money. An address only affects which
 * suggestions Dobby offers.
 */

type Entity = {
  id: string;
  kind: "offramp_provider" | "onramp_provider" | "yield_protocol" | "yield_token";
  name: string;
  chain: string | null;
  address: string | null;
  narrationPatterns: string[];
  notes: string | null;
};

const KIND_LABEL: Record<Entity["kind"], string> = {
  offramp_provider: "Offramp — sells you naira",
  onramp_provider: "Onramp — sells you tokens",
  yield_protocol: "Yield protocol",
  yield_token: "Yield token",
};

const PLACEHOLDER: Partial<Record<Entity["kind"], string>> = {
  yield_protocol: "0x… — the vault or reward contract",
  yield_token: "Leave empty: the symbol already identifies these",
};

export function StablecoinProvidersPage() {
  const api = useApi();
  const [entities, setEntities] = useState<Entity[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await api.get<{ data: Entity[] }>("/v1/known-entities");
      setEntities(response.data);
      setDrafts(Object.fromEntries(response.data.map((entity) => [entity.id, entity.address ?? ""])));
    } catch {
      setEntities([]);
      toast.error("Could not load providers. Try again.");
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (id: string) => {
    const raw = (drafts[id] ?? "").trim();
    // A half-typed address is worse than none: it looks filled in and matches
    // nothing, which is indistinguishable from a working one.
    if (raw && raw.length < 8) {
      toast.error("That address looks too short to be real. Paste the whole thing, or leave it empty.");
      return;
    }
    setSaving(id);
    try {
      await api.patch(`/v1/known-entities/${id}`, { address: raw || null });
      await load();
      toast.success(raw ? "Address saved." : "Address cleared.");
    } catch {
      toast.error("Could not save that address. Try again.");
    } finally {
      setSaving(null);
    }
  };

  const grouped = (entities ?? []).reduce<Record<string, Entity[]>>((acc, entity) => {
    (acc[entity.kind] ??= []).push(entity);
    return acc;
  }, {});

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <h1 className="m-0 text-[20px] font-semibold tracking-[-0.01em]">Stablecoin providers</h1>
      <p className="m-0 mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
        Dobby already recognises these by name in your bank narrations. Adding an address lets it also recognise transfers on
        chain. An estimate, not advice — Dobby never files, pays or moves money.
      </p>

      {entities === null ? null : Object.keys(grouped).length === 0 ? (
        <EmptyState
          title="No providers yet"
          suggestion="They appear here once the reference list loads. If it is empty, the list has not been seeded on this deployment."
          className="mt-6"
        />
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {Object.entries(grouped).map(([kind, rows]) => (
            <section key={kind} aria-label={KIND_LABEL[kind as Entity["kind"]]}>
              <h2 className="m-0 text-[13px] font-semibold">{KIND_LABEL[kind as Entity["kind"]]}</h2>
              <ul className="m-0 mt-2 list-none p-0">
                {rows.map((entity) => (
                  <li key={entity.id} className="border-b border-line py-3 last:border-b-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[13px] font-medium">{entity.name}</span>
                      {entity.chain ? <span className="text-[11px] text-muted-foreground">{entity.chain}</span> : null}
                    </div>
                    <p className="m-0 mt-0.5 text-[12px] text-muted-foreground">
                      Narration: {entity.narrationPatterns.length > 0 ? entity.narrationPatterns.join(", ") : "none yet"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Input
                        aria-label={`Address for ${entity.name}`}
                        value={drafts[entity.id] ?? ""}
                        onChange={(event) => setDrafts((prev) => ({ ...prev, [entity.id]: event.target.value }))}
                        placeholder={PLACEHOLDER[entity.kind] ?? "0x… or the mint address"}
                        className="h-8 min-w-0 flex-1 font-mono text-[12px]"
                      />
                      <Button
                        variant="secondary"
                        size="small"
                        disabled={saving === entity.id}
                        onClick={() => void save(entity.id)}
                      >
                        {saving === entity.id ? "Saving…" : "Save"}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default StablecoinProvidersPage;