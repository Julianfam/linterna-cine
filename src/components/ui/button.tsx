import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[opacity,transform,background-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-fg hover:opacity-90 active:scale-[0.98]",
        outline:
          "border border-border bg-transparent text-fg hover:bg-elevated active:scale-[0.98]",
        ghost: "bg-transparent text-fg hover:bg-elevated/80",
        subtle: "bg-elevated text-fg hover:bg-elevated/80 active:scale-[0.98]",
      },
      size: {
        default: "h-11 rounded-md px-5 text-sm",
        sm: "h-9 rounded-sm px-3.5 text-sm",
        lg: "h-12 rounded-lg px-6 text-base",
        icon: "size-11 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />
  );
}
