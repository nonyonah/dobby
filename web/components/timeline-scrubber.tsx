"use client";

import { useEffect, useRef } from "react";
import { format } from "date-fns";
import { MONTH_LABELS, dateAtDay, dayIndex, type DayRange } from "@/lib/insights-data";

interface ScrubberProps {
  range: DayRange;
  onChange: (r: DayRange) => void;
}

type DragMode = "left" | "right" | "move" | "new";

const YEAR_DAYS = 365;
const MAX_DAY = 272; // Sep 30 — last day with data

function fracAt(clientX: number, el: HTMLDivElement | null): number {
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  return Math.max(0, Math.min(0.9999, (clientX - rect.left) / rect.width));
}

/**
 * Analog-watch ruler scrubber, day-granular. Dragging is fully imperative
 * (rAF-throttled window listeners, direct DOM paints, zero React renders)
 * so the selection edge elongates and shrinks at full pointer fidelity;
 * month ranges commit underneath only when the snapped days change.
 */
export function MonthScrubber({ range, onChange }: ScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<null | {
    mode: DragMode;
    anchorDay: number;
    origFrom: number;
    origTo: number;
    moved: boolean;
    clientX: number;
    raf: number;
    lastCommit: number;
    pendingA: number;
    pendingB: number;
  }>(null);
  const committedRef = useRef({ f: dayIndex(range.from), t: dayIndex(range.to) });
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Keep the committed mirror in sync when the range changes externally
  // (e.g. the custom-date picker).
  useEffect(() => {
    committedRef.current = { f: dayIndex(range.from), t: dayIndex(range.to) };
  }, [range]);

  useEffect(() => {
    return () => {
      const d = dragRef.current;
      if (d) {
        cancelAnimationFrame(d.raf);
        window.removeEventListener("pointermove", handleWindowMove);
        window.removeEventListener("pointerup", handleWindowUp);
        window.removeEventListener("pointercancel", handleWindowUp);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const paint = (aDay: number, bDay: number) => {
    const el = overlayRef.current;
    if (!el) return;
    const a = Math.max(0, Math.min(aDay, 364)) / YEAR_DAYS;
    const b = Math.max(0, Math.min(bDay, 364)) / YEAR_DAYS;
    el.style.left = `${Math.min(a, b) * 100}%`;
    el.style.width = `${Math.max(0.4, Math.abs(b - a) * 100)}%`;
  };

  const showPopup = (clientX: number) => {
    const track = trackRef.current;
    const popup = popupRef.current;
    if (!track || !popup) return;
    const rect = track.getBoundingClientRect();
    const frac = Math.max(0, Math.min(0.9999, (clientX - rect.left) / rect.width));
    const d = new Date(2026, 0, 1 + Math.floor(frac * YEAR_DAYS));
    popup.style.display = "block";
    popup.style.left = `${Math.max(4, Math.min(96, frac * 100))}%`;
    popup.textContent = format(d, "MMM d");
  };

  const hidePopup = () => {
    if (popupRef.current) popupRef.current.style.display = "none";
  };

  const commit = (aDay: number, bDay: number) => {
    const lo = Math.round(Math.max(0, Math.min(aDay, bDay, MAX_DAY)));
    const hi = Math.round(Math.max(0, Math.min(Math.max(aDay, bDay), MAX_DAY)));
    const prev = committedRef.current;
    if (prev.f === lo && prev.t === hi) return;
    committedRef.current = { f: lo, t: hi };
    onChangeRef.current({ from: dateAtDay(lo), to: dateAtDay(hi) });
  };

  /** Commit at most every ~120ms during a drag so charts keep up; the
   * overlay itself paints every frame for a smooth edge. */
  const commitThrottled = (aDay: number, bDay: number) => {
    const d = dragRef.current;
    if (!d) return;
    d.pendingA = aDay;
    d.pendingB = bDay;
    const now = performance.now();
    if (now - d.lastCommit < 120) return;
    d.lastCommit = now;
    commit(aDay, bDay);
  };

  const processFrame = () => {
    const d = dragRef.current;
    if (!d) return;
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const frac = Math.max(0, Math.min(0.9999, (d.clientX - rect.left) / rect.width));
    const day = frac * YEAR_DAYS;
    const { mode, anchorDay, origFrom, origTo } = d;
    if (mode === "left") {
      paint(day, origTo);
      commitThrottled(day, origTo);
    } else if (mode === "right") {
      paint(origFrom, day);
      commitThrottled(origFrom, day);
    } else if (mode === "move") {
      const len = origTo - origFrom;
      const start = Math.max(0, Math.min(MAX_DAY - len, origFrom + (day - anchorDay)));
      paint(start, start + len);
      commitThrottled(start, start + len);
    } else {
      if (Math.abs(day - anchorDay) > 1.5) d.moved = true;
      paint(anchorDay, day);
      if (d.moved) commitThrottled(anchorDay, day);
    }
    const dd = new Date(2026, 0, 1 + Math.floor(Math.max(0, Math.min(364, day))));
    const popup = popupRef.current;
    if (popup) {
      popup.style.display = "block";
      popup.style.left = `${Math.max(4, Math.min(96, frac * 100))}%`;
      popup.textContent = format(dd, "MMM d");
    }
  };

  const handleWindowMove = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    d.clientX = e.clientX;
    cancelAnimationFrame(d.raf);
    d.raf = requestAnimationFrame(processFrame);
  };

  const handleWindowUp = () => {
    const d = dragRef.current;
    if (d) {
      cancelAnimationFrame(d.raf);
      // Flush the final position so figures settle exactly where released.
      if (d.moved || d.mode !== "new") commit(d.pendingA, d.pendingB);
    }
    dragRef.current = null;
    window.removeEventListener("pointermove", handleWindowMove);
    window.removeEventListener("pointerup", handleWindowUp);
    window.removeEventListener("pointercancel", handleWindowUp);
    hidePopup();
    const el = overlayRef.current;
    if (el) {
      el.style.left = "";
      el.style.width = "";
    }
  };

  const onTrackDown = (e: React.PointerEvent) => {
    const target = (e.target as HTMLElement).dataset.handle as string | undefined;
    const day = fracAt(e.clientX, trackRef.current) * YEAR_DAYS;
    const mode: DragMode =
      target === "left" ? "left" : target === "right" ? "right" : target === "body" ? "move" : "new";
    dragRef.current = {
      mode,
      anchorDay: day,
      origFrom: dayIndex(range.from),
      origTo: dayIndex(range.to),
      moved: false,
      clientX: e.clientX,
      raf: 0,
      lastCommit: 0,
      pendingA: day,
      pendingB: day,
    };
    window.addEventListener("pointermove", handleWindowMove);
    window.addEventListener("pointerup", handleWindowUp);
    window.addEventListener("pointercancel", handleWindowUp);
  };

  const nudge = (edge: "from" | "to", delta: number, big = false) => {
    const step = big ? 7 : 1;
    const f = dayIndex(range.from);
    const t = dayIndex(range.to);
    if (edge === "from") {
      const nf = Math.max(0, Math.min(t, f + delta * step));
      onChange({ from: dateAtDay(nf), to: range.to });
    } else {
      const nt = Math.min(MAX_DAY, Math.max(f, t + delta * step));
      onChange({ from: range.from, to: dateAtDay(nt) });
    }
  };

  const leftPct = (dayIndex(range.from) / YEAR_DAYS) * 100;
  const widthPct = Math.max(0.4, ((dayIndex(range.to) - dayIndex(range.from)) / YEAR_DAYS) * 100);

  return (
    <div className="relative select-none">
      <div className="relative min-w-0 flex-1">
        <div
          ref={popupRef}
          aria-hidden="true"
          style={{ display: "none" }}
          className="mono pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-[#17181c] px-2 py-1 text-[12px] whitespace-nowrap text-white"
        />
        <div
          ref={trackRef}
          onPointerDown={onTrackDown}
          role="group"
          aria-label="Timeline range scrubber. Drag to select days."
          className="relative h-14 cursor-ew-resize touch-none overflow-x-auto select-none"
        >
          <div className="relative h-full min-w-[560px]">
            <div className="absolute inset-x-0 top-1 flex" aria-hidden="true">
              {MONTH_LABELS.map((m, i) => {
                const inWindow = i >= range.from.getMonth() && i <= range.to.getMonth();
                return (
                  <span
                    key={m}
                    className={`flex-1 text-center text-[11px] ${
                      inWindow
                        ? "font-semibold text-[#1c1d20] dark:text-[#eceef0]"
                        : "font-medium text-[#8a8b91] dark:text-[#a2a3a8]"
                    }`}
                  >
                    {m}
                  </span>
                );
              })}
            </div>
            <div className="absolute inset-x-0 bottom-2 h-4" aria-hidden="true">
              {MONTH_LABELS.map((_, i) => (
                <span key={i}>
                  <span
                    className="absolute bottom-0 w-[2px] bg-[#8a8b91] dark:bg-[#a2a3a8]"
                    style={{ left: `${(i / 12) * 100}%`, height: 16 }}
                  />
                  {[1, 2, 3, 4, 5].map((k) => (
                    <span
                      key={k}
                      className="absolute bottom-0 w-px bg-[#c4c2bc] dark:bg-[#3a3a40]"
                      style={{ left: `${((i + k / 6) / 12) * 100}%`, height: 7 }}
                    />
                  ))}
                </span>
              ))}
            </div>
            <div
              ref={overlayRef}
              className="absolute top-1 bottom-1 rounded-md border border-[#4a55c9] bg-[#4a55c9]/10 transition-[left,width] duration-150 ease-out"
              style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
            >
              <span data-handle="body" className="absolute inset-0 cursor-grab active:cursor-grabbing" />
              <span
                data-handle="left"
                role="slider"
                tabIndex={0}
                aria-label="Range start day"
                aria-valuetext={format(range.from, "MMM d")}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft") nudge("from", -1, e.shiftKey);
                  if (e.key === "ArrowRight") nudge("from", 1, e.shiftKey);
                }}
                className="absolute top-1 bottom-1 -left-[3px] w-[5px] cursor-ew-resize rounded-full bg-[#4a55c9] outline-none focus-visible:outline-2 focus-visible:outline-[#4a55c9] focus-visible:outline-offset-2"
              />
              <span
                data-handle="right"
                role="slider"
                tabIndex={0}
                aria-label="Range end day"
                aria-valuetext={format(range.to, "MMM d")}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft") nudge("to", -1, e.shiftKey);
                  if (e.key === "ArrowRight") nudge("to", 1, e.shiftKey);
                }}
                className="absolute top-1 bottom-1 -right-[3px] w-[5px] cursor-ew-resize rounded-full bg-[#4a55c9] outline-none focus-visible:outline-2 focus-visible:outline-[#4a55c9] focus-visible:outline-offset-2"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
