import * as React from "react";
import { cn } from "cn";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "brand" | "destructive" | "destructive-outline";
type ButtonSize = "default" | "small" | "icon" | "icon-sm";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-secondary text-foreground hover:bg-secondary/80",
  outline: "border border-line bg-card text-foreground hover:bg-muted",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
  // Brand-tinted outline: the row-level call to action that should read as
  // "yours to press" without competing with a filled primary button for it.
  // Driven by --accent, so it follows the accent the user picked.
  brand: "border border-accent/40 text-accent hover:bg-accent/10",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  // Soft destructive for reversible teardown (disconnect a provider). Reads as
  // destructive without the weight of a filled red, which is reserved for
  // irreversible confirms.
  "destructive-outline": "border border-destructive/40 text-destructive hover:bg-destructive/10",
};

function buttonVariants({ variant = "secondary" }: { variant?: ButtonVariant } = {}) {
  return VARIANT_CLASSES[variant];
}

type ButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

function Button({
  className,
  variant = "secondary",
  size = "default",
  type = "button",
  disabled,
  onClick,
  children,
  ...props
}: ButtonProps) {
  const iconOnly = size === "icon" || size === "icon-sm";
  return (
    <button
      data-slot="button"
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[50px] font-medium whitespace-nowrap outline-none select-none transition-colors focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        VARIANT_CLASSES[variant],
        (size === "default" || size === "small") && "h-7 px-[10px] text-[12px] [&_svg:not([class*='size-'])]:size-3",
        size === "icon" && "size-8 [&_svg:not([class*='size-'])]:size-3.5",
        size === "icon-sm" && "size-[26px] [&_svg:not([class*='size-'])]:size-3",
        iconOnly && "px-0",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export { Button, buttonVariants };
