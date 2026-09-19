import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-[6px] rounded-[10px] font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:outline-2 focus-visible:outline-[#4a55c9] focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      // Rift Labs variants: exactly one primary per screen.
      variant: {
        primary:
          "border border-[#4a55c9] bg-[#4a55c9] text-white hover:border-[#3a44a8] hover:bg-[#3a44a8]",
        secondary:
          "border border-[#d8d6d0] dark:border-[#2d2d31] bg-white dark:bg-[#26262a] text-[#1c1d20] dark:text-[#eceef0] hover:bg-[#f1efeb] dark:hover:bg-[#303035]",
        outline:
          "border border-[#d8d6d0] dark:border-[#2d2d31] bg-white dark:bg-[#26262a] text-[#1c1d20] dark:text-[#eceef0] hover:bg-[#f1efeb] dark:hover:bg-[#303035]",
        ghost:
          "border border-transparent bg-transparent text-[#1c1d20] dark:text-[#eceef0] hover:bg-[#f1efeb] dark:hover:bg-white/10",
        destructive:
          "border border-[#b0402f] bg-[#b0402f] text-white hover:border-[#8f3425] hover:bg-[#8f3425]",
      },
      // Rift Labs sizes: default 32px / 13px, small 26px / 12px.
      size: {
        default:
          "h-8 px-[14px] text-[13px] [&_svg:not([class*='size-'])]:size-3.5",
        small:
          "h-[26px] px-[10px] text-[12px] [&_svg:not([class*='size-'])]:size-3",
        icon: "size-8 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-[26px] [&_svg:not([class*='size-'])]:size-3",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "secondary",
  size = "default",
  type = "button",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      type={type}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
