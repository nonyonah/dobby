import * as React from "react";
import { Button as HeroButton } from "@heroui/react";
import { cn } from "cn";

const heroVariants = {
  primary: "primary",
  secondary: "secondary",
  outline: "outline",
  ghost: "ghost",
  destructive: "danger",
} as const;

type ButtonVariant = keyof typeof heroVariants;
type ButtonSize = "default" | "small" | "icon" | "icon-sm";

function buttonVariants({ variant = "secondary" }: { variant?: ButtonVariant } = {}) {
  return `button--${heroVariants[variant]}`;
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
  const heroSize = size === "small" || size === "icon-sm" ? "sm" : "md";
  return (
    <HeroButton
      data-slot="button"
      type={type}
      variant={heroVariants[variant]}
      size={heroSize}
      isDisabled={disabled}
      isIconOnly={iconOnly}
      onClick={onClick as React.ComponentProps<typeof HeroButton>["onClick"]}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] font-medium whitespace-nowrap outline-none select-none transition-colors focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        size === "default" && "h-8 px-[14px] text-[13px] [&_svg:not([class*='size-'])]:size-3.5",
        size === "small" && "h-[26px] px-[10px] text-[12px] [&_svg:not([class*='size-'])]:size-3",
        size === "icon" && "size-8 [&_svg:not([class*='size-'])]:size-3.5",
        size === "icon-sm" && "size-[26px] [&_svg:not([class*='size-'])]:size-3",
        className
      )}
      {...(props as React.ComponentProps<typeof HeroButton>)}
    >
      {children}
    </HeroButton>
  );
}

export { Button, buttonVariants };
