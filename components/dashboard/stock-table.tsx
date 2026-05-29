"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Info, MessageCircle, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Market, NewsArticle, Quote, Security, WatchlistRow } from "@/lib/domain/types";
import { xueqiuStockUrl } from "@/lib/domain/xueqiu";
import {
  cnMarketName,
  formatClockTime,
  formatCurrency,
  formatPercent,
  relativeTime,
} from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

type StockTableProps = {
  initialRows: WatchlistRow[];
};

const QUOTE_POLL_INTERVAL_MS = 3000;

function changeColorClass(changePercent?: number) {
  if (!changePercent) return "text-muted";
  return changePercent > 0 ? "text-coral" : "text-moss";
}

function marketStatusLabel(status?: Quote["marketStatus"]) {
  if (status === "open") return "交易中";
  if (status === "closed") return "已休市";
  if (status === "pre_market") return "盘前";
  if (status === "after_hours") return "盘后";
  return "数据源未返回";
}

function marketStatusTone(status?: Quote["marketStatus"]) {
  if (status === "open") return "green";
  if (status === "pre_market" || status === "after_hours") return "amber";
  return "neutral";
}

export function StockTable({ initialRows }: StockTableProps) {
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Security[]>([]);
  const [selectedSecurity, setSelectedSecurity] = useState<Security | null>(null);
  const [filter, setFilter] = useState<Market | "ALL">("ALL");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("我会整理价格、新闻和每日摘要。");
  const [selectedRow, setSelectedRow] = useState<WatchlistRow | null>(null);
  const pollingRef = useRef(false);
  const pendingManualRefreshRef = useRef(false);
  const rowsRef = useRef(initialRows);

  const filteredRows = useMemo(
    () => rows.filter((row) => (filter === "ALL" ? true : row.market === filter)),
    [rows, filter],
  );
  const latestFetchedAt = useMemo(() => {
    const timestamps = filteredRows
      .map((row) => row.quote?.quoteTime ?? row.quote?.fetchedAt)
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value).getTime())
      .filter(Number.isFinite);
    if (!timestamps.length) return null;
    return new Date(Math.max(...timestamps)).toISOString();
  }, [filteredRows]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const mergeQuotes = useCallback((quotes: Quote[]) => {
    const quoteBySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
    setRows((current) =>
      current.map((row) => {
        const quote = quoteBySymbol.get(row.normalizedSymbol);
        if (!quote) return row;
        return { ...row, quote, dataStatus: quote.status };
      }),
    );
    setSelectedRow((current) => {
      if (!current) return null;
      const quote = quoteBySymbol.get(current.normalizedSymbol);
      if (!quote) return current;
      return { ...current, quote, dataStatus: quote.status };
    });
  }, []);

  const fetchQuotes = useCallback(async (options?: { showLoading?: boolean; updateMessage?: boolean }) => {
    if (pollingRef.current) {
      if (options?.showLoading) pendingManualRefreshRef.current = true;
      return;
    }
    const symbols = rowsRef.current.map((row) => row.normalizedSymbol);
    if (!symbols.length) return;
    pollingRef.current = true;
    if (options?.showLoading) setLoading(true);
    try {
      const response = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as { data?: Quote[] };
      mergeQuotes(payload.data ?? []);
      if (options?.updateMessage) setMessage("已更新页面行情。");
    } finally {
      pollingRef.current = false;
      if (options?.showLoading) setLoading(false);
      if (pendingManualRefreshRef.current) {
        pendingManualRefreshRef.current = false;
        void fetchQuotes({ showLoading: true, updateMessage: true });
      }
    }
  }, [mergeQuotes]);

  useEffect(() => {
    void fetchQuotes();
    const interval = window.setInterval(() => {
      void fetchQuotes();
    }, QUOTE_POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [fetchQuotes]);

  async function reloadRows() {
    await fetchQuotes({ showLoading: true, updateMessage: true });
  }

  async function addStock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const symbol = selectedSecurity?.normalizedSymbol ?? query.trim();
    if (!symbol) {
      setMessage("请输入股票代码或公司名。");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const payload = (await response.json()) as {
        data?: WatchlistRow;
        watchlist?: WatchlistRow[];
        error?: { message: string };
      };
      if (!response.ok) {
        setMessage(payload.error?.message ?? "添加失败，请稍后重试。");
        return;
      }
      setRows(payload.watchlist ?? []);
      setQuery("");
      setSuggestions([]);
      setSelectedSecurity(null);
      setMessage(`已添加 ${payload.data?.name ?? symbol}，我会开始跟踪它的价格和新闻。`);
    } finally {
      setLoading(false);
    }
  }

  async function searchSecurities(value: string) {
    setQuery(value);
    setSelectedSecurity(null);
    if (!value.trim()) {
      setSuggestions([]);
      return;
    }

    setSearching(true);
    try {
      const response = await fetch(`/api/securities/search?q=${encodeURIComponent(value)}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as { data?: Security[]; error?: { message: string } };
      if (!response.ok) {
        setMessage(payload.error?.message ?? "搜索暂时不可用。");
        return;
      }
      setSuggestions(payload.data ?? []);
      if (!payload.data?.length) {
        setMessage("没有找到匹配证券，可以换成股票代码或公司名再试。");
      }
    } finally {
      setSearching(false);
    }
  }

  function chooseSecurity(security: Security) {
    setSelectedSecurity(security);
    setQuery(security.normalizedSymbol);
    setSuggestions([]);
    setMessage(`已选择 ${security.name}（${cnMarketName(security.market)}），点击添加即可加入自选股。`);
  }

  async function removeStock(id: string) {
    setLoading(true);
    try {
      const response = await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
      const payload = (await response.json()) as { data?: WatchlistRow[]; error?: { message: string } };
      if (!response.ok) {
        setMessage(payload.error?.message ?? "删除失败，请稍后重试。");
        return;
      }
      setRows(payload.data ?? []);
      setSelectedRow((current) => (current?.id === id ? null : current));
      setMessage("已从自选股中移除。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="relative rounded-lg border border-line bg-white/85 shadow-soft">
      <div className="flex flex-col gap-4 border-b border-line p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">自选股</h2>
          <p className="mt-1 text-sm text-muted">{message}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm text-muted">
            更新时间：{latestFetchedAt ? formatClockTime(latestFetchedAt) : "-"}
          </span>
          {(["ALL", "US", "HK", "CN"] as const).map((item) => (
            <Button
              key={item}
              variant={filter === item ? "primary" : "secondary"}
              size="sm"
              onClick={() => setFilter(item)}
            >
              {item === "ALL" ? "全部" : cnMarketName(item)}
            </Button>
          ))}
          <Button variant="secondary" size="icon" aria-label="刷新行情" onClick={reloadRows}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      <form onSubmit={addStock} className="grid gap-3 border-b border-line p-4 md:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" />
          <Input
            value={query}
            onChange={(event) => void searchSecurities(event.target.value)}
            placeholder="搜索股票代码或公司名，例如 AAPL、腾讯、中国电信"
            aria-label="搜索股票"
            className="pl-9"
            autoComplete="off"
          />
          {suggestions.length > 0 ? (
            <div className="absolute left-0 right-0 top-12 z-20 overflow-hidden rounded-lg border border-line bg-white shadow-soft">
              {suggestions.map((security) => (
                <button
                  key={security.normalizedSymbol}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 border-b border-line/60 px-4 py-3 text-left last:border-b-0 hover:bg-moss/5"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    chooseSecurity(security);
                  }}
                >
                  <span>
                    <span className="block text-sm font-semibold text-ink">{security.name}</span>
                    <span className="mt-1 block text-xs text-muted">{security.normalizedSymbol}</span>
                  </span>
                  <Badge tone="blue">{cnMarketName(security.market)}</Badge>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <Button type="submit" disabled={loading || searching || !query.trim()}>
          <Plus className="h-4 w-4" />
          {selectedSecurity ? "添加" : searching ? "搜索中" : "直接添加"}
        </Button>
        {selectedSecurity ? (
          <div className="md:col-span-2 flex items-center gap-2 text-sm text-moss">
            <Check className="h-4 w-4" />
            已选择 {selectedSecurity.name} · {selectedSecurity.normalizedSymbol} · {cnMarketName(selectedSecurity.market)}
          </div>
        ) : null}
      </form>

      {filteredRows.length === 0 ? (
        <div className="p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-moss/10 text-moss">
            <Plus className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-ink">还没有自选股</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
            添加第一只股票后，我会开始整理价格、新闻和每日摘要。可以先试试
            AAPL、腾讯、中国电信或 600519。
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="bg-surface/80 text-xs uppercase tracking-normal text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">名称</th>
                <th className="px-4 py-3 font-medium">代码</th>
                <th className="px-4 py-3 font-medium">市场</th>
                <th className="px-4 py-3 font-medium">价格</th>
                <th className="px-4 py-3 font-medium">涨跌幅</th>
                <th className="px-4 py-3 font-medium">市场状态</th>
                <th className="px-4 py-3 font-medium">新闻</th>
                <th className="px-4 py-3 font-medium">数据</th>
                <th className="px-4 py-3 font-medium">来源</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const quote = row.quote;
                return (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-t border-line/70 hover:bg-moss/5"
                    onClick={() => setSelectedRow(row)}
                  >
                    <td className="px-4 py-4">
                      <div className="font-medium text-ink">{row.name}</div>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-muted">{row.normalizedSymbol}</td>
                    <td className="px-4 py-4">
                      <Badge tone="blue">{cnMarketName(row.market)}</Badge>
                    </td>
                    <td className="px-4 py-4 font-medium text-ink">
                      {quote ? formatCurrency(quote.price, quote.currency) : "等待更新"}
                    </td>
                    <td className={cn("px-4 py-4 font-semibold", changeColorClass(quote?.changePercent))}>
                      {quote ? formatPercent(quote.changePercent) : "-"}
                    </td>
                    <td className="px-4 py-4">
                      <Badge tone={marketStatusTone(quote?.marketStatus)}>
                        {marketStatusLabel(quote?.marketStatus)}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-muted">{row.todayNewsCount} 条</td>
                    <td className="px-4 py-4">
                      <Badge
                        tone={
                          row.dataStatus === "ok"
                            ? "green"
                            : row.dataStatus === "error"
                              ? "red"
                              : "amber"
                        }
                      >
                        {row.dataStatus === "ok"
                          ? "正常"
                          : row.dataStatus === "error"
                            ? "失败"
                            : "待更新"}
                      </Badge>
                    </td>
                    <td className="px-4 py-4">
                      <Badge tone={quote?.provider === "mock" ? "amber" : "blue"}>
                        {quote?.provider ?? "-"}
                      </Badge>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-1">
                        <a
                          href={xueqiuStockUrl(row.normalizedSymbol)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="打开雪球"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition hover:bg-black/5 hover:text-ink"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Info className="h-4 w-4" />
                        </a>
                        <Link
                          href={`/chat?q=${encodeURIComponent(`${row.name} 今天为什么波动？`)}`}
                          aria-label="追问 Chat"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition hover:bg-black/5 hover:text-ink"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="删除"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeStock(row.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {selectedRow ? (
        <StockDetailDrawer row={selectedRow} onClose={() => setSelectedRow(null)} />
      ) : null}
    </section>
  );
}

function StockDetailDrawer({
  row,
  onClose,
}: {
  row: WatchlistRow;
  onClose: () => void;
}) {
  const quote = row.quote;
  const question = `${row.name} 今天为什么波动？`;
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [newsStatus, setNewsStatus] = useState("正在整理相关新闻。");

  useEffect(() => {
    let active = true;
    async function loadNews() {
      try {
        const response = await fetch(
          `/api/news?symbols=${encodeURIComponent(row.normalizedSymbol)}&hours=24`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as {
          data?: NewsArticle[];
          error?: { message: string };
        };
        if (!active) return;
        if (!response.ok) {
          setNewsStatus(payload.error?.message ?? "新闻暂时不可用。");
          return;
        }
        setArticles(payload.data ?? []);
        setNewsStatus(
          payload.data?.length
            ? `过去 24 小时找到 ${payload.data.length} 条相关线索。`
            : "过去 24 小时没有找到与这只股票高度相关的重要新闻。",
        );
      } catch {
        if (active) setNewsStatus("新闻暂时不可用，稍后可以再试。");
      }
    }
    void loadNews();
    return () => {
      active = false;
    };
  }, [row.normalizedSymbol]);

  return (
    <div className="fixed inset-0 z-40 bg-ink/20" onClick={onClose}>
      <aside
        className="ml-auto flex h-full w-full max-w-md flex-col border-l border-line bg-white shadow-soft"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line p-5">
          <div>
            <p className="text-sm font-medium text-moss">{cnMarketName(row.market)}</p>
            <h3 className="mt-1 text-xl font-semibold text-ink">{row.name}</h3>
            <p className="mt-1 font-mono text-xs text-muted">{row.normalizedSymbol}</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="关闭详情" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <section>
            <h4 className="text-sm font-semibold text-ink">最新行情</h4>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Metric label="价格" value={quote ? formatCurrency(quote.price, quote.currency) : "等待更新"} />
              <Metric
                label="涨跌幅"
                value={quote ? formatPercent(quote.changePercent) : "-"}
                className={changeColorClass(quote?.changePercent)}
              />
              <Metric label="抓取时间" value={quote ? formatClockTime(quote.fetchedAt ?? quote.quoteTime) : "-"} />
              <Metric label="行情时间" value={quote ? formatClockTime(quote.quoteTime) : "-"} />
              <Metric label="市场状态" value={marketStatusLabel(quote?.marketStatus)} />
            </div>
          </section>

          <section className="rounded-md border border-line bg-surface/60 p-4">
            <h4 className="text-sm font-semibold text-ink">数据来源</h4>
            <p className="mt-2 text-sm leading-6 text-muted">
              当前来源：{quote?.provider ?? "等待行情更新"}。数据状态：
              {row.dataStatus === "ok" ? "正常" : row.dataStatus === "error" ? "失败" : "待更新"}。
              {quote?.errorMessage ? ` ${quote.errorMessage}` : ""}
            </p>
          </section>

          <section className="rounded-md border border-line bg-surface/60 p-4">
            <h4 className="text-sm font-semibold text-ink">相关新闻</h4>
            <p className="mt-2 text-sm leading-6 text-muted">{newsStatus}</p>
            {articles.length ? (
              <div className="mt-3 space-y-3">
                {articles.slice(0, 4).map((article) => (
                  <a
                    key={article.id}
                    href={article.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-md border border-line bg-white p-3 hover:border-moss/30 hover:bg-moss/5"
                  >
                    <div className="text-sm font-semibold leading-5 text-ink">{article.title}</div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{article.summary}</p>
                    <div className="mt-2 text-xs text-muted">
                      {article.source} · {relativeTime(article.publishedAt)}
                    </div>
                  </a>
                ))}
              </div>
            ) : null}
          </section>
        </div>

        <div className="border-t border-line p-5">
          <Link
            href={`/chat?q=${encodeURIComponent(question)}`}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-medium text-white transition hover:bg-ink/90"
          >
            <MessageCircle className="h-4 w-4" />
            追问这只股票
          </Link>
        </div>
      </aside>
    </div>
  );
}

function Metric({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="rounded-md border border-line bg-white p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={cn("mt-1 text-sm font-semibold text-ink", className)}>{value}</div>
    </div>
  );
}
