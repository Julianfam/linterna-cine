import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-md border border-border bg-elevated px-3.5 text-sm text-fg placeholder:text-subtle",
        "transition-[box-shadow,border-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70",
        className,
      )}
      {...props}
    />
  );
}
