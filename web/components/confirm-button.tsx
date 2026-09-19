"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";

interface ConfirmButtonProps {
  onConfirm: () => void;
  children: React.ReactNode;
  confirmLabel?: string;
  className?: string;
}

/**
 * Two-step destructive button: first click arms ("Sure?"), second
 * confirms. Disarms after 3s — the skill's second confirmation step
 * for irreversible actions, inline.
 */
export function ConfirmButton({ onConfirm, children, confirmLabel = "Confirm?", className }: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const click = () => {
    if (armed) {
      if (timer.current) clearTimeout(timer.current);
      setArmed(false);
      onConfirm();
    } else {
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), 3000);
    }
  };

  return (
    <Button variant="destructive" size="small" onClick={click} className={className}>
      {armed ? confirmLabel : children}
    </Button>
  );
}
