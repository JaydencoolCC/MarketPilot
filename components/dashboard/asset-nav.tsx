import Link from "next/link";
import { BadgeDollarSign, BriefcaseBusiness, ChartNoAxesCombined, Gem } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type DashboardView = "stocks" | "holdings" | "funds" | "gold";

const items = [
  { id: "stocks", label: "股票", href: "/?view=stocks", icon: ChartNoAxesCombined },
  { id: "holdings", label: "持仓", href: "/?view=holdings", icon: BriefcaseBusiness },
  { id: "funds", label: "基金", href: "/?view=funds", icon: BadgeDollarSign },
  { id: "gold", label: "黄金", href: "/?view=gold", icon: Gem },
] as const;

export function AssetNav({ active }: { active: DashboardView }) {
  return (
    <nav className="flex gap-2 lg:sticky lg:top-5 lg:flex-col">
      {items.map((item) => {
        const Icon = item.icon;
        const selected = active === item.id;
        return (
          <Link
            key={item.id}
            href={item.href}
            className={cn(
              "inline-flex h-11 min-w-24 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition lg:h-12 lg:min-w-28",
              selected
                ? "border-ink bg-ink text-white shadow-sm"
                : "border-line bg-white/85 text-muted hover:border-moss/30 hover:bg-moss/5 hover:text-ink",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
