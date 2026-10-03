"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "cn";
import { EmojiPicker, type PickerResult } from "./icon-emoji-picker";

interface EmojiPickerFieldProps {
  value: string;
  onChange: (emoji: string) => void;
  label?: string;
  className?: string;
}

const PICKER_WIDTH = 340;
const PICKER_HEIGHT = 380;

/**
 * Emoji trigger + popup. The popup is portaled to <body> with fixed
 * positioning: inside a card (`overflow-hidden`) an absolutely positioned
 * child gets clipped, which is why the picker used to appear empty.
 */
export function EmojiPickerField({ value, onChange, label, className }: EmojiPickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const place = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - PICKER_WIDTH - 8));
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const openUp = spaceBelow < PICKER_HEIGHT && rect.top > spaceBelow;
    const top = openUp
      ? Math.max(8, rect.top - PICKER_HEIGHT - 6)
      : rect.bottom + 6;
    setPosition({ left, top });
  };

  const handleSelect = (result: PickerResult) => {
    if (result.type === "emoji") onChange(result.value);
  };

  useEffect(() => {
    if (!open) return;
    const insidePopup = (target: EventTarget | null) =>
      target instanceof Node && (popupRef.current?.contains(target) ?? false);
    const onPointerDown = (event: MouseEvent) => {
      if (insidePopup(event.target) || buttonRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const reposition = (event: Event) => {
      if (insidePopup(event.target)) return;
      place();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  return (
    <div className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label ?? "Choose emoji"}
        aria-expanded={open}
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          place();
          setOpen(true);
        }}
        className="flex size-9 items-center justify-center rounded-md border border-line bg-card text-xl transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
      >
        {value || "🙂"}
      </button>
      {open && position
        ? createPortal(
            <div ref={popupRef} className="fixed z-[100]" style={{ left: position.left, top: position.top }}>
              <EmojiPicker onSelect={handleSelect} onClose={() => setOpen(false)} />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
