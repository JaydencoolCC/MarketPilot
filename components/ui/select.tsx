"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 rounded-md border border-line bg-white px-3 text-sm text-ink shadow-sm",
        "focus:border-moss/40 focus:outline-none focus:ring-2 focus:ring-moss/15",
        className,
      )}
      {...props}
    />
  );
}
