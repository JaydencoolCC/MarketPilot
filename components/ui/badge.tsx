import { cn } from "@/lib/utils/cn";

type BadgeProps = {
  children: React.ReactNode;
  tone?: "neutral" | "green" | "red" | "amber" | "blue";
  className?: string;
};

export function Badge({ children, tone = "neutral", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium",
        tone === "neutral" && "bg-black/5 text-muted",
        tone === "green" && "bg-moss/10 text-moss",
        tone === "red" && "bg-coral/10 text-coral",
        tone === "amber" && "bg-amber/15 text-amber",
        tone === "blue" && "bg-ocean/10 text-ocean",
        className,
      )}
    >
      {children}
    </span>
  );
}
