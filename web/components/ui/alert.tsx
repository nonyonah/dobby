import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative grid w-full items-start gap-x-2 gap-y-0.5 rounded-xl border px-3.5 py-3 text-card-foreground text-sm has-[>svg]:has-data-[slot=alert-action]:grid-cols-[calc(var(--spacing)*4)_1fr_auto] has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-data-[slot=alert-action]:grid-cols-[1fr_auto] has-[>svg]:gap-x-2 [&>svg]:h-lh [&>svg]:w-4",
  {
    defaultVariants: {
      variant: "default",
    },
    variants: {
      variant: {
        default:
          "bg-transparent dark:bg-input/32 [&>svg]:text-muted-foreground",
        error:
          "border-destructive/32 bg-destructive/4 [&>svg]:text-destructive",
        info: "border-info/32 bg-info/4 [&>svg]:text-info",
        success: "border-success/32 bg-success/4 [&>svg]:text-success",
        warning: "border-warning/32 bg-warning/4 [&>svg]:text-warning",
      },
    },
  },
);

type AlertVariant = NonNullable<VariantProps<typeof alertVariants>["variant"]>;

/**
 * The vocabulary this app already speaks for alerts. It is the HeroUI v3
 * naming the call sites were written against, mapped onto coss's semantic
 * variants: `accent` is coss's `info`, `danger` is its `error`. Nothing else
 * about the component changes — this table is the whole translation.
 */
export type AlertStatus =
  | "default"
  | "accent"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "error";

const STATUS_VARIANT: Record<AlertStatus, AlertVariant> = {
  default: "default",
  accent: "info",
  info: "info",
  success: "success",
  warning: "warning",
  danger: "error",
  error: "error",
};

export interface AlertProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof alertVariants> {
  /** Semantic status. Wins over `variant` so call sites keep one vocabulary. */
  status?: AlertStatus;
}

export function Alert({
  status = "default",
  variant,
  className,
  ...props
}: AlertProps): React.ReactElement {
  return (
    <div
      className={cn(
        alertVariants({ variant: variant ?? STATUS_VARIANT[status] }),
        // The only thing overridden from coss is `display`. coss lays an alert
        // out as a grid with the icon pinned to a fixed first column, which
        // expects actions to come through `AlertAction`. Every alert here is
        // written as a row instead — icon, body, then an optional action block
        // as a sibling — so flex restores that row while keeping coss's
        // colours, border, radius, `role="alert"` and `[&>svg]` icon sizing.
        // Tailwind emits `.grid` after `.flex`, so a plain `flex` would lose the
        // cascade to coss's base — hence the `!`.
        "flex! flex-wrap gap-y-2",
        className,
      )}
      data-slot="alert"
      role="alert"
      {...props}
    />
  );
}

/**
 * The status icon, rendered *through* rather than wrapped.
 *
 * coss sizes and colours the icon from selectors on the alert itself —
 * `has-[>svg]` and `[&>svg]` — both of which only match an `<svg>` that is a
 * direct child of the alert. A wrapper element would drop the icon out of that
 * column entirely, so this renders its children as a fragment. When a
 * className is supplied it is folded onto the icon element itself, which is
 * what keeps `className="[&_svg]:size-3.5"` doing what it says.
 */
export interface AlertIndicatorProps {
  className?: string;
  children?: React.ReactNode;
}

export function AlertIndicator({
  className,
  children,
}: AlertIndicatorProps): React.ReactElement {
  if (!className) {
    return <>{children}</>;
  }

  return (
    <>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;
        const childProps = child.props as { className?: string };
        return React.cloneElement(
          child as React.ReactElement<{ className?: string }>,
          { className: cn(className, childProps.className) },
        );
      })}
    </>
  );
}

/** The icon-adjacent column: title, description and anything stacked under them. */
export function AlertContent({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-y-0.5",
        className,
      )}
      data-slot="alert-content"
      {...props}
    />
  );
}

export function AlertTitle({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn("font-medium [svg~&]:col-start-2", className)}
      data-slot="alert-title"
      {...props}
    />
  );
}

export function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 text-muted-foreground [svg~&]:col-start-2",
        className,
      )}
      data-slot="alert-description"
      {...props}
    />
  );
}

export function AlertAction({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn(
        "flex shrink-0 gap-1 self-center",
        className,
      )}
      data-slot="alert-action"
      {...props}
    />
  );
}
