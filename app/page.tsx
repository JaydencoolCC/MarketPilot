import Link from "next/link";
import { Settings } from "lucide-react";
import { StockTable } from "@/components/dashboard/stock-table";
import { DigestPanel } from "@/components/dashboard/digest-panel";
import { ChatPreview } from "@/components/dashboard/chat-preview";
import { listWatchlistRows } from "@/lib/db/store";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const rows = await listWatchlistRows();
  const quoteProvider = process.env.QUOTE_PROVIDER ?? "auto";
  const lastUpdated = new Date().toLocaleString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-5 md:px-6 lg:px-8">
      <header className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-moss">个人 AI 金融信息工作台</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal text-ink md:text-3xl">
            你的自选股，今天我帮你盯着
          </h1>
          <p className="mt-2 text-sm text-muted">
            当前行情来源：{quoteProvider}
            {quoteProvider === "mock" ? "，仅用于开发验证，不是真实行情" : "，行情可能有延迟"}
            。全局刷新时间：{lastUpdated}
          </p>
        </div>
        <Link
          href="/settings"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-medium text-ink shadow-sm hover:border-moss/30 hover:bg-moss/5"
        >
          <Settings className="h-4 w-4" />
          设置
        </Link>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <StockTable initialRows={rows} />
        <aside className="space-y-5">
          <DigestPanel />
          <ChatPreview />
        </aside>
      </div>
    </main>
  );
}
