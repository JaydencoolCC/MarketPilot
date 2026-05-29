import Link from "next/link";
import Image from "next/image";
import { Settings } from "lucide-react";
import type { DashboardView } from "@/components/dashboard/asset-nav";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { StockTable } from "@/components/dashboard/stock-table";
import { HoldingTable } from "@/components/dashboard/holding-table";
import { FundTable } from "@/components/dashboard/fund-table";
import { GoldPanel } from "@/components/dashboard/gold-panel";
import { DigestPanel } from "@/components/dashboard/digest-panel";
import { ChatPreview } from "@/components/dashboard/chat-preview";
import { listFundRows, listWatchlistRows } from "@/lib/db/store";

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

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1720px] px-4 py-5 md:px-6 lg:px-8 2xl:px-10">
      <header className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-4">
          <Image
            src="/brand/marketpilot-header-icon.png"
            alt="MarketPilot"
            width={78}
            height={112}
            className="h-16 w-auto shrink-0 object-contain"
            priority
            unoptimized
          />
          <div>
            <p className="text-sm font-medium text-moss">MarketPilot · 个人 AI 金融信息工作台</p>
            <p className="mt-2 text-sm text-muted">
              {subtitleForView(view, { quoteProvider, fundProvider, goldProvider })}
              。全局刷新时间：{lastUpdated}
            </p>
          </div>
        </div>
        <Link
          href="/settings"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-medium text-ink shadow-sm hover:border-moss/30 hover:bg-moss/5"
        >
          <Settings className="h-4 w-4" />
          设置
        </Link>
      </header>

      <DashboardLayout
        active={view}
        main={
          <>
            {view === "stocks" ? <StockTable initialRows={rows} /> : null}
            {view === "holdings" ? <HoldingTable initialRows={rows} /> : null}
            {view === "funds" ? <FundTable initialRows={fundRows} /> : null}
            {view === "gold" ? <GoldPanel /> : null}
          </>
        }
        aside={
          <>
            <DigestPanel />
            <ChatPreview />
          </>
        }
      />
    </main>
  );
}

function parseView(value?: string): DashboardView {
  if (value === "holdings" || value === "funds" || value === "gold") return value;
  return "stocks";
}

function subtitleForView(
  view: DashboardView,
  providers: { quoteProvider: string; fundProvider: string; goldProvider: string },
) {
  if (view === "funds") {
    return `当前基金来源：${providers.fundProvider}，ETF 行情复用真实行情源`;
  }
  if (view === "gold") {
    return `当前黄金来源：${providers.goldProvider}，国内金价为人民币/克参考折算`;
  }
  if (view === "holdings") {
    return `持仓按股票本币计算，当前行情来源：${providers.quoteProvider}`;
  }
  return `当前行情来源：${providers.quoteProvider}，行情可能有延迟`;
}
