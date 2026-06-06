"use client";

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
import { LocaleProvider, useLocale } from "@/components/i18n/locale-provider";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import type { FundRow, WatchlistRow } from "@/lib/domain/types";
import type { Locale } from "@/lib/i18n";

type DashboardPageClientProps = {
  initialLocale: Locale;
  view: DashboardView;
  rows: WatchlistRow[];
  fundRows: FundRow[];
  providers: { quoteProvider: string; fundProvider: string; goldProvider: string };
  lastUpdated: string;
};

export function DashboardPageClient(props: DashboardPageClientProps) {
  return (
    <LocaleProvider initialLocale={props.initialLocale}>
      <DashboardPageContent {...props} />
    </LocaleProvider>
  );
}

function DashboardPageContent({
  view,
  rows,
  fundRows,
  providers,
  lastUpdated,
}: DashboardPageClientProps) {
  const { t } = useLocale();

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
            <p className="text-sm font-medium text-moss">{t.dashboard.productLabel}</p>
            <p className="mt-2 text-sm text-muted">
              {subtitleForView(view, providers, t)}
              。{t.dashboard.globalRefresh}：{lastUpdated}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LanguageToggle />
          <Link
            href="/settings"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-medium text-ink shadow-sm hover:border-moss/30 hover:bg-moss/5"
          >
            <Settings className="h-4 w-4" />
            {t.common.settings}
          </Link>
        </div>
      </header>

      <DashboardLayout
        active={view}
        main={
          <>
            {view === "stocks" ? <StockTable initialRows={rows} /> : null}
            {view === "holdings" ? <HoldingTable initialRows={rows} initialFundRows={fundRows} /> : null}
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

function subtitleForView(
  view: DashboardView,
  providers: { quoteProvider: string; fundProvider: string; goldProvider: string },
  t: ReturnType<typeof useLocale>["t"],
) {
  if (view === "funds") return t.dashboard.subtitles.funds(providers.fundProvider);
  if (view === "gold") return t.dashboard.subtitles.gold(providers.goldProvider);
  if (view === "holdings") return t.dashboard.subtitles.holdings(providers.quoteProvider);
  return t.dashboard.subtitles.stocks(providers.quoteProvider);
}
