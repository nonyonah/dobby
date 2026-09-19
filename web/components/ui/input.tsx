import * as React from "react";
import { Input as HeroInput } from "@heroui/react";
import { cn } from "cn";

function Input({ className, type, onChange, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <HeroInput
      type={type}
      variant="primary"
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-md border border-input bg-card px-2.5 py-0.5 text-[13px] outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
        className
      )}
      onChange={onChange as React.ComponentProps<typeof HeroInput>["onChange"]}
      {...(props as React.ComponentProps<typeof HeroInput>)}
    />
  );
}

export { Input };
