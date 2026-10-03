"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";

interface ConfirmButtonProps extends React.ComponentPropsWithoutRef<"button"> {
  onConfirm: () => void;
  children: React.ReactNode;
  confirmLabel?: string;
}

/**
 * Two-step destructive button: first click arms ("Sure?"), second
 * confirms. Disarms after 3s — the skill's second confirmation step
 * for irreversible actions, inline.
 *
 * Forwards every remaining button prop so the coss `Toolbar` can compose it
 * through `render={<ConfirmButton … />}` like any other toolbar item; the arm
 * handler always wins over an injected `onClick`.
 */
export function ConfirmButton({ onConfirm, children, confirmLabel = "Confirm?", ...props }: ConfirmButtonProps) {
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
    <Button variant="destructive" size="small" {...props} onClick={click}>
      {armed ? confirmLabel : children}
    </Button>
  );
}
