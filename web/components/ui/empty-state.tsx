"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "cn";

export interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface EmptyStateProps {
  title: string;
  /**
   * Required on purpose. An empty state is the one place a user is guaranteed
   * to be looking for something to do, so it must always point at a next step
   * or a useful alternative — never a dead end.
   */
  suggestion: React.ReactNode;
  action?: EmptyStateAction;
  icon?: React.ReactNode;
  /** Tighter padding for use inside a dashboard module card. */
  compact?: boolean;
  className?: string;
}

export function EmptyState({ title, suggestion, action, icon, compact = false, className }: EmptyStateProps) {
  const body = (
    <>
      {icon ? (
        <span aria-hidden="true" className="mx-auto mb-2 flex size-8 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          {icon}
        </span>
      ) : null}
      <p className="m-0 text-[13px] font-medium text-foreground">{title}</p>
      <p className="m-0 mt-1 text-[12px] text-muted-foreground">{suggestion}</p>
      {action ? (
        action.href ? (
          <Link
            href={action.href}
            className="mt-2.5 inline-flex items-center rounded-full bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            {action.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-2.5 inline-flex items-center rounded-full bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            {action.label}
          </button>
        )
      ) : null}
    </>
  );

  return (
    <div
      role="status"
      className={cn(
        "rounded-lg bg-muted text-center",
        compact ? "px-3 py-4" : "px-4 py-8",
        className,
      )}
    >
      {body}
    </div>
  );
}
