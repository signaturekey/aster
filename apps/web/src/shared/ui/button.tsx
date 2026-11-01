import type { ComponentProps } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-[#e28a6d]",
        outline: "border border-border bg-card hover:bg-muted",
        ghost: "hover:bg-muted",
        destructive:
          "border border-[#a0342d] text-[#a0342d] hover:bg-[#f9ece9]",
      },
      size: {
        default: "min-h-10 px-5 py-2",
        sm: "min-h-8 px-3 py-1",
        lg: "min-h-12 px-6 py-3",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

// shadcn-style source ownership: variants remain local so custom density and
// contrast are not coupled to a remote component theme.
export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      data-slot="button"
      className={twMerge(clsx(buttonVariants({ variant, size }), className))}
      {...props}
    />
  );
}
