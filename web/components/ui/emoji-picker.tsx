"use client";

import { useState } from "react";
import { cn } from "cn";
import { EmojiPicker, type PickerResult } from "./icon-emoji-picker";

interface EmojiPickerFieldProps {
  value: string;
  onChange: (emoji: string) => void;
  label?: string;
  className?: string;
}

export function EmojiPickerField({ value, onChange, label = "Choose emoji", className }: EmojiPickerFieldProps) {
  const [open, setOpen] = useState(false);
  const handleSelect = (result: PickerResult) => {
    if (result.type === "emoji") onChange(result.value);
  };

  return <div className={cn("relative", className)}>
    <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen((current) => !current)} className="flex size-9 items-center justify-center rounded-lg border border-line bg-card text-xl transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring">{value || "🙂"}</button>
    {open ? <div className="absolute top-11 left-0 z-50"><EmojiPicker onSelect={handleSelect} onClose={() => setOpen(false)} /></div> : null}
  </div>;
}
