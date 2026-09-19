"use client";

import { useMemo, useRef, useState } from "react";
import { cn } from "cn";
import { EMOJI_GROUPS, FREQUENT_EMOJIS, type EmojiEntry } from "./emoji-data";

export type PickerResult = { type: "emoji"; value: string };

function EmojiGrid({ search, selected, onSelect }: { search: string; selected: string | null; onSelect: (emoji: string) => void }) {
  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return [{ label: "Frequently used", emojis: FREQUENT_EMOJIS }, ...EMOJI_GROUPS];
    }
    return EMOJI_GROUPS.map((group) => ({
      ...group,
      emojis: group.emojis.filter((entry) => entry.n.includes(query)),
    })).filter((group) => group.emojis.length > 0);
  }, [search]);
  if (!groups.length) {
    return <p className="py-8 text-center text-[13px] text-muted-foreground">No emojis found</p>;
  }
  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">{group.label}</p>
          <div className="grid grid-cols-10 gap-0.5">
            {group.emojis.map((entry: EmojiEntry) => (
              <button
                key={entry.e + entry.n}
                type="button"
                aria-label={entry.n}
                title={entry.n}
                onClick={() => onSelect(entry.e)}
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg text-lg hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring",
                  selected === entry.e && "bg-primary/10 ring-1 ring-primary"
                )}
              >
                {entry.e}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmojiPicker({ onSelect, onClose }: { onSelect: (result: PickerResult) => void; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  return (
    <div className="w-[340px] overflow-hidden rounded-xl border border-line bg-card text-foreground shadow-lg">
      <div className="border-b border-soft-line p-2">
        <input
          ref={searchRef}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search emojis…"
          aria-label="Search emojis"
          className="h-8 w-full rounded-lg border border-line bg-secondary px-2.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring"
          autoFocus
        />
      </div>
      <div className="max-h-[300px] overflow-y-auto p-3">
        <EmojiGrid
          search={search}
          selected={null}
          onSelect={(value) => {
            onSelect({ type: "emoji", value });
            onClose();
          }}
        />
      </div>
    </div>
  );
}
