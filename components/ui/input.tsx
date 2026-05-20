"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink shadow-sm",
        "placeholder:text-muted/70 focus:border-moss/40 focus:outline-none focus:ring-2 focus:ring-moss/15",
        className,
      )}
      {...props}
    />
  );
}
