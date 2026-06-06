import { cookies } from "next/headers";
import type { DashboardView } from "@/components/dashboard/asset-nav";
import { DashboardPageClient } from "@/components/dashboard/dashboard-page-client";
import { listFundRows, listWatchlistRows } from "@/lib/db/store";
import { defaultLocale, isLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const view = parseView(params?.view);
  const rows = await listWatchlistRows();
  const fundRows = await listFundRows();
  const quoteProvider = process.env.QUOTE_PROVIDER ?? "auto";
  const fundProvider = process.env.FUND_PROVIDER ?? "public";
  const goldProvider = process.env.GOLD_PROVIDER ?? "public";
  const lastUpdated = new Date().toLocaleString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const cookieLocale = (await cookies()).get("marketpilot-locale")?.value;

  return (
    <DashboardPageClient
      initialLocale={isLocale(cookieLocale) ? cookieLocale : defaultLocale}
      view={view}
      rows={rows}
      fundRows={fundRows}
      providers={{ quoteProvider, fundProvider, goldProvider }}
      lastUpdated={lastUpdated}
    />
  );
}

function parseView(value?: string): DashboardView {
  if (value === "holdings" || value === "funds" || value === "gold") return value;
  return "stocks";
}
