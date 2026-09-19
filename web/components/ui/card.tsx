import * as React from "react";
import { Card as HeroCard } from "@heroui/react";
import { cn } from "cn";

function Card({ className, size = "default", ...props }: React.ComponentProps<typeof HeroCard> & { size?: "default" | "sm" }) {
  return (
    <HeroCard
      data-slot="card"
      data-size={size}
      variant="default"
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl border border-line bg-card py-(--card-spacing) text-xs/relaxed text-card-foreground shadow-none ring-0 [--card-spacing:--spacing(4)] data-[size=sm]:[--card-spacing:--spacing(3)]",
        className
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<typeof HeroCard.Header>) {
  return <HeroCard.Header data-slot="card-header" className={cn("group/card-header grid auto-rows-min items-start gap-1 px-(--card-spacing)", className)} {...props} />;
}

function CardTitle({ className, ...props }: React.ComponentProps<typeof HeroCard.Title>) {
  return <HeroCard.Title data-slot="card-title" className={cn("text-sm font-medium", className)} {...props} />;
}

function CardDescription({ className, ...props }: React.ComponentProps<typeof HeroCard.Description>) {
  return <HeroCard.Description data-slot="card-description" className={cn("text-xs/relaxed text-muted-foreground", className)} {...props} />;
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-action" className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)} {...props} />;
}

function CardContent({ className, ...props }: React.ComponentProps<typeof HeroCard.Content>) {
  return <HeroCard.Content data-slot="card-content" className={cn("px-(--card-spacing)", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<typeof HeroCard.Footer>) {
  return <HeroCard.Footer data-slot="card-footer" className={cn("flex items-center px-(--card-spacing)", className)} {...props} />;
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
