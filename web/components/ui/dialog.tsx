"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { HugeiconsIcon } from "@hugeicons/react";
import { CancelIcon } from "@hugeicons/core-free-icons";
import { cn } from "cn";
import { DialogSurfaceContext } from "./dialog-surface";

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Popovers from other libraries (HeroUI selects) portal outside the dialog's
 * React tree: Radix would read their clicks as outside interaction and
 * dismiss the dialog underneath the user's cursor. Elements carrying
 * `data-radix-dialog-safe` opt out of that dismissal (see ui/select).
 */
function keepOpenForSafeTargets(event: {
  target?: unknown;
  detail?: { originalEvent?: { target?: unknown } } | null;
  preventDefault: () => void;
}) {
  const original = event.detail && typeof event.detail === "object" ? event.detail.originalEvent : undefined;
  const targets = [event.target, original?.target];
  if (targets.some((target) => target instanceof Element && target.closest("[data-radix-dialog-safe]") !== null)) {
    event.preventDefault();
  }
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { showCloseButton?: boolean }) {
  // Published so overlays inside the dialog can portal here rather than to
  // <body> — see dialog-surface.tsx for why that matters.
  const surfaceRef = React.useRef<HTMLDivElement | null>(null);
  // `undefined` while unresolved — see dialog-surface.tsx for why null breaks it.
  const [surface, setSurface] = React.useState<HTMLElement | undefined>(undefined);
  React.useEffect(() => {
    setSurface(surfaceRef.current ?? undefined);
  }, []);

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={(node: HTMLDivElement | null) => {
          surfaceRef.current = node;
        }}
        data-slot="dialog-content"
        onPointerDownOutside={keepOpenForSafeTargets}
        onFocusOutside={keepOpenForSafeTargets}
        className={cn(
          // Centred with `inset-0 m-auto` rather than `top-1/2 + translate(-50%,-50%)`.
// A transform on this element makes every `position: fixed` descendant — which
// is what a portalled select/popover/menu popup is — resolve against the dialog
// instead of the viewport, so the popup lands offset and breaks as soon as it
// opens. No transform means the popup positions correctly.
          "fixed inset-0 m-auto z-50 grid h-fit max-h-[calc(100dvh-3rem)] w-full max-w-[min(28rem,calc(100%-2rem))] gap-4 overflow-y-auto rounded-xl border border-line bg-card p-4 text-xs/relaxed text-foreground shadow-lg outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 [&>*]:min-w-0",
          className,
        )}
        {...props}
      >
        <DialogSurfaceContext.Provider value={surface}>
          {children}
        </DialogSurfaceContext.Provider>
        {showCloseButton ? (
          <DialogPrimitive.Close
            aria-label="Close dialog"
            className="absolute top-2 right-2 flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
          >
            <HugeiconsIcon icon={CancelIcon} size={14}  />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("flex flex-col gap-1", className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn("text-sm font-medium", className)} {...props} />;
}

function DialogDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="dialog-description" className={cn("text-xs/relaxed text-muted-foreground", className)} {...props} />;
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
